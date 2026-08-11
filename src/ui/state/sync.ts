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
  RunSummary,
  SessionSnapshot,
  SessionSummary,
} from "../../protocol/index.js"
import { WorkbenchClientError, type WorkbenchClient } from "../client.js"
import { note } from "./connection.js"
import { guard } from "./guard.js"
import { applySnapshot } from "./transcript.js"
import {
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
      applySnapshot({ items: snap.items, terminal: snap.terminal, trimmed: snap.terminalTrimmed })
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
