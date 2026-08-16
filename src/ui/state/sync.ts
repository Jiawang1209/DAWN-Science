/**
 * 把后端的真相同步进缓存。
 *
 * **这一层存在的理由**：搬变量不等于搬职责。
 * 状态挪进 atom 之后，`App.tsx` 里仍然坐着七个 effect，每一个都知道
 * 「该调哪个协议操作、把结果塞进哪个 atom、失败了怎么办」——
 * 那些知识属于状态层，不属于一个负责布局的组件。
 *
 * Hermes 的说法是：*"**Colocated action modules over god hooks.** A hook owns
 * one narrow job."* 这里每个导出都只干一件事，且都自带世代守卫与出声。
 *
 * 组件那边于是只剩「什么时候调」，不再关心「怎么调」。
 */
import type {
  ProjectSummary,
  ProvenanceLink,
  RemoteConnection,
  TaskSummary,
  RunSummary,
  SessionSnapshot,
  SessionSummary,
} from "../../protocol/index.js"
import { WorkbenchClientError, type WorkbenchClient } from "../client.js"
import { note } from "./connection.js"
import { guard } from "./guard.js"
import { applySnapshot } from "./transcript.js"
import {
  setConnections,
  setTasks,
  setCredentials,
  setProjects,
  setProvenance,
  setRunDetail,
  setRuns,
  setSessions,
  setTempSessions,
  setProviders,
  setContextUsage,
  type CredentialState,
  type Providers,
  type RunDetail,
} from "./catalog.js"
import { $activeSessionId } from "./view.js"

/**
 * 失败一律出声（规格 7.5）。
 *
 * **宁可多一条提示，也不要让界面默默停在旧数据上**——
 * 停在旧数据上的界面看起来完全正常，那才是最难查的一种坏。
 */
export function fail(e: unknown): void {
  note(e instanceof WorkbenchClientError ? e.message : String(e))
}

/** 临时会话：**跨项目的一问**，见 `listTemporarySessions` 的说明 */
export const loadTempSessions = (c: WorkbenchClient): Promise<void> =>
  c
    .get<SessionSummary[]>("listTemporarySessions")
    .then((v) => {
      setTempSessions(v)
    })
    .catch(fail)

/**
 * 远端连接名单（②-B · R3）。
 *
 * **失败要出声**：一份取不回来的名单与一份空名单在界面上长得一样，
 * 而后者会被读成「你还没加过服务器」。
 */
export const loadConnections = (c: WorkbenchClient): Promise<void> =>
  c
    .get<RemoteConnection[]>("listConnections")
    .then((v) => {
      setConnections(v)
    })
    .catch(fail)

/**
 * 任务列表（T2）。**失败要出声**：取不回来的列表与空列表在界面上长得一样，
 * 而后者会被读成「你还没建过任务」。
 */
export const loadTasks = (c: WorkbenchClient): Promise<void> =>
  c
    .get<TaskSummary[]>("listTasks")
    .then((v) => {
      setTasks(v)
    })
    .catch(fail)

export const loadProjects = (c: WorkbenchClient): Promise<void> =>
  c.get<ProjectSummary[]>("listProjects").then((v) => {
      setProjects(v)
    })
    .catch(fail)

export const loadCredentials = (c: WorkbenchClient): Promise<void> =>
  c.get<CredentialState>("listCredentials").then((v) => {
      setCredentials(v)
    })
    .catch(fail)

export const loadContextUsage = async (
  c: WorkbenchClient,
  sessionId: string | undefined,
): Promise<void> => {
  // 没有会话就把它清掉。**留着上一个会话的数字是最坏的一种**——
  // 它看起来是真的
  if (!sessionId) return setContextUsage(undefined)
  await c
    .get<import("../panels.js").ContextUsage>("getContextUsage", { sessionId })
    .then(setContextUsage)
    .catch(fail)
}

export const loadProviders = (c: WorkbenchClient): Promise<void> =>
  c.get<Providers>("getProviders").then(setProviders).catch(fail)

export const loadSessions = (c: WorkbenchClient, projectId: string): Promise<void> =>
  c.get<SessionSummary[]>("listSessions", { projectId }).then((v) => {
      setSessions(v)
    })
    .catch(fail)

export const loadRuns = (c: WorkbenchClient, projectId: string): Promise<void> =>
  c.get<RunSummary[]>("listRuns", { projectId }).then((v) => {
      setRuns(v)
    })
    .catch(fail)

/**
 * 取一次全量快照并同步 revision。跳号自愈与切会话都走这里。
 *
 * **两道防线**：世代守卫挡住「用户已经切走了」，会话 id 比对挡住
 * 「这条响应属于另一个会话」。少任何一道都会让旧内容倒灌进新会话。
 */
export function resyncSession(c: WorkbenchClient, sessionId: string): Promise<void> {
  const g = guard()
  return c
    .get<SessionSnapshot>("subscribeSession", { sessionId })
    .then((snap) => {
      if (g.stale() || snap.sessionId !== $activeSessionId.get()) return
      /**
       * **初次订阅这一路也要带上「当前是什么」**（A3，2026-08-16 补）。
       *
       * 会话开关与待答的权限是在**开会话那一刻**就有的，
       * 而实时更新那一路只送「后来发生了什么」。只改那一路的话，
       * 症状是**界面上那颗按钮根本不出现**，而运行时与中枢的判据全绿。
       *
       * 同一个缺口今天在三处各犯了一次（运行时的 attach、中枢的推送、这里）——
       * **凡是「当前是什么」的东西，每一条路都要补一次**。
       */
      applySnapshot({
        items: snap.items,
        terminal: snap.terminal,
        trimmed: snap.terminalTrimmed,
        kernelInstanceId: snap.kernelInstanceId,
        configOptions: snap.configOptions,
        pendingPermission: snap.pendingPermission,
      })
      c.expectRevision(sessionId, snap.revision)
    })
    .catch(fail)
}

/**
 * 最新 Run 的详情与溯源。**产出与成本只有 `getRun` 带得来**——`listRuns` 只给摘要。
 *
 * 溯源取不到**不是错误**，是「不知道」：静静留空即可，面板自己会说「无溯源记录」。
 * 这与「取数失败」是两件事，混为一谈会让用户以为系统坏了。
 */
export function loadRunDetail(c: WorkbenchClient, runId: string | undefined): void {
  setRunDetail(undefined)
  setProvenance(undefined)
  if (!runId) return
  const g = guard()
  c.get<RunDetail>("getRun", { runId })
    .then((r) => {
      if (!g.stale()) setRunDetail(r)
    })
    .catch(fail)
  c.get<ProvenanceLink>("getProvenance", { resourceId: runId })
    .then((p) => {
      if (!g.stale()) setProvenance(p)
    })
    .catch(() => {})
}
