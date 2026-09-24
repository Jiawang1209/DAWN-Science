/**
 * 坞里那段对话（2026-09-24，侧边对话）。**渲染进程自有**：挂的是哪段按「地方」记住
 * （项目 = `p:<projectId>`，远端 = `r:<connectionId>`），key 里写明作用域。
 * 它的转录是第二个槽——后端权威，这里是缓存，与主槽同一条纪律。
 */
import { atom } from "nanostores"
import { 创建转录槽 } from "./transcript-slot.js"

export const 侧槽 = 创建转录槽()
export const $侧边会话id = atom<string | undefined>(undefined)
/** 坞里那段的运行时读不读得到主对话（`setSideSession` 回的）。缺省 = 还不知道 */
export const $侧边能读主 = atom<boolean | undefined>(undefined)
/**
 * 坞此刻按哪个「地方」挂（`载入侧边` / `挂进坞` 记下的）。**缺省 = 此刻没有地方**
 * （没选项目、或主区是一段不属于任何项目的临时会话）——坞格据此说「没法另开」，不是空白。
 *
 * 拿下时缺省用它（Task 5 审查抓的）：界面那边算「地方」要等会话摘要到手，临时会话压根算不出来——
 * 拿那个现算的值去拿下，拿不下来又不出声；这里记的是**挂上去那一刻**的地方，必定在。
 */
export const $侧边地方 = atom<string | undefined>(undefined)

/**
 * **作用域是「地方」**：一个项目（`p:<projectId>`）或一台远端连接（`r:<connectionId>`）各记一段——
 * 同一个地方挂的那段，换走再换回来还在；换到别处不会把这里的那段带过去。
 * 整张表（地方 → sessionId）存在**这一个键**里，不是一个地方一个键。
 */
export const SIDE_SESSION_KEY = "dawn.project.side-session"

export function 侧边地方键(s: { projectId?: string | undefined; remote?: { connectionId: string } | undefined }): string | undefined {
  if (s.remote) return `r:${s.remote.connectionId}`
  return s.projectId ? `p:${s.projectId}` : undefined
}

/**
 * 这一段进不进得了坞。**终端（pty）不是对话**：坞格画的是 `ConversationView`，把一段终端挂进来
 * 只会得到一个假装能聊的空转录。坞格的「同处」清单、页签右键「放进坞里」、「换到主区」换下来的那段，
 * 三处都认这一条——各写一遍的话，迟早一处漏了（Task 6 审查抓的：后两处就漏了）。
 */
export function 能进坞(s: { kind?: string | undefined }): boolean {
  return s.kind !== "pty"
}

function 读表(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SIDE_SESSION_KEY) ?? "{}")
    if (!v || typeof v !== "object" || Array.isArray(v)) return {}
    // **只留值是字符串的那几格**：手改坏的、旧版本写的别的形状，挂上去就是拿一个非 id 去订阅
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"))
  } catch {
    return {}
  }
}
function 写表(t: Record<string, string>): void {
  try {
    localStorage.setItem(SIDE_SESSION_KEY, JSON.stringify(t))
  } catch {
    /* 记不住只是下次要重新挂，不影响这一次 */
  }
}

/** 换了地方（或刚启动）：按表挂上那一段；表里没有就空着。**同一段不重挂**——重挂会把侧槽清空 */
export function 载入侧边(地方: string | undefined): void {
  $侧边地方.set(地方)
  const id = 地方 ? 读表()[地方] : undefined
  if (id === $侧边会话id.get()) return
  侧槽.reset()
  $侧边能读主.set(undefined)
  $侧边会话id.set(id)
}
export function 挂进坞(地方: string, sessionId: string): void {
  写表({ ...读表(), [地方]: sessionId })
  载入侧边(地方)
}
/**
 * 从坞里拿下。**地方缺省 = 挂上去时记下的那个**（`$侧边地方`）。
 * 表里那一格删不删得到，**槽与两个 atom 都照清**——坞格不许留着一段已经拿下的对话。
 */
export function 从坞拿下(地方: string | undefined = $侧边地方.get()): void {
  if (地方) {
    const t = 读表()
    delete t[地方]
    写表(t)
  }
  侧槽.reset()
  $侧边能读主.set(undefined)
  $侧边会话id.set(undefined)
}
