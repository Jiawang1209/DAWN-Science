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
  setArtifacts,
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
  type ArtifactList,
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

/**
 * **`verified: false` 就过几秒再问。** 有加密文件时，后端在钥匙串预热（首帧后 5 秒）之前答不出哪些 key 解得开——
 * 那时 `configured` 是按文件里有没有键答的，`broken` 是空的。预热完没有人来推（凭证没有事件流），所以这边追问；
 * 有界：最多追 10 次（30 秒），之后就当它核验不了了，别无限打 IPC。
 *
 * **预算按轮算，不按整个进程算**（审查 2026-09-01）。四处调用点（启动、存 key、删 key、打开设置）各自是新的一轮：
 * 之前的计数器是进程级一份，启动那轮把 10 次用光之后，用户再打开设置看到的永远是预热前的答案——
 * 界面看着完全正常，那是最难查的一种坏。同一个理由下的另外两条：
 * - **同时只留一条链**：两问同时在飞时各排各的定时器，两条链分一份预算，30 秒窗口塌成 15 秒。
 *   新的一轮开始就把旧轮的定时器清掉，旧轮迟到的答案也不再排追问（世代比对）。
 * - **追问途中抖一次不死**：`.catch(fail)` 一句就把整轮杀了，而屏上还是预热前的答案。失败照样出声，
 *   但吃着这一轮的预算接着追。**第一问就失败的不重试**——屏上没有临时答案要换，出声就够了，再试就是反复报错。
 */
const 核验追问 = { 上限: 10, 间隔ms: 3_000 }
const 追问状态: { 世代: number; 次数: number; 定时器: ReturnType<typeof setTimeout> | undefined } = {
  世代: 0,
  次数: 0,
  定时器: undefined,
}
export const loadCredentials = (c: WorkbenchClient): Promise<void> => {
  停掉核验追问()
  return 问一次凭证(c, ++追问状态.世代)
}
/** 测试与 `resetAllState` 用：清掉挂着的定时器，让在飞的答案作废，下一问从零起算 */
export function 停掉核验追问(): void {
  clearTimeout(追问状态.定时器)
  追问状态.定时器 = undefined
  追问状态.次数 = 0
  追问状态.世代 += 1
}
function 问一次凭证(c: WorkbenchClient, 世代: number): Promise<void> {
  return c
    .get<CredentialState>("listCredentials")
    .then((v) => {
      // 旧轮迟到的答案整个作废，不只是不排追问（2026-09-01 终审抓的）：启动那轮（预热前）还在飞、用户打开设置，
      // 新轮先答回核验过的并画对了，旧轮慢半拍的 `verified:false` 落地一盖，而它排追问时世代对不上直接返回——
      // 屏上就永远停在预热前的答案。`resetAllState` 里的 `停掉核验追问()` 也靠这一句才真的停得住
      if (世代 !== 追问状态.世代) return
      setCredentials(v)
      if (v.verified === false) 再问凭证(c, 世代)
    })
    .catch((e: unknown) => {
      // 作废的一轮失败了也不出声：新的一轮在飞，它会自己说
      if (世代 !== 追问状态.世代) return
      fail(e)
      if (追问状态.次数 > 0) 再问凭证(c, 世代)
    })
}
function 再问凭证(c: WorkbenchClient, 世代: number): void {
  // 更新的一轮已经开始：旧轮的答案用着，但追问由新轮排
  if (世代 !== 追问状态.世代) return
  if (追问状态.次数 >= 核验追问.上限) return
  追问状态.次数 += 1
  clearTimeout(追问状态.定时器)
  追问状态.定时器 = setTimeout(() => {
    追问状态.定时器 = undefined
    void 问一次凭证(c, 世代)
  }, 核验追问.间隔ms)
}

export const loadContextUsage = async (
  c: WorkbenchClient,
  sessionId: string | undefined,
): Promise<void> => {
  // 没有会话就把它清掉。**留着上一个会话的数字是最坏的一种**——
  // 它看起来是真的
  if (!sessionId) return setContextUsage(undefined)
  await c
    .get<import("../panels.js").ContextUsage>("getContextUsage", { sessionId })
    // 身份守卫(审查 debug I3):快点两会话时,A 的用量回来晚了不许写进 B 的面板。
    // 与 resyncSession 同一道防线——比对这条响应属于的会话是否还是当前活跃的那个。
    .then((v) => { if (sessionId === $activeSessionId.get()) setContextUsage(v) })
    .catch(fail)
}

export const loadProviders = (c: WorkbenchClient): Promise<void> =>
  c.get<Providers>("getProviders").then(setProviders).catch(fail)

export const loadSessions = (c: WorkbenchClient, projectId: string): Promise<void> =>
  c.get<SessionSummary[]>("listSessions", { projectId }).then((v) => {
      setSessions(v)
    })
    .catch(fail)

/**
 * @param sessionId 给了就只取**这段会话**的 Run（2026-08-20，作者定的：
 *   概览「应该是针对单一一个会话的，而不是全部的概览」）。协议与后端
 *   一直支持这个参数，只是界面从没传过。不给 = 项目全量（没选会话时
 *   审阅那一格还要用）。
 */
export const loadRuns = (c: WorkbenchClient, projectId: string, sessionId?: string): Promise<void> =>
  c.get<RunSummary[]>("listRuns", { projectId, ...(sessionId ? { sessionId } : {}) }).then((v) => {
      // 身份守卫(I3):按会话取的账本,回来晚了不许覆盖已切走的会话。
      // sessionId 缺省 = 项目全量(审阅那格用),没有会话可比,照旧应用。
      if (sessionId && sessionId !== $activeSessionId.get()) return
      setRuns(v)
    })
    .catch(fail)

/**
 * 当前会话的产物（spec 2026-08-26-产物）。没有会话就清空，不发请求。
 */
export const loadArtifacts = (c: WorkbenchClient, sessionId: string | undefined): Promise<void> => {
  if (!sessionId) {
    setArtifacts(undefined)
    return Promise.resolve()
  }
  return c
    .get<ArtifactList>("listArtifacts", { sessionId })
    .then((v) => {
      // 身份守卫：回来晚了不许覆盖已切走的会话
      if (sessionId !== $activeSessionId.get()) return
      setArtifacts(v)
    })
    .catch((e: unknown) => {
      fail(e)
      // **失败也要落成一个状态**：留着 undefined 面板会一直转圈，那是把「取不到」说成「还在取」
      if (sessionId !== $activeSessionId.get()) return
      setArtifacts({ artifacts: [], unknown: [], error: e instanceof Error ? e.message : String(e) })
    })
}

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
        team: snap.team,
        // 内核状态（笔记本，2026-08-26）：重连也要带上「当前是什么」，同一条缝——
        // 与上面 kernelInstanceId 那条注释是同一个洞：只在实时更新那一路灌的话，
        // 跳号自愈 / 切会话重订阅回来的这一刻，坞会先说「没有内核」，等下一条 kernels 更新才补上
        kernels: snap.kernels,
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
  /**
   * **自己的世代，不借 `guard()` 那个**（2026-08-22 抓的）。
   * `guard()` 的计数器是全局一份：这里领一个新号，就把正在飞的 `resyncSession` 判成了过时——
   * 切会话时恰好有一条 Run 详情在取，整份快照（含会话开关）就被静静丢掉。
   * 症状是「同一段会话，第一次点开没有权限那颗，切走再回来就有」。
   * 两个互不相干的请求不该共用一个「谁更新」的判据。
   */
  const 我的 = ++运行详情世代
  const 过时 = () => 我的 !== 运行详情世代
  c.get<RunDetail>("getRun", { runId })
    .then((r) => {
      if (!过时()) setRunDetail(r)
    })
    .catch(fail)
  c.get<ProvenanceLink>("getProvenance", { resourceId: runId })
    .then((p) => {
      if (!过时()) setProvenance(p)
    })
    .catch(() => {})
}
let 运行详情世代 = 0
