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
  Artifact,
  Cost,
  FileChangeFacts,
  ProjectSummary,
  ProvenanceLink,
  RemoteConnection,
  TaskSummary,
  RunSummary,
  SessionSummary,
} from "../../protocol/index.js"
import { sameList, setList, setValue } from "./identity.js"
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

/** `listArtifacts` 的返回：本会话的产物清单，外加认不出的那几次工具调用 */
export interface ArtifactList {
  artifacts: readonly Artifact[]
  unknown: readonly { runId: string; toolCallId?: string }[]
  /** 取清单失败时带上原因（审查 2026-08-26）：不带的话面板永远转圈，「没取到」与「取不到」分不开 */
  error?: string
}

/** 当前会话的产物（spec 2026-08-26-产物）。缺省 = 还没取到 / 没有会话 */
export const $artifacts = atom<ArtifactList | undefined>(undefined)
export const setArtifacts = (v: ArtifactList | undefined) => setValue($artifacts, v)

/**
 * 当前会话笔记本里的 cell 数（plan 2026-08-26-笔记本 Task 8）：坞标签「笔记本」的角标读它。
 * 与 `$artifacts` 同一条路——RightDock 拿不到转录，App 在 `items` 变化时从 `cells(items).length` 灌进来。
 */
export const $cellCount = atom<number>(0)
export const setCellCount = (v: number) => setValue($cellCount, v)

export const $providers = atom<Providers>({ agents: [], providers: [] })
export const $credentials = atom<CredentialState>({ configured: [], encrypted: false })
/**
 * **目录与凭证「到手了没有」**（2026-08-28，打包版首启抓的）。
 *
 * 此前首启向导与底部红字拿 `providers.providers.length > 0` 当「目录到手」的信号。
 * 可 `getProviders` 回的 `providers` 只包含**被 native agent 用到的服务商**——发布出去的默认配置
 * 刻意不放 native，于是全新安装的机器上那个列表永远是空的，**向导永远不亮、红字也不亮**，
 * 用户看到的是一个空白首页，一开口走 claude CLI。作者机器上看得到向导，是因为打包版把开发版的旧配置迁了过去。
 * 「到手」就该是「回复来了」这件事本身，与内容多少无关。
 */
export const $providersLoaded = atom<boolean>(false)
export const $credentialsLoaded = atom<boolean>(false)

export const setProjects = (v: readonly ProjectSummary[]) => setList($projects, v)
export const setSessions = (v: readonly SessionSummary[]) => setList($sessions, v)

/**
 * **临时会话**（2026-08-11）：没有指定项目的那些。
 *
 * 作者：*「会话其实更倾向于，没有设置工作路径的、或者没有设置项目的临时会话。」*
 *
 * **与 `$sessions` 分开存**，因为它们回答两个问题：
 * 那一份是「当前这个项目里有哪些会话」，这一份是「不属于任何项目的有哪些」。
 * 合成一份就得在每个使用点重新过滤，而漏掉一处的表现是
 * 临时会话跑进项目里，或者反过来。
 */
export const $tempSessions = atom<readonly SessionSummary[]>([])
export const setTempSessions = (v: readonly SessionSummary[]) => setList($tempSessions, v)
export const setRuns = (v: readonly RunSummary[]) => setList($runs, v)
export const setRunDetail = (v: RunDetail | undefined) => setValue($runDetail, v)
export const setProvenance = (v: ProvenanceLink | undefined) => setValue($provenance, v)

export function setProviders(v: Providers): void {
  if (!$providersLoaded.get()) $providersLoaded.set(true)
  const prev = $providers.get()
  /**
   * **按内容比，不只按 id**（2026-08-21 修）。
   *
   * 上一版只比两串 id：名单没变就当什么都没变。于是「给 claude-code-acp
   * 标上能上服务器」文件写了、后端内存换了，界面停在旧数据上——
   * 按钮按了没反应。同一个洞也咬得到 provider 的模型清单。
   * `sameList` 是全站那条「内容没变就不换引用」的实现，嵌套字段走序列化比较。
   */
  if (sameList(prev.agents, v.agents) && sameList(prev.providers, v.providers)) return
  $providers.set(v)
}

export function setCredentials(v: CredentialState): void {
  if (!$credentialsLoaded.get()) $credentialsLoaded.set(true)
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
/**
 * **2026-08-11 起连 provider 一起记。**
 *
 * 换模型现在可以**跨服务**（作者：*「同一个对话，我切换到 Kimi 的时候，
 * 直接就重新新建对话了。这不是我所期待的。」*），
 * 于是「当前是哪个」光有 model 已经答不上来——
 * 两家可以有同名模型，而界面要说出「现在答话的是谁」。
 */
export interface CurrentModel {
  /** native 才有；cli 会话没有 provider 这个概念 */
  provider?: string
  model: string
}

export const $sessionModels = atom<Readonly<Record<string, CurrentModel>>>({})

export function setSessionModel(sessionId: string, model: string, provider?: string): void {
  const prev = $sessionModels.get()
  const now: CurrentModel = { ...(provider ? { provider } : {}), model }
  const was = prev[sessionId]
  if (was && was.model === now.model && was.provider === now.provider) return
  $sessionModels.set({ ...prev, [sessionId]: now })
}

/** 当前会话的上下文用量（①-B″ · U3）。后端权威，这里只是缓存 */
export const $contextUsage = atom<ContextUsage | undefined>(undefined)
export const setContextUsage = (v: ContextUsage | undefined) => $contextUsage.set(v)

/**
 * 远端连接名单（②-B · R3）。**服务端说了算**——
 * 界面自己维护一份状态会猜成「以为连着」。
 */
export const $connections = atom<readonly RemoteConnection[]>([])
export const setConnections = (v: readonly RemoteConnection[]) => setList($connections, v)

/**
 * 只把**一台**的状态换掉（推送来时用）。
 *
 * 不整份重取的原因：状态每变一次就重问一次列表，会在断线抖动时
 * 打出一串请求；而且列表回来之前那一小段时间里，界面显示的是旧状态。
 */

/**
 * **此刻哪几段会话正在等模型回话**（2026-08-19）。
 *
 * 作者选的形状：*「换成时间，但『正在跑』要看得见。」*
 * 侧栏那一列平时写「多久之前」，只有这一段真在干活时换成一个跑着的标记。
 *
 * ## 它从推送流里来，不从账本里来
 *
 * 账本里也有 `status = 'running'`，但那是**落了盘的**：
 * 应用崩过一次之后，那些 run 会永远停在 `running`——
 * 于是侧栏会显示一堆根本没在跑的东西，**而那种谎最难发现**。
 * 推送流则天然是对的：**重启之后什么都没在跑，那就是实话。**
 *
 * ## 为什么不复用当前会话那个 `busy`
 *
 * `busy` 是从 `$items` 派生的，而 `$items` **只有当前正在看的那一段**。
 * 侧栏问的是「别的那几段呢」——同一个判据（有一条还没 `final` 的 agent 轮次），
 * 两个作用域。判据只写一次，见 `App.tsx` 里那个订阅。
 */
export const $跑着的会话 = atom<ReadonlySet<string>>(new Set<string>())

/** **没变就不换引用**：每来一个 token 换一次 Set，整条侧栏会跟着重渲染 */
export function 标记在跑(sessionId: string, 在跑: boolean): void {
  const 现在 = $跑着的会话.get()
  if (现在.has(sessionId) === 在跑) return
  const 下一个 = new Set(现在)
  if (在跑) 下一个.add(sessionId)
  else 下一个.delete(sessionId)
  $跑着的会话.set(下一个)
}

export function setConnectionState(connectionId: string, state: RemoteConnection["state"]): void {
  const 现在 = $connections.get()
  const i = 现在.findIndex((c) => c.id === connectionId)
  // **不认识的 id 就丢掉**：凭一条推送凭空造一台服务器，
  // 那台机器的其余字段全是编的
  if (i < 0) return
  const 下一份 = [...现在]
  下一份[i] = { ...现在[i]!, state }
  $connections.set(下一份)
}

/**
 * 「远端连接」那一区展开着没有。
 *
 * **默认收起**：没有远端的人不该为此多占一行。
 * 不持久化——它是这个窗口此刻的样子，与 dock 同一条理由。
 */
export const $remoteOpen = atom(false)
export const toggleRemoteOpen = () => $remoteOpen.set(!$remoteOpen.get())
export const setRemoteOpen = (v: boolean) => $remoteOpen.set(v)

/**
 * 某个远端会话换目录了（②-B · R4′）。
 *
 * **只改那一条**，不整份重取：模型可能连着 `cd` 好几次，
 * 每次重取一遍列表既慢又会让侧栏抖。
 */
export function setSessionCwd(sessionId: string, cwd: string): void {
  for (const [store, set] of [
    [$tempSessions, setTempSessions],
    [$sessions, setSessions],
  ] as const) {
    const 现在 = store.get()
    const i = 现在.findIndex((s) => s.sessionId === sessionId)
    // **不认识的会话就跳过**：凭一条推送造一个会话出来，其余字段全是编的
    if (i < 0) continue
    const s = 现在[i]!
    if (!s.remote) continue
    const 下一份 = [...现在]
    下一份[i] = { ...s, remote: { ...s.remote, cwd } }
    set(下一份)
  }
}

/**
 * 任务（T2/T3）。**它取代此前的三样**：项目、项目下的会话、临时会话。
 *
 * 作者：*「任务 = 一段对话 + 一个可选的工作路径；不设路径就是普通对话。」*
 */
export const $tasks = atom<readonly TaskSummary[]>([])
export const setTasks = (v: readonly TaskSummary[]) => setList($tasks, v)

/**
 * **未读**（codex-polish ⑤，2026-08-22，学自 dsh-codex-ui 的未读圆点）：
 * 一段会话在你没看着的时候（不是当前选中）说完了一轮 → 记一个点；点开就清。
 * 持久化 `dawn.global.unread`：重启之后「哪几段回来了还没看」不该忘。人也能手动标回未读。
 */
const UNREAD_KEY = "dawn.global.unread"
const 读未读 = (): ReadonlySet<string> => {
  try {
    const raw = localStorage.getItem(UNREAD_KEY)
    const arr: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [])
  } catch {
    return new Set()
  }
}
export const $未读 = atom<ReadonlySet<string>>(typeof localStorage === "undefined" ? new Set<string>() : 读未读())
export function 标未读(sessionId: string, 未读: boolean): void {
  const 现在 = $未读.get()
  if (现在.has(sessionId) === 未读) return
  const 下一个 = new Set(现在)
  if (未读) 下一个.add(sessionId)
  else 下一个.delete(sessionId)
  $未读.set(下一个)
  try {
    localStorage.setItem(UNREAD_KEY, JSON.stringify([...下一个]))
  } catch (e) {
    console.error("[未读] 记不住，本次仍然生效：", e)
  }
}
