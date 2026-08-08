/**
 * 后端目录数据的缓存：项目、会话、Run、provider、凭证。
 *
 * **这一整个文件都是缓存，不是所有物。**
 * 别的界面（CLI、另一个窗口）也能改这些东西，所以刷新是**新信息叠加**，
 * 不是可以丢掉活跃行的替换。写入一律走 `setList`，内容没变就不换引用。
 */
import { atom } from "nanostores"
import type {
  Cost,
  FileChangeFacts,
  ProjectSummary,
  ProvenanceLink,
  RunSummary,
  SessionSummary,
} from "../../protocol/index.js"
import { setList, setValue } from "./identity.js"

/** `getRun` 的返回：Run 摘要 + 可选的产出事实与成本 */
export type RunDetail = RunSummary & { fileChanges?: FileChangeFacts; cost?: Cost }

export interface Providers {
  agents: { agentId: string; kind: "native" | "pty" }[]
  providers: { providerId: string; models: string[] }[]
}

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
