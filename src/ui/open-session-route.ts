/**
 * 点了一条桌面通知之后「回到那段」（2026-09-27 起，2026-09-28 改成拉）。
 *
 * 两件事，都是纯逻辑、注入依赖，所以在 node 下可测：
 *
 * 1. **路由**（`回到那段`）：坞里挂着的那段 → 开坞的「对话」格；任务名单 / 当前项目会话 / 临时会话里有 → 与侧栏点一行同一条路；
 *    本地名单里没有 → **先问后端**（别的项目里、不在任务名单里的那段不许被报成「不在了」）；后端也没有 → 说一句，不静默。
 * 2. **门**（`通知回段门`）：界面 `ready` 且头一批名单取回之前，推来的「回到那段」不路由——那时名单是空的，
 *    路由一定会说「那段对话已经不在了」。门开的那一刻**拉**一次 `takePendingOpenSession`；门开之后每次被推醒也去拉
 *    （主进程先记后推、读了就清，所以推与拉不会各切一次）。
 */
import type { ProjectSummary, SessionSummary, TaskSummary } from "../protocol/index.js"

export type 回到结果 = "dock" | "main" | "other" | "gone"

export interface 回到那段依赖 {
  侧边id: () => string | undefined
  tasks: () => readonly TaskSummary[]
  /** 临时会话 ∪ 当前项目的会话 */
  sessions: () => readonly SessionSummary[]
  projects: () => readonly ProjectSummary[]
  /** 本地名单里没有：问后端（逐个项目 `listSessions`）。没有 = undefined */
  查后端: (sessionId: string) => Promise<SessionSummary | undefined>
  开坞: () => void
  /** `projectId` 给了就先切项目（与 `onPickTask` 同一条理由：只切会话不切项目，主区回落成初始画面） */
  切到: (sessionId: string, projectId: string | undefined) => void
  说没了: () => void
}

export async function 回到那段(id: string, d: 回到那段依赖): Promise<回到结果> {
  if (id === d.侧边id()) {
    d.开坞()
    return "dock"
  }
  const 任务 = d.tasks().find((x) => x.sessionId === id)
  // 归档的任务后端 `listTasks` 已经滤掉了；会话列表里的要自己看 `archivedAt`
  const s = d.sessions().find((x) => x.sessionId === id && !x.archivedAt)
  if (任务 || s) {
    const pid = 任务?.workspace ? d.projects().find((p) => p.workspace === 任务.workspace)?.projectId : undefined
    d.切到(id, pid)
    return "main"
  }
  let 别处: SessionSummary | undefined
  try {
    别处 = await d.查后端(id)
  } catch {
    别处 = undefined
  }
  if (别处 && !别处.archivedAt) {
    d.切到(id, 别处.projectId)
    return "other"
  }
  d.说没了()
  return "gone"
}

export interface 通知回段门 {
  /** 事件通道上推来的 `openSession`：门没开就只记着「醒过」，门开时那一次拉会带上 */
  推醒(pushedId: string): Promise<void>
  /** 头一批名单取回之后叫一次。只有第一次算数 */
  开门(): Promise<void>
}

export function 通知回段门(o: {
  /** `takePendingOpenSession`：读了就清 */
  取: () => Promise<string | undefined>
  路由: (sessionId: string) => Promise<unknown>
  /** 取失败要出声（规格 7.5）；失败时退回推来的那个 id */
  说: (e: unknown) => void
}): 通知回段门 {
  let 开了 = false
  let 推来的: string | undefined
  const 拉 = async (推: string | undefined): Promise<void> => {
    let id: string | undefined
    try {
      id = await o.取()
    } catch (e) {
      o.说(e)
      id = 推
    }
    if (id) await o.路由(id)
  }
  return {
    推醒(pushedId) {
      if (!开了) {
        推来的 = pushedId
        return Promise.resolve()
      }
      return 拉(pushedId)
    },
    开门() {
      if (开了) return Promise.resolve()
      开了 = true
      const 推 = 推来的
      推来的 = undefined
      return 拉(推)
    },
  }
}
