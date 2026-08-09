/**
 * 后端目录数据的缓存：项目、会话、Run、provider、凭证。
 *
 * **这一整个文件都是缓存，不是所有物。**
 * 别的界面（CLI、另一个窗口）也能改这些东西，所以刷新是**新信息叠加**，
 * 不是可以丢掉活跃行的替换。写入一律走 `setList`，内容没变就不换引用。
 */
import { atom } from "nanostores"
import { z } from "zod"
import { OPERATIONS } from "../../protocol/index.js"
import type {
  Cost,
  FileChangeFacts,
  ProjectSummary,
  ProvenanceLink,
  RunSummary,
  SessionSummary,
} from "../../protocol/index.js"
import { setList, setValue } from "./identity.js"
import type { ContextUsage } from "../panels.js"

/** `getRun` 的返回：Run 摘要 + 可选的产出事实与成本 */
export type RunDetail = RunSummary & { fileChanges?: FileChangeFacts; cost?: Cost }

/**
 * `getProviders` 的返回。**从协议推导，不手抄一份。**
 *
 * 2026-08-09（①-C）：这里原本是手写的一份结构，于是它和协议**各自漂移**——
 * 协议加了 `kind: "cli"` 与 cli 的 `models`，这份没跟上，
 * 界面因此看不见 cli agent 的模型清单，而 typecheck 报的是
 * 「`"native" | "pty"` 与 `"cli"` 没有重叠」——**指向的是抄件，不是原件**。
 *
 * 推导之后这类漂移不会再有：协议改了，这里跟着改，改不动就编译不过。
 *
 * 各字段的语义（协议里也写了，这里留一份给读界面代码的人）：
 * - `provider` / `model` 是 agent 配置里的**初始**模型
 * - `providers[].models` 是**配置里声明过的**（凭证界面看它）
 * - `providers[].available` 是**目录里真正有的**（模型选择器看它）。
 *   **两者语义不同，不能合并**；`available` 缺省 = 不知道，不是没有
 * - cli agent 的 `models` 由配置声明（Spike H：两个 CLI 都没有「列出可选项」的接口）
 */
export type Providers = z.infer<(typeof OPERATIONS)["getProviders"]["response"]>

export interface CredentialState {
  configured: string[]
  encrypted: boolean
}

export const $projects = atom<readonly ProjectSummary[]>([])
export const $sessions = atom<readonly SessionSummary[]>([])
export const $runs = atom<readonly RunSummary[]>([])

/** 最新一个 Run 的详情。**产出与成本只有它带得来**——`listRuns` 只给摘要 */
export const $runDetail = atom<RunDetail | undefined>(undefined)

/**
 * 溯源链。**没有记录不是错误**，是「不知道」——
 * 静静地留空即可，面板自己会说「无溯源记录」。
 */
export const $provenance = atom<ProvenanceLink | undefined>(undefined)

export const $providers = atom<Providers>({ agents: [], providers: [] })
export const $credentials = atom<CredentialState>({ configured: [], encrypted: false })

export const setProjects = (v: readonly ProjectSummary[]) => setList($projects, v)
export const setSessions = (v: readonly SessionSummary[]) => setList($sessions, v)
export const setRuns = (v: readonly RunSummary[]) => setList($runs, v)
export const setRunDetail = (v: RunDetail | undefined) => setValue($runDetail, v)
export const setProvenance = (v: ProvenanceLink | undefined) => setValue($provenance, v)

export function setProviders(v: Providers): void {
  const prev = $providers.get()
  if (
    prev.agents.length === v.agents.length &&
    prev.providers.length === v.providers.length &&
    prev.agents.every((a, i) => a.agentId === v.agents[i]?.agentId) &&
    prev.providers.every((p, i) => p.providerId === v.providers[i]?.providerId)
  ) {
    return
  }
  $providers.set(v)
}

export function setCredentials(v: CredentialState): void {
  const prev = $credentials.get()
  if (
    prev.encrypted === v.encrypted &&
    prev.configured.length === v.configured.length &&
    prev.configured.every((c, i) => c === v.configured[i])
  ) {
    return
  }
  $credentials.set(v)
}

/**
 * 每个会话**当前**用的模型（①-B″ · U2）。
 *
 * **后端权威，这里只是缓存**（本文件的定位）。初值来自 `getProviders` 里
 * 该 agent 配置的模型；换过之后以 `setSessionModel` **成功返回**为准——
 * 不是乐观更新：调用失败时（没配 key、这一轮还没说完）不能显示成换过了。
 *
 * key 是 sessionId，**作用域写在 key 里**：模型是会话级的，
 * 不是窗口级也不是全局的。pi 那边 `setModel` 会写 agentDir 的全局默认，
 * 但我们每会话一个 agentDir，所以那份全局默认也被关在会话里（Spike E）。
 */
export const $sessionModels = atom<Readonly<Record<string, string>>>({})

export function setSessionModel(sessionId: string, model: string): void {
  const prev = $sessionModels.get()
  if (prev[sessionId] === model) return
  $sessionModels.set({ ...prev, [sessionId]: model })
}

/** 当前会话的上下文用量（①-B″ · U3）。后端权威，这里只是缓存 */
export const $contextUsage = atom<ContextUsage | undefined>(undefined)
export const setContextUsage = (v: ContextUsage | undefined) => $contextUsage.set(v)
