/**
 * 外壳。
 *
 * **信息架构学 Claude app：打开就是对话，侧栏常驻。**
 *
 * 2026-08-08 修正（作者反馈「和 Claude app 完全不一样」）。初版有三处偏差，
 * 第一处是坏的：
 *   1. **UI 里根本没有「新建会话」入口**——`createSession` 一次都没被调用，
 *      也就是说这个 app 做不了它最该做的那件事
 *   2. 侧栏默认隐藏——我把 Rho 的 agent-first 单栏照搬过来，
 *      **却没察觉它与「模仿 Claude app」直接冲突**
 *   3. 打开后看到的是一页统计面板——我把作者说想知道的四样
 *      （状态/产出/成本/历史）做成了首页，但那是**偶尔查**的东西，
 *      不是**打开时要看**的东西
 *
 * 现在：侧栏常驻、新建会话是主动作、默认进对话、项目概览降为侧栏底部入口。
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { useStore } from "@nanostores/react"
import type { ProjectSummary, SessionSummary, SessionUpdate } from "../protocol/index.js"
import {
  AttributionCaveat,
  ChangesPanel,
  ContextPanel,
  CostPanel,
  ProvenanceBadge,
  RunsPanel,
  mayIncludeUserEdits,
  StatusPanel,
  ToolChangesPanel,
  VariablesPanel,
  EnvironmentPanel,
  type EnvironmentState,
  type VariablesState,
} from "./panels.js"
import {
  ConversationView,
  EmptyConversation,
  SessionSidebar,
  SideSash,
  TerminalView,
  type ModelChoice,
  type ServiceChoice,
} from "./views.js"
import {
  AppearancePanel,
  KernelsPanel,
  SettingsPanel,
  SettingsShell,
  PermissionPanel,
  WorkspacePanel,
  type KernelRow,
} from "./Settings.js"
import { 外观图标, 文件夹图标, 模型图标, 终端图标, 侧栏图标, 搜索图标, 设置图标 } from "./icons.js"
import { Button, Loader } from "./primitives.js"
import { FilesView, type FileContent, type Listing } from "./files.js"
import { SkillsView, McpView, PluginsView, type SkillLoad, type MCP装载 } from "./skills.js"
import { TerminalDock } from "./dock.js"
import { ConfirmDialog, type ConfirmRequest } from "./confirm.js"
import { ConnectionDialog, RemoteSection, type ConnectionDraft } from "./remote.js"
import { 新建会话可选的 } from "./agents.js"
import { ConnectionSurface } from "./connection.js"
import { CommandPalette } from "./palette.js"
import { buildCommands, type Actions } from "./commands.js"
import { createClient, type WorkbenchClient } from "./client.js"
import {
  $activeProjectId,
  $activeSessionId,
  $credentials,
  $sessionModels,
  $contextUsage,
  $items,
  $notes,
  $projects,
  $providers,
  $provenance,
  $connection,
  $ready,
  $runDetail,
  $runs,
  $sessions,
  $tempSessions,
  $terminal,
  $terminalTrimmed,
  $kernelInstanceId,
  $view,
  appendBytes,
  applySnapshot,
  connectFailed,
  connectStarted,
  connectSucceeded,
  fail,
  fatalReason,
  loadCredentials,
  loadProjects,
  loadProviders,
  loadContextUsage,
  loadRunDetail,
  loadRuns,
  carryDraft,
  draftOf,
  loadSessions,
  loadTempSessions,
  loadConnections,
  loadTasks,
  $tasks,
  setConnectionState,
  setSessionCwd,
  $connections,
  $remoteOpen,
  toggleRemoteOpen,
  setDraft,
  note,
  resyncSession,
  resetTranscript,
  setActiveProjectId,
  setActiveSessionId,
  setSessionModel,
  setSessions,
  $dockOpen,
  $dockSessionId,
  toggleDock,
  setDockOpen,
  setDockSessionId,
  setDockChunks,
  appendDockBytes,
  resetDockTerminal,
  setTheme,
  setView,
  upsertItem,
  $sidebarWidth,
  $sidebarCollapsed,
  setSidebarWidth,
  setSidebarCollapsed,
  toggleSidebar,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
} from "./state/index.js"

import { t, tf, $lang } from "./i18n/index.js"
/**
 * @param injected 测试注入点。**不要写成默认参数** `client = createClient()`——
 *   默认参数每次渲染都求值，于是每次渲染都得到一个新的 client 身份，
 *   每个依赖 `client` 的 effect 就每次渲染都重跑：重新订阅（累积 IPC 监听器）
 *   + 重新取数（setState）→ 再渲染 → **无限循环**。
 *   真机后果是渲染进程 18 秒吃满 4 GB。而 419 个测试全都显式传了 client，
 *   **那条生产环境唯一走的默认路径从来没被跑过**。见 tests/ui/app-default-client.test.tsx。
 */
export function App({ client: injected }: { client?: WorkbenchClient }) {
  const client = useMemo(() => injected ?? createClient(), [injected])

  /**
   * 状态**全部住在 state/ 里，按权威分家**（`state/index.ts` 的文件头有分家表）。
   *
   * 这里只订阅要渲染的部分。**非渲染路径一律用 `$atom.get()` 直读**——
   * 那样既拿到最新值，又不会让这个组件因为它变化而重渲染。
   * 此前 `watching` 那个 ref 存在的唯一理由就是绕开闭包捕获的旧值，
   * 现在不需要了：atom 本来就是同步可读的。
   */
  const ready = useStore($ready)
  const connection = useStore($connection)
  const notes = useStore($notes)
  const projects = useStore($projects)
  const sessions = useStore($sessions)
  const tempSessions = useStore($tempSessions)
  const runs = useStore($runs)
  const runDetail = useStore($runDetail)
  const provenance = useStore($provenance)
  const providers = useStore($providers)
  const creds = useStore($credentials)
  const sessionModels = useStore($sessionModels)
  const contextUsage = useStore($contextUsage)
  const projectId = useStore($activeProjectId)
  const sessionId = useStore($activeSessionId)
  const view = useStore($view)
  const items = useStore($items)
  const termChunks = useStore($terminal)
  const termTrimmed = useStore($terminalTrimmed)
  const kernelInstanceId = useStore($kernelInstanceId)
  const dockOpen = useStore($dockOpen)
  const dockSessionId = useStore($dockSessionId)
  const sidebarWidth = useStore($sidebarWidth)
  const sidebarCollapsed = useStore($sidebarCollapsed)
  /**
   * **换语言 = 整棵树重挂**（2026-08-13）。
   *
   * `t()` 是普通函数调用，不是 hook——它读的是 `$lang.get()`，
   * 组件不会因为它变了而重渲染。给外壳一个 `key={lang}` 是最省事、
   * 也最诚实的做法：**换语言那一刻整屏重画一次**。
   *
   * 代价说清楚：组件里的局部 state（展开了哪个菜单、光标在哪）会丢。
   * 换语言是罕见动作，而**让每个组件各自 `useStore($lang)`** 的代价是
   * 十几个文件里都要多一行、且漏一处就是「那一块没跟着换」——
   * 那种漏法在界面上表现为半中半英，比丢一次菜单状态难查得多。
   *
   * 草稿不会丢：它住在 `$drafts` 这个 store 里，不在组件里。
   */
  const lang = useStore($lang)
  /**
   * 侧栏的搜索（2026-08-13，作者要的）。
   *
   * **短命的交互细节留在组件里，不进全局 store**（`state/index.ts` 的头注：
   * *「一个新的全局 store 是在主张『很多互不相邻的界面都需要它』」*）。
   * 这里只有两处用它——顶栏那颗按钮与侧栏那个框，而它们都在这一层底下。
   *
   * **关掉就清空**：留着上次搜的词，下次打开会是「一进来就已经过滤掉大半」，
   * 人会以为对话不见了。命令面板那条查询词也是这么处理的，同一个理由。
   */
  const [搜索开着, 设搜索开着] = useState(false)
  const [搜索词, 设搜索词] = useState("")

  /**
   * 握手。**失败不再是一个终局的 `fatal` 字符串**，而是进重试状态机：
   * 重试有界，用尽后给出真的能点的出路（见 state/connection.ts）。
   */
  const connect = useCallback(() => {
    connectStarted()
    client
      .handshake()
      .then(connectSucceeded)
      .catch((e: unknown) => connectFailed(e instanceof Error ? e.message : String(e)))
  }, [client])

  useEffect(connect, [connect])

  useEffect(() => {
    if (!ready) return
    void loadProjects(client)
    void loadCredentials(client)
    void loadProviders(client)
    // 临时会话不属于任何项目，所以它不跟着「当前项目」走，开机就取一次
    void loadTempSessions(client)
    // 远端连接名单同理——它不属于任何项目（②-B · R3）
    void loadConnections(client)
    // 任务（T2）：它也不属于任何项目——它就是那个「属于」本身
    void loadTasks(client)
  }, [ready, client])

  /**
   * 有项目就选中第一个。
   *
   * 不这么做的话，重开 app 时侧栏列着项目、「＋ 新建会话」却是禁用的，
   * 还提示「先打开一个项目文件夹」——**明明已经有项目了**。
   * 这个缺陷是 Task 2.23 的 App 级测试撞出来的，叶子组件测试碰不到它。
   */
  useEffect(() => {
    // **临时项目不算数**：它是一次没指定项目的对话，不该被当成「当前项目」
    const 正式的 = projects.filter((p) => !p.temporary)
    if (projectId === undefined && 正式的.length > 0) setActiveProjectId(正式的[0]!.projectId)
  }, [projects, projectId])

  useEffect(() => {
    if (!projectId) return
    void loadSessions(client, projectId)
    void loadRuns(client, projectId)
  }, [client, projectId])

  /**
   * 推送流。**只订阅一次**，进来的更新按当前正在看的会话过滤——
   * 每次切会话都退订重订会在切换的空隙里漏掉更新。
   */
  useEffect(() => {
    if (!ready) return
    return client.subscribeUpdates({
      onUpdate: (u: SessionUpdate) => {
        // **直读 atom，不用闭包捕获的值。** 这个订阅只建立一次，
        // 闭包里的 sessionId 会永远停在建立那一刻
        /**
         * **底部终端是第二条线**（2026-08-11）。
         *
         * dock 里那个终端与当前对话**同时活着**——你一边让模型干活，
         * 一边在下面 `ls` 看它到底写出了什么。所以这里按 sessionId 分流，
         * 各写各的 atom；混在一起的话，终端的字节会流进对话的终端视图。
         */
        /**
         * **当前目录变了**（②-B · R4′）。模型 `cd` 之后头上那一条要立刻跟上——
         * 慢一步，人看到的就是上一个目录。
         */
        if (u.type === "cwd") {
          setSessionCwd(u.sessionId, u.cwd)
          return
        }
        if (u.sessionId === $dockSessionId.get()) {
          if (u.type === "bytes") appendDockBytes(u.data)
          // 快照里的终端是**一整段字符串**（不是片段数组）
          if (u.type === "snapshot") setDockChunks(u.snapshot.terminal ? [u.snapshot.terminal] : [])
          if (u.type === "state" && u.state === "exited") {
            const pid = $activeProjectId.get()
            if (pid) void loadSessions(client, pid)
          }
          return
        }
        if (u.sessionId !== $activeSessionId.get()) return
        if (u.type === "item") upsertItem(u.item)
        if (u.type === "bytes") appendBytes(u.data)
        if (u.type === "snapshot") {
          applySnapshot({
            items: u.snapshot.items,
            terminal: u.snapshot.terminal,
            trimmed: u.snapshot.terminalTrimmed,
            // **当前**内核实例。缺省 = 还没有内核，不是「不陈旧」
            kernelInstanceId: u.snapshot.kernelInstanceId,
          })
        }
        // 会话退出要立刻反映到侧栏与输入框，否则还能继续打字却写不进去
        if (u.type === "state" && u.state === "exited") {
          const pid = $activeProjectId.get()
          if (pid) void loadSessions(client, pid)
        }
      },
      /**
       * **跳号不再只是报警，而是重新同步。**
       * 旧设计（seq + 环形缓冲）少的那一段补不回来，只能告诉用户「丢了」。
       */
      onResync: (sessionId) => void resyncSession(client, sessionId),
      /**
       * 连接状态是**推来的**（②-B · R3）。
       *
       * 轮询的话，从断开到被发现之间那段时间里界面显示的是「连着」——
       * **那是一个看起来很确定的谎**。这里只换那一台的状态，
       * 不整份重取：断线抖动时重取会打出一串请求，
       * 而列表回来之前界面显示的仍是旧的。
       */
      onRemote: (u) => setConnectionState(u.connectionId, u.state),
      onProblem: note,
    })
    // **依赖里刻意不放 projectId**：它变化时不该退订重订，
    // 那会在切换的空隙里漏掉更新。回调内部直读 atom 拿最新值
  }, [ready, client])

  /**
   * **一整轮是不是还开着。** 由 `items` 派生，但它一轮只翻两次
   * （false→true→false），不像 `items` 每来一个 token 就变一次——
   * 所以它可以进 effect 依赖，`items` 不行。下面那个 effect 依赖的就是这个区别。
   */
  const busy = items.some((i) => i.type === "turn" && i.who === "agent" && !i.final)

  /**
   * 重取账本：列表 + 最新那条的详情 + 上下文用量。
   *
   * **只在项目概览开着时做**——这三样只长在那一屏，没人看的时候不该打 IPC。
   *
   * ## 为什么必须一路取到 `getRun`
   *
   * 产出栏的数字**不是存下来的，是 `getRun` 每次调用现算的**
   * （中枢里的 `diffSince(workspace, baseline)`）。只重取 `listRuns` 不够：
   * 最新那条 Run 的 id 通常**没变**，而 `latestRunId` 没变就不会触发下面那个
   * effect，**屏幕上那份 diff 仍然是旧的**——而且它长得和新的一模一样，
   * 没有任何东西会说它过期了。
   *
   * ## 一律直读 atom
   *
   * 它同时被 effect 和 `window` 的 focus 监听器调用，而后者活得比任何一次渲染都长，
   * 闭包捕获的值会永远停在挂监听那一刻。这正是文件头那条
   * 「非渲染路径一律用 `$atom.get()` 直读」说的场景。
   */
  const refreshLedger = useCallback(async () => {
    if ($view.get() !== "panel") return
    void loadContextUsage(client, $activeSessionId.get())
    const pid = $activeProjectId.get()
    if (!pid) return
    await loadRuns(client, pid)
    loadRunDetail(client, $runs.get()[0]?.runId)
  }, [client])

  useEffect(() => {
    /**
     * **依赖里绝不能放 `items`。** 它每来一个 token 就变一次，
     * 于是每个 token 打一次 IPC——第一版就是这么写的，
     * 表现为整个 e2e 套件开始随机超时（每次挂的还不是同一条）。
     *
     * 2026-08-09（U4 补验的 e2e 撞出来的生产缺陷）：`loadRuns` 此前**只挂在
     * `projectId` 变化上**，而项目在启动时就定下来了——于是这份列表永远停在
     * 「打开项目那一刻」，之后账本记了什么，界面一概不知道。
     * 受害的不止变更 pane，`runs[0]` 还喂着产出与成本两个面板，
     * **三个一起在真实产物上是死的，而它们各自的单元测试全绿**。
     * 与下面「产出与成本从这里来」那段注释记的是同一种死法，隔了几个 Task 又来一次。
     *
     * `busy` 进依赖是为了**回合结束时再取一次**：人可以开着概览等结果，
     * 只在打开时取一次的话，那一屏会一直停在回合开始前的样子。
     */
    void refreshLedger()
  }, [refreshLedger, sessionId, view, projectId, busy])

  /**
   * **窗口重新拿到焦点也要重取。**（①-B″ · U4 追加项的一半）
   *
   * 计划原写的是用 `@parcel/watcher` 监听工作区。查下来那句话**指错了面板**：
   * 变更 pane 显示的是逐次工具调用**当时**拍下的历史事实，外部编辑不该改写它；
   * 真正会过期的是产出栏，因为它现算。
   *
   * 而「切到编辑器改文件、再切回 DAWN」这个主场景，focus 就够了，
   * **代价是零依赖、零协议改动**。原生模块 + 项目级推送通道换来的增量只是
   * 「并排放着不切窗口也刷新」，留到阶段 ③ 与 worktree 隔离一起做——
   * 那时工作区归 agent 独占，「谁改的」才分得清，监听的语义也才干净。
   */
  useEffect(() => {
    const onFocus = () => void refreshLedger()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [refreshLedger])

  /**
   * 切换 dock 里看的终端：**先清空再取快照**，否则上一个终端的输出
   * 会倒灌进这一个。与主区那条是同一套纪律，只是写的是另一份 atom。
   */
  useEffect(() => {
    resetDockTerminal()
    if (!dockSessionId) return
    client
      .get<{ terminal?: string; revision: number; sessionId: string }>("subscribeSession", {
        sessionId: dockSessionId,
      })
      .then((snap) => {
        // 取回来时人可能已经切走了——**过去的结果不许覆盖现在的**
        if (snap.sessionId !== $dockSessionId.get()) return
        setDockChunks(snap.terminal ? [snap.terminal] : [])
        client.expectRevision(dockSessionId, snap.revision)
      })
      .catch(fail)
    return () => {
      client.forgetRevision(dockSessionId)
      client.get("unsubscribeSession", { sessionId: dockSessionId }).catch(fail)
    }
  }, [client, dockSessionId])

  /** 切会话：清空 transcript 并作废飞行中的请求，再取新会话的全量快照 */
  useEffect(() => {
    resetTranscript()
    if (!sessionId) return
    /**
     * **取完快照要把会话列表也重取一遍**（会话续接，2026-08-11）。
     *
     * 订阅这一步会把一段已退出的对话**续起来**（后端做的），于是它的状态
     * 从 `exited` 变回 `alive`。而列表是另一次请求取回来的——不重取的话，
     * 界面上那条仍写着「已退出」，输入框也仍然是禁用的：
     * **对话恢复出来了，人却打不了字**。
     */
    void resyncSession(client, sessionId).then(() => {
      // 直接调用而不是依赖上面的 `重取会话`：它定义在后面，
      // 而这个 effect 要早于它——**这三行就是它做的事**
      const pid = $activeProjectId.get()
      if (pid) void loadSessions(client, pid)
      void loadTempSessions(client)
    })
    return () => {
      client.forgetRevision(sessionId)
      client.get("unsubscribeSession", { sessionId }).catch(fail)
    }
  }, [client, sessionId])

  /**
   * 最新 Run 的详情：**产出与成本从这里来**。
   *
   * 初版把 `facts={undefined}` 写死在 JSX 里，产出栏因此永远显示「无法确定」——
   * 那三条硬要求里的第一条（可能包含你自己的修改）在真实界面上永远不会出现。
   * 测试是绿的，功能是死的。
   */
  const latestRunId = runs[0]?.runId
  useEffect(() => {
    loadRunDetail(client, latestRunId)
  }, [client, latestRunId])

  /**
   * 成本属于**回合**，不属于工具调用。
   *
   * 上一版取的是 `runDetail?.cost ?? latestRun?.cost`，而 `latestRun` 是
   * `runs[0]`——**最新那条 run**。一轮里只要有过一次工具调用，
   * 最新那条就是 `tool_call:...`，它身上没有成本，于是成本栏显示「尚未记录」。
   *
   * **native 的那条 e2e 之所以是绿的，是因为它那一轮没有工具调用**，
   * 正好把这个掩盖了。claude 那条（假 CLI 会调一次工具）当场就红了。
   */
  const latestCost = useMemo(
    () => runs.find((r) => r.requestType === "agent_turn" && r.cost !== undefined)?.cost,
    [runs],
  )

  /**
   * 本机内核（②-A · K2）。**每次打开设置都重扫，不缓存**——
   * 人可能刚在别处 `installspec` 了一个，缓存住的表现是「我装了但 DAWN 看不见」，
   * 而那看起来像 DAWN 坏了。
   */
  const [kernels, setKernels] = useState<{
    kernels: KernelRow[]
    problems: { dir: string; reason: string }[]
    shadowed: { name: string; dir: string }[]
  }>({ kernels: [], problems: [], shadowed: [] })
  const refreshKernels = useCallback(() => {
    client.get<typeof kernels>("listKernels", {}).then(setKernels).catch(fail)
  }, [client])

  /**
   * 两个解释器路径（2026-08-10，作者定的机制）。
   * **没配的那个是 undefined**，界面据此显示「还没配置」而不是一个空串。
   */
  const [interpreters, setInterpreters] = useState<{ python?: string; r?: string }>({})
  const refreshInterpreters = useCallback(() => {
    client.get<{ python?: string; r?: string }>("getInterpreters", {}).then(setInterpreters).catch(fail)
  }, [client])
  const saveInterpreter = useCallback(
    (language: "python" | "R", path: string) => {
      client
        .get<{ python?: string; r?: string; problem?: string }>("setInterpreter", { language, path })
        .then((r) => {
          setInterpreters({ ...(r.python ? { python: r.python } : {}), ...(r.r ? { r: r.r } : {}) })
          // **当场把问题说出来**：保存成功却用不了，比直接说不行更糟
          if (r.problem) fail(new Error(r.problem))
        })
        .catch(fail)
    },
    [client],
  )
  useEffect(() => {
    if (view !== "settings") return
    refreshKernels()
    refreshInterpreters()
  }, [view, refreshKernels, refreshInterpreters])

  /**
   * 这个会话现在有哪些变量（②-A · K5 · S14）。
   *
   * **进概览时问一次，换会话时重问**——不做轮询：
   * 每次问都是一次内核往返，轮询会让一个空着的面板持续骚扰内核。
   * 想看最新的，切走再切回来（与产出栏同一个手势）。
   */
  const [variables, setVariables] = useState<VariablesState>(undefined)
  useEffect(() => {
    if (view !== "panel" || !sessionId) {
      setVariables(undefined)
      return
    }
    client
      .get<Exclude<VariablesState, undefined>>("listVariables", { sessionId })
      .then(setVariables)
      .catch(fail)
  }, [client, view, sessionId])

  /**
   * 环境快照（S17）。与变量同一个手势：**开着面板时取一次**。
   *
   * 但它与变量有一处根本不同：**变量会变，环境不会**——
   * 这一份是准入时刻冻结的，重取只是为了切会话时换成新会话的那一份。
   */
  /**
   * 工具权限档位（2026-08-13）。**进设置时取一次**——它不会自己变。
   */
  /** 上一次「按科研目录结构初始化」做了什么。**做完要出声** */
  const [目录说明, 设目录说明] = useState<string | undefined>(undefined)

  const [权限档, 设权限档] = useState<"allow-all" | "deny-risky">("allow-all")
  useEffect(() => {
    if (view !== "settings") return
    client
      .get<{ mode: "allow-all" | "deny-risky" }>("getPermissionMode", {})
      .then((r) => 设权限档(r.mode))
      .catch(fail)
  }, [client, view])

  const [environment, setEnvironment] = useState<EnvironmentState>(undefined)
  useEffect(() => {
    if (view !== "panel" || !sessionId) {
      setEnvironment(undefined)
      return
    }
    client
      .get<Exclude<EnvironmentState, undefined>>("getEnvironment", { sessionId })
      .then(setEnvironment)
      .catch(fail)
  }, [client, view, sessionId])

  /**
   * 能用来**开一段对话**的那些。
   *
   * **终端不在里面**（2026-08-11）：`shell` 那种 `kind: pty` 的 agent
   * 开出来的是一个终端，而终端已经有自己的家（对话区底下那条 dock）。
   * 留在这个清单里，人就会在「新建会话，用哪个 LLM」的菜单里看见 `shell`——
   * 而它既不是 LLM，点了也不会开出一段对话。
   */
  const agentIds = useMemo(
    () => providers.agents.filter((a) => a.kind !== "pty").map((a) => a.agentId),
    [providers],
  )

  /**
   * 新建会话并直接进对话。
   *
   * **侧栏与空对话区共用它**——Hermes：*"One action, one home. A command may have
   * keyboard, palette, and visible affordances, but they invoke the same action
   * and state. Do not fork behavior per entry point."*
   */
  /* ── 文件浏览（②-A′ · F3/F4） ─────────────────────────────────── */

  const [filePath, setFilePath] = useState<string | undefined>(undefined)
  const [fileContent, setFileContent] = useState<FileContent | undefined>(undefined)

  /**
   * 列一层目录。**失败要抛出去**——`DirNode` 接住之后显示原因，
   * 静静地给一个空目录会被读成「这个文件夹是空的」。
   */
  const loadDir = useCallback(
    async (path: string): Promise<Listing> => {
      if (!projectId) throw new Error(t("还没有选中项目"))
      return await client.get("listDirectory", { projectId, path })
    },
    [client, projectId],
  )

  /**
   * 打开一个文件。**先清空内容再取**——不清的话，上一个文件的内容会顶着
   * 新文件的名字显示一瞬间，那一瞬间是在说谎。
   */
  const openFile = useCallback(
    (path: string) => {
      setView("files")
      setFilePath(path)
      setFileContent(undefined)
      if (!projectId) return
      client
        .get<FileContent>("readFile", { projectId, path })
        .then(setFileContent)
        .catch(fail)
    },
    [client, projectId],
  )

  const openExternally = useCallback(
    (path: string) => {
      if (!projectId) return
      client
        .get<{ problem?: string }>("openExternally", { projectId, path })
        // **系统拒绝要出声**，不是什么都没发生
        .then((r) => { if (r.problem) fail(new Error(r.problem)) })
        .catch(fail)
    },
    [client, projectId],
  )

  /* ── 删除（2026-08-10） ──────────────────────────────────────── */

  const [confirming, setConfirming] = useState<ConfirmRequest | undefined>(undefined)

  /**
   * ── 远端连接（②-B · R3/R4）───────────────────────────────────────
   *
   * 名单与状态在 store 里（服务端说了算）；**这里只有三样此刻的东西**：
   * 正在编辑哪一台、哪一台正在连、上一次操作出了什么错。
   */
  const connections = useStore($connections)
  const tasks = useStore($tasks)

  /**
   * **新建任务**（T2/T3）：建出来 + 进去聊。
   *
   * 作者要的「新建任务」就是这一颗。**不问工作路径**——
   * 先聊起来，需要落到某个目录再设（`setTaskWorkspace`）。
   * 那正是他定的形状：*「不设置任何工作目录的话，就是我们的普通对话。」*
   */
  /**
   * **回到初始画面**（2026-08-12，作者定案）。
   *
   * 作者：*「我一旦直接开始对话，其实就算是一个普通的会话了……
   * 当然，我点击新建任务之后，依旧也是这个画面，然后我可以选择文件夹，
   * 一旦选择文件夹了，那么就是一个项目。」*
   *
   * **所以「新建任务」不建任何东西**——它只是把人送回那个画面。
   * 真正建出来的那一刻是**第一次开口**，那时才知道要不要带工作目录，
   * 也才知道该归到哪一栏。
   *
   * 副作用是个好的：**点一下不再冒出一行「新任务」**。
   * 一段还没说过话的对话本来就不该占据侧栏的一行。
   */
  const 回到初始画面 = useCallback(() => {
    setActiveSessionId(undefined)
    setView("conversation")
  }, [])

  const 新建任务 = async (
    opts: {
      workspace?: string | undefined
      firstMessage?: string | undefined
      agentId?: string | undefined
      /** 第一句话带的图（协议 4.13）。**空态那一屏也能粘图** */
      images?: readonly import("./views.js").图片来源[] | undefined
    } = {},
  ) => {
    const { workspace, firstMessage, images } = opts
    const agentId = opts.agentId ?? agentIds[0]
    if (!agentId) {
      note(t("配置里还没有可用的 agent——先去设置里加一个"))
      return
    }
    /**
     * **记下按下时人在哪一屏**（2026-08-12 补上，与 `startSession` 同一条）。
     *
     * 漏掉这一句的后果是：「按下新建任务 → 还没建好 → 人切到项目概览 →
     * 回调到了」会把他**从刚打开的那一屏上拽走**，而且之后没有任何东西
     * 把他送回去。这条路在 `startSession` 上 2026-08-09 就修过一次，
     * 我新写这条时**把它落下了**——`app-mvp` 里那条用例当场抓住。
     *
     * 它在 e2e 全量跑里出现过两次，单独跑必绿：
     * **「只在忙的时候错」不是偶发，是窗口小。**
     */
    const from = $view.get()
    try {
      const t = await client.get<import("../protocol/index.js").TaskSummary>("createTask", {
        agentId,
        // **不给就是不给**：`workspace: undefined` 与「没设」是同一件事，
        // 而空串会被记成「设了一个空路径」——那是第三种状态，没人想要
        ...(workspace ? { workspace } : {}),
      })
      await loadTasks(client)
      /**
       * **给了路径就跟着切到它的项目**（2026-08-12）。
       *
       * 会话落在 `projects.open(workspace)` 那个项目里，而当前项目还是上一个——
       * 于是它**两拨列表里都找不到**（`tempSessions` 不含它，`sessions` 装的是别的
       * 项目的），主区当场停在空态：**人打完字按了发送，屏幕纹丝不动。**
       *
       * 这个洞我在 `设工作目录` 里补过一次，**这条路上漏了**——
       * 同一种病的第二个入口。e2e 截图当场抓到。
       */
      if (workspace) {
        await loadProjects(client)
        const 新家 = $projects.get().find((p) => p.workspace === workspace)?.projectId
        if (新家) {
          setActiveProjectId(新家)
          await loadSessions(client, 新家)
        }
      } else {
        await loadTempSessions(client)
      }
      if (t.sessionId) {
        // 取写权，否则第一句就会被租约挡下（与其余几条建会话的路同一条）
        await 取写权(t.sessionId)
        /**
         * **建完立刻把第一句发出去**（2026-08-12）。
         *
         * 空态那张输入卡与起手卡片都走这条：人已经打好字了，
         * 让他建完再打一遍是**为了迁就界面而多走一步**。
         *
         * **不做本地乐观追加**：与手动发送同一条路径，自己说的话经事件回灌进来。
         */
        /**
         * **只有图、没有字也算一句话**（2026-08-13）。
         * 「看看这张」这种意图，人常常懒得打字——
         * 拦下来的表现是「粘了图、按了发送，什么都没发生」。
         */
        if (firstMessage || (images && images.length > 0)) {
          try {
            await client.get("writeToSession", {
              sessionId: t.sessionId,
              data: firstMessage ?? "",
              as: "user",
              ...(images && images.length > 0 ? { images: [...images] } : {}),
            })
          } catch (e) {
            /**
             * **第一句没发出去，这段对话就不该存在**（2026-08-13，作者报的
             * *「回车，结果给我的反馈是：还没有对话」*）。
             *
             * 人的意图是「用这句话开一段对话」。话没送出去，
             * **留下的就只是一条空壳**——它会挂在侧栏上，点进去什么都没有，
             * 而人根本不知道它是哪来的。
             *
             * 所以收掉它，然后把错误抛给调用点：空态那张卡会**把字和图还回去**，
             * 并把原因摆在输入框旁边。**建会话 + 发第一句是一个意图，
             * 要么都成，要么都不留下痕迹。**
             */
            await client.get("deleteTask", { taskId: t.taskId }).catch(() => {})
            await loadTasks(client).catch(() => {})
            throw e
          }
        }
        /**
         * **发成功了才进对话**（2026-08-13 调的顺序）。
         *
         * 此前是先进去再发——于是第一句失败时人已经站在那个空对话里了，
         * 屏幕上写着「还没有对话」，而他刚打的字和挑的图都没了。
         *
         * 写入本身很快（把 prompt 交给运行时就返回，不等模型），
         * 所以这一下推迟在人那儿感觉不到；换来的是**失败时他还在原地**。
         *
         * 「人还在原地才进对话」那条守卫保留：**他自己切走了就尊重他的选择**。
         */
        setActiveSessionId(t.sessionId)
        if ($view.get() === from) setView("conversation")
      }
    } catch (e) {
      /**
       * **这里不报，往上抛**（2026-08-13 修，一次自伤）。
       *
       * 上一版同时做了 `fail(e)`（走那条全局提示）**和** `throw e`
       * （让空态那张卡显示）——于是同一句话在屏幕上出现两次，
       * Playwright 的严格模式当场撞上。**而它撞的正是我们自己那条
       * 「两处长得一样的东西，等于没有判据」。**
       *
       * 谁报由**调用点**决定，因为只有它知道人正在看哪儿：
       *   - 空态那张输入卡 → 摆在输入框旁边（人正盯着它）
       *   - 侧栏那颗 `＋`   → 没有输入卡可摆，走全局提示
       */
      throw e
    }
  }
  /**
   * 当前这段对话属于哪个任务（T3-b）。
   *
   * **工作目录长在任务上，不在会话上**——会话总有一个目录（服务端给的
   * scratch），而那个目录是实现细节。摆出来只会让人看见一个自己从没选过的路径。
   */
  const 当前任务 = tasks.find((t) => t.sessionId === sessionId)

  /**
   * 设/改/取消这段对话的工作目录（T3-b）。
   *
   * **后端会把运行时真的搬过去**（连 pi 的历史一起），所以这里只需要
   * 把三份列表重取一遍：任务（决定侧栏归到哪一栏）、项目（新长出来的那条）、
   * 会话（它换了项目，两拨的归属都变了）。
   */
  const 设工作目录 = async (taskId: string, workspace: string | undefined) => {
    try {
      await client.get("setTaskWorkspace", { taskId, ...(workspace ? { workspace } : {}) })
      await loadTasks(client)
      await loadProjects(client)
      await loadTempSessions(client)
      /**
       * **跟着切到它的新家**（2026-08-12）。
       *
       * 这段会话刚从「临时会话」项目搬进了那个路径的项目——
       * 不切的话它**两拨列表里都找不到**（`tempSessions` 不再有它，
       * `sessions` 装的还是上一个项目的），主区当场退回空态：
       * **人刚点完「选一个文件夹」，对话就没了。** e2e 截图抓到的就是这一幕。
       */
      const 新家 = workspace
        ? $projects.get().find((p) => p.workspace === workspace)?.projectId
        : undefined
      if (新家) setActiveProjectId(新家)
      const pid = 新家 ?? $activeProjectId.get()
      if (pid) await loadSessions(client, pid)
    } catch (e) {
      fail(e)
    }
  }

  /** 弹原生目录选择器再设。**取消就什么都不做**——改主意不是错误 */
  const 选工作目录 = async (taskId: string) => {
    const ws = await client.pickDirectory(默认工作区?.path)
    if (!ws) return
    await 设工作目录(taskId, ws)
  }

  /**
   * App 的默认工作目录（2026-08-12）。**没配过时用系统默认**
   * （mac `~/DAWN`、Windows 桌面），`isDefault` 说的就是这件事。
   */
  const [默认工作区, 设默认工作区状态] = useState<{ path: string; isDefault: boolean } | undefined>(
    undefined,
  )
  useEffect(() => {
    if (!ready) return
    client
      .get<{ path: string; isDefault: boolean }>("getDefaultWorkspace", {})
      .then(设默认工作区状态)
      .catch(() => {
        /** **读不到就不显示那一格**，不摆一个猜出来的路径——那会指错地方 */
      })
  }, [client, ready])
  const 设默认工作区 = async (path: string) => {
    try {
      设默认工作区状态(
        await client.get<{ path: string; isDefault: boolean }>("setDefaultWorkspace", { path }),
      )
    } catch (e) {
      fail(e)
    }
  }

  const remoteOpen = useStore($remoteOpen)
  const [connDraft, setConnDraft] = useState<
    (ConnectionDraft & { hasSecret?: boolean }) | undefined
  >(undefined)
  const [connBusy, setConnBusy] = useState<string | undefined>(undefined)
  const [connProblem, setConnProblem] = useState<string | undefined>(undefined)
  const [connSaving, setConnSaving] = useState(false)

  const saveConnection = async (d: ConnectionDraft) => {
    setConnSaving(true)
    setConnProblem(undefined)
    try {
      await client.get("saveConnection", {
        ...(d.id ? { id: d.id } : {}),
        label: d.label,
        ...(d.group ? { group: d.group } : {}),
        host: d.host.trim(),
        ...(d.port ? { port: d.port } : {}),
        username: d.username.trim(),
        ...(d.privateKeyPath ? { privateKeyPath: d.privateKeyPath } : {}),
        /**
         * **没动过那个框就不传**（不是传空串）。
         *
         * 传空串是「清除」；不传是「别动」。分不清这两者的话，
         * 改一次分组就会把口令弄丢——而那个框永远是空的，因为它从不回显。
         */
        ...(d.secret === undefined ? {} : { secret: d.secret }),
      })
      await loadConnections(client)
      setConnDraft(undefined)
    } catch (e) {
      // **失败就留在对话框里**：关掉它等于把人填的东西一起丢了
      setConnProblem(e instanceof Error ? e.message : String(e))
    } finally {
      setConnSaving(false)
    }
  }

  /**
   * 在一台服务器上开一段对话（②-B · R4′）。
   *
   * **没连上就先连**（服务端负责），起点是那台机器的家目录。
   * 人点的是「在这台机器上干活」，不该让他先按一次连接再按一次新建。
   */
  const startRemoteSession = async (c: { id: string; label: string }) => {
    const agentId = agentIds[0]
    if (!agentId) {
      setConnProblem(t("配置里还没有可用的 agent——先去设置里加一个"))
      return
    }
    setConnBusy(c.id)
    setConnProblem(undefined)
    try {
      /**
       * **走 `createTask`，不走 `createRemoteSession`**（2026-08-14 作者报的）。
       *
       * 作者：*「新建的对话要收录到下面的服务器的收纳里面。」*
       * 而侧栏在任务模型之后**以任务为骨架**——`createRemoteSession` 只起会话、
       * 不建任务，于是那段对话在收纳里根本不存在。
       *
       * 走任务这条路还顺带把另一件事补上了：那些远端对话**终于能像别的任务一样
       * 改名、置顶、批量删**——它们此前不能，正因为它们不是任务。
       */
      const t = await client.get<import("../protocol/index.js").TaskSummary>("createTask", {
        agentId,
        connectionId: c.id,
      })
      await Promise.all([loadConnections(client), loadTasks(client), loadTempSessions(client)])
      if (!t.sessionId) throw new Error("任务建好了却没有会话——这一步不该悄悄过去")
      setActiveSessionId(t.sessionId)
      setView("conversation")
      // 写权由上面那个 effect 统一持有（选中即取、到点即续）——**这里不再抄一遍**
      await 取写权(t.sessionId)
    } catch (e) {
      // **开不起来要说清为什么**，就在那一区里
      setConnProblem(e instanceof Error ? e.message : String(e))
    } finally {
      setConnBusy(undefined)
    }
  }

  const connectRemote = async (id: string) => {
    setConnBusy(id)
    setConnProblem(undefined)
    try {
      await client.get("connectRemote", { id })
      await loadConnections(client)
    } catch (e) {
      /**
       * **连不上要说清是为什么。**
       *
       * 口令错、主机不通、私钥读不到——在界面上都长成「连不上」，
       * 但要人去改的东西完全不同。所以把底层那句话原样带上来。
       */
      setConnProblem(e instanceof Error ? e.message : String(e))
      await loadConnections(client)
    } finally {
      setConnBusy(undefined)
    }
  }

  /**
   * 上一次换模型／换服务为什么没成（2026-08-11）。
   * **摆在 composer 上**，不是只丢进状态栏那一行小字——
   * 作者报的「点了没反应」，实情多半是「点了，失败了，但那句话在屏幕另一头」。
   */
  const [switchProblem, setSwitchProblem] = useState<string | undefined>(undefined)

  /**
   * pi 认识的全部 provider（2026-08-10）。**「我能配谁」，不是「我配过谁」**。
   * 只在打开设置时取一次——它不会变，而进设置之前没人看得见它。
   */
  const [knownProviders, setKnownProviders] = useState<{
    providers: string[]
    models?: Record<string, string[]>
    needsBaseUrl?: string[]
    connections?: Record<string, { baseUrl?: string; api?: string; models?: string[] }>
    problem?: string
  }>({ providers: [] })
  useEffect(() => {
    if (view !== "settings") return
    client
      .get<typeof knownProviders>("listKnownProviders", {})
      .then(setKnownProviders)
      .catch(fail)
  }, [view, client])

  /**
   * 删会话。**账本不动**——那句话要在按下之前就在屏幕上，
   * 否则「删除」会被读成「历史也没了」。
   */
  /**
   * **取当前这段对话的写权**（规格 7.1 的租约）。
   *
   * ## 作者报的那个「不能输入了」就是这里
   *
   * *「我一旦点击了新对话，原来的对话就不能再输入任何信息了：
   * 写入被拒——user 未持有会话的租约（当前持有者：无）。」*
   *
   * 租约有 **5 分钟 TTL**（`LeaseManager`），而界面此前**只在建会话那一刻取一次**：
   *   - 切回一段旧对话 → 那时它的租约早过期了，没人再去取
   *   - 在同一段对话里待过五分钟再开口 → 同样写不进去
   *
   * 所以写权不该是「建的时候顺手取一下」，而是**「当前这段对话，界面一直持有它」**：
   * 选中就取，选中期间按 TTL 的一半续。
   *
   * **它只有这一份实现。** 此前这句话在三个建会话的地方各抄了一遍，
   * 我加远端那条路时漏了第四遍——症状是能打字、能按发送，然后什么都不发生。
   */
  const 写进去 = useCallback(
    async (
      id: string,
      data: string,
      images?: readonly import("./views.js").图片来源[],
      /** 上一轮还在跑时怎么进去（协议 5.6）：`steer` 插队、`followUp` 排队 */
      behavior?: "steer" | "followUp",
    ) => {
      /** 空数组与不给是同一个意思——**别把一个空 `images` 送下去** */
      const 带图 = images && images.length > 0 ? { images: [...images] } : {}
      /** **不忙时不给**：缺席与「排队」在协议上不是一回事 */
      const 带送法 = behavior ? { behavior } : {}
      try {
        await client.get("writeToSession", { sessionId: id, data, as: "user", ...带图, ...带送法 })
      } catch (e) {
        /**
         * **被租约挡下时，重取一次再发。**
         *
         * 上面那个 effect 在会话选中期间按 TTL 的一半续租，但它是个定时器——
         * **机器睡一觉、系统把定时器冻住，回来时租约就已经过期了**。
         * 那一刻人按下发送，看到的会是一行「写入被拒」，而他什么也没做错。
         *
         * 重取是安全的：租约的抢占是不对称的（规格 7.1），**user 本来就可以抢**，
         * 而按下发送正是「我现在要写」这个意思本身。
         * 只重试一次——两次还不行就是别的原因，那时要如实报出来。
         */
        const 像租约 = e instanceof Error && /租约/.test(e.message)
        if (!像租约) throw e
        await client.get("acquireLease", { sessionId: id, holder: "user" })
        await client.get("writeToSession", { sessionId: id, data, as: "user", ...带图, ...带送法 })
      }
    },
    [client],
  )

  const 取写权 = useCallback(
    (id: string) =>
      client
        .get("acquireLease", { sessionId: id, holder: "user" })
        .catch((e: unknown) => {
          // **拿不到要出声**：静默的话，人要等到按下发送才发现自己写不进去
          note(e instanceof Error ? e.message : String(e))
        }),
    [client],
  )

  /**
   * 选中哪一段，就持有哪一段的写权，**并且续着**。
   *
   * 续期间隔取 TTL 的一半（TTL 300 秒）：一半是通用做法——
   * 慢到不至于让服务端被请求淹没，快到足以在过期之前一定续上一次。
   */
  useEffect(() => {
    if (!ready || !sessionId) return
    void 取写权(sessionId)
    const t = setInterval(() => void 取写权(sessionId), 150_000)
    return () => clearInterval(t)
  }, [ready, sessionId, 取写权])

  const askDeleteSession = useCallback(
    (s: SessionSummary) => {
      const 名 = s.title ?? "新会话"
      setConfirming({
        title: tf("删除会话「{0}」？", 名),
        detail: <>{t("会停掉它的进程，并删掉这个会话与它的对话记录。")}</>,
        safety: <>{t("账本不动：这个会话对文件做过什么，记录仍然留在「项目概览」里。")}</>,
        confirmLabel: "删除会话",
        onConfirm: () => {
          client
            .get<{ ledgerKept: number }>("deleteSession", { sessionId: s.sessionId })
            .then(() => {
              // 删的正好是当前这个，就把选中清掉——**不要留一个指向空的选中**
              if ($activeSessionId.get() === s.sessionId) {
                setActiveSessionId(undefined)
                setView("conversation")
              }
              const pid = $activeProjectId.get()
              if (pid) void loadSessions(client, pid)
              // **临时会话不跟着当前项目走**，删完得单独重取，否则那一行还挂着
              void loadTempSessions(client)
              void loadProjects(client)
              // **任务列也要重取**（T3-a）：侧栏那两栏都是从它长出来的，
              // 不重取的话删掉的那一行还在，点进去是一段不存在的会话
              void loadTasks(client)
            })
            .catch(fail)
        },
      })
    },
    [client],
  )

  /**
   * 移除项目。**先问后端要真数字**——界面手里的会话列表与账本都是局部的，
   * 摆一个猜出来的数字比不摆更坏。
   */
  /**
   * 改名 / 置顶 / 挪位置。
   *
   * **三个都要重取会话列表**：顺序与置顶都是后端定的
   * （`sort_order` 在库里，界面自己排等于第二份实现）。
   */
  const 重取会话 = useCallback(() => {
    const pid = $activeProjectId.get()
    if (pid) void loadSessions(client, pid)
    // 临时会话不跟着当前项目走，得单独重取
    void loadTempSessions(client)
    /**
     * **项目列表上那个「N 个会话」也要跟着变**（2026-08-11）。
     *
     * 它来自 `listProjects` 的 `totalSessionCount`，而那份只在启动时取过一次——
     * 于是新建一个会话之后，项目行上的数字**一直停在旧值**。
     * 一个不会变的计数比没有计数更坏：它看起来像事实。
     */
    void loadProjects(client)
  }, [client])

  const renameSession = useCallback(
    (s: SessionSummary, title: string) => {
      // **没变就不打 IPC**：点进改名又原样退出是常事
      if ((s.title ?? "") === title.trim()) return
      client.get("renameSession", { sessionId: s.sessionId, title }).then(重取会话).catch(fail)
    },
    [client, 重取会话],
  )

  const pinSession = useCallback(
    (s: SessionSummary, pinned: boolean) => {
      client.get("setSessionPinned", { sessionId: s.sessionId, pinned }).then(重取会话).catch(fail)
    },
    [client, 重取会话],
  )

  const moveSession = useCallback(
    (s: SessionSummary, direction: "up" | "down") => {
      /**
       * **已经在头/尾时什么都不做**，不出声也不撒谎——
       * 后端如实回 `moved: false`，那是一个正常结果。
       */
      client
        .get<{ moved: boolean }>("moveSession", { sessionId: s.sessionId, direction })
        .then((r) => { if (r.moved) 重取会话() })
        .catch(fail)
    },
    [client, 重取会话],
  )

  /**
   * 拖拽排序。**发完整顺序，服务端一次写完**——
   * 在界面里算「插在 A 与 B 之间」的位置需要间隙分配，间隙用光还得重排。
   */
  const reorderSessions = useCallback(
    (orderedIds: string[]) => {
      /**
       * **项目取自会话自己，不是「当前项目」**（2026-08-11）。
       *
       * 临时会话属于那个「临时会话」项目，而当前项目多半是别的——
       * 用当前项目去发，服务端会因为「这些 id 不属于这个项目」而全部忽略，
       * **一条都不报错，列表纹丝不动**。e2e 的拖拽用例当场抓到了它。
       */
      const 头 = orderedIds[0]
      const 属于 =
        $sessions.get().find((x) => x.sessionId === 头)?.projectId ??
        $tempSessions.get().find((x) => x.sessionId === 头)?.projectId
      if (!属于) return
      client.get("reorderSessions", { projectId: 属于, orderedIds }).then(重取会话).catch(fail)
    },
    [client, 重取会话],
  )

  /**
   * 移除项目。**收哪个项目由调用方给**（2026-08-11）——
   * 侧栏现在是一列项目，删的不一定是当前那个。
   * 不给就删当前那个（项目概览里那个入口就是这么调的）。
   */
  /**
   * **批量删除**（2026-08-12，作者：*「会话越来越多了，能否给我来一个
   * 批量处理的选项，我可以批量删除」*）。
   *
   * 走的是**同一个 `deleteSession`**，不是新造一个批量端点：
   * 「删一段对话」这件事已经有一个家（会停进程、删任务、留账本），
   * 再写一个批量版就是第二份实现，两份迟早不一致。
   *
   * **确认框摆真数字**，并把「不会发生什么」说在前面——
   * 与单条删除同一条：账本不动。
   */
  const askDeleteMany = useCallback(
    (targets: readonly import("../protocol/index.js").TaskSummary[], done: () => void) => {
      if (targets.length === 0) return
      setConfirming({
        title: tf("删除这 {0} 段对话？", targets.length),
        detail: <>{t("会停掉它们的进程，并删掉这些会话与它们的对话记录。")}</>,
        safety: <>{t("账本不动：它们对文件做过什么，记录仍然留在「项目概览」里。")}</>,
        confirmLabel: tf("删除 {0} 段", targets.length),
        onConfirm: () => {
          /**
           * **一条条删，不并发**。后端每次删都要停进程、动库、算账本，
           * 十几条同时发过去只会让失败更难归因——而这里最要紧的是
           * **哪一条没删掉要说得出来**。
           */
          void (async () => {
            const 没删掉: string[] = []
            for (const t of targets) {
              try {
                /**
                 * **按 taskId 删**（协议 4.9）。按 sessionId 的话，
                 * 迁移过来的那些一条都删不掉——界面手上没有它们的会话摘要。
                 */
                await client.get("deleteTask", { taskId: t.taskId })
              } catch {
                没删掉.push(t.title ?? t.taskId)
              }
            }
            if ($activeSessionId.get() && targets.some((t) => t.sessionId === $activeSessionId.get())) {
              setActiveSessionId(undefined)
              setView("conversation")
            }
            const pid = $activeProjectId.get()
            if (pid) await loadSessions(client, pid)
            await loadTempSessions(client)
            await loadTasks(client)
            await loadProjects(client)
            // **失败必须出声**，而且要说清是哪几条（规格 7.5）
            if (没删掉.length > 0) note(tf("有 {0} 段没删掉：{1}", 没删掉.length, 没删掉.join("、")))
            done()
          })()
        },
      })
    },
    [client],
  )

  /**
   * **批量移除项目**（2026-08-13，作者：*「项目里面没有批量删除项目的选项，
   * 可以模仿一下会话的批量管理」*）。
   *
   * 与批量删会话同一副骨架：**复用已有的单条端点，一条条来**，
   * 不新造一个批量端点——「移除一个项目」这件事已经有一个家
   * （会删它名下的会话与账本，磁盘上的文件夹一个都不动）。
   *
   * **两条路，因为项目未必有 id**：拿得到就走 `deleteProject`（连账本一起收）；
   * 拿不到（迁移过来、界面还没认识它的会话）就删它底下那些任务。
   * 后者正是作者上一轮报过的「历史遗留的删不掉」，这里从一开始就避开。
   */
  const askDeleteProjects = useCallback(
    (
      groups: readonly {
        workspace: string
        projectId?: string
        tasks: readonly import("../protocol/index.js").TaskSummary[]
      }[],
      done: () => void,
    ) => {
      if (groups.length === 0) return
      const 会话数 = groups.reduce((n, g) => n + g.tasks.length, 0)
      setConfirming({
        title: tf("从工作台移除这 {0} 个项目？", groups.length),
        detail: (
          <>
            {/* **整句走 `tf`，不拿 `<b>` 把它劈成两半**——英文语序不同，拼出来是半句话 */}
            {tf("会一并移除它们名下的 {0} 段对话与相应的账本记录。", 会话数)}
          </>
        ),
        safety: (
          <>
            <b>{t("磁盘上的文件夹一个都不会被删除。")}</b>
            <br />
            {groups.map((g) => g.workspace).join("\n")}
          </>
        ),
        confirmLabel: tf("移除 {0} 个", groups.length),
        onConfirm: () => {
          void (async () => {
            const 没删掉: string[] = []
            for (const g of groups) {
              try {
                if (g.projectId) {
                  await client.get("deleteProject", { projectId: g.projectId })
                } else {
                  // **没有 projectId 也要删得掉**：按 taskId 走（协议 4.9）
                  for (const t of g.tasks) await client.get("deleteTask", { taskId: t.taskId })
                }
              } catch {
                没删掉.push(g.workspace)
              }
            }
            const pid = $activeProjectId.get()
            if (pid && groups.some((g) => g.projectId === pid)) {
              setActiveProjectId(undefined)
              setActiveSessionId(undefined)
              setView("conversation")
            }
            await loadTempSessions(client)
            await loadTasks(client)
            await loadProjects(client)
            // **失败必须出声**，而且说得出是哪几个（规格 7.5）
            if (没删掉.length > 0) note(tf("有 {0} 个没移除：{1}", 没删掉.length, 没删掉.join("、")))
            done()
          })()
        },
      })
    },
    [client],
  )

  const askDeleteProject = useCallback((projectId?: string) => {
    const pid = projectId ?? $activeProjectId.get()
    if (!pid) return
    const 名 = projects.find((p) => p.projectId === pid)?.name ?? pid
    client
      .get<{ sessions: number; runs: number; workspace: string }>("deletionImpact", { projectId: pid })
      .then((impact) => {
        setConfirming({
          title: tf("从工作台移除项目「{0}」？", 名),
          detail: (
            <>
              {tf(
                "会一并移除它名下的 {0} 个会话与 {1} 条账本记录。账本是按项目组织的，项目没了它就没有归属。",
                impact.sessions,
                impact.runs,
              )}
            </>
          ),
          safety: (
            <>
              <b>{t("磁盘上的文件夹不会被删除。")}</b>
              <br />
              {impact.workspace}
            </>
          ),
          confirmLabel: t("移除项目"),
          onConfirm: () => {
            client
              .get("deleteProject", { projectId: pid })
              .then(() => {
                /**
                 * **删的是当前那个才清空选中**（2026-08-11）。
                 * 侧栏现在能删任意一个——把别的项目删掉却把人从他正看着的
                 * 会话里踢出去，那是另一种「界面自己动了」。
                 */
                const 删的是当前 = $activeProjectId.get() === pid
                if (删的是当前) {
                  setActiveProjectId(undefined)
                  setActiveSessionId(undefined)
                  setView("conversation")
                }
                /**
                 * **把会话列表也清掉**（2026-08-11 补）。
                 *
                 * 此前只重取了项目：项目从下拉框里消失了，
                 * **它的会话却还留在侧栏上**——点进去是一段属于已删项目的对话。
                 * 会话列表只在「有当前项目」时重取，而这一刻恰恰没有了，
                 * 于是没有任何东西会去清它。
                 */
                if (删的是当前) {
                  setSessions([])
                  // 终端也归项目所有：项目没了，dock 里那个也不该继续指着它
                  setDockSessionId(undefined)
                  setDockOpen(false)
                }
                /**
                 * **任务与临时会话都要重取**（T3-a，2026-08-12）。
                 *
                 * 侧栏那两栏是从任务长出来的。只重取项目的话，
                 * **被删掉那些对话的行还挂在侧栏上**，而且它们的路径还会
                 * 把那个已经不存在的项目继续撑在那儿——
                 * 与 2026-08-11 补的那条（「项目没了会话还留着」）是同一种病。
                 */
                void loadTempSessions(client)
                void loadTasks(client)
                return loadProjects(client)
              })
              .catch(fail)
          },
        })
      })
      .catch(fail)
  }, [client, projects])

  /* ── 底部终端（2026-08-11） ──────────────────────────────────── */

  /** 这个项目里的终端会话。**它们不在会话列表里**，只在 dock 里 */
  const 终端们 = useMemo(() => sessions.filter((x) => x.kind === "pty"), [sessions])
  /** 起终端用哪个 agent。**配置里没有 pty agent 就开不了**，如实说 */
  const ptyAgentId = providers.agents.find((a) => a.kind === "pty")?.agentId
  const currentWorkspace = projects.find((p) => p.projectId === projectId)?.workspace

  /**
   * 开一个新终端。
   *
   * **路径不在这里挑**：会话属于项目，pty 运行时的 cwd 取项目的工作区
   * （`spec.workspace`）。所以「终端开在项目文件夹里」不是这里另做的一件事，
   * 是同一个事实的自然结果——也因此没有第二处可能和它不一致。
   */
  const 开一个终端 = useCallback(() => {
    if (!ptyAgentId) return
    /**
     * **只在那个项目确实还在时才提它**（2026-08-11）。
     *
     * `$activeProjectId` 可能指着一个**刚被删掉**的项目——删除是异步的，
     * 而「掀开 dock 就自动开一个终端」那条 effect 跑得比清理快。
     * 拿一个不存在的 id 去建，后端如实回「项目不存在」，
     * 而屏幕上的表现是**dock 开着、里面永远空着**：一个失败被读成了「没反应」。
     */
    const pid = $activeProjectId.get()
    const 项目还在 = Boolean(pid && $projects.get().some((x) => x.projectId === pid))
    client
      .get<{ sessionId: string }>("createTerminalSession", {
        agentId: ptyAgentId,
        /**
         * **没有项目就不给**——那时服务端把终端开在家目录
         * （作者：*「如果没有选择的话，那么终端就在家目录下」*）。
         * 路径由服务端定：让界面拼路径等于把「shell 从哪儿开」交给渲染进程。
         */
        ...(项目还在 ? { projectId: pid! } : {}),
      })
      .then((r) => {
        setDockSessionId(r.sessionId)
        if (项目还在) void loadSessions(client, pid!)
        void loadTempSessions(client)
        void loadProjects(client)
        /**
         * **取写权，否则每一次按键都会被租约挡下。**
         *
         * 与 `startSession` 那条路上的同一句话（*「取写权，否则第一句就会被
         * 租约挡下」*）。第一版漏了它，症状是**终端能打字、屏幕上也有回显
         * （那是 xterm 自己画的），但进程一个字节都没收到**——
         * 敲 `pwd` 什么都不发生。
         */
        // 终端要立刻能打字，**不等那个 effect 的下一拍**——见 `取写权` 的注释
        return 取写权(r.sessionId)
      })
      .catch(fail)
  }, [client, ptyAgentId])

  /**
   * 掀开 dock 时**如果还没有终端，就开一个**。
   *
   * 点「终端」却看见一个空盒子、还要再点一次「＋ 新终端」——
   * 那是把一次意图拆成两次点击。已经有终端时不多开：那会在你每次
   * 掀开面板时悄悄多起一个进程。
   */
  useEffect(() => {
    if (!dockOpen) return
    if (dockSessionId) return
    const 活着的 = 终端们.find((t) => t.state !== "exited")
    if (活着的) {
      setDockSessionId(活着的.sessionId)
      return
    }
    // **没有项目也能开**——那时终端开在家目录（2026-08-11）
    if (ptyAgentId) 开一个终端()
  }, [dockOpen, dockSessionId, 终端们, projectId, ptyAgentId, 开一个终端])


  /**
   * 当前这一段。**两拨里都要找**（2026-08-11）：
   * `sessions` 是当前项目的，`tempSessions` 是不属于任何项目的临时会话。
   * 只找前者的话，点开一段临时会话会得到「没有这个会话」的空屏。
   */
  const session =
    sessions.find((s) => s.sessionId === sessionId) ??
    tempSessions.find((s) => s.sessionId === sessionId)

  /**
   * 当前会话可选的模型与正在用的那个（①-B″ · U2）。
   *
   * **可选清单不必新造查询**——`getProviders` 已经回传了 `providers[].models`。
   * 当前值：配置里的默认值，换过之后以 `$sessionModels` 为准
   * （那份缓存只在 `setSessionModel` **成功返回**后才更新，不做乐观更新——
   * 没配 key 或这一轮还没说完时，不能显示成换过了）。
   */
  const agentCfg = providers.agents.find((a) => a.agentId === session?.agentId)
  // **看 `available` 不是 `models`。** 后者是「配置里声明用到的」，
  // 前者才是「这个 provider 能用哪些」。缺省时给空数组 → pill 不显示，
  // 那正是「不知道」该有的表现：不假装有得选
  /**
   * 能选哪些模型。**两类会话的来源不同，但纪律是同一条：取不到就不假装有得选。**
   *
   * - **native**：问 pi 的模型目录（`available`）。看它不看 `models`——
   *   后者是「配置里声明用到的」，前者才是「这个 provider 能用哪些」。
   * - **cli**：只能由配置声明（Spike H）。claude / codex **都没有
   *   「列出可选项」的接口**，所以问配置；没声明就空着。
   *
   * 2026-08-09（作者试用后补）：此前只有 native 那一支，于是 cli 会话里
   * 根本没有模型选择器——**用户只看得见 agent pill，而它点了必然新建会话**。
   */
  /**
   * **一家服务该怎么称呼**（2026-08-11）。
   *
   * 作者：*「ds-chat 我感觉不如直接叫 DeepSeek。」*
   * agent id 是 `providers.yaml` 里的一个键——**我们的内部标识**。
   * 名字问 pi 要（`providers[].name`），**没有就退回 id**：那至少是实话，
   * 而手打一份对照表从写下那天起就开始撒谎。
   *
   * cli / pty / kernel 保持用 id：`claude` / `codex` / `shell`
   * 本来就是人叫它们的名字。
   */
  const agentLabel = useCallback(
    (agentId: string): string => {
      const a = providers.agents.find((x) => x.agentId === agentId)
      if (a?.kind !== "native" || !a.provider) return agentId
      return providers.providers.find((p) => p.providerId === a.provider)?.name ?? a.provider
    },
    [providers],
  )

  /**
   * 能换到哪些模型。
   *
   * **native：所有配好的服务 × 各自的模型**（2026-08-11 起跨服务）。
   * 作者：*「同一个对话，我切换到 Kimi 的时候，直接就重新新建对话了。」*——
   * 换一家原本只能靠 agent pill，而那颗必然新建会话；
   * 运行时其实一直支持就地换（`setSessionModel` 收 provider + model），
   * **缺的只是把别家摆进这个菜单**。
   *
   * cli：只能由配置声明（Spike H）——两个外部 CLI 都没有「列出可选项」的接口。
   */
  const currentModel: { provider?: string; model: string } | undefined = sessionId
    ? (sessionModels[sessionId] ??
      (agentCfg?.model
        ? {
            ...(agentCfg.provider ? { provider: agentCfg.provider } : {}),
            model: agentCfg.model,
          }
        : undefined))
    : undefined

  /**
   * **当前这段对话正在用哪家**。
   *
   * 注意它**不是** `agentCfg.provider`——中途换过服务之后，会话用的是新那家，
   * 而配置里那个 agent 一个字都没变。作者：*「我选择 kimi-k3 的时候，
   * 后面的模型厂家能否帮我自动设置为 kimi？」*——就是这一行在管。
   */
  const currentProvider = currentModel?.provider ?? agentCfg?.provider

  /** 能就地换过去的服务。**只有 native 会话有** */
  const services: ServiceChoice[] | undefined =
    agentCfg?.kind === "native"
      ? providers.providers.map((p) => ({
          providerId: p.providerId,
          name: p.name ?? p.providerId,
        }))
      : undefined
  /**
   * provider id → 该怎么称呼（`deepseek` → `DeepSeek`）。
   * **查不到就用 id**：那不好看但是实话，编一个名字会让人以为真有这么一家。
   */
  const serviceLabel = (id: string) =>
    providers.providers.find((p) => p.providerId === id)?.name ?? id
  const currentServiceLabel = currentProvider ? serviceLabel(currentProvider) : undefined

  /**
   * 能选哪些模型。**所有配好的服务 × 各自的模型**（2026-08-12 放开）。
   *
   * ## 为什么放开
   *
   * 2026-08-11 这里收窄成「只列当前这一家」，理由是**厂家由旁边那颗 pill 选**
   * （作者：*「选择 kimi-k3 的时候，前面不用出现 Kimi」*），两颗各管一件事。
   *
   * 现在两颗并成了一颗（作者要的，实测 WorkBuddy 就是一颗）——
   * **那条理由随之失效**：旁边没有那颗了，收窄就等于
   * **换服务这件事从 composer 上消失**。它是真能力（2026-08-11 做的
   * 「换到另一家，对话不断」），丢掉它是静默的功能倒退。
   *
   * 换过去不需要另一条路：`onPickModel` 本来就把这一条的 `provider`
   * 一起发出去（同上那次改动定的），服务端的 `setSessionModel` 收两个字段。
   * **列表里选另一家的模型 = 就地换服务 + 换模型**，对话不断。
   *
   * cli：只能由配置声明（Spike H）——两个外部 CLI 都没有「列出可选项」的接口。
   */
  const modelChoices: ModelChoice[] =
    agentCfg?.kind === "cli"
      ? (agentCfg.models ?? []).map((m) => ({ model: m }))
      : providers.providers.flatMap((p) =>
          (p.available ?? []).map((m) => ({ provider: p.providerId, model: m })),
        )

  /**
   * **界面上所有动作的唯一定义处**（①-B″ · U1）。
   *
   * Hermes：*"One action, one home. A command may have keyboard, palette, and
   * visible affordances, but they **invoke the same action and state**.
   * **Do not fork behavior per entry point**."*
   *
   * 这个对象出现之前，`() => setView("settings")` 在本文件里**写了四遍**，
   * 中止与打开项目还各自带着实现——命令面板再加一个入口就是第五份。
   * 现在按钮、快捷键、命令面板拿到的是同一个函数。
   */
  const actions = useMemo<Actions>(
    () => ({
      openSettings: () => setView("settings"),
      /** 掀开／收起底部终端。**与 composer 上那颗是同一个动作** */
      toggleDock: () => toggleDock(),
      showConversation: () => setView("conversation"),
      showProjectPanel: () => setView("panel"),
      /**
       * **面板里那条也是「新建任务」**（T4，2026-08-13）。
       *
       * 此前它调 `startTemporarySession`——那是任务模型之前的路，
       * **绕过了工作目录那一步**，建出来的永远是普通会话。
       * 现在与侧栏那颗、与顶栏那个标志是同一个动作：回初始画面。
       */
      newTask: 回到初始画面,
      /** **与侧栏那个 × 同一个动作。** 面板里选中的那个会话 */
      deleteSession: () => {
        const s = sessions.find((x) => x.sessionId === $activeSessionId.get())
        if (s) askDeleteSession(s)
      },
      abort: () => {
        if (!session) return
        client.get("abortSession", { sessionId: session.sessionId }).catch(fail)
      },
      setTheme,
    }),
    [client, session, sessions, askDeleteSession, 回到初始画面],
  )

  const commands = useMemo(
    () => buildCommands({ actions, agents: agentIds, session, busy, view, dockOpen }),
    [actions, agentIds, session, busy, view, dockOpen],
  )

  // **只有 exhausted 才配得上占满全屏。** connecting/reconnecting/degraded
  // 各有各的呈现，由 ConnectionSurface 决定——见它的文件头
  if (connection.phase === "exhausted") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">DAWN Science</span>
        </div>
        <ConnectionSurface onRetry={connect} onOpenSettings={actions.openSettings} />
        <div className="statusbar" />
      </div>
    )
  }

  const latestRun = runs[0]

  return (
    <div className="app-shell" key={lang}>
      <div className="topbar">
        {/**
          * **顺序：标志 → 折叠 → 搜索**（2026-08-13，作者定的）。
          *
          * *「左上角的 logo 和 折叠按钮，换一下位置，先是 logo，再是折叠按钮，
          * 此外帮我增加一个搜索功能，放一个搜索按钮，搜索按钮放在折叠按钮旁边。」*
          *
          * 标志在最左是**这一屏叫什么**；后面两颗是**对左边那一栏做什么**。
          * 实测 WorkBuddy 的侧栏顶栏里，「收起侧边栏」与「搜索」也是紧挨着的
          * （32×32，间距 36），我们照这个关系排。
          */}
        <Button variant="text" size="inline" className="brand" onClick={回到初始画面}>
          DAWN Science
        </Button>
        {/**
          * **折叠侧栏**（2026-08-13，作者要的）。
          *
          * 实测 WorkBuddy 那颗在**侧栏自己的顶栏里**（32×32 的 ghost 图标按钮，
          * 右对齐，标签「收起侧边栏」）。**我们没有放在那儿，理由要写清楚**：
          * 侧栏收起之后它自己也没了，于是这个能力**只剩一条藏在别处的出路**。
          *
          * 这正是本项目已经报过两次的那个形状（*「看不见的能力等于不存在」*：
          * 没标签的 `＋`、`opacity: 0` 的删除键，两次作者的话都是「没有这个功能」）。
          * 放在顶栏——它横跨整个窗口，**两个状态下都在同一个位置**，
          * 收起之后还能原地点回来。
          *
          * 一颗按钮管两态，标签跟着换：不是两颗，那样就是「一个动作两个家」。
          */}
        <Button
          variant="ghost"
          size="icon"
          className="side-toggle"
          aria-label={sidebarCollapsed ? t("展开侧边栏") : t("收起侧边栏")}
          aria-expanded={!sidebarCollapsed}
          onClick={toggleSidebar}
        >
          <侧栏图标 />
        </Button>
        {/**
          * **搜索**（2026-08-13，作者要的，紧挨着折叠那颗）。
          *
          * **它搜的是名字与路径，不是对话内容**——后者要后端出一个全文检索，
          * 现在没有。一颗看起来什么都能搜、其实只搜标题的按钮，
          * 比一颗说清楚自己搜什么的更坏（不变式 5：不假装有我们没有的东西），
          * 所以输入框的占位符直接把范围写出来。
          *
          * **侧栏收着的时候按它要先把侧栏打开**：输入框长在侧栏里，
          * 收着的时候按下去屏幕上什么都不会发生——那就是「点了没反应」。
          */}
        <Button
          variant="ghost"
          size="icon"
          className="side-search-toggle"
          aria-label={t("搜索")}
          aria-expanded={搜索开着}
          onClick={() => {
            const 要开 = !搜索开着
            设搜索开着(要开)
            if (!要开) 设搜索词("")
            if (要开 && sidebarCollapsed) setSidebarCollapsed(false)
          }}
        >
          <搜索图标 />
        </Button>
        <span className="spacer" />
        {/**
          * **「返回」对所有非对话屏都给**（2026-08-10）。
          *
          * 作者：*「当我们点开项目概览和文件的时候，我们没有关闭窗口。」*
          * 此前只有设置屏有返回，项目概览与文件**进得去出不来**——
          * 只能靠去侧栏点一个会话，而那是「切会话」，不是「关掉这一屏」。
          */}
        {view !== "conversation" && view !== "settings" ? (
          <Button variant="ghost" size="sm" onClick={() => setView("conversation")}>
            {t("返回")}
          </Button>
        ) : null}
        {/**
          * **设置搬去了左下角**（2026-08-11，作者：*「设置可以放到 App 的左下角」*）。
          * 顶栏只留「返回」——它是**这一屏的动作**，而设置是**去另一屏**，
          * 后者跟「项目概览 / 文件」是同一类，所以它们排在一起。
          */}
        {view === "settings" ? (
          <Button variant="ghost" size="sm" onClick={() => setView("conversation")}>
            {t("返回")}
          </Button>
        ) : null}
      </div>

      {/* 不可逆操作的确认。**自己写的**——Electron 里 confirm() 直接抛错 */}
      <ConfirmDialog request={confirming} onCancel={() => setConfirming(undefined)} />

      {/**
        * 添加 / 编辑一台服务器（②-B · R3）。
        *
        * **删除走已有的那个确认框**，不另造一份：不可逆的动作只有一种问法，
        * 两份实现迟早有一份忘了说「会连带删掉什么」。
        */}
      {connDraft ? (
        <ConnectionDialog
          draft={connDraft}
          saving={connSaving}
          {...(connProblem ? { problem: connProblem } : {})}
          onCancel={() => {
            setConnDraft(undefined)
            setConnProblem(undefined)
          }}
          onSave={(d) => void saveConnection(d)}
          {...(connDraft.id
            ? {
                onRemove: () => {
                  const id = connDraft.id!
                  const 名字 = connDraft.label
                  setConnDraft(undefined)
                  setConfirming({
                    title: tf("删除服务器「{0}」？", 名字),
                    detail: (
                      <p>
                        {t("会断开这台机器的连接，并把它的登录口令从系统钥匙串里删掉。")}
                      </p>
                    ),
                    safety: t("那台服务器上的文件不会有任何变化。"),
                    confirmLabel: t("删除"),
                    onConfirm: () => {
                      void client
                        .get("removeConnection", { id })
                        .then(() => loadConnections(client))
                        .catch((e: unknown) =>
                          setConnProblem(e instanceof Error ? e.message : String(e)),
                        )
                    },
                  })
                },
              }
            : {})}
        />
      ) : null}

      {/**
        * **宽度由内联变量给，不由 CSS 里那个常数给**（2026-08-13）。
        *
        * `--dawn-sidebar-w` 的默认值仍然住在 `tokens.css`（唯一的家），
        * 这里只在人拖过之后**覆盖它**——覆盖是显式的、看得见的，
        * 而在样式表里再写一个 264 就成了同一个数的第二个家。
        *
        * 折叠 = 宽度 0 + `.side-collapsed`。**不用 `display: none`**：
        * 那样 0.25s 的收合动画没有中间态，一下就没了。
        */}
      <div
        className={`body${sidebarCollapsed ? " side-collapsed" : ""}`}
        style={
          { "--dawn-sidebar-w": sidebarCollapsed ? "0px" : `${sidebarWidth}px` } as React.CSSProperties
        }
      >
        <SessionSidebar
          /**
           * 服务器那一列的名字（2026-08-14）。
           * **取不到就让侧栏显示连接 id**——不在这里编一个占位名字。
           */
          服务器名={(id) => connections.find((c) => c.id === id)?.label}
          /** **临时项目不进项目列表**：它们的会话在上面那一列 */
          projects={projects.filter((p) => !p.temporary)}
          /**
           * 上面那一列是**临时会话**（没有指定项目的那些，2026-08-11）。
           *
           * **终端不进任何一列**：它们在下面那条 dock 里。
           * 一个终端混在对话中间，点开会把整屏换成一片黑——
           * 而作者要的正好相反：对话在上，终端在下，同时看得见。
           */
          /**
           * **远端会话不在这一列**：它们挂在「远端连接」下面各自的服务器上。
           * 两处都列的话，同一段对话会出现两次，而它在哪台机器上就没人说得清了。
           */
          sessions={tempSessions.filter((x) => x.kind !== "pty" && !x.remote)}
          /** 展开那个项目里的会话，嵌在它自己那一行下面 */
          projectSessions={sessions.filter((x) => x.kind !== "pty")}
          agents={agentIds}
          agentLabel={agentLabel}
          onDeleteProject={askDeleteProject}
          activeProjectId={projectId}
          activeSessionId={sessionId}
          view={view}
          onPickProject={(id) => {
            setActiveProjectId(id)
            setActiveSessionId(undefined)
            setView("conversation")
          }}
          onPickSession={(id) => {
            setActiveSessionId(id)
            setView("conversation")
          }}
          onShowPanel={() => setView(view === "panel" ? "conversation" : "panel")}
          /* **再点一次就回去**：一个亮着的入口点下去毫无反应，人会以为它坏了 */
          onShowSkills={() => setView(view === "skills" ? "conversation" : "skills")}
          onShowPlugins={() => setView(view === "plugins" ? "conversation" : "plugins")}
          onShowMcp={() => setView(view === "mcp" ? "conversation" : "mcp")}
          onShowFiles={() => setView(view === "files" ? "conversation" : "files")}
          onDeleteSession={askDeleteSession}
          onDeleteMany={askDeleteMany}
          onDeleteProjects={askDeleteProjects}
          {...(搜索开着
            ? {
                search: {
                  value: 搜索词,
                  onChange: 设搜索词,
                  onClose: () => {
                    设搜索开着(false)
                    设搜索词("")
                  },
                },
              }
            : {})}
          /**
           * 单条删除也走 `deleteTask`（2026-08-12）。
           *
           * **拿不到会话摘要的那些行只有这一条路**——而那正是
           * 「历史遗留的对话删不掉」的形状：它们的会话在别的项目里，
           * 界面手上没有，于是上一版连删除键都画不出来。
           */
          onDeleteTask={(t) => askDeleteMany([t], () => {})}
          onRenameSession={renameSession}
          onPinSession={pinSession}
          onMoveSession={moveSession}
          onReorderSessions={reorderSessions}
          /**
           * 「远端连接」那一区（②-B · R3）。**整块在这里组装**——
           * 侧栏只负责它坐在哪里，不负责它怎么取数。
           */
          remote={
            <RemoteSection
              connections={connections}
              open={remoteOpen}
              onToggle={toggleRemoteOpen}
              {...(connBusy ? { busyId: connBusy } : {})}
              {...(connProblem ? { problem: connProblem } : {})}
              onAdd={() =>
                setConnDraft({ label: "", host: "", username: "", hasSecret: false })
              }
              onEdit={(c) =>
                setConnDraft({
                  id: c.id,
                  label: c.label,
                  ...(c.group ? { group: c.group } : {}),
                  host: c.host,
                  port: c.port,
                  username: c.username,
                  ...(c.privateKeyPath ? { privateKeyPath: c.privateKeyPath } : {}),
                  // **口令不带进来**：它从不回显。`hasSecret` 只说配过没有
                  hasSecret: c.hasSecret,
                })
              }
              onConnect={(c) => void connectRemote(c.id)}
              /**
               * **这一区不再列这台机器上的对话**（2026-08-14 作者定的）：
               * 它们已经在侧栏那个「服务器」收纳里了（服务器 → 每台机器 → 会话）。
               * 两处都列就是同一个东西有两个家。
               */
              onNewSession={(c) => void startRemoteSession(c)}
              {...(sessionId ? { activeSessionId: sessionId } : {})}
              onDisconnect={(c) => {
                setConnProblem(undefined)
                void client
                  .get("disconnectRemote", { id: c.id })
                  .then(() => loadConnections(client))
                  .catch((e: unknown) =>
                    setConnProblem(e instanceof Error ? e.message : String(e)),
                  )
              }}
            />
          }
          tasks={tasks}
          onNewTask={回到初始画面}
          onNewTaskIn={(workspace) =>
            // 这条路没有输入卡可以摆错误，所以它走全局提示
            void 新建任务({ workspace }).catch(fail)
          }
          onPickTask={(任务) => {
            if (!任务.sessionId) {
              // **没有会话就说清楚**：那是「还没拉起来」，不是点了没反应
              note(t("这个任务还没有活动的对话——重启之后需要重新拉起（T3 后半）"))
              return
            }
            /**
             * **跟着切项目**（T3-a，2026-08-12）。
             *
             * 账本、产出、git 事实全按项目归集，「项目概览 / 文件」两个入口
             * 也只在有当前项目时才出现。不切的话，点进一段有工作路径的对话，
             * 概览显示的是**上一个项目**的数字——
             * **一份摆在错的地方的真数据，比「尚未记录」更坏。**
             */
            const s =
              tempSessions.find((x) => x.sessionId === 任务.sessionId) ??
              sessions.find((x) => x.sessionId === 任务.sessionId)
            /**
             * **只有带工作路径的才切**（2026-08-12 收窄）。
             *
             * 第一版对所有任务都切，于是点一段**普通对话**会把当前项目
             * 换成那个「临时会话」项目——三条 e2e 当场红：切回旧对话之后
             * 转录是空的（换项目会重取会话列表，把正在挂的那一段冲掉）。
             *
             * 而且语义上也不该切：普通对话**没有用户项目**，
             * 把概览指到一个 scratch 目录，等于摆一份指着错地方的真数据。
             */
            /**
             * **项目 id 要能从任务自己的路径推出来**（2026-08-13 修，作者报的：
             * *「为什么有的会话，可以点击进去，有的会话不能点击进去呢？」*）。
             *
             * 上一版只从 `s?.projectId` 取——而 `s` 来自
             * `sessions`（**只有当前打开那个项目的**）∪ `tempSessions`。
             * 于是**凡是属于别的项目的那些会话，`s` 一律是 undefined**：
             * 项目不切、会话 id 设了、然后 `session` 那一句查不到它，
             * 主区回落成初始画面——**看起来就是「点了没反应」**。
             *
             * 不是随机的：**当前项目里的点得进去，别的项目里的一个都点不进去。**
             *
             * 任务身上一直带着 `workspace`，而项目就是从路径长出来的，
             * 所以这里按路径回查一次。切过去之后 `loadSessions` 会把那一拨取回来，
             * 下一帧 `session` 就有了。
             */
            const pid =
              s?.projectId ??
              (任务.workspace
                ? projects.find((p) => p.workspace === 任务.workspace)?.projectId
                : undefined)
            if (任务.workspace && pid) setActiveProjectId(pid)
            setActiveSessionId(任务.sessionId)
            setView("conversation")
          }}
          {...(sessionId ? { activeTaskId: tasks.find((t) => t.sessionId === sessionId)?.taskId } : {})}
          /**
           * 任务行要拿到会话摘要才能有删除/改名/置顶/挪动（T3-a）。
           *
           * **两拨都要查**：`tempSessions` 是不属于用户项目的那些（新建任务
           * 走的就是这条），`sessions` 是当前展开项目里的——迁移过来的老任务在那儿。
           * 只查一拨的话，另一拨那些行会安静地退化成一行纯文字，
           * **而「有的行有 ⋯ 有的行没有」比全都没有更难发现**。
           */
          sessionOf={(id) =>
            tempSessions.find((x) => x.sessionId === id) ??
            sessions.find((x) => x.sessionId === id)
          }
          /**
           * 顺序**由会话那一套说了算**（置顶／上下挪／拖拽改的都是它）。
           * 两张表各有一套次序，照任务那一套排的话，症状是
           * **点了置顶什么都不动**——本项目已经吃过三回这种「点了没反应」。
           */
          sessionRank={(id) => {
            const i = tempSessions.findIndex((x) => x.sessionId === id)
            if (i >= 0) return i
            const j = sessions.findIndex((x) => x.sessionId === id)
            return j >= 0 ? tempSessions.length + j : -1
          }}
          /**
           * **顶上那颗回首页，不直接建**（2026-08-11）——
           * 在首页上挑完 LLM 才建，而且建出来的是临时会话。
           * 想在某个项目里开，走那个项目行上的 ＋。
           */
          /**
           * **再点一次就回去**（2026-08-11，作者：*「设置的地方，
           * 点击第二次也可以返回到界面」*）。
           *
           * 与旁边的「项目概览 / 文件」是同一条：**一个亮着的入口点下去
           * 毫无反应，人会以为它坏了**。设置搬进侧栏时漏了这一条——
           * 它原来在顶栏，那颗按钮本来就是「设置 ⇄ 返回」两态的。
           */
          onOpenSettings={() => setView(view === "settings" ? "conversation" : "settings")}
          settingsActive={view === "settings"}
        />

        {/**
          * 那条能拖的缝。**折叠时不画**——它的位置跟着宽度走，
          * 宽度是 0 时它会贴在窗口最左边，看起来像是可以把侧栏
          * 「从零拖回来」，而拖不动（`clampWidth` 的下界是 200）。
          * 一个看得见、拖不动的把手比没有更坏。
          */}
        {!sidebarCollapsed ? (
          <SideSash
            width={sidebarWidth}
            min={SIDEBAR_MIN}
            max={SIDEBAR_MAX}
            onResize={setSidebarWidth}
          />
        ) : null}

        <main className="main">
          {view === "skills" ? (
            <SkillsView
              {...(projectId
                ? { load: () => client.get<SkillLoad>("listSkills", { projectId }) }
                : {})}
            />
          ) : view === "plugins" ? (
            <PluginsView />
          ) : view === "mcp" ? (
            /**
             * MCP 那一屏（2026-08-15）。
             *
             * **按项目问**：项目级 `.dawn/mcp.yaml` 会追加几台，
             * 没有当前项目时就只有全局那些——那不是错误，是实情。
             */
            <McpView
              load={() =>
                client.get<MCP装载>("listMcpServers", projectId ? { projectId } : {})
              }
              onTest={(name) =>
                client.get<{ ok: boolean; error?: string; tools: { name: string }[] }>(
                  "testMcpServer",
                  projectId ? { name, projectId } : { name },
                )
              }
              onFlag={async (name, flag, value) => {
                await client.get("setMcpFlag", { name, flag, value })
              }}
              onSecret={async (name, varName, secret) => {
                await client.get("setMcpSecret", { name, varName, secret })
              }}
            />
          ) : view === "settings" ? (
            /* **设置不复用项目概览的三栏网格**：仪表盘要一眼看全，
               设置要一件一件读。单栏 + 最大宽度，见 Settings.tsx 的文件头 */
            <div className="settings-page">
            {/**
              * **左边分类、右边内容**（2026-08-12，作者要的）。
              *
              * 作者：*「我们自己的设置，比较枯燥乏味，每一项的设置，
              * 以及设置的内容，都比较乏味，看不出太大的层次。」*
              *
              * 他指的是**层次**：上一版是一长条平铺的 section，从「外观」
              * 一路滚到「模型服务」——**没有任何东西告诉你这里一共有几块、
              * 你现在在哪一块**。左边那一列分类就是那个东西。
              *
              * 分类只列**真的能配的那几块**：截图里那份有十一项
              * （账户管理 / 记忆 / 安全中心 …），我们没有那些，
              * 照抄一个点进去是空的入口比没有更坏。
              */}
            <SettingsShell
              sections={[
                {
                  id: "appearance",
                  title: t("外观"),
                  icon: <外观图标 className="row-icon" />,
                  body: <AppearancePanel />,
                },
                {
                  id: "permission",
                  title: t("工具权限"),
                  icon: <设置图标 className="row-icon" />,
                  body: (
                    <PermissionPanel
                      mode={权限档}
                      onChange={(m) => {
                        // **乐观先动**：单选按钮点了不动是最难受的一种失灵；
                        // 失败时如实退回去并出声
                        const 旧的 = 权限档
                        设权限档(m)
                        client
                          .get<{ mode: "allow-all" | "deny-risky" }>("setPermissionMode", { mode: m })
                          .then((r) => 设权限档(r.mode))
                          .catch((e: unknown) => {
                            设权限档(旧的)
                            fail(e)
                          })
                      }}
                    />
                  ),
                },
                ...(默认工作区
                  ? [
                      {
                        id: "workspace",
                        title: t("工作目录"),
                        icon: <文件夹图标 className="row-icon" />,
                        body: (
                          <WorkspacePanel
                            path={默认工作区.path}
                            isDefault={默认工作区.isDefault}
                            onPick={() => {
                              void client.pickDirectory(默认工作区?.path).then((d) => {
                                // **取消就什么都不做**：改主意不是错误
                                if (d) void 设默认工作区(d)
                              })
                            }}
                            onReset={() => void 设默认工作区("")}
                          />
                        ),
                      },
                    ]
                  : []),
                {
                  id: "models",
                  title: t("模型服务"),
                  icon: <模型图标 className="row-icon" />,
                  body: (
                    <>
              <SettingsPanel
                providers={providers.providers.map((p) => p.providerId)}
                known={knownProviders.providers}
                /** 该 provider 在模型目录里有哪些。**没有就是空**，摘要据此说「没有模型」 */
                modelsOf={(pid) =>
                  /**
                   * **先问 pi 的目录，再退回配置里那份。**
                   * 前者覆盖全部 39 个 provider，后者只覆盖配置用到的——
                   * 而「刚加进来的那个」恰恰还没被配置用到。
                   */
                  knownProviders.models?.[pid] ??
                  providers.providers.find((p) => p.providerId === pid)?.available ??
                  []
                }
                {...(knownProviders.needsBaseUrl
                  ? { needsBaseUrl: knownProviders.needsBaseUrl }
                  : {})}
                {...(knownProviders.connections
                  ? { connections: knownProviders.connections }
                  : {})}
                onSaveConnection={(providerId, conn) => {
                  client
                    .get("setProviderConnection", { providerId, ...conn })
                    /**
                     * **三份都要重取。** 连接一变，可选 provider（自定义端点会
                     * 出现在目录里）、agent 列表（配了就自动有一个）、
                     * 以及这一行自己要显示的值，全都变了。
                     */
                    .then(() =>
                      Promise.all([
                        client
                          .get<typeof knownProviders>("listKnownProviders", {})
                          .then(setKnownProviders),
                        loadProviders(client),
                      ]),
                    )
                    .catch(fail)
                }}
                {...(knownProviders.problem ? { knownProblem: knownProviders.problem } : {})}
                credentials={creds}
                onSet={(id, secret) =>
                  client
                    .get("setCredential", { providerId: id, secret })
                    /**
                     * **也要重取 agent 列表。**
                     * 填了 key 之后那个 provider 自动就有 agent 了
                     * （见 backend 的「填了 key 就够了」），
                     * 不重取的话选择器还是旧的——而那正是作者说的
                     * 「设置完还是看不到 kimi」。
                     */
                    .then(() => Promise.all([loadCredentials(client), loadProviders(client)]))
                    .catch(fail)
                }
                onDelete={(id) =>
                  client
                    .get("deleteCredential", { providerId: id })
                    .then(() => Promise.all([loadCredentials(client), loadProviders(client)]))
                    .catch(fail)
                }
              />
                    </>
                  ),
                },
                {
                  id: "kernels",
                  title: t("内核"),
                  icon: <终端图标 className="row-icon" />,
                  body: (
                    <>
              {/* 内核：**带解释器路径**。不显示它，选内核就是蒙（作者 2026-08-10） */}
              <KernelsPanel
                kernels={kernels.kernels}
                problems={kernels.problems}
                shadowed={kernels.shadowed}
                interpreters={interpreters}
                onRefresh={refreshKernels}
                onSetInterpreter={saveInterpreter}
              />

                    </>
                  ),
                },
              ]}
            />
            </div>
          ) : view === "files" ? (
            <FilesView
              selected={filePath}
              content={fileContent}
              loadDir={loadDir}
              onSelect={openFile}
              onOpenExternally={openExternally}
              {...(projectId
                ? {
                    onInitLayout: () => {
                      client
                        .get<
                          | { created: string[]; instructions: "written"; file: string }
                          | {
                              created: string[]
                              instructions: "skipped"
                              existingFile: string
                              reason: string
                            }
                        >("initScienceLayout", { projectId })
                        .then((r) => {
                          /**
                           * **两种结果说的话完全不同。**
                           * 「写了」与「没写、因为你已经有一份」混成一句「已初始化」，
                           * 人就会以为约定生效了，而实际上没有。
                           */
                          设目录说明(
                            r.instructions === "written"
                              ? tf("建了 {0} 个目录，约定已写入 {1}", String(r.created.length), r.file)
                              : tf(
                                  "建了 {0} 个目录。{1}",
                                  String(r.created.length),
                                  r.reason,
                                ),
                          )
                        })
                        .catch(fail)
                    },
                    ...(目录说明 ? { layoutNote: 目录说明 } : {}),
                  }
                : {})}
            />
          ) : view === "panel" ? (
            <div className="panels">
              {/* 归属告知说一次。**两个来源合并判定**——只看其中一个的话，
                  另一个有而这一个没有时警告会整个消失（规格 7.5 禁止静默吞掉） */}
              <AttributionCaveat show={mayIncludeUserEdits(runDetail?.fileChanges, runs)} />
              <StatusPanel sessions={sessions} />
              <ChangesPanel facts={runDetail?.fileChanges} onOpenFile={openFile} />
              {/* 逐次工具调用那一层。**不变式 5 第一次有用户可见面** */}
              <ToolChangesPanel runs={runs} onOpenFile={openFile} />
              {/* **取最近一条带成本的 `agent_turn`**，不是「最新那条 run」——
                  见 `latestCost` 的说明。都没有时面板说「尚未记录」 */}
              <CostPanel cost={latestCost} />
              {/* 上下文用量。**已用 token 尚未采集，面板如实说，不拿字节去凑** */}
              <ContextPanel usage={contextUsage} />
              {/* 变量：**三态在界面上分得开**——不支持要说原因，空是真的空 */}
              <VariablesPanel state={variables} />
              {/* 环境：**准入时刻冻结的那一份**，不是现在重新探的 */}
              <EnvironmentPanel state={environment} />
              <RunsPanel runs={runs} />
              {/**
                * 移除项目放在**项目概览**里：它是项目作用域的动作，
                * 而侧栏的下拉框是「切到哪个项目」——**切换的地方不该同时是删除的地方**。
                */}
              <section className="panel danger-zone">
                <h3 className="panel-title">{t("移除项目")}</h3>
                <div className="panel-body">
                  <p className="hint">
                    {t("从工作台移除这个项目，连同它的会话与账本。")}
                    <em className="set-emph">{t("磁盘上的文件夹不会被删除。")}</em>
                  </p>
                  <div className="state-action">
                    <Button variant="danger" size="sm" onClick={() => askDeleteProject()}>
                      {t("移除项目")}
                    </Button>
                  </div>
                </div>
              </section>
              {provenance ? (
                <section className="panel">
                  <h3 className="panel-title">{t("溯源")}</h3>
                  <div className="panel-body">
                    <ProvenanceBadge link={provenance} />
                  </div>
                </section>
              ) : null}
            </div>
          ) : session && session.kind === "pty" ? (
            /**
             * **终端只在 dock 里**（2026-08-11）。
             *
             * 这一支曾经是「PTY 会话铺满主区」（2026-08-09 作者试用后定的），
             * 现在终端有了自己的家：对话区底下那条 dock。
             * 留着这一支的唯一理由是**旧会话**——数据库里还躺着当初那种
             * 占满主区的 pty 会话，选中它时得给一句话，而不是一片空白。
             */
            <div className="conversation empty-conv">
              <p className="empty">
                {t("这是一段终端会话。终端现在在对话区下面那一条里——")}
                <Button variant="text" size="inline" onClick={toggleDock}>
                  {t("打开终端")}
                </Button>
              </p>
            </div>
          ) : sessionId && !session ? (
            /**
             * **选中了一段、但它还没到手**（2026-08-13）。
             *
             * 这一支此前不存在，于是它落进了下面那个 `EmptyConversation`——
             * 而那一屏正是「你还没选任何东西」的样子。**两种状态长得一样，
             * 就等于没有判据**：人点了一行，看见初始画面，只能理解为「点了没反应」。
             *
             * 它出现在切项目那一下：`loadSessions` 是异步的，中间有一帧。
             * 说出「在打开」比默认它不存在诚实。
             */
            <div className="conversation empty-conv">
              <Loader label={t("正在打开这段对话")} />
            </div>
          ) : session ? (
            <>
              <ConversationView
                session={session}
                items={items}
                {...(当前任务?.workspace ? { workspace: 当前任务.workspace } : {})}
                serviceLabel={serviceLabel}
                onOpenSettings={actions.openSettings}
                {...(当前任务 && !session.remote
                  ? /**
                     * **只给「选 / 换」，不给「改回普通对话」**（2026-08-13，
                     * 作者定的：*「这个也可以删除掉。」*）。
                     *
                     * 它是一扇**反向的门，而正向那扇门本来就不需要它**：
                     *
                     *   1. **归类是开口之前的决定。**「选了文件夹 = 项目」描述的是
                     *      这段对话**怎么开始的**；事后改回去等于改写一件已经发生的事。
                     *   2. **它会把 agent 已经在用的目录抽走。** 那段对话很可能
                     *      已经读过、写过那个文件夹里的东西——抽掉之后，
                     *      **界面说没有目录，而历史里全是那个目录的路径**。
                     *   3. **账本按项目组织。** 挪出去，它做过的事就与那个项目的
                     *      产出记录脱钩了。
                     *
                     * 它唯一盖住的场景是「文件夹选错了」，而那件事另有答案且更好：
                     * `onPickWorkspace` **可以再选一次**，直接换成对的那个。
                     *
                     * **空态那一屏仍然给它**——那里还什么都没发生：没有历史、
                     * 没有账本、agent 的手还没伸出去。那时它只是「我改主意了」，
                     * 不是一扇反向的门。
                     */
                    { onPickWorkspace: () => void 选工作目录(当前任务.taskId) }
                  : {})}
                /**
                 * **能就地换的，就不要在「新建会话」那一组里再出现一次**
                 * （2026-08-11 修）。
                 *
                 * 作者：*「同一个对话，我切换模型，依旧会弹出新的对话，
                 * 而不是继续对话。」* 那颗 pill 的菜单里有两组，
                 * 上组「就地换服务（对话不断）」、下组「新建会话，用哪个 LLM」——
                 * **同一家 DeepSeek 在两组里各出现一次**，
                 * 而人是照着「换 LLM」这几个字点的，于是点中了会新开对话的那个。
                 *
                 * 现在下组只留**换不过去的那些**（CLI / 终端 / 内核那类：
                 * 一个 API 会话没法半路变成 claude 会话）。
                 * 想另起一段仍然有路——侧栏那颗「新建会话」。
                 */
                agents={新建会话可选的(
                  agentIds,
                  (id) => providers.agents.find((a) => a.agentId === id)?.kind,
                  Boolean(services && services.length > 0),
                )}
                models={modelChoices}
                model={currentModel}
                agentLabel={agentLabel}
                {...(services ? { services } : {})}
                {...(currentServiceLabel ? { currentServiceLabel } : {})}
                {...(switchProblem ? { switchProblem } : {})}
                onToggleDock={toggleDock}
                dockOpen={dockOpen}
                /**
                 * **换服务 = 换到那家的第一个模型**。
                 *
                 * 不问「换到它的哪个模型」再点一次：换家的人多半只想换家，
                 * 具体哪个模型旁边那颗 pill 随时能改。
                 * **挑不出模型就不发请求**——那家目录是空的，
                 * 发出去只会换来一句与「我想换家」无关的报错。
                 */
                onSwitchService={(providerId) => {
                  if (!session) return
                  const 第一个 = providers.providers.find((p) => p.providerId === providerId)
                    ?.available?.[0]
                  if (!第一个) {
                    note(tf("「{0}」在模型目录里一个模型都没有，没法换过去", providerId))
                    return
                  }
                  client
                    .get("setSessionModel", {
                      sessionId: session.sessionId,
                      provider: providerId,
                      model: 第一个,
                    })
                    .then(() => {
                      setSwitchProblem(undefined)
                      setSessionModel(session.sessionId, 第一个, providerId)
                    })
                    .catch((e: unknown) => {
                      setSwitchProblem(e instanceof Error ? e.message : String(e))
                      fail(e)
                    })
                }}
                onPickModel={(c) => {
                  if (!session) return
                  /**
                   * **`provider` 只有 native 有。**
                   *
                   * 此前这里写的是 `if (!session || !agentCfg?.provider) return`——
                   * 加了 cli 之后，那个卫语句会让**换模型静静地什么都不做**：
                   * 点了没反应，而用户无从知道为什么。协议已把它放宽为可选（2.4）。
                   */
                  /**
                   * **provider 跟着这一条选项走，不跟着 agent 配置走**
                   * （2026-08-11）。此前这里永远传 `agentCfg.provider`——
                   * 那时菜单里也只有那一家，所以看不出问题；
                   * 现在菜单跨服务，传旧的那个就等于**换了个寂寞**：
                   * 界面显示换了，请求还打在原来那家。
                   */
                  client
                    .get("setSessionModel", {
                      sessionId: session.sessionId,
                      ...(c.provider ? { provider: c.provider } : {}),
                      model: c.model,
                    })
                    // **成功之后才更新缓存。** 失败时把后端给的理由
                    // （没配 key / 这一轮还没说完）**摆到 composer 上**
                    .then(() => {
                      setSwitchProblem(undefined)
                      setSessionModel(session.sessionId, c.model, c.provider)
                    })
                    .catch((e: unknown) => {
                      setSwitchProblem(e instanceof Error ? e.message : String(e))
                      fail(e)
                    })
                }}
                terminalTrimmed={termTrimmed}
                kernelInstanceId={kernelInstanceId}
                disabled={session.state === "exited"}
                onAbort={
                  session.kind === "native" ? actions.abort : undefined
                }
                onSend={(text, images, behavior) =>
                  // **不做本地乐观追加**：事件流是对话的唯一事实来源。
                  // 两条路各写一半迟早对不上——自己发的话会经事件回灌进来。
                  写进去(session.sessionId, text, images, behavior)
                    .then(() => {
                      /**
                       * 标题是第一句话定的，而**它落在后端**——不重取一次，
                       * 侧栏会一直显示「新会话」直到下次因为别的原因刷新。
                       *
                       * **只在还没有标题时取**：之后每句话都取一遍纯属白打 IPC，
                       * 而标题一旦定了就不会再变（`setTitleIfAbsent`）。
                       */
                      if (!session.title) {
                        const pid = $activeProjectId.get()
                        if (pid) void loadSessions(client, pid)
                        /**
                         * **临时会话也要重取**（2026-08-11）。
                         *
                         * 它不属于当前项目，所以上面那一句取不到它——
                         * 症状是侧栏上那一行永远停在「新会话」，
                         * 而这正是标题这个功能存在的理由（作者：*「会话的 ID
                         * 怎么都是一个呢？我很难辨别具体是哪个会话」*）。
                         */
                        void loadTempSessions(client)
                      }
                    })
                }
              />
            </>
          ) : (
            <EmptyConversation
              agents={agentIds}
              agentLabel={agentLabel}
              onToggleDock={toggleDock}
              /**
               * **首页开出来的是临时会话**（2026-08-11）。
               *
               * 作者：*「如果没有在项目下，新建对话的话，就出现 App 首页；
               * 如果在项目下，新建对话的话，就在项目下面新建对话。」*
               * 首页正是「没有在项目下」那一支——所以它不该建到当前项目里去。
               */
              /**
               * **空态开出来的也是任务**（2026-08-12）。
               *
               * 上一版走 `startTemporarySession`——那是任务模型之前的路，
               * 建出来的东西不进侧栏的任何一栏。
               *
               * 而作者要的正是**在开口之前就能决定归到哪一栏**：
               * *「默认的 App 的面板，也应该和新建任务一样，带有一个选择工作目录，
               * 因为只有选择了，才归类为项目，如果不选择目录，那么就是会话。」*
               */
              onStart={(agentId, firstMessage, workspace, images) =>
                // **返回 promise**：空态那张卡要据此在失败时把字和图还回去
                新建任务({ agentId, firstMessage, workspace, images })
              }
              onPickDirectory={() => client.pickDirectory(默认工作区?.path)}
              onOpenSettings={actions.openSettings}
            />
          )}
              {/**
                * **底部终端在对话这一侧**（2026-08-11 挪进 `.main`）。
                *
                * 作者：*「这个终端的感觉差点意思，应该在对话框的这边，
                * 侧边栏这边不能有终端。」*
                *
                * 上一版它挂在 `.body` 外面、横跨整个窗口，于是**侧栏底下也压着一条黑**——
                * 而侧栏是导航，它跟「在这段对话里敲命令」没有关系。
                * 现在它只占主区的下半条：对话在上、终端在下，**都在同一侧**。
                */}
          {dockOpen ? (
            <TerminalDock
              terminals={终端们}
              currentId={dockSessionId}
              workspace={currentWorkspace ?? t("家目录")}
              canOpen={Boolean(ptyAgentId)}
              onPick={setDockSessionId}
              onNew={开一个终端}
              onClose={(id) => {
                client
                  .get("stopSession", { sessionId: id })
                  .then(() => {
                    if ($dockSessionId.get() === id) setDockSessionId(undefined)
                    const pid = $activeProjectId.get()
                    if (pid) void loadSessions(client, pid)
                  })
                  .catch(fail)
              }}
              onCloseDock={() => setDockOpen(false)}
              onInput={(data) => {
                const id = $dockSessionId.get()
                if (!id) return
                写进去(id, data).catch(fail)
              }}
            />
          ) : null}

        </main>
      </div>

      <ConnectionSurface onRetry={connect} onOpenSettings={actions.openSettings} />

      {/* 命令面板。**放在最外层**——它盖住整个窗口，且要在任何视图下都能叫出来 */}
      <CommandPalette commands={commands} />

      <div className="statusbar">
        <span>{ready ? t("已连接") : t("未连接")}</span>
        {creds.configured.length === 0 && providers.providers.length > 0 ? (
          /**
           * **不说「native agent」。** 那是我们内部的词，作者已经为它抱怨过一次
           * （*「为什么还会多一个新建 agent 这种奇怪的东西呢？」*）。
           * 这一行要说的是他关心的事实：还没有钥匙，所以还不能对话。
           */
          <span className="caveat">{t("还没有填任何 API key，暂时不能对话——去「设置 → 模型服务」加一个")}</span>
        ) : null}
        {notes.map((n, i) => (
          <span key={i} className="hint">
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}
