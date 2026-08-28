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
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "@nanostores/react"
import type { ProjectSummary, SessionSummary, SessionUpdate } from "../protocol/index.js"
import { 能上服务器 } from "../protocol/index.js"
import {
  AttributionCaveat,
  ChangesPanel,
  ContextPanel,
  CostPanel,
  ProvenanceBadge,
  RunsPanel,
  mayIncludeUserEdits,
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
  DockSwitch,
  RightDock, 挑文件 } from "./views.js"
import {
  AppearancePanel,
  KernelsPanel,
  AcpPanel,
  SettingsPanel,
  SettingsShell,
  WorkspacePanel,
  type KernelRow,
} from "./Settings.js"
import { AtFilePanel, type 艾特设置 } from "./at-settings.js"
import { SessionTabs } from "./session-tabs.js"
import { 编文件规则 } from "../files/mentions.js"
import { 外观图标, 文件夹图标, 文件图标, 模型图标, 终端图标, 侧栏图标, 搜索图标, 设置图标, 用量图标, 技能图标, 对话图标, 插件图标, 手机图标, 记忆图标 } from "./icons.js"
import { Button, Loader } from "./primitives.js"
import { ReviewPanel, type 审阅数据 } from "./review.js"
import { FilesView, 拖进来的本机路径, type FileContent, type Listing, type 传输态, type SearchResult } from "./files.js"
import { RemoteAssistantView, useSessionChoices, type FeishuStatus, type NotifySettings, type WeixinStatus } from "./remote-assistant.js"
import { 读记忆, 记记忆, type FilesMemory } from "./state/files-memory.js"
import type { EnhanceMode, EnhanceOutcome } from "./enhance.js"
import {
  AgentSkillsView,
  SubagentsView,
  McpView,
  PluginsView,
  type SkillLoad,
  type AgentSkill装载,
  type 导入回执,
  type MCP装载,
} from "./skills.js"
import { TerminalDock } from "./dock.js"
import { AttachUsagePanel } from "./attach-panel.js"
import { ArchivedView, type 归档的会话 } from "./archived.js"
import type { 会话额外动作 } from "./views.js"
import { ScheduleView, type ScheduleActions } from "./schedule.js"
import { setSlashItems, type SlashItem } from "./state/view.js"
import { UsagePanel, type 用量数据 } from "./usage.js"
import { ConfirmDialog, type ConfirmRequest } from "./confirm.js"
import { ConnectionDialog, RemoteSection, type ConnectionDraft } from "./remote.js"
import { ConnectionSurface } from "./connection.js"
import { CommandPalette } from "./palette.js"
import { TeamPanel } from "./team-panel.js"
import { WebPanel } from "./web.js"
import { ArtifactsPanel } from "./artifacts.js"
import { loadArtifacts } from "./state/sync.js"
import { $artifacts, setArtifacts, setCellCount } from "./state/catalog.js"
import { $kernels, setKernels as setKernelsAtom } from "./state/transcript.js"
import { NotebookPanel, cells as 转录里的cells, type 语言 as 内核语言 } from "./notebook.js"
import { SetupWizard, 读跳过, 记跳过, type 探测结果 } from "./setup-wizard.js"
import { 对话agent顺序 } from "./agent-order.js"
import { MemoryPanel } from "./memory-panel.js"
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
  $providersLoaded,
  $credentialsLoaded,
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
  $待答权限,
  $会话开关,
  $团队,
  setTeam,
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
  $终端归属,
  无会话,
  记终端归属,
  setDockChunks,
  appendDockBytes,
  resetDockTerminal,
  setTheme,
  setView,
  $settingsSection,
  openSettingsSection,
  upsertItem,
  dropItem,
  $sidebarWidth,
  $sidebarCollapsed,
  setSidebarWidth,
  setSidebarCollapsed,
  toggleSidebar,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  $rightDockOpen,
  $rightDockTenant,
  $rightDockWidth,
  setRightDockOpen,
  setRightDockTenant,
  请打开网址,
  setRightDockWidth,
  RIGHT_DOCK_DEFAULT,
  $跑着的会话,
  $未读,
  标记在跑,
  标未读,
  RIGHT_DOCK_MAX,
  RIGHT_DOCK_两栏起点,
  坞的上界,
  点开房客,
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
  const 跑着的会话 = useStore($跑着的会话)
  const 未读的 = useStore($未读)
  const runs = useStore($runs)
  const artifacts = useStore($artifacts)
  const runDetail = useStore($runDetail)
  const provenance = useStore($provenance)
  const providers = useStore($providers)
  const creds = useStore($credentials)
  const 目录到手 = useStore($providersLoaded)
  const 凭证到手 = useStore($credentialsLoaded)
  /** 「还没有钥匙」——两份都回来了才算数；理由见 catalog.ts 的 `$providersLoaded` */
  const 没有钥匙 = 目录到手 && 凭证到手 && creds.configured.length === 0
  const sessionModels = useStore($sessionModels)
  const contextUsage = useStore($contextUsage)
  const projectId = useStore($activeProjectId)
  const 设置分类 = useStore($settingsSection)
  const sessionId = useStore($activeSessionId)
  const view = useStore($view)
  const items = useStore($items)
  const termChunks = useStore($terminal)
  const termTrimmed = useStore($terminalTrimmed)
  const kernelInstanceId = useStore($kernelInstanceId)
  /** agent 正在问「能不能」（A2）。**跟着当前会话走** */
  const 待答权限 = useStore($待答权限)
  /** 这一段可以调的开关（A3，只有 acp 有） */
  const 会话开关们 = useStore($会话开关)
  const dockOpen = useStore($dockOpen)
  const dockSessionId = useStore($dockSessionId)
  const rightDockOpen = useStore($rightDockOpen)
  const rightDockTenant = useStore($rightDockTenant)
  const rightDockWidth = useStore($rightDockWidth)
  const sidebarWidth = useStore($sidebarWidth)
  const sidebarCollapsed = useStore($sidebarCollapsed)
  /**
   * 视口宽（审查 debug I8）：文件面板「两栏还是上下摞」的判据依赖 `坞的上界`,而它读 `window.innerWidth`。
   * 没有这个监听,窗口拉窄后组件不重渲染——坞被上界夹到放不下两栏了,判据却还按存储的宽给两栏,挤成一团。
   */
  const [视口宽, 设视口宽] = useState(() => (typeof window === "undefined" ? 0 : window.innerWidth))
  useEffect(() => {
    const on = () => 设视口宽(window.innerWidth)
    window.addEventListener("resize", on)
    return () => window.removeEventListener("resize", on)
  }, [])
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
  /**
   * **别人替你建的会话也要出现在侧栏**（远程助理，2026-08-21）。
   *
   * 微信里说第一句话时，后端会替你建一段会话——界面此前只在自己按下去之后才重拉任务，
   * 于是那段会话在侧栏上不存在，而微信里已经在聊了。每 5 s 拉一次任务与临时会话；
   * `setList` 内容没变就不换引用，不会白白重渲染。**没有推送**：任务列表不属于任何会话，
   * 塞进 `SessionUpdate` 要造假 id（与微信状态同一个理由）。
   */
  /** 归档了几段（侧栏那一行只在 > 0 时画）。启动时取一次，之后跟着 5 秒那班车，归档 / 取消归档之后立刻重取 */
  const [归档数, 设归档数] = useState(0)
  const 重取归档数 = useCallback(
    () =>
      client
        .get<{ sessions: unknown[] }>("listArchivedSessions", {})
        .then((r) => 设归档数(r.sessions.length))
        .catch(() => {}),
    [client],
  )
  useEffect(() => {
    void 重取归档数()
  }, [重取归档数])
  useEffect(() => {
    const id = setInterval(() => {
      void loadTasks(client)
      void loadTempSessions(client)
      // 项目也要拉：点别的项目里的任务时靠这份名单找 projectId，名单旧了就切不过去
      void loadProjects(client)
      void 重取归档数()
    }, 5_000)
    return () => clearInterval(id)
  }, [client, 重取归档数])

  useEffect(() => {
    // **临时项目不算数**：它是一次没指定项目的对话，不该被当成「当前项目」
    const 正式的 = projects.filter((p) => !p.temporary)
    if (projectId === undefined && 正式的.length > 0) setActiveProjectId(正式的[0]!.projectId)
  }, [projects, projectId])

  useEffect(() => {
    if (!projectId) return
    void loadSessions(client, projectId)
    /**
     * **这里刻意不带 `sessionId`，也不进依赖**（2026-08-20 当天踩的）。
     *
     * 第一版为了「账本按会话取」把 `sessionId` 加进了依赖：
     * 建任务的那一拍 `$activeSessionId` 先变、`$activeProjectId` 后变，
     * effect 于是带着**过期的 projectId** 重放了一次 `loadSessions`——
     * 刚建的会话被旧项目的空列表冲掉，症状是**用户自己那一轮不渲染**
     * （e2e `task-workspace` 两条当场红）。
     *
     * 会话作用域由 `refreshLedger` 负责：它只在有人看着账本时跑，
     * 依赖里本来就有 `sessionId`。这里只做项目级的初始装载。
     */
    void loadRuns(client, projectId)
  }, [client, projectId])

  /**
   * 右侧坞的快捷键（`feat/远端文件` · 批 1，2026-08-17）。
   *
   * **挂在 document 上**，与 ⌘K 同一条：它在任何地方都该管用，包括正在打字时。
   *
   * 键位照作者给的那张 Codex 截图：文件 ⌘P、审阅 ⌃⇧G。
   * `⌘P` 在 Chromium 里是打印，**必须 `preventDefault`**——
   * 不挡的话按下去会弹出一个打印对话框，而那与「快捷键没接上」
   * 在人眼里长得完全不一样，会更让人困惑。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // **焦点在终端里就让开**（审查 debug I6）：终端是一整块键盘面,Ctrl+P/Ctrl+K 是 shell 的绑定
      // (上一条历史 / kill-line)。此前全局 handler 照抢,结果 shell 收到 ^P 的同时右坞还弹出来抢焦点。
      if ((e.target as Element | null)?.closest?.(".term-host")) return
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault()
        点开房客("files")
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault()
        点开房客("review")
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

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
        /**
         * **哪几段正在跑，在这里记**（2026-08-19）。
         *
         * 侧栏那一列平时写「多久之前」，正在等模型回话时换成一个跑着的标记
         * （作者选的形状）。**这一段必须在下面那道
         * 「不是当前会话就丢掉」的过滤之前**——它问的恰恰是别的那几段。
         *
         * 判据与当前会话那个 `busy` **是同一句话**（有一条还没 `final` 的
         * agent 轮次），只是作用域不同：那个只看 `$items`，
         * 而 `$items` 里只有正在看的那一段。**写两句不同的判据的话，
         * 侧栏说在跑而对话里已经答完了这种事迟早会发生。**
         */
        /**
         * **开口那一刻就算在跑**（2026-08-22，codex-polish ⑤ 的 e2e 抓出来的）。
         * 此前只在第一段 agent 字节到达时才标「跑着」——而真模型第一个字往往要几秒。
         * 在那几秒里切走，上面那个 effect 的清理看到「没在跑」就把这一段退订了：
         * 侧栏的跑着标记、答完之后的未读点，**全都收不到**。
         */
        if (u.type === "item" && u.item.type === "turn" && u.item.who === "user") 标记在跑(u.sessionId, true)
        if (u.type === "item" && u.item.type === "turn" && u.item.who === "agent") {
          标记在跑(u.sessionId, !u.item.final)
          /**
           * **答完了就重取一次列表**：那一行的「多久之前」要立刻变成「刚刚」。
           * 不取的话它会停在上一次的数上，而一个不动的相对时间**比没有更骗人**。
           */
          if (u.item.final) {
            // 不是正看着的那段说完了 → 未读点（codex-polish ⑤）
            if (u.sessionId !== $activeSessionId.get()) 标未读(u.sessionId, true)
            void loadTempSessions(client)
            const pid = $activeProjectId.get()
            if (pid) void loadSessions(client, pid)
            /**
             * **跑完了、而且人已经不在这一段上，就把它退订掉。**
             *
             * 上面那个 effect 的清理在「它还在跑」时**故意没有退订**
             * （否则这一格会永远挂着「跑着」）。那份欠账在这里还：
             * 不还的话，每切走一段跑着的对话就永久多留一份订阅，
             * **而那种泄漏不出声**。
             */
            if (u.sessionId !== $activeSessionId.get()) {
              client.forgetRevision(u.sessionId)
              client.get("unsubscribeSession", { sessionId: u.sessionId }).catch(fail)
            }
          }
          // **不 return**：下面还要把这一条 upsert 进当前会话的 transcript
        }
        // 会话没了就不可能还在跑。**重启之后什么都没在跑，那是实话**
        if (u.type === "state" && u.state === "exited") 标记在跑(u.sessionId, false)
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
        if (u.type === "dropItem") dropItem(u.id) // 服务端摘掉一条(如「只想没说」并进新的)——实时流跟着删(审查 debug F3)
        if (u.type === "bytes") appendBytes(u.data)
        if (u.type === "snapshot") {
          applySnapshot({
            items: u.snapshot.items,
            terminal: u.snapshot.terminal,
            trimmed: u.snapshot.terminalTrimmed,
            // **当前**内核实例。缺省 = 还没有内核，不是「不陈旧」
            kernelInstanceId: u.snapshot.kernelInstanceId,
            // agent 在问「能不能」（A2）。**缺省 = 没有人在问**，那时卡要消失
            pendingPermission: u.snapshot.pendingPermission,
            // 这一段可以调的开关（A3）。**缺省 = 没有这回事**
            configOptions: u.snapshot.configOptions,
            team: u.snapshot.team,
            // 内核状态（笔记本，2026-08-26）。缺省 = 还没有内核，不是「不陈旧」——与 kernelInstanceId 同一条理由
            kernels: u.snapshot.kernels,
          })
        }
        // 团队变了（team-board）：整份换掉
        if (u.type === "team") setTeam(u.team)
        // 内核状态变了（笔记本，2026-08-26）：与 team 同一条纪律，整份换掉
        if (u.type === "kernels") setKernelsAtom(u.kernels)
        // 产物变了（2026-08-26）：只说变了，清单重拉
        // 只认当前会话的：别的会话变了不拉——拉回来也会被身份守卫丢掉，白打一次 IPC
        if (u.type === "artifactsChanged" && u.sessionId === $activeSessionId.get()) void loadArtifacts(client, u.sessionId)
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
    /**
     * **「账本这一屏开着没有」现在有两个来源**（2026-08-17，批 1）。
     *
     * 「产出」与「变更」搬去了右侧坞的「审阅」，而这个条件当时还写着
     * `view === "panel"`——于是坞里那两张卡**再也不刷新**。
     *
     * 它的表现是最坏的一种：屏幕上写着「无法确定——没有取到 git 基线」，
     * 而真相是「未改动任何文件」。**那句话看起来像一个正当答案**，
     * 不像一个失效。e2e 当场抓住了它（`workspace-refresh`）。
     *
     * 教训不是「加个条件」，是：**把一块界面搬家时，喂它的那条管子
     * 未必跟着搬**——而管子断了通常不出声。
     */
    const 在看账本 =
      $rightDockOpen.get() &&
      ($rightDockTenant.get() === "review" || $rightDockTenant.get() === "overview")
    if (!在看账本) return
    void loadContextUsage(client, $activeSessionId.get())
    const pid = $activeProjectId.get()
    if (!pid) return
    await loadRuns(client, pid, $activeSessionId.get())
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
    // **坞开合与换房客也要触发**：它们和切屏是同一件事的两个入口
  }, [refreshLedger, sessionId, view, projectId, busy, rightDockOpen, rightDockTenant])

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
      /**
       * **还在跑的那一段，切走了也继续听着**（2026-08-19 修）。
       *
       * ## 这是一个探针拍下来的洞
       *
       * 侧栏那一格「跑着」的数据来自推送流。而 `events.bump` 里有一句
       * `if (!this.subscribed.has(sessionId)) return`——**退订之后那一段的
       * 一切更新都收不到了**。于是：切走一段正在跑的对话，
       * 它的「跑着」**永远挂在那儿**，活早干完了也不掉。
       *
       * 量到的（`sleep 6` 的活，切走之后盯了 11 秒）：
       * `甲那段：跑着 / 跑着 / 跑着 …` 一次都没变回去。
       *
       * **而「你切走了也想知道它在跑」正是作者选那个形状的理由**，
       * 所以这不是一个边角——它恰恰是那颗标记存在的场景，
       * 而在那个场景里它是个会粘住的谎。
       *
       * ## 为什么是「继续听」，不是「让忙闲绕过订阅」
       *
       * 后者要新增一种协议更新、还要回答「它算不算一次 revision」
       * （渲染进程靠 revision 连号来发现丢帧）。
       * 而这里要表达的意思本来就很简单：**它还在替我干活，我就继续听着。**
       * 代价有界：只在跑着的时候多收一段的字节流，跑完就退订
       * （见下面那个订阅里 `busy → false` 那一支）。
       */
      if ($跑着的会话.get().has(sessionId)) return
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
  /**
   * 首启向导（2026-08-27）：没有任何凭证、且没点过「先跳过」时替换主区。
   * 判据与底部红字同一条（`没有钥匙`）：目录与凭证**都回来了**且没有凭证。
   * 2026-08-28 之前这里看的是 `providers.providers.length > 0`——那个列表在发布出去的默认配置下永远为空，
   * 全新安装的机器上向导从来没亮过。
   */
  const [跳过向导, 设跳过向导] = useState(读跳过)
  /**
   * 向导一旦因「没凭证」亮起，就留到人按「开始使用」或「先跳过」——key 保存成功那一瞬不能把它抽走
   * （e2e 抓的：第 ② 段解释器还没来得及选，屏幕就换了）。
   */
  const [向导中, 设向导中] = useState(false)
  useEffect(() => {
    if (没有钥匙 && !跳过向导) 设向导中(true)
  }, [没有钥匙, 跳过向导])
  const 探测解释器 = useCallback(() => client.get<探测结果>("probeInterpreters", {}), [client])
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
  const 在看概览 = rightDockOpen && rightDockTenant === "overview"

  /**
   * 笔记本格的 cell 清单（plan 2026-08-26-笔记本 Task 8）：从当前会话转录里筛出来，`items` 一变就重算。
   * 角标要的计数也在这儿灌进 `$cellCount`——RightDock 拿不到 `items`，走 `$artifacts` 同一条路。
   */
  const 笔记本cells = useMemo(() => 转录里的cells(items), [items])
  useEffect(() => { setCellCount(笔记本cells.length) }, [笔记本cells])
  /** 最近一个语言已知的 cell 的语言：概览格问变量时顺手带上，让它问对话里正在用的那个内核 */
  const 最近cell语言 = useMemo(
    () => [...笔记本cells].reverse().find((c) => c.languageKnown && c.language !== undefined)?.language,
    [笔记本cells],
  )
  const 对话内核 = useStore($kernels)
  const [笔记本在跑, 设笔记本在跑] = useState(false)
  /** 中断失败之类**不经 `onRun`** 的错走这条；`onRun` 自己抛的错由面板记着（它要留住草稿），这里不重复记 */
  const [笔记本错, 设笔记本错] = useState<string | undefined>(undefined)
  useEffect(() => { 设笔记本在跑(false); 设笔记本错(undefined) }, [sessionId])

  useEffect(() => {
    if (!在看概览 || !sessionId) {
      setVariables(undefined)
      return
    }
    // 陈旧守卫(I4):快切两会话时,A 的变量回来晚了不许覆盖 B 的面板。切 sessionId → effect 重跑 → cleanup 作废上一发
    let 作废 = false
    client
      .get<Exclude<VariablesState, undefined>>("listVariables", { sessionId, ...(最近cell语言 ? { language: 最近cell语言 } : {}) })
      .then((v) => { if (!作废) setVariables(v) })
      .catch(fail)
    return () => { 作废 = true }
  }, [client, 在看概览, sessionId, 最近cell语言])

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

  const [权限档, 设权限档] = useState<"allow-all" | "ask-risky" | "deny-risky">("allow-all")
  /**
   * 用量（S21）。**进那一屏时才拉**——它要扫全表，而绝大多数会话
   * 从头到尾不会打开这一屏。
   */
  const [用量, 设用量] = useState<用量数据 | undefined>(undefined)
  const 拉用量 = useCallback(() => {
    client.get<用量数据>("getUsage", {}).then(设用量).catch(fail)
  }, [client])
  // 输入卡上那颗权限是唯一入口（2026-08-23）：默认档一进来就取，不再只在设置屏取
  useEffect(() => {
    if (!ready) return
    client
      .get<{ mode: "allow-all" | "ask-risky" | "deny-risky" }>("getPermissionMode", {})
      .then((r) => 设权限档(r.mode))
      .catch(fail)
  }, [client, ready])
  const 设默认档 = useCallback(
    (m: "allow-all" | "ask-risky" | "deny-risky") => {
      const 旧的 = 权限档
      设权限档(m)
      client
        .get<{ mode: "allow-all" | "ask-risky" | "deny-risky" }>("setPermissionMode", { mode: m })
        .then((r) => 设权限档(r.mode))
        .catch((e: unknown) => {
          设权限档(旧的)
          fail(e)
        })
    },
    [client, 权限档],
  )

  const [environment, setEnvironment] = useState<EnvironmentState>(undefined)
  useEffect(() => {
    if (!在看概览 || !sessionId) {
      setEnvironment(undefined)
      return
    }
    // 陈旧守卫(I4):同变量,A 的环境快照回来晚了不许覆盖 B
    let 作废 = false
    client
      .get<Exclude<EnvironmentState, undefined>>("getEnvironment", { sessionId })
      .then((v) => { if (!作废) setEnvironment(v) })
      .catch(fail)
    return () => { 作废 = true }
  }, [client, 在看概览, sessionId])

  /**
   * 能用来**开一段对话**的那些。
   *
   * **终端不在里面**（2026-08-11）：`shell` 那种 `kind: pty` 的 agent
   * 开出来的是一个终端，而终端已经有自己的家（对话区底下那条 dock）。
   * 留在这个清单里，人就会在「新建会话，用哪个 LLM」的菜单里看见 `shell`——
   * 而它既不是 LLM，点了也不会开出一段对话。
   */
  /**
   * 有没有一个 API 模型可用（native agent）——「优化输入」灰不灰看它。
   * 常传（2026-08-28 作者定的：按钮常驻）：native 会话走自己的模型；cli / ACP 会话先借配置里的 API 模型——
   * 走它们自己流量的那条路等一次问答原语造出来再接（见 DEVELOPMENT_HISTORY）。
   */
  const 有API模型 = useMemo(() => providers.agents.some((a) => a.kind === "native"), [providers])
  /** 顺序的理由见 `agent-order.ts`（2026-08-28：打包版首启一开口走了 claude CLI） */
  const agentIds = useMemo(() => 对话agent顺序(providers.agents), [providers])

  /**
   * **在服务器上干活时能用的**（T3，2026-08-21）：native，加标了 `remoteCapable` 的 ACP。
   *
   * 此前远端新建取的是 `agentIds[0]`——配置里第一个是 codex-acp 的话，
   * 远端会话静默变成本机 codex。判据与后端同一个函数（`能上服务器`），
   * 后端也拒；这里先滤，是不让人点到一个注定被拒的。
   */
  const 远端能用的agentIds = useMemo(
    () => providers.agents.filter((a) => a.kind !== "pty" && 能上服务器(a)).map((a) => a.agentId),
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
   * readFile 的陈旧守卫(审查 debug I2)。**先点大文件再点小文件**时,大文件的
   * readFile 后回来会顶着小文件的名字把内容覆盖上去——名字是 B、内容是 A,在说谎。
   * 每次发 readFile 领一张递增票,回来只在票还是最新时才落内容。openFile 与
   * 切树记忆两处共用这一张票(它们改的是同一个 filePath/fileContent)。
   */
  const 读票 = useRef(0)

  /**
   * 列一层目录。**失败要抛出去**——`DirNode` 接住之后显示原因，
   * 静静地给一个空目录会被读成「这个文件夹是空的」。
   */
  /**
   * 当前这一段。**两拨里都要找**（2026-08-11）：
   * `sessions` 是当前项目的，`tempSessions` 是不属于任何项目的临时会话。
   * 只找前者的话，点开一段临时会话会得到「没有这个会话」的空屏。
   *
   * （2026-08-17 挪到这儿：文件面板要知道这段会话长在哪台机器上，
   * 而它比原来那个位置早。**编译器指出来的**，不是我想起来的。）
   */
  const session =
    sessions.find((s) => s.sessionId === sessionId) ??
    tempSessions.find((s) => s.sessionId === sessionId)

  /**
   * 这棵树长在哪台机器上（批 3，2026-08-17）。
   *
   * **跟着当前会话走，不给切换器**（作者定的）：本地会话看本地，
   * 远端会话看那台服务器。你已经用「开哪段会话」表达过这个选择了，
   * 再让你选一次是多余的。
   */
  const 文件所在 = session?.remote

  const searchFiles = useCallback(
    async (query: string, 根: string): Promise<SearchResult> => {
      if (文件所在) return await client.get<SearchResult>("searchFiles", { connectionId: 文件所在.connectionId, path: 根, query })
      if (!projectId) throw new Error(t("还没有选中项目"))
      return await client.get<SearchResult>("searchFiles", { projectId, path: 根, query })
    },
    [client, projectId, 文件所在],
  )
  const loadDir = useCallback(
    async (path: string): Promise<Listing> => {
      if (文件所在) {
        return await client.get("listDirectory", { connectionId: 文件所在.connectionId, path })
      }
      if (!projectId) throw new Error(t("还没有选中项目"))
      return await client.get("listDirectory", { projectId, path })
    },
    [client, projectId, 文件所在],
  )

  /**
   * 打开一个文件。**先清空内容再取**——不清的话，上一个文件的内容会顶着
   * 新文件的名字显示一瞬间，那一瞬间是在说谎。
   */
  const openFile = useCallback(
    (path: string) => {
      /**
       * **打开坞，不切屏**（2026-08-17，批 2）。
       * 从「产出」里点一个文件名，对话不该消失——
       * 那正是把文件从整屏搬进坞的全部理由。
       */
      点开文件面板()
      setFilePath(path)
      setFileContent(undefined)
      // **跟着当前会话所在的机器**（批 3）：远端会话读那台服务器上的
      const 去哪读 = 文件所在
        ? { connectionId: 文件所在.connectionId, path }
        : projectId
          ? { projectId, path }
          : undefined
      if (!去哪读) return
      const 票 = ++读票.current
      client.get<FileContent>("readFile", 去哪读)
        .then((c) => { if (票 === 读票.current) setFileContent(c) })
        .catch(fail)
    },
    [client, projectId, 文件所在],
  )

  /**
   * 坞「产物」格（spec 2026-08-26-产物）。
   *
   * **换会话就重拉，没会话就清空**——清单是按会话的，留着上一段的会在新会话里说谎。
   * `产物焦点` 是「对话里产物条点了哪个」，**带着它所属的 sessionId**：
   * 面板挂着 `key={sessionId}`，切会话时它会重挂，而 state 的清零是在 effect 里、
   * 晚于那次重挂的首次渲染——光靠「切会话时清零」，上一段的焦点会在新会话的
   * 面板上重放一次（打开一个新会话根本没有的路径）。传下去之前先对一遍会话。
   */
  const [产物焦点, 设产物焦点] = useState<{ sessionId: string; path: string; nonce: number } | undefined>(undefined)
  /** 焦点带一个递增计数：同一条产物再点一次也要重新进预览（同 path 的 state 不会触发更新） */
  const 产物焦点计数 = useRef(0)
  useEffect(() => {
    if (!ready) return
    设产物焦点(undefined)
    // **先清再拉**：不清的话，新会话的清单回来之前，坞里顶着的是上一段会话的产物
    setArtifacts(undefined)
    void loadArtifacts(client, sessionId)
  }, [client, ready, sessionId])
  const 重拉产物 = useCallback(() => void loadArtifacts(client, sessionId), [client, sessionId])
  const openArtifact = useCallback((path: string) => {
    const sid = $activeSessionId.get()
    if (!sid) return
    设产物焦点({ sessionId: sid, path, nonce: ++产物焦点计数.current })
    setRightDockTenant("artifacts")
    setRightDockOpen(true)
  }, [])
  /** 产物格自己的预览读文件：**身份要稳**（面板把它放进 effect 依赖），跟 `openFile` 同一条 readFile 路 */
  /**
   * **按会话读，不按项目**（2026-08-26 首用回归）：临时「项目」的 workspace 是 scratch 根，
   * 而会话（探针、账本里的相对路径）住在 `根/<时间戳>-xxxx/`。按 projectId 读就差这一层——
   * 作者第一次点开临时会话的产物 chip，坞里说「找不到」。`listArtifacts` 按会话工作区记路径，读也按它。
   */
  const 读产物 = useCallback((path: string) => {
    const 去哪读 = 文件所在
      ? { connectionId: 文件所在.connectionId, path }
      : sessionId
        ? { sessionId, path }
        : projectId
          ? { projectId, path }
          : undefined
    if (!去哪读) return Promise.reject(new Error(t("还没有选中项目")))
    return client.get<FileContent>("readFile", 去哪读)
  }, [client, projectId, sessionId, 文件所在])

  /**
   * 图片产物的缩略图源（2026-08-27）：走 `读产物` 同一条 readFile，图片响应回 data URL，其余回 undefined。
   * **失败一律回 undefined**（chip / 格子据此退回徽标 / 占位方块，绝不画断图）。身份跟着 `读产物` 稳定。
   */
  const 读产物缩略 = useCallback(
    async (path: string): Promise<string | undefined> => {
      try {
        const c = await 读产物(path)
        return c.kind === "image" ? `data:${c.mediaType};base64,${c.base64}` : undefined
      } catch {
        return undefined
      }
    },
    [读产物],
  )

  /**
   * `@` 引用的文件源（2026-08-23，学自 dsh-at-file）：就是坞里文件格那两条（`loadDir` / `searchFiles`），
   * 远端会话跟着那台机器、令牌相对它的当前目录。**没有项目 / 没有远端 = 没有源**——菜单里要说清。
   */
  /** `@` 引用的第二档设置（7.23）：粘贴不算、文件名过滤。跟着当前项目的工作区取（那一套规则按工作区存） */
  const 当前工作区路径 = projects.find((p) => p.projectId === projectId)?.workspace
  const [艾特设置, 设艾特设置] = useState<艾特设置>({ ignorePasted: true, globalRules: [] })
  /** 线那头回的东西不信到底：缺字段就按默认（测试里的假 client 对不认识的操作回 `{}`） */
  const 整理艾特设置 = (r: Partial<艾特设置> | undefined): 艾特设置 => ({
    ignorePasted: r?.ignorePasted ?? true,
    globalRules: Array.isArray(r?.globalRules) ? r.globalRules : [],
    ...(Array.isArray(r?.workspaceRules) ? { workspaceRules: r.workspaceRules } : {}),
  })
  useEffect(() => {
    if (!ready) return
    client
      .get<艾特设置>("getAtFileSettings", 当前工作区路径 ? { workspace: 当前工作区路径 } : {})
      .then((r) => 设艾特设置(整理艾特设置(r)))
      .catch(fail)
  }, [client, ready, 当前工作区路径])
  const 改艾特设置 = useCallback(
    (patch: { ignorePasted?: boolean; globalRules?: 艾特设置["globalRules"]; workspaceRules?: 艾特设置["globalRules"] }) => {
      client
        .get<艾特设置>("setAtFileSettings", { ...patch, ...(当前工作区路径 ? { workspace: 当前工作区路径 } : {}) })
        .then((r) => 设艾特设置(整理艾特设置(r)))
        .catch(fail)
    },
    [client, 当前工作区路径],
  )
  const 滤掉 = useMemo(() => 编文件规则([...艾特设置.globalRules, ...(艾特设置.workspaceRules ?? [])]), [艾特设置])
  const 引用文件 = useMemo(
    () => (projectId || 文件所在 ? { 根: 文件所在?.cwd ?? "", loadDir, search: searchFiles, 滤掉, 护粘贴: 艾特设置.ignorePasted } : undefined),
    [projectId, 文件所在, loadDir, searchFiles, 滤掉, 艾特设置.ignorePasted],
  )
  /** 点引用栏那一行：远端读那台机器；本地打开坞里的预览（readFile 那条路） */
  const 打开引用 = useCallback((path: string) => openFile(文件所在 ? `${文件所在.cwd.replace(/\/+$/, "")}/${path}` : path), [openFile, 文件所在])

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
      /** 空态排队的外部文件（2026-08-25）：会话建出来之后在这里落盘、拼 `@`——空态自己没有 sessionId */
      files?: readonly import("./views.js").排队的外部文件[] | undefined
    } = {},
  ) => {
    const { workspace, firstMessage, images, files } = opts
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
      // **任务列表刷新挪出关键路径**（2026-08-27，作者报的「切会话慢」）：
      // 它只喂侧栏的任务列表，不参与「主区找不找得到这段会话」——放后台跑，
      // 别挡着开聊。会话列表那几拨（下面）是找会话用的，留在路上。
      void loadTasks(client)
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
         * 空态排队的外部文件（2026-08-25）：会话刚建出来、sessionId 到手，**此刻落盘**。
         * 落进这段会话真实的工作区（没选目录时就是 scratch——`t.workspace` 是准的），
         * `@相对路径` 拼进第一句。失败当场抛，外面那层把字、图、文件都还回空态。
         */
        let 首句 = firstMessage
        // 令牌还在首句里的才落盘（引用栏 ×掉的当没发生过），令牌换写成落盘后的真实路径
        const 活的 = (files ?? []).filter((f) => 首句?.includes(`@${f.令牌}`))
        if (活的.length > 0) {
          const save = window.dawn?.attachSave
          if (!save) throw new Error("这个环境里没有落盘通道，外部文件发不出去")
          const 落点 = t.workspace ?? t.scratchWorkspace ?? workspace
          if (!落点) throw new Error("这段会话没有工作目录，外部文件没处放")
          const 存 = await save(
            落点,
            t.sessionId,
            await Promise.all(
              活的.map(async (f) => ({
                名: f.名,
                ...(f.源路径 ? { 源路径: f.源路径 } : { 字节: new Uint8Array(await f.file!.arrayBuffer()) }),
              })),
            ),
          )
          活的.forEach((f, i) => {
            首句 = 首句!.replace(`@${f.令牌}`, `@${存.相对路径们[i]!}`)
          })
        }
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
        if (首句 || (images && images.length > 0)) {
          try {
            await client.get("writeToSession", {
              sessionId: t.sessionId,
              data: 首句 ?? "",
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

  /**
   * **下载目录**（作者 2026-08-18 定的②）。
   *
   * 后端从批 4a 起就有这两个操作，**而界面上一直没有入口**——
   * 于是从服务器拉下来的文件落到哪儿只能靠猜。
   *
   * 默认值来自主进程的 `app.getPath("downloads")`：mac 上是 `~/Downloads`，
   * Windows 上是它自己的下载文件夹。**不按平台写死路径**——
   * `app.getPath` 还跟得上用户改过的系统设置。
   */
  const [下载目录, 设下载目录状态] = useState<{ path: string; isDefault: boolean } | undefined>(
    undefined,
  )
  useEffect(() => {
    if (!ready) return
    client
      .get<{ path: string; isDefault: boolean }>("getDownloadDir", {})
      .then(设下载目录状态)
      .catch(() => {
        /** **读不到就不画那一格**，不摆一个猜出来的路径——那会指错地方 */
      })
  }, [client, ready])
  const 设下载目录 = async (path: string) => {
    try {
      设下载目录状态(
        await client.get<{ path: string; isDefault: boolean }>("setDownloadDir", { path }),
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
   * 模型 pill 里点了一个 ACP 适配器（2026-08-21，作者在服务器上建会话时报的）。
   *
   * 作者：*「我在点击服务器连接的时候，肯定是要点击新对话的，那么这个页面
   * 现在就应该保持不变，然后在选择模型的时候，就应该显示出有 claude-code-acp 才对。」*
   *
   * ACP 换不了模型也换不了家，所以这一步是**另起一段**：远端会话就起在同一台
   * 服务器上，本地的就起在同一个工作目录。
   *
   * **空会话直接顶替**：点服务器建出来的那段「新对话」还一个字没说，
   * 这时人想的是「改用 claude」而不是「再来一段」——留着那段空的，
   * 侧栏里就多一条永远空着的「新对话」。有历史的会话不动，另开一段。
   */
  const 用ACP另起一段 = async (agentId: string) => {
    if (!session) return
    const 旧任务 = 当前任务
    /**
     * **「空」看 `session.title`，不看 `items`**（2026-08-21 审查抓到的）：
     * 切会话那一瞬 `$items` 被清空、快照回来之前它一直是空的——
     * 那时按 `items.length === 0` 判，一段有历史的会话会被当成空的**删掉**。
     * `title` 的定义就是「还没说过话」（协议 2.12），而且它跟着会话摘要走、不会被清。
     * 两个都空才算空：宁可多留一条空会话，不冒删掉历史的险。
     */
    const 是空的 = !session.title && items.length === 0
    const t = await client.get<import("../protocol/index.js").TaskSummary>("createTask", {
      agentId,
      ...(session.remote
        ? { connectionId: session.remote.connectionId }
        : 旧任务?.workspace
          ? { workspace: 旧任务.workspace }
          : {}),
    })
    if (!t.sessionId) throw new Error("任务建好了却没有会话——这一步不该悄悄过去")
    if (是空的 && 旧任务) {
      // **新的起来了再删旧的**；删不掉只是多一条空会话，不该拦住切换
      await client.get("deleteTask", { taskId: 旧任务.taskId }).catch(() => {})
    }
    await Promise.all([loadTasks(client), loadTempSessions(client), loadConnections(client)])
    if (projectId) await loadSessions(client, projectId)
    setActiveSessionId(t.sessionId)
    setView("conversation")
    await 取写权(t.sessionId)
  }

  /**
   * 在一台服务器上开一段对话（②-B · R4′）。
   *
   * **没连上就先连**（服务端负责），起点是那台机器的家目录。
   * 人点的是「在这台机器上干活」，不该让他先按一次连接再按一次新建。
   */
  const startRemoteSession = async (c: { id: string; label: string }) => {
    // **只从手能到服务器的里面挑**（T3）；codex-acp / cli / kernel 会在本机跑，不算
    const agentId = 远端能用的agentIds[0]
    if (!agentId) {
      setConnProblem(
        t("没有能在服务器上干活的 agent——API 模型可以，标了「能上服务器」的 ACP 适配器（如 Claude Code）也可以"),
      )
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
  // 换会话就清掉上一段的换模型报错(审查 debug I5):它语义上属于某个会话,
  // 但摆在 composer 上是全局的——不清的话,A 换模型失败的那句 ⚠ 会挂到 B 的输入框上。
  useEffect(() => {
    setSwitchProblem(undefined)
  }, [sessionId])

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
    // 设置屏要它；首启向导（没凭证、没跳过时）也要它——服务商下拉从这儿来
    if (view !== "settings" && !(creds.configured.length === 0 && !跳过向导)) return
    client
      .get<typeof knownProviders>("listKnownProviders", {})
      .then(setKnownProviders)
      .catch(fail)
  }, [view, client, creds.configured.length, 跳过向导])

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

  /** 走全局那个确认框，包成一个 Promise：确认 / 第三个选项 / 取消三条路各回一个词（技能屏、已归档屏共用） */
  const 问一句 = useCallback(
    (req: { title: string; detail: React.ReactNode; confirmLabel: string; altLabel?: string | undefined }) =>
      new Promise<"confirm" | "alt" | "cancel">((resolve) => {
        let 答了 = false
        const 答 = (v: "confirm" | "alt" | "cancel") => {
          if (答了) return
          答了 = true
          resolve(v)
        }
        setConfirming({
          title: req.title,
          detail: req.detail,
          confirmLabel: req.confirmLabel,
          onConfirm: () => 答("confirm"),
          ...(req.altLabel ? { altLabel: req.altLabel, onAlt: () => 答("alt") } : {}),
          onDismiss: () => 答("cancel"),
        })
      }),
    [],
  )
  const 载已归档 = useCallback(() => client.get<{ sessions: 归档的会话[] }>("listArchivedSessions", {}), [client])
  /** 「定时」那一屏要的一切（7.19）。去处 = 你打开的项目 + 服务器；agent 去掉终端那种 */
  const 定时操作 = useMemo<ScheduleActions>(
    () => ({
      load: () => client.get("listSchedules", {}),
      loadRuns: (id) => client.get("listScheduleRuns", { ...(id ? { id } : {}), limit: 100 }),
      create: (req) => client.get("createSchedule", req),
      update: (req) => client.get("updateSchedule", req),
      remove: (id) => client.get("deleteSchedule", { id }),
      runNow: (id) => client.get("runScheduleNow", { id }),
      问: 问一句,
      openSession: (sid) => {
        const rec = [...sessions, ...tempSessions].find((s) => s.sessionId === sid)
        // 临时项目不切（与 `onPickTask` 同一条判据，2026-08-23 审查抓的：切过去会把侧栏项目换成「临时会话」那个）
        const 临时 = rec ? projects.find((p) => p.projectId === rec.projectId)?.temporary : false
        if (rec && !临时) setActiveProjectId(rec.projectId)
        setActiveSessionId(sid)
        setView("conversation")
        void loadTasks(client)
      },
      projects: projects.filter((p) => !p.temporary).map((p) => ({ projectId: p.projectId, name: p.name, workspace: p.workspace })),
      connections: connections.map((c) => ({ id: c.id, label: c.label })),
      agents: providers.agents.filter((a) => a.kind !== "pty").map((a) => ({ agentId: a.agentId, remoteCapable: 能上服务器(a) })),
    }),
    [client, 问一句, sessions, tempSessions, projects, connections, providers],
  )

  const askDeleteSession = useCallback(
    (s: SessionSummary) => {
      const 名 = s.title ?? "新会话"
      setConfirming({
        title: tf("删除会话「{0}」？", 名),
        detail: <>{t("会停掉它的进程，并删掉这个会话与它的对话记录。")}</>,
        safety: <>{t("账本不动：这个会话对文件做过什么，记录仍然留在坞的「概览」里。")}</>,
        confirmLabel: t("删除会话"),
        onConfirm: () => {
          client
            .get<{ ledgerKept: number; transcriptTrashed: boolean; problem?: string }>("deleteSession", { sessionId: s.sessionId })
            .then((r) => {
              // **目录没进废纸篓要出声**（2026-08-22）：确认框说了「删掉对话记录」，没做到就得说
              if (!r.transcriptTrashed && r.problem) note(r.problem)
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

  /**
   * 归档（2026-08-22，学自 dsh-archive-manager）：**藏，不删**。进程不停、记录不动，
   * 只是从侧栏消失、到「已归档」那一屏去。正在看的那段归档了就把选中清掉——不留一个指向空的选中。
   */
  const 归档几段 = useCallback(
    async (ids: readonly string[]) => {
      const 没成: string[] = []
      for (const id of ids) {
        try {
          await client.get("setSessionArchived", { sessionId: id, archived: true })
        } catch {
          没成.push(id)
        }
      }
      if ($activeSessionId.get() && ids.includes($activeSessionId.get()!)) {
        setActiveSessionId(undefined)
        setView("conversation")
      }
      await 重取会话()
      await loadTasks(client)
      await 重取归档数()
      if (没成.length > 0) note(tf("有 {0} 段没归档成", 没成.length))
      else note(tf("已归档 {0} 段；在侧栏「已归档」里能找回来", ids.length))
    },
    [client, 重取会话, 重取归档数, note],
  )
  const archiveSession = useCallback((s: SessionSummary) => void 归档几段([s.sessionId]), [归档几段])
  /**
   * 会话菜单补的五项（codex-polish ②，2026-08-22，学自 dsh-codex-ui）。
   * fork = 在同一个地方（项目 / 服务器）用同一个 agent 开一段新的，把上一段最后一句助手的话当开场写进草稿——
   * 不复制转录（那是另一段独立的对话），只带个引子。
   */
  const sessionExtra = useCallback(
    (s: SessionSummary, task: import("../protocol/index.js").TaskSummary, action: 会话额外动作) => {
      const 标题 = s.title ?? t("新对话")
      const 复制 = (文: string, 说: string) => void navigator.clipboard.writeText(文).then(() => note(说)).catch((e: unknown) => fail(e instanceof Error ? e : new Error(String(e))))
      if (action === "copyTitle") return 复制(标题, tf("已复制标题：{0}", 标题))
      if (action === "copyId") return 复制(s.sessionId, tf("已复制会话 ID：{0}", s.sessionId))
      if (action === "copyPath") {
        const p = s.remote?.cwd ?? task.workspace ?? projects.find((x) => x.projectId === s.projectId)?.workspace ?? ""
        return 复制(p, tf("已复制工作目录：{0}", p))
      }
      if (action === "openDir") {
        if (s.remote) return note(t("远端的目录打不开本机的访达"))
        client.get<{ problem?: string }>("openExternally", { projectId: s.projectId, path: "." }).then((r) => { if (r.problem) fail(new Error(r.problem)) }).catch(fail)
        return
      }
      // fork
      const 最后一句 = [...$items.get()].reverse().find((x) => x.type === "turn" && x.who === "agent" && x.final)
      void client
        .get<{ sessionId?: string }>("createTask", { agentId: s.agentId, ...(s.remote ? { connectionId: s.remote.connectionId } : task.workspace ? { workspace: task.workspace } : {}) })
        .then(async (r) => {
          await loadTasks(client)
          if (s.projectId) await loadSessions(client, s.projectId)
          if (!r.sessionId) return
          const 引子 = 最后一句 && 最后一句.type === "turn" && $activeSessionId.get() === s.sessionId ? `接着上一段「${标题}」的结论：
> ${最后一句.text.trim().slice(0, 600).replace(/\n/g, "\n> ")}

` : `接着上一段「${标题}」：

`
          setDraft(r.sessionId, 引子)
          setActiveSessionId(r.sessionId)
          setView("conversation")
        })
        .catch(fail)
    },
    [client, projects, note, fail],
  )
  const archiveMany = useCallback(
    (targets: readonly import("../protocol/index.js").TaskSummary[], done: () => void) => {
      const ids = targets.flatMap((t) => (t.sessionId ? [t.sessionId] : []))
      if (ids.length < targets.length) note(tf("有 {0} 段没有会话，归档不了", targets.length - ids.length))
      void 归档几段(ids).finally(done)
    },
    [归档几段, note],
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
        safety: <>{t("账本不动：它们对文件做过什么，记录仍然留在坞的「概览」里。")}</>,
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
        /** 名下的会话全选了 → 连项目一起移除；否则只删选中的那几段（2026-08-21） */
        整个?: boolean
      }[],
      done: () => void,
    ) => {
      if (groups.length === 0) return
      const 会话数 = groups.reduce((n, g) => n + g.tasks.length, 0)
      const 整个的 = groups.filter((g) => g.整个 !== false)
      const 只删几段 = 整个的.length < groups.length
      setConfirming({
        // **按实际发生的事起标题**：只勾了几段会话时，说「删对话」，不说「移除项目」
        title: 只删几段
          ? tf("删除这 {0} 段对话？", 会话数)
          : tf("从工作台移除这 {0} 个项目？", groups.length),
        detail: (
          <>
            {/* **整句走 `tf`，不拿 `<b>` 把它劈成两半**——英文语序不同，拼出来是半句话 */}
            {只删几段
              ? 整个的.length > 0
                ? tf("其中 {0} 个项目名下的对话全选了，会连项目一起从工作台移除。", 整个的.length)
                : t("会一并删除相应的账本记录。项目本身留着。")
              : tf("会一并移除它们名下的 {0} 段对话与相应的账本记录。", 会话数)}
          </>
        ),
        safety: (
          <>
            <b>{t("磁盘上的文件夹一个都不会被删除。")}</b>
            <br />
            {groups.map((g) => g.workspace).join("\n")}
          </>
        ),
        confirmLabel: 只删几段 ? tf("删除 {0} 段", 会话数) : tf("移除 {0} 个", groups.length),
        onConfirm: () => {
          void (async () => {
            const 没删掉: string[] = []
            for (const g of groups) {
              try {
                if (g.projectId && g.整个 !== false) {
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

  /**
   * **人自己按 × 关掉的那些**（2026-08-16）。
   *
   * 记在本地、立刻生效，不等列表回来——作者报的 bug 正是这个：
   * *「点进去之后，终端点退出不好使」*。此前 `onClose` 只在**有项目**时
   * 才重拉列表，于是临时会话里那条终端永远躺在列表里、状态还是活的，
   * 而下面那条 effect 一看「有个活着的」，当场又把它接了回来。
   *
   * **为什么不干脆把 `exited` 都滤掉**：自己死掉的终端要留下 `已结束`
   * 让人看见（规格 7.5，失败必须出声）。**人关的与自己死的不是一回事**，
   * 所以按「谁关的」分，不按状态分。
   */
  const [关掉的终端, 设关掉的终端] = useState<ReadonlySet<string>>(() => new Set())
  const 终端归属 = useStore($终端归属)
  /** dock 此刻归谁：当前对话；没有对话时是「无会话」那一格 */
  const 终端主人 = sessionId ?? 无会话
  /**
   * **当前这段对话的终端**（2026-08-21 起按对话分）。
   *
   * 两拨都要找：项目里的在 `sessions`，没有项目时开的在 `tempSessions`——
   * 上一版只看前者，于是在家目录开的终端**在 dock 里没有标签**：
   * 关不掉、也看不见，掀一次面板就多一个进程，这正是作者报的「一大堆死掉的终端」。
   *
   * 别的对话的终端不列（它们还活着，切回去就在）；没记归属的一律列出来——
   * 藏起来等于把一个活着的进程从所有入口上摘掉。
   */
  const 终端们 = useMemo(
    () =>
      [...sessions, ...tempSessions].filter(
        (x) =>
          x.kind === "pty" &&
          !关掉的终端.has(x.sessionId) &&
          (终端归属.get(x.sessionId) ?? 终端主人) === 终端主人,
      ),
    [sessions, tempSessions, 关掉的终端, 终端归属, 终端主人],
  )
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
        // **记下它是从哪段对话开的**：dock 按对话分，不记就哪儿都不归
        记终端归属(r.sessionId, 终端主人)
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
  }, [client, ptyAgentId, 终端主人])

  /**
   * 掀开 dock 时**如果还没有终端，就开一个**。
   *
   * 点「终端」却看见一个空盒子、还要再点一次「＋ 新终端」——
   * 那是把一次意图拆成两次点击。已经有终端时不多开：那会在你每次
   * 掀开面板时悄悄多起一个进程。
   */
  /**
   * **只在「掀开」那一下自动开，不是每次 `dockSessionId` 变空都开**（2026-08-16 改）。
   *
   * 上一版没有这道闸：人按 × 关掉当前那个 → `dockSessionId` 变空 →
   * 这条 effect 立刻又开一个（或把还没来得及更新状态的那个接回来）。
   * **两种表现都是「点了退出什么也没发生」**，而代码里两处各自都说得通。
   *
   * 关完最后一个之后该看见的是 dock 里那句「还没有终端。点『＋ 新开』开一个」——
   * 那句话在上一版**根本到不了**。
   */
  /**
   * **按「这段对话」记掀开过没有**（2026-08-21 改）：切到另一段对话，
   * dock 要换成那段的终端——没有就新开一个；而不是把上一段的接着摆在这儿。
   */
  const 掀开过的主人 = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!dockOpen) {
      掀开过的主人.current = undefined
      return
    }
    if (掀开过的主人.current === 终端主人) return
    掀开过的主人.current = 终端主人
    const 活着的 = 终端们.find((t) => t.state !== "exited")
    if (活着的) {
      setDockSessionId(活着的.sessionId)
      return
    }
    setDockSessionId(undefined)
    // **没有项目也能开**——那时终端开在家目录（2026-08-11）
    if (ptyAgentId) 开一个终端()
  }, [dockOpen, 终端主人, 终端们, ptyAgentId, 开一个终端])


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
  /* ── 提示词增强（2026-08-21） ── */
  const 去增强 = useCallback(
    (sessionId: string | undefined) =>
      (req: { text: string; mode: EnhanceMode; requestId: string }) =>
        client.get<EnhanceOutcome & { model: string }>("enhancePrompt", { ...req, ...(sessionId ? { sessionId } : {}) }),
    [client],
  )
  const 取消增强 = useCallback((requestId: string) => client.get("cancelEnhance", { requestId }), [client])

  /* ── 远程助理（2026-08-21） ── */
  const 载微信状态 = useCallback(() => client.get<WeixinStatus>("weixinGetStatus", {}), [client])
  /** 扩展三屏的 `load` 记住引用（2026-08-23 审查抓的：内联箭头函数让那三屏的 effect 每次渲染都重拉一遍——后台会话每到一个 token 就打一次） */
  const 载技能 = useCallback(() => client.get<AgentSkill装载>("listAgentSkills", projectId ? { projectId } : {}), [client, projectId])
  const 载子agent = useCallback(() => client.get<SkillLoad>("listSubagents", projectId ? { projectId } : {}), [client, projectId])
  const 载MCP = useCallback(() => client.get<MCP装载>("listMcpServers", projectId ? { projectId } : {}), [client, projectId])
  const 载微信通知 = useCallback(() => client.get<NotifySettings>("weixinGetNotify", {}), [client])
  const 载飞书状态 = useCallback(() => client.get<FeishuStatus>("feishuGetStatus", {}), [client])
  const 载飞书通知 = useCallback(() => client.get<NotifySettings>("feishuGetNotify", {}), [client])
  const 微信可绑的 = useSessionChoices(tasks)

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
    /**
     * **ACP 那条没有这颗 pill**（2026-08-19，作者报的）。
     *
     * 作者：*「我在调用 codex-acp 的时候，发送旁边的还显示的是 cli。」*
     * 他看到的是那颗 pill 上写着**「CLI 默认」**——那句兜底文案是给 `cli`
     * 写的（*「当前未知时如实标『CLI 默认』」*），ACP 落进去纯属误伤。
     *
     * 而比文案更糟的是**那颗 pill 本身不该在这儿**：它列的是
     * 各家 provider 的模型，点一下会去改这段会话的模型——
     * 可 **ACP 里根本没有「换模型」这个操作**（`ModelPill` 上面那段注写着）。
     * ACP 的模型是适配器自己广播的，走的是左边那颗会话开关
     * （claude 那台上就写着 `Sonnet`）。
     *
     * 给空清单而不是加一个 `kind !== "acp"` 的渲染判断：
     * `ModelPill` 本来就有「没得选就不画」这条（`choices.length === 0`），
     * **同一件事不写第二遍**。
     */
    agentCfg?.kind === "acp"
      ? []
      : agentCfg?.kind === "cli"
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
  /**
   * 文件面板（`feat/远端文件` · 批 2，2026-08-17）。
   *
   * **它只有一份**，长在右侧坞里。此前它是 `view === "files"` 那一整屏——
   * 于是看文件的时候对话没了，而看图的真实场景恰恰是
   * 「模型刚跑完，我想边看图边说下一步」。
   *
   * 侧栏那个「文件」入口现在**打开坞**，不再切屏。
   * 留着两个入口指向同一个东西，就是「两处长得一样的东西，等于没有判据」。
   */
  /**
   * 开坞并切到文件那一格。**与 `点开房客` 不同：它永远是「开」，不是「切换」**——
   * 从产出栏点一个文件名，人的意图是「给我看这个」，绝不会是「把面板关掉」。
   */
  const 点开文件面板 = useCallback(() => {
    setRightDockTenant("files")
    setRightDockOpen(true)
  }, [])

  /**
   * 文件面板的身份（批 3）。**换机器就换一份**——
   * `key` 变了组件重新挂载，上一台机器的路径与预览一起清空。
   * 留着比空着更坏：屏幕上是 gs191 的路径，内容却是本机的。
   */
  /**
   * 下载（批 4a，2026-08-17）。**只对远端给**——本地文件已经在这台机器上了，
   * 给一颗「下载到本机」的按钮是荒唐的。
   *
   * 进度**轮询**，不走推送：推送那条通道是会话专属的（信封里带 `sessionId`），
   * 而传输不是会话事件；另开一条推送通道相对 200ms 轮询的收益，
   * 在一根进度条上人眼看不出来。
   */
  /**
   * **传输 id 进 state，不进 ref**（2026-08-17 e2e 抓到的）。
   *
   * 第一版把它放在 `useRef` 里，而轮询那个 effect 的依赖是
   * `[client, 传输?.state]`——**ref 变了不会重跑 effect**，
   * 于是守卫 `!传输id.current` 永远拦在那儿，轮询一次都没起来。
   * 屏幕上的表现是进度条停在「0 字节 / ？」，看起来像传输卡住了。
   */
  const [传输, 设传输] = useState<(传输态 & { id?: string }) | undefined>(undefined)
  const 起点 = useRef<{ 时刻: number; 已传: number }>({ 时刻: 0, 已传: 0 })

  const 下载 = useCallback(
    (path: string) => {
      if (!文件所在) return
      设传输({ transferred: 0, state: "running" })
      起点.current = { 时刻: Date.now(), 已传: 0 }
      client
        .get<{ transferId: string; name: string; target: string }>("startDownload", {
          connectionId: 文件所在.connectionId,
          path,
        })
        .then((r) => {
          设传输((前) => ({
            ...(前 ?? { transferred: 0, state: "running" as const }),
            id: r.transferId,
            target: r.target,
          }))
        })
        .catch((e: unknown) => {
          // **起不来也要出声**：不出声的表现是「点了下载没反应」
          设传输({ transferred: 0, state: "failed", error: e instanceof Error ? e.message : String(e) })
        })
    },
    [client, 文件所在],
  )

  useEffect(() => {
    if (传输?.state !== "running" || !传输.id) return
    const id = 传输.id
    const t = setInterval(() => {
      client
        .get<{ transferred: number; total?: number; state: 传输态["state"]; error?: string }>(
          "transferStatus",
          { transferId: id },
        )
        .then((r) => {
          // **速度在这一层算**：后端不认识时钟，那样它才能在测试里不依赖真实时间
          const 现在 = Date.now()
          const 秒 = (现在 - 起点.current.时刻) / 1000
          const 速度 = 秒 > 0.3 ? (r.transferred - 起点.current.已传) / 秒 : undefined
          if (秒 > 1) 起点.current = { 时刻: 现在, 已传: r.transferred }
          设传输((前) => ({ ...前, ...r, ...(速度 ? { 速度 } : {}) }))
        })
        .catch(() => {
          // 查不到多半是这次传输已经被清了；**停下来，不要一直转**
          设传输((前) => (前 ? { ...前, state: "failed" } : 前))
        })
    }, 200)
    return () => clearInterval(t)
  }, [client, 传输?.state, 传输?.id])

  /**
   * 上传（批 4b，2026-08-17）。**另一头交给系统对话框**，不长第二棵树。
   *
   * 撞名时后端**什么都不做**、只回一句「撞名了」，由这里去问
   * 「覆盖 / 另存一份 / 取消」——默默覆盖是唯一不能选的：
   * **你可能正在覆盖昨天那一版数据**。
   */
  /**
   * 传一个文件，**传完（或人做完选择）才 resolve**。
   *
   * 拖进来一批时要一个一个来——「全部覆盖」那种按钮是专门用来批量毁数据的。
   */
  const 传一个 = useCallback(
    (dir: string, 本机路径: string) =>
      new Promise<void>((完事) => {
        if (!文件所在) return 完事()
        /**
         * **先把条子清空**（2026-08-18，真机上撞出来的）。
         *
         * 不清的话，从按下到服务器答复这一段，条子上挂着的是**上一次的结果**
         * ——假 SFTP 上那只有几毫秒，真机上是一到三秒，屏幕上就是
         * 「我明明在传新的，它却说上一个传好了」。
         */
        设传输({ transferred: 0, state: "running", 方向: "上传", name: 本机路径.split("/").pop() ?? 本机路径 })
        起点.current = { 时刻: Date.now(), 已传: 0 }

        const 发一次 = (onConflict: "ask" | "overwrite" | "keepBoth") =>
          client
            .get<
              | { kind: "conflict"; name: string }
              | { kind: "started"; transferId: string; target: string }
            >("startUpload", {
              connectionId: 文件所在.connectionId,
              dir: dir || 文件所在.cwd,
              localPath: 本机路径,
              onConflict,
            })
            .then((r) => {
              if (r.kind === "conflict") {
                // **问之前把条子撤掉**：还没开始传，留着一根转着的条是假象
                设传输(undefined)
                setConfirming({
                  title: tf("「{0}」已经在那台机器上了", r.name),
                  detail: t("覆盖会写掉那边那一份。另存一份会自动改名，两个都留着。"),
                  confirmLabel: t("覆盖"),
                  onConfirm: () => void 发一次("overwrite"),
                  altLabel: t("另存一份"),
                  onAlt: () => void 发一次("keepBoth"),
                  // **人点了取消也要往下走**，否则一批里有一个撞名就整批卡住
                  onDismiss: () => 完事(),
                })
                return
              }
              设传输((前) => ({ ...前, transferred: 0, state: "running", id: r.transferId, target: r.target }))
              起点.current = { 时刻: Date.now(), 已传: 0 }
              完事()
            })
            .catch((e: unknown) => {
              // **起不来也要出声**：不出声的表现是「点了上传没反应」
              设传输({ transferred: 0, state: "failed", error: e instanceof Error ? e.message : String(e) })
              完事()
            })

        void 发一次("ask")
      }),
    [client, 文件所在],
  )

  /**
   * 传一批。**一个一个来，冲突一个一个问**（2026-08-18）。
   * 「全部覆盖」那种按钮是专门用来批量毁数据的——一次点错，
   * 昨天那一版结果整批没了。慢一点是这件事该有的代价。
   */
  const 传这些 = useCallback(
    async (dir: string, 本机路径们: readonly string[]) => {
      for (const p of 本机路径们) await 传一个(dir, p)
    },
    [传一个],
  )

  const 上传 = useCallback(
    async (dir: string) => {
      const 挑中 = await 挑文件("any")
      // 取消了：什么都不做，也不出声
      if (挑中.length > 0) await 传这些(dir, 挑中)
    },
    [传这些],
  )

  /**
   * 传完一次就让树重读一遍。**不这么做的话，屏幕上说「传好了」而树里没有它**
   * ——那正是「看起来一切正常」的反面（2026-08-17 e2e 撞出来的）。
   */
  const [刷新令牌, 设刷新令牌] = useState(0)
  useEffect(() => {
    if (传输?.state === "done") 设刷新令牌((n) => n + 1)
  }, [传输?.state, 传输?.target])

  /**
   * **切回这个窗口就重读一遍文件树**（2026-08-19，作者报的）。
   *
   * 作者：*「我在挪动文件进去之后文件tree没有更新。」*
   *
   * ## 为什么此前不会更新
   *
   * 那个令牌只在**我们自己动手**时才 +1（传完、上传、删除）。
   * 在 Finder 里把文件挪进去，**没有任何东西会告诉界面**——
   * 于是屏幕上那棵树与磁盘上那个目录，从那一刻起就是两回事了。
   *
   * ## 为什么是「切回窗口」，不是文件监视器
   *
   * 监视器要递归盯住整个工作区。科研目录里动辄几十万个文件
   * （一个 `data/raw` 就够），而**盯住它们的收益只发生在你回到这个窗口的那一刻**——
   * 在别处改文件时没人在看那棵树。
   *
   * 「切回来」恰好就是那一刻，而且它是**免费**的：一个 `focus` 事件。
   *
   * ## 它现在敢这么做，是因为刷新不再重挂整棵树
   *
   * 令牌此前拌在树根的 `key` 里，一变就整棵重挂、**展开的目录全部塌回去**。
   * 那样按 focus 刷新会变成「每次切回来树都收起来」，比不刷新更烦人。
   * 改成逐层重读之后（见 `files.tsx` 的 `DirNode`），这一条才成立。
   *
   * **坞关着时 `FilesView` 根本没挂载**，所以这里不必判断——没人读，就没有开销。
   */
  useEffect(() => {
    const 回来了 = () => 设刷新令牌((n) => n + 1)
    window.addEventListener("focus", 回来了)
    return () => window.removeEventListener("focus", 回来了)
  }, [])

  /**
   * 删一个文件（批 5，2026-08-17）。
   *
   * **确认框把你需要为之负责的事实摆全**（作者：*「自己要为自己的数据负责」*）：
   * 哪台机器、**完整绝对路径**（不是相对的 `out/`——那句话在两台机器上
   * 可以指两个地方）、以及**删了还回不回得来**。
   */
  /**
   * 删一个目录（2026-08-18）。
   *
   * **先数清楚再问**：作者定的是*「自己要为自己的数据负责」*，
   * 而负责的前提是**知道自己要删掉什么**——一个只写着 `out/` 的确认框
   * 给不了这个。数不完就如实说「至少这么多」。
   */
  const 删一个目录 = useCallback(
    (path: string) => {
      const 远端的 = 文件所在
      const 去哪 = 远端的
        ? { connectionId: 远端的.connectionId, path }
        : projectId
          ? { projectId, path }
          : undefined
      if (!去哪) return
      client
        .get<{ files: number; bytes: number; counted: "complete" | "partial" }>("pathInfo", 去哪)
        .then((info) => {
          const 多少 =
            info.counted === "partial"
              ? tf("**至少** {0} 个文件（还没数完）", info.files)
              : tf("{0} 个文件", info.files)
          setConfirming({
            title: 远端的 ? t("永久删除这个目录？") : t("把这个目录移到废纸篓？"),
            detail: tf("{0}：{1}　—　{2}", 远端的?.label ?? t("本机"), path, 多少),
            safety: 远端的
              ? tf("{0} 上没有废纸篓，删了找不回来。", 远端的.label)
              : t("可以从废纸篓找回来。"),
            confirmLabel: 远端的 ? t("永久删除") : t("移到废纸篓"),
            onConfirm: () => {
              client
                .get<{ trashed: boolean }>("deletePath", 去哪)
                .then(() => {
                  // 删掉的目录里可能就有正在预览的那个
                  // 删的是目录时只清它**底下**的预览（`out` 不该连带 `out2/x.png`）——2026-08-23 审查抓的
                  if (filePath === path || filePath?.startsWith(`${path.replace(/\/+$/, "")}/`)) {
                    setFilePath(undefined)
                    setFileContent(undefined)
                  }
                  设刷新令牌((n) => n + 1)
                })
                .catch(fail)
            },
          })
        })
        .catch(fail)
    },
    [client, projectId, 文件所在, filePath],
  )

  const 删一个 = useCallback(
    (path: string) => {
      const 远端的 = 文件所在
      const 干 = () => {
        const 去哪删 = 远端的
          ? { connectionId: 远端的.connectionId, path }
          : projectId
            ? { projectId, path }
            : undefined
        if (!去哪删) return
        client
          .get<{ trashed: boolean }>("deletePath", 去哪删)
          .then(() => {
            /**
             * **正在预览的那个被删了，预览要清空并说一句。**
             * 留着一张已经不存在的图，是这个项目最不能忍的
             * 那种「看起来一切正常」。
             */
            if (filePath === path) {
              setFilePath(undefined)
              setFileContent(undefined)
            }
            设刷新令牌((n) => n + 1)
          })
          .catch(fail)
      }
      setConfirming({
        title: 远端的 ? t("永久删除这个文件？") : t("把这个文件移到废纸篓？"),
        detail: tf("{0}：{1}", 远端的?.label ?? t("本机"), path),
        safety: 远端的
          ? tf("{0} 上没有废纸篓，删了找不回来。", 远端的.label)
          : t("可以从废纸篓找回来。"),
        confirmLabel: 远端的 ? t("永久删除") : t("移到废纸篓"),
        onConfirm: 干,
      })
    },
    [client, projectId, 文件所在, filePath],
  )

  /**
   * 审阅那一屏的数据（2026-08-18）。**开着才拉**——
   * 没人在看的时候跑 `git diff` 是白烧一次子进程。
   */
  const [审阅, 设审阅] = useState<审阅数据 | undefined>(undefined)
  const 拉审阅 = useCallback(() => {
    if (!projectId) return
    client.get<审阅数据>("reviewChanges", { projectId }).then(设审阅).catch(fail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, projectId])

  /**
   * 侧栏此刻真的占掉多少（收起来就是 0）。**坞的上界要拿它去算**——
   * 拿 `SIDEBAR_MIN` 去算会多给几十像素，坞照样越界，只是越得少一点。
   */
  /**
   * **人刚刚亲手选的那个工作目录**（2026-08-19 作者要的：
   * *「应该立刻收纳入项目里面」*）。
   *
   * **它不是「当前活跃项目」**：应用一启动就有一个活跃项目（默认工作区），
   * 拿那个当判据的话，「项目」那一列会**永远存在**——
   * 第一版就是这么写的，十七条 e2e 当场红，含全部十张视觉基线。
   *
   * 作用域是**这个窗口、这一次**：它记的是「我刚点了那颗按钮」，
   * 不落盘。真在那个目录里说了话之后，它自己会从任务里长出来，
   * 这个值也就无关紧要了（侧栏那边会去重）。
   */
  const [刚选的工作区, 设刚选的工作区] = useState<string | undefined>(undefined)

  const 侧栏此刻多宽 = sidebarCollapsed ? 0 : sidebarWidth

  const 文件面板身份 = 文件所在 ? `远端:${文件所在.connectionId}:${文件所在.cwd}` : `本机:${projectId ?? ""}`

  /**
   * **这棵树的记忆**（2026-08-21）：展开过哪些目录、选中的是哪个文件，按身份记在 localStorage，
   * 切走再切回来照样在（此前树靠 key 重挂，一切换全塌）。读回来经过清洗；写是防抖的。
   */
  const 树根 = 文件所在?.cwd ?? ""
  /**
   * 行菜单的两样（dock-polish ⑤）。路径：本地相对 = 树上的路径、绝对 = 工作区 + 它；
   * 远端树上的本来就是绝对路径，相对是去掉会话 cwd 那一截。
   * 插进输入框：追加到**当前会话**的草稿末尾，`@相对路径 `——没有会话就没有这一项。
   */
  const 行路径 = useCallback(
    (path: string) => {
      if (文件所在) {
        const 前缀 = 树根 ? `${树根.replace(/\/+$/, "")}/` : ""
        return { 相对: 前缀 && path.startsWith(前缀) ? path.slice(前缀.length) : path, 绝对: path }
      }
      return { 相对: path, 绝对: currentWorkspace ? `${currentWorkspace.replace(/\/+$/, "")}/${path}` : path }
    },
    [文件所在, 树根, currentWorkspace],
  )
  const 插进输入框 = useCallback(
    (text: string) => {
      if (!sessionId) return
      const 旧 = draftOf(sessionId)
      setDraft(sessionId, 旧 && !/\s$/.test(旧) ? `${旧} ${text} ` : `${旧}${text} `)
    },
    [sessionId],
  )
  const [树记忆, 设树记忆] = useState<FilesMemory>(() => 读记忆(文件面板身份, 树根))
  const 树记忆身份 = useRef(文件面板身份)
  useEffect(() => {
    if (树记忆身份.current === 文件面板身份) return
    树记忆身份.current = 文件面板身份
    const m = 读记忆(文件面板身份, 树根)
    设树记忆(m)
    // 选中的那个文件也跟着回来——**没有就清掉**，不把上一棵树的文件留在预览里。
    // **不经 `openFile`**（2026-08-23 审查抓的：它第一句是「点开文件面板」——切会话会擅自把坞弹出来、房客换成文件）
    if (m.selected) {
      setFilePath(m.selected)
      setFileContent(undefined)
      const 去哪读 = 文件所在 ? { connectionId: 文件所在.connectionId, path: m.selected } : projectId ? { projectId, path: m.selected } : undefined
      if (去哪读) {
        const 票 = ++读票.current
        client.get<FileContent>("readFile", 去哪读)
          .then((c) => { if (票 === 读票.current) setFileContent(c) })
          .catch(fail)
      }
    } else {
      setFilePath(undefined)
      setFileContent(undefined)
    }
  }, [文件面板身份, 树根, client, projectId, 文件所在])
  useEffect(() => {
    记记忆(文件面板身份, 树记忆, 树根)
  }, [文件面板身份, 树记忆, 树根])
  const 展开集合 = useMemo(() => new Set(树记忆.expanded), [树记忆.expanded])
  const 切展开 = useCallback(
    (path: string, open: boolean) =>
      设树记忆((前) => {
        const 有 = 前.expanded.includes(path)
        if (有 === open) return 前
        return { ...前, expanded: open ? [...前.expanded, path] : 前.expanded.filter((p) => p !== path && !p.startsWith(`${path}/`)) }
      }),
    [],
  )
  // 选中的文件变了就记下（只记相对路径，绝对的是远端那条线的事）
  useEffect(() => {
    设树记忆((前) => (前.selected === filePath ? 前 : filePath ? { ...前, selected: filePath } : (({ selected: _, ...rest }) => rest)(前)))
  }, [filePath])

  /**
   * 文件那一片**只有一份实现，两个摆法**（2026-08-19）。
   *
   * 坞窄的时候上下摞（树在上、预览在下）；**拉宽之后横着分两栏——
   * 左树、右预览**（08-19 先照 Codex 截图做成左预览右树，08-20 作者改成
   * 左树右预览；两边理由在 `styles.css` 的 `.files-wide`）。
   *
   * ## 为什么**不**做成主区那一屏（我先做错了一版）
   *
   * 作者先选了「主区开一屏」，做出来之后当场否掉：
   * *「其实我们不能在主区放图啊，我们要放到旁边的文件区域的旁边，
   * 学习一下 codex。」* 而 e2e 也从另一头量到同一件事——
   * 图从 317px 只变成 312px，因为坞还占着 377px。
   * **两条都指向同一个结论：预览该长在树旁边，不该另开一屏。**
   *
   * 换宽窄要**重新挂载**（`key` 带上摆法），否则 `DirNode` 的展开状态
   * 会跨着两种排布留下来，看起来像树自己动了。
   */
  const 造文件面板 = (铺开: boolean) => (
      <FilesView
        key={`${文件面板身份}#${铺开 ? "宽" : "窄"}`}
        {...(铺开
          ? {
              铺开: true,
              // 加宽的反向：回到默认宽（作者：*「有加宽选项，怎么能没有恢复选项呢」*）
              onShrink: () => setRightDockWidth(RIGHT_DOCK_DEFAULT, 侧栏此刻多宽),
            }
          : {
              /**
               * 一颗一键加宽。**拖把手也能加宽，但那条路没人找得到**——
               * 「看不见的能力等于不存在」这条本项目栽过两次。
               *
               * **已经顶到这个窗口能给的最宽时就不给这颗**：
               * 一颗按下去什么都不变的按钮，比没有这颗更让人怀疑自己点错了。
               * 上界跟着窗口走（见 `坞的上界`）——窗口不够宽时 720 是拿不到的。
               */
              ...(rightDockWidth < 坞的上界(undefined, 侧栏此刻多宽)
                ? {
                    onExpand: () =>
                      setRightDockWidth(坞的上界(undefined, 侧栏此刻多宽)),
                  }
                : {}),
            })}
        机器={文件所在?.label ?? t("本机")}
        初始根={文件所在?.cwd ?? ""}
        {...(文件所在
          ? {
              onDownload: 下载,
              onUpload: 上传,
              /**
               * 拖进来（2026-08-18）。**拖到哪一行就传到哪个目录。**
               *
               * 拿不到本机路径的那些要**响亮说出来**：从浏览器里拖来的图、
               * 压缩包里的条目，`webUtils.getPathForFile` 给的是空串，
               * 而上传走的是 `localPath`——不说的话就是
               * 「看起来拖进去了，其实什么都没发生」。
               */
              onDropUpload: (dir: string, files: readonly File[]) => {
                const { 有, 没有 } = 拖进来的本机路径(files)
                if (没有 > 0) {
                  fail(new Error(tf("有 {0} 个拖进来的东西拿不到本机路径，没有传", 没有)))
                }
                if (有.length > 0) void 传这些(dir, 有)
              },
            }
          : {})}
        刷新令牌={刷新令牌}
        onDelete={删一个}
        onDeleteDir={删一个目录}
        进废纸篓={!文件所在}
        {...(传输 ? { 传输 } : {})}
        onCancel={() => {
          if (传输?.id) client.get("cancelTransfer", { transferId: 传输.id }).catch(fail)
        }}
        selected={filePath}
        展开={展开集合}
        onToggle={切展开}
        content={fileContent}
        loadDir={loadDir}
        search={searchFiles}
        路径={行路径}
        {...(sessionId ? { onInsert: 插进输入框 } : {})}
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
  )

  const actions = useMemo<Actions>(
    () => ({
      openSettings: () => setView("settings"),
      openSettingsSection: (id) => openSettingsSection(id),
      /** 掀开／收起底部终端。**与 composer 上那颗是同一个动作** */
      toggleDock: () => toggleDock(),
      showConversation: () => setView("conversation"),
      /** 概览住在坞里了（2026-08-20）。命令面板这条打开坞的那一格 */
      showProjectPanel: () => {
        setRightDockTenant("overview")
        setRightDockOpen(true)
      },
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
        // 两拨都找（2026-08-23 审查抓的：远端 / 散的会话住在 `tempSessions`，只查 `sessions` 时命令亮着、按下去没反应）
        const id = $activeSessionId.get()
        const s = sessions.find((x) => x.sessionId === id) ?? tempSessions.find((x) => x.sessionId === id)
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

  /** 子 agent 名册（命令面板里「派」与「按规矩聊」两组用）。启动取一次，项目切换时再取；停用的不列 */
  const [子agent名册, 设子agent名册] = useState<{ name: string; title?: string | undefined; description: string; group?: string | undefined }[]>([])
  /** 侧栏「Agent Skills」后面那个数：开着的（不含「关」了的） */
  const [技能数, 设技能数] = useState<number | undefined>(undefined)
  /** 设置「记忆」入口的待确认角标(建议 + 待装技能;0 = 不显示) */
  const [记忆待确认数, 设记忆待确认数] = useState<number | undefined>(undefined)
  const [技能单, 设技能单] = useState<SlashItem[]>([])
  /** 输入框 `/` 菜单的单子：技能 + 子 agent（两个输入框共用一份 store） */
  useEffect(() => {
    setSlashItems([
      // 团队模式（team-board）：永远在最前——它不是名册里的一员，是一种做法
      { kind: "team" as const, name: "team", title: t("组一支团队"), description: t("让模型当队长：拉几个子 agent 当成员、拆成带依赖的任务、自动派活；进度在坞里「团队」那一格") },
      ...技能单,
      ...子agent名册.map((a) => ({ kind: "subagent" as const, name: a.name, ...(a.title ? { title: a.title } : {}), description: a.description, ...(a.group ? { group: a.group } : {}) })),
    ])
  }, [技能单, 子agent名册])
  /**
   * 侧栏那两个数**动了才重取**（2026-08-22 作者：「不用每五秒刷，有增加的时候自然就增加」）：
   * 技能屏 / 子 agent 屏做完一件事（导入、删除、启停）报一声，这里 +1；切项目、切屏也重取。
   */
  const [名册代, 设名册代] = useState(0)
  const 名册变了 = useCallback(() => 设名册代((n) => n + 1), [])
  useEffect(() => {
    let 还在 = true
    client
      .get<SkillLoad>("listSubagents", projectId ? { projectId } : {})
      .then((r) => 还在 && 设子agent名册(r.agents.filter((a) => !a.disabled).map((a) => ({ name: a.name, description: a.description, ...(a.title ? { title: a.title } : {}), ...(a.group ? { group: a.group } : {}) }))))
      .catch(() => {})
    client
      .get<AgentSkill装载>("listAgentSkills", projectId ? { projectId } : {})
      .then((r) => {
        if (!还在) return
        const 开着的 = r.skills.filter((x) => x.invocation !== "off")
        设技能数(开着的.length)
        设技能单(开着的.map((x) => ({ kind: "skill" as const, name: x.name, description: x.description })))
      })
      .catch(() => {})
    client
      .get<{ pending: number }>("memoryOverview", 当前工作区路径 ? { workspace: 当前工作区路径 } : {})
      .then((r) => 还在 && 设记忆待确认数(r.pending))
      .catch(() => {})
    return () => {
      还在 = false
    }
  }, [client, projectId, view, 名册代, 当前工作区路径])
  const commands = useMemo(
    () =>
      buildCommands({
        actions, agents: agentIds, session, busy, view, dockOpen,
      }),
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
        {/**
          * **右侧坞的入口，钉在顶栏最右**（`feat/远端文件` · 批 1，2026-08-17）。
          *
          * 与左边那颗「折叠侧栏」同一条理由：坞关上之后，长在坞里的按钮
          * 自己也没了，这个能力就只剩一条藏在别处的出路。
          * 顶栏横跨整个窗口，**开着关着都在同一个位置**。
          */}
        <DockSwitch
          open={rightDockOpen}
          tenant={rightDockTenant}
          onToggle={() => setRightDockOpen(!rightDockOpen)}
        />
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
          {
            "--dawn-sidebar-w": sidebarCollapsed ? "0px" : `${sidebarWidth}px`,
            /**
             * 坞那一列的宽度。**关着时是 0，不是 `display: none`**——
             * 与折叠同一条：后者没有中间态，一下就没了，人看不出「它去哪了」。
             */
            "--dawn-dock-w": rightDockOpen ? `${rightDockWidth}px` : "0px",
            /**
             * **内容的宽度不跟着收**（2026-08-15 作者报的）。
             *
             * 折叠动的是列宽，而里面的东西默认跟着列宽走——于是那 0.25 秒里
             * 每一行都在被压窄、重排，作者看到的就是这个
             * （判据量到中途从 204px 挤到 24px）。
             *
             * 好的收合是**内容保持原宽、整体滑出去被裁掉**。所以这里再给一个
             * 变量：它**永远是展开时的宽度**，收起时也不变。
             */
            "--dawn-sidebar-content-w": `${sidebarWidth}px`,
          } as React.CSSProperties
        }
      >
        <SessionSidebar
          /**
           * 服务器那一列的名字（2026-08-14）。
           * **取不到就让侧栏显示连接 id**——不在这里编一个占位名字。
           */
          服务器名={(id) => connections.find((c) => c.id === id)?.label}
          {...(刚选的工作区 ? { 刚选的工作区 } : {})}
          /** **临时项目不进项目列表**：它们的会话在上面那一列 */
          projects={projects.filter((p) => !p.temporary)}
          /**
           * **能参与拖拽排序的全部会话**（2026-08-19 从 `sessions` 改名，见那一侧的注）。
           *
           * **终端不进来**：它们在下面那条 dock 里，根本不在任何一列上，
           * 也就无所谓排序。
           *
           * **远端那些要进来**（2026-08-19 修）。这里从前跟着写了一句
           * `&& !x.remote`，理由是「远端会话不在这一列，两处都列的话同一段
           * 对话会出现两次」——那句话在 2026-08-11 是对的，因为这个 prop
           * 当时**就是那一列要渲染的东西**。2026-08-14 侧栏三列改成由 `tasks`
           * 驱动之后，它只剩排序一个用途，**那条理由随之失效，过滤却留了下来**。
           * 后果：服务器收纳里的行 `draggable` 照给、落点线照画，
           * 松手时 `drop()` 在这个集合里查不到 from/to，一声不吭地 return——
           * 作者报的「服务器里面的会话，我不能挪动鼠标更换位置」。
           */
          排序全集={tempSessions.filter((x) => x.kind !== "pty")}
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
            标未读(id, false)
            setActiveSessionId(id)
            setView("conversation")
          }}
          /* 技能 / 子 agent / 插件 / MCP / 远程助理 2026-08-23 起住在设置的「扩展」一组里，侧栏不再放 */
          /** **点它开坞**（批 2）。再点一次收起来——`点开房客` 就是这个语义 */
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
          onArchiveSession={archiveSession}
          onSessionExtra={sessionExtra}
          onMarkUnread={(s) => 标未读(s.sessionId, true)}
          onArchiveMany={archiveMany}
          archivedCount={归档数}
          onShowArchived={() => setView(view === "archived" ? "conversation" : "archived")}
          onShowSchedule={() => setView(view === "schedule" ? "conversation" : "schedule")}
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
            标未读(任务.sessionId, false)
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
            onResize={(px, phase) => setSidebarWidth(px, phase === "commit")}
          />
        ) : null}

        <main className="main">
          {view === "schedule" ? (
            <ScheduleView actions={定时操作} />
          ) : view === "archived" ? (
            <ArchivedView
              load={载已归档}
              unarchive={(sessionId) => client.get("setSessionArchived", { sessionId, archived: false }).then(async (r) => { await 重取会话(); await loadTasks(client); await 重取归档数(); return r })}
              remove={(sessionId) => client.get<{ transcriptTrashed: boolean; problem?: string }>("deleteSession", { sessionId }).then(async (r) => { await loadTasks(client); await 重取归档数(); return r })}
              removeAll={() => client.get<{ deleted: number; transcriptsTrashed: number; problems: string[] }>("deleteArchivedSessions", {}).then(async (r) => { await loadTasks(client); await 重取归档数(); return r })}
              问={问一句}
              onOpen={(s) => {
                void client
                  .get("setSessionArchived", { sessionId: s.sessionId, archived: false })
                  .then(async () => {
                    if (!projects.find((p) => p.projectId === s.projectId)?.temporary) setActiveProjectId(s.projectId)
                    await loadSessions(client, s.projectId)
                    await loadTasks(client)
                    await 重取归档数()
                    setActiveSessionId(s.sessionId)
                    setView("conversation")
                  })
                  .catch(fail)
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
                  id: "atfile",
                  title: t("文件引用"),
                  icon: <文件图标 className="row-icon" />,
                  body: <AtFilePanel 设置={艾特设置} workspace={当前工作区路径} onChange={改艾特设置} />,
                },
                {
                  /**
                   * 用量（S21，2026-08-16 作者要的）。
                   *
                   * **摆在「外观」后面、「工具权限」前面**：它是"看"，
                   * 后面几块是"配"——一屏里先看后配，比按字母排更像人的顺序。
                   */
                  id: "usage",
                  title: t("用量"),
                  icon: <用量图标 className="row-icon" />,
                  body: (
                    <UsagePanel data={用量} onReload={拉用量} />
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
                            {...(下载目录
                              ? {
                                  download: {
                                    path: 下载目录.path,
                                    isDefault: 下载目录.isDefault,
                                    onPick: () => {
                                      void client.pickDirectory(下载目录.path).then((d) => {
                                        // **取消就什么都不做**：改主意不是错误
                                        if (d) void 设下载目录(d)
                                      })
                                    },
                                    // **空串 = 回到系统那个下载文件夹**（`store/settings.ts`）
                                    onReset: () => void 设下载目录(""),
                                  },
                                }
                              : {})}
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
                  /**
                   * **ACP 适配器**（2026-08-19，作者要的）。
                   *
                   * 作者：*「你现在要在选择模型的地方加上我们之前开发 ACP 的东西，
                   * 否则岂不是白开发了。」*
                   *
                   * 那一整套 2026-08-16 就做完了（runtime、权限卡、
                   * 模型旁边那个 ACP 标记），**缺的只是「怎么把一个加进来」**——
                   * 此前只能自己打开 `providers.yaml` 手写一段。
                   *
                   * **排在「模型服务」后面**：两者是同一类事（这个应用能跟谁说话），
                   * 而这一类里 native 那条是绝大多数人唯一会用到的。
                   */
                  id: "acp",
                  title: t("ACP 适配器"),
                  icon: <模型图标 className="row-icon" />,
                  body: (
                    <AcpPanel
                      agents={providers.agents
                        .filter((a) => a.kind === "acp")
                        .map((a) => ({ agentId: a.agentId, remoteCapable: 能上服务器(a) }))}
                      onSetRemoteCapable={(agentId, on) =>
                        client
                          .get("setAcpRemoteCapable", { agentId, remoteCapable: on })
                          // 与加／删同一条：改完立刻重取，不说半真的话
                          .then(() => loadProviders(client))
                          .catch(fail)
                      }
                      onAdd={(a) =>
                        client
                          .get("addAcpAgent", a)
                          /**
                           * **加完立刻重取 agent 列表**：不重取的话，
                           * 界面说「已添加」而模型选择器还是旧的——
                           * 而那正是作者当初在 kimi 那件事上撞到的同一种半真的话。
                           */
                          .then(() => loadProviders(client))
                          .catch(fail)
                      }
                      onRemove={(agentId) =>
                        client
                          .get("removeAgent", { agentId })
                          .then(() => loadProviders(client))
                          .catch(fail)
                      }
                    />
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
                onProbe={探测解释器}
              />

                    </>
                  ),
                },
                /* ── 扩展（2026-08-23）：从侧栏并进来的五屏，原样挂在这儿——作者：「前 4 个内容保留，剩下的都并入设置」 ── */
                {
                  id: "skills",
                  group: t("扩展"),
                  title: t("Skills"),
                  icon: <技能图标 className="row-icon" />,
                  count: 技能数,
                  body: (
            /**
             * **Agent Skills**（S20，2026-08-15）。
             * 按项目问：项目级 `.dawn/skills/` 会追加几个；没有当前项目时
             * 只有自带与全局那些——**那不是错误，是实情**。
             */
            <AgentSkillsView
              load={载技能}
              actions={{
                setInvocation: (filePath, mode) => client.get("setSkillInvocation", { filePath, mode }),
                onChanged: 名册变了,
                importSkill: (req) => client.get<导入回执>("importSkill", { ...req, ...(req.to === "project" && projectId ? { projectId } : {}) }),
                deleteSkill: (filePath) => client.get("deleteSkill", { filePath }),
                pickDirectory: () => client.pickDirectory(默认工作区?.path),
                hasProject: Boolean(projectId),
                问: 问一句,
              }}
            />
                  ),
                },
                {
                  /**
                   * 记忆(2026-08-25,学自 dsh-memory-evolve):三轨确认制长期记忆。
                   * 角标 = 待确认数(0 不显示)——0 也挂数字就成了噪音。
                   */
                  id: "memory",
                  group: t("扩展"),
                  title: t("记忆"),
                  icon: <记忆图标 className="row-icon" />,
                  count: 记忆待确认数 || undefined,
                  body: (
            <MemoryPanel client={client} workspace={当前工作区路径} onChanged={名册变了} />
                  ),
                },
                {
                  id: "subagents",
                  group: t("扩展"),
                  title: t("子 Agent"),
                  icon: <对话图标 className="row-icon" />,
                  count: 子agent名册.length,
                  body: (
            <SubagentsView
              load={载子agent}
              actions={{
                setEnabled: (filePath, enabled) => client.get("setSubagentEnabled", { filePath, enabled }),
                importSubagents: (req) => client.get<导入回执>("importSubagents", { ...req, ...(req.to === "project" && projectId ? { projectId } : {}) }),
                deleteSubagent: (filePath) => client.get("deleteSubagent", { filePath }),
                pickDirectory: () => client.pickDirectory(默认工作区?.path),
                问: 问一句,
                hasProject: Boolean(projectId),
                onChanged: 名册变了,
              }}
            />
                  ),
                },
                {
                  id: "plugins",
                  group: t("扩展"),
                  title: t("插件"),
                  icon: <插件图标 className="row-icon" />,
                  body: (
            <PluginsView
              load={() => client.get<{ plugins: import("./skills.js").插件一个[] }>("listPlugins", {})}
              onFlag={(pluginId, family, on) => client.get("setPluginFlag", { pluginId, ...(family ? { family } : {}), on })}
            />
                  ),
                },
                {
                  id: "mcp",
                  group: t("扩展"),
                  title: t("MCP 服务器"),
                  icon: <设置图标 className="row-icon" />,
                  body: (
            /**
             * MCP 那一屏（2026-08-15）。
             *
             * **按项目问**：项目级 `.dawn/mcp.yaml` 会追加几台，
             * 没有当前项目时就只有全局那些——那不是错误，是实情。
             */
            <McpView
              load={载MCP}
              问={问一句}
              onTest={(name) =>
                client.get<{ ok: boolean; error?: string; tools: { name: string }[] }>(
                  "testMcpServer",
                  projectId ? { name, projectId } : { name },
                )
              }
              onFlag={async (name, flag, value, fingerprint) => {
                await client.get("setMcpFlag", { name, flag, value, ...(fingerprint ? { fingerprint } : {}) })
              }}
              onSecret={async (name, varName, secret) => {
                await client.get("setMcpSecret", { name, varName, secret })
              }}
              onAdd={(json) =>
                client.get<{ name: string; needsSecrets: string[] }>("saveMcpServer", { json })
              }
              onRemove={async (name) => {
                await client.get("removeMcpServer", { name })
              }}
            />
                  ),
                },
                {
                  id: "assistant",
                  group: t("扩展"),
                  title: t("远程助理"),
                  icon: <手机图标 className="row-icon" />,
                  body: (
            <RemoteAssistantView
              load={载微信状态}
              问={问一句}
              startLogin={() => client.get("weixinStartLogin", {})}
              submitCode={(code) => client.get("weixinSubmitCode", { code })}
              cancelLogin={() => client.get("weixinCancelLogin", {})}
              unbind={() => client.get("weixinUnbind", {})}
              sessions={微信可绑的}
              bindSession={(sessionId) => client.get("weixinBindSession", { sessionId })}
              openSession={(id) => {
                setActiveSessionId(id)
                setView("conversation")
              }}
              loadNotify={载微信通知}
              setNotify={(patch) => client.get("weixinSetNotify", patch)}
              feishu={{
                load: 载飞书状态,
                startLogin: () => client.get("feishuStartLogin", {}),
                cancelLogin: () => client.get("feishuCancelLogin", {}),
                unbind: () => client.get("feishuUnbind", {}),
                bindSession: (sessionId) => client.get("feishuBindSession", { sessionId }),
                loadNotify: 载飞书通知,
                setNotify: (patch) => client.get("feishuSetNotify", patch),
              }}
            />
                  ),
                },
              ]}
              selected={设置分类}
              onSelect={(id) => $settingsSection.set(id)}
            />
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
                  {t("打开面板")}
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
              {/* 同一处（同一个项目文件夹 / 同一台服务器）的会话横着排一行（2026-08-23 作者要的）；散的会话没有「同一处」，不画 */}
              {(() => {
                const 远端 = session.remote?.connectionId
                const 项目 = projects.find((p) => p.projectId === session.projectId)
                if (!远端 && (!项目 || 项目.temporary)) return null
                // 远端会话住在 `tempSessions`（2026-08-23 审查抓的：只筛 `sessions` 时远端那一条分栏永远是空的）
                const 同处 = (远端 ? tempSessions : sessions).filter((x) => !x.archivedAt && (远端 ? x.remote?.connectionId === 远端 : !x.remote && x.projectId === session.projectId))
                return (
                  <SessionTabs
                    tabs={同处.map((x) => ({ sessionId: x.sessionId, title: x.title ?? t("新会话"), running: 跑着的会话.has(x.sessionId), unread: 未读的.has(x.sessionId) }))}
                    current={session.sessionId}
                    onPick={(id) => {
                      标未读(id, false)
                      setActiveSessionId(id)
                    }}
                    onClose={(id) => {
                      // 关掉当前这段之前，先跳到相邻的一段，别把人晾在空屏上
                      if (id === session.sessionId) {
                        const 兄弟 = 同处.find((x) => x.sessionId !== id)
                        if (兄弟) setActiveSessionId(兄弟.sessionId)
                      }
                      void 归档几段([id]).catch(fail)
                    }}
                    onNew={
                      远端
                        ? () => {
                            const c = connections.find((x) => x.id === 远端)
                            if (c) void startRemoteSession({ id: c.id, label: c.label })
                          }
                        : 项目
                          ? () => void 新建任务({ workspace: 项目.workspace }).catch(fail)
                          : undefined
                    }
                  />
                )
              })()}
              <ConversationView
                key={session.sessionId}
                session={session}
                items={items}
                /**
                 * **消息里点了一条本机地址**（批 2，2026-08-18）。
                 *
                 * 动作的家在这儿：切房客、把坞打开、把地址放进那个请求。
                 * 叶子组件只发回调——设计契约那一条：叶子自己改导航状态的话，
                 * 同一个跳转就有两个来源，而「谁先谁后」取决于渲染顺序。
                 */
                onExport={() => client.get<{ path: string; turns: number }>("exportSession", { sessionId: session!.sessionId })}
                引用文件={引用文件}
                onOpenReference={打开引用}
                artifacts={artifacts}
                onOpenArtifact={openArtifact}
                loadThumb={读产物缩略}
                {...(() => {
                  // 这一段的档来自会话开关 `dawn.permission`（原生会话才有）；没有这条开关的会话（acp / cli）不画那颗
                  const 开 = 会话开关们?.find((o) => o.id === "dawn.permission")
                  if (!开) return {}
                  const 跟随 = 开.current === "inherit"
                  const 当前 = (跟随 ? 权限档 : (开.current as "allow-all" | "ask-risky" | "deny-risky"))
                  return {
                    权限: {
                      当前,
                      跟随默认: 跟随,
                      onPick: (档: "allow-all" | "ask-risky" | "deny-risky", 也作为默认: boolean) => {
                        client.get("setSessionConfigOption", { sessionId: session.sessionId, configId: "dawn.permission", value: 档 }).catch(fail)
                        if (也作为默认) 设默认档(档)
                      },
                    },
                  }
                })()}
                onOpenWeb={(url) => {
                  setRightDockTenant("web")
                  setRightDockOpen(true)
                  请打开网址(url)
                }}
                {...(待答权限 ? { 待答权限 } : {})}
                {...(会话开关们 ? { 会话开关们 } : {})}
                onSetConfigOption={(configId, value) => {
                  client
                    .get("setSessionConfigOption", { sessionId: session.sessionId, configId, value })
                    .catch(fail)
                }}
                onAnswerPermission={(requestId, optionId) => {
                  /**
                   * **乐观先摘卡**：点了之后卡立刻消失，人才知道自己点中了。
                   * 服务端那边也会摘一次（快照推回来），两次是幂等的。
                   * 失败时出声——**不出声的表现是「点了没反应」**。
                   */
                  $待答权限.set(undefined)
                  client
                    .get("answerPermission", {
                      sessionId: session.sessionId,
                      requestId,
                      ...(optionId ? { optionId } : {}),
                    })
                    .catch(fail)
                }}
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
                 * 模型 pill 里那一组 ACP 适配器（2026-08-21）。
                 * 远端会话只列手能到服务器的（T3）——此前这条过滤挂在一个
                 * 早就没人读的 `agents` 参数上，等于没做。
                 */
                acpAgents={(session.remote ? 远端能用的agentIds : agentIds)
                  .filter((id) => providers.agents.find((a) => a.agentId === id)?.kind === "acp")
                  .map((id) => ({ agentId: id, label: agentLabel(id) }))}
                onPickAgent={(id) => {
                  void 用ACP另起一段(id).catch(fail)
                }}
                models={modelChoices}
                model={currentModel}
                agentLabel={agentLabel}
                {...(services ? { services } : {})}
                {...(currentServiceLabel ? { currentServiceLabel } : {})}
                {...(switchProblem ? { switchProblem } : {})}
                onToggleDock={toggleDock}
                dockOpen={dockOpen}
                onEnhance={去增强(session.sessionId)}
                onCancelEnhance={取消增强}
                enhanceReason={有API模型 ? undefined : t("还没有 API key——填一个就能用")}
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
                /**
                 * **哪些会话停得下来**（A3，2026-08-16 加了 acp）。
                 *
                 * 这里是一张**白名单，不是「排除 pty」**：
                 *   - `native`：pi 支持中止；
                 *   - `acp`：发一条 `session/cancel`，agent 认它；
                 *   - `cli`：headless 进程没有中止入口，只能杀——那是另一件事；
                 *   - `pty` / `kernel`：中止是往终端送 Ctrl-C，语义完全不同。
                 *
                 * 给一颗按不下去的停止键，比没有更坏——
                 * 而 `undefined` 时那颗键根本不画。
                 */
                onAbort={
                  session.kind === "native" || session.kind === "acp" ? actions.abort : undefined
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
          ) : 向导中 && !跳过向导 ? (
            <SetupWizard
              providers={knownProviders.providers}
              configured={creds.configured}
              interpreters={interpreters}
              onSaveKey={(id, secret) =>
                client
                  .get("setCredential", { providerId: id, secret })
                  // 与设置里那条同一个理由：填了 key 那个 provider 才有 agent，要重取
                  .then(() => Promise.all([loadCredentials(client), loadProviders(client)]))
                  .then(() => undefined)
              }
              onSetInterpreter={saveInterpreter}
              onProbe={探测解释器}
              onSkip={() => {
                记跳过(true)
                设跳过向导(true)
                设向导中(false)
              }}
              onStart={() => {
                记跳过(true)
                设跳过向导(true)
                设向导中(false)
              }}
            />
          ) : (
            <EmptyConversation
              agents={agentIds}
              agentLabel={agentLabel}
              /**
               * **挑之前就要知道它是哪一路**（2026-08-19 作者要的：
               * *「我要你在模型选择的时候，标记出是 API 还是 CLI 还是 ACP」*）。
               */
              agentKind={(id: string) => providers.agents.find((x) => x.agentId === id)?.kind}
              权限={{ 当前: 权限档, onPick: (档) => 设默认档(档) }}
              dockOpen={dockOpen}
              引用文件={引用文件}
              onOpenReference={打开引用}
              onToggleDock={toggleDock}
              onEnhance={去增强(undefined)}
              onCancelEnhance={取消增强}
              enhanceReason={有API模型 ? undefined : t("还没有 API key——填一个就能用")}
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
              onStart={(agentId, firstMessage, workspace, images, files) =>
                // **返回 promise**：空态那张卡要据此在失败时把字、图、文件还回去
                新建任务({ agentId, firstMessage, workspace, images, files })
              }
              /**
               * **选完立刻进项目，文件树跟着换**（2026-08-19 作者定的）。
               *
               * 作者：*「我在选择文件夹后，立刻进入项目，文件tree也转入。
               * 如果不选文件夹，那么就按照会话进行处理。」*
               *
               * ## 为什么非得真的「进项目」
               *
               * 本地列目录**必须给 projectId**（路径相对工作区，绝对路径被守卫拒），
               * 所以「树跟着走」与「进项目」在这一层是同一件事，拆不开。
               * 想只切树不进项目，就得给渲染进程开一条读任意本地目录的口子——
               * **那道守卫不值得为这件事拆掉。**
               *
               * ## 它仍然不建任何会话
               *
               * 「开口那一刻才建」那条决定管的是**任务/会话**。这里只认领文件夹，
               * 侧栏上不会多出一行（那一列由任务分组而来，
               * **没有任务的项目在界面上根本不出现**），
               * 而 `openProject` 是幂等的，选错了再选一次也不会堆积。
               *
               * **取消就什么都不做**：改主意不是错误。
               */
              onPickDirectory={() =>
                client.pickDirectory(默认工作区?.path).then(async (d) => {
                  if (!d) return null
                  try {
                    const p = await client.get<{ projectId: string }>("openProject", {
                      workspace: d,
                    })
                    setActiveProjectId(p.projectId)
                    // **让它立刻出现在「项目」收纳里**（作者要的）
                    设刚选的工作区(d)
                    // **项目名单也要跟上**：头上那一条要写得出它叫什么
                    await loadProjects(client)
                  } catch (e) {
                    /**
                     * **认不下来要出声，而且这一次不往下走**（规格 7.5）。
                     * 静默吞掉的表现是「选了个文件夹，chip 变了、树没变」——
                     * 而那正是这一轮要消掉的那个自相矛盾的中间态。
                     */
                    fail(e)
                    return null
                  }
                  return d
                })
              }
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
                /**
                 * **先从界面上摘掉，再去停**（2026-08-16）。
                 *
                 * 反过来写就是作者报的那个 bug：等服务端回来才动界面，
                 * 而中间那一拍里 effect 已经把它接回去了。
                 * 停失败会走 `fail` 出声——**但那时它已经不在 dock 里了**，
                 * 这是有意的：人要的是「这个终端别再占着我的面板」。
                 */
                设关掉的终端((前) => new Set(前).add(id))
                const 下一个 = 终端们.find((x) => x.sessionId !== id && x.state !== "exited")
                if ($dockSessionId.get() === id) setDockSessionId(下一个?.sessionId)
                /**
                 * **停掉之后连记录一起删**（2026-08-21，作者：*「我关掉的，应该彻底关掉」*）。
                 * 终端没有可恢复的东西；留一条 exited 记录只会在下次变成一排「已结束」。
                 */
                client
                  .get("stopSession", { sessionId: id })
                  .catch(() => {})
                  .then(() => client.get("deleteSession", { sessionId: id }))
                  .then(() => {
                    const pid = $activeProjectId.get()
                    if (pid) void loadSessions(client, pid)
                    // **临时会话那一拨也要刷**——上一版漏了它，
                    // 而没有项目时终端恰恰只在这一拨里
                    void loadTempSessions(client)
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

        {/**
          * **右侧坞**（`feat/远端文件` · 批 1，2026-08-17）。
          *
          * 它是 `.body` 的第三列，**与左半的屏切换无关**（作者定的 Q3）：
          * 切到「设置」或「项目概览」，这一栏还在。
          *
          * 本批只有「审阅」一个房客真的有内容；「文件」这一格现在如实说
          * 「还没搬过来」——**不画一个空面板**，空白会被读成「这里什么都没有」。
          */}
        {rightDockOpen ? (
          <RightDock
            tenant={rightDockTenant}
            width={rightDockWidth}
            onWidth={(px: number, 记住: boolean) => setRightDockWidth(px, 侧栏此刻多宽, 记住)}
            onClose={() => setRightDockOpen(false)}
            /**
             * **点标签只换房客，不收起。**
             *
             * `点开房客` 那条「再点一次就收起」是给快捷键与侧栏入口用的；
             * 一条标签条上点当前那一格却把面板收掉，是没人预期的。
             */
            onPick={setRightDockTenant}
          >
            {rightDockTenant === "review" ? (
              <>
                {/**
                  * **「跟 git HEAD 比，改了什么」**（2026-08-18）。
                  *
                  * 它排在下面那两张卡之前：那两张答的是「这段会话干了什么」，
                  * 而这一张答的是「从上次提交到现在，累计改了什么」——
                  * **两个口径，刻意分开**，合成一个的话必有一个被答错。
                  */}
                <ReviewPanel
                  data={审阅}
                  onReload={拉审阅}
                  loadDiff={(path) =>
                    client.get("fileDiff", { projectId: projectId ?? "", path })
                  }
                />
                {/**
                  * 归属告知**由上面那块 `ReviewPanel` 说一次**（2026-08-18）——
                  * 它离它解释的那些数最近。这儿再说一遍就是两处说同一件事。
                  */}
                <ChangesPanel facts={runDetail?.fileChanges} onOpenFile={openFile} />
                <ToolChangesPanel runs={runs} onOpenFile={openFile} />
              </>
            ) : rightDockTenant === "overview" ? (
              /**
                * **概览**（2026-08-20 从整屏搬进坞，作者定的）。
                * 七块面板竖着摞；「变更/产出」不在这儿——它们 2026-08-17
                * 就搬去「审阅」了，两处显示同一件事等于没有判据。
                *
                * **管子跟着搬**（2026-08-17 的教训原文就在 `refreshLedger` 上）：
                * 变量/环境两个 effect 与 `在看账本` 的条件都已改看这一格。
                */
<div className="dock-overview">
              {/**
                * **这一格答的是「当前这段会话」**（2026-08-20，作者定的：
                * *「概览应该是针对单一一个会话的，而不是全部的概览」*）。
                *
                * 收窄时拿掉的两块，各有各的理由：
                * - **「状态」删了**——它列项目里所有会话，而侧栏本来就在答
                *   这个问题，两处答同一件事等于没有判据；
                * - **「移除项目」移走了**——项目级的危险动作不该躺在一段会话
                *   的概览里；每一行项目上已经有删除入口（同一个动作）。
                *
                * 成本与历史不在这儿另起口径：`loadRuns` 现在带着
                * `sessionId` 取，喂进来的就已经是这段会话的（管子跟着搬）。
                */}
              {!sessionId ? (
                // **没选会话就说清楚**，不摆一排空面板——空面板会被读成「什么都没发生」
                <p className="empty">{t("还没有选中会话。开一段对话，这里就是它的事实面：成本、上下文、变量、环境与账本。")}</p>
              ) : (
                <>
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
                  {/* 外部附件（2026-08-25，学自 dsh-paste-input）：本会话粘贴 / 拖拽落盘的占用与清理 */}
                  {currentWorkspace ? <AttachUsagePanel workspace={currentWorkspace} sessionId={sessionId} /> : null}
                  {provenance ? (
                    <section className="panel">
                      <h3 className="panel-title">{t("溯源")}</h3>
                      <div className="panel-body">
                        <ProvenanceBadge link={provenance} />
                      </div>
                    </section>
                  ) : null}
                </>
              )}
            </div>
            ) : rightDockTenant === "team" ? (
              <TeamPanel key={sessionId} />
            ) : rightDockTenant === "artifacts" ? (
              /** **产物那一格**（2026-08-26）：下载与文件格同一契约——只有远端会话才给（本地文件没有「下载」这一说） */
              <ArtifactsPanel
                key={sessionId}
                data={artifacts}
                focus={产物焦点 && 产物焦点.sessionId === sessionId ? { path: 产物焦点.path, nonce: 产物焦点.nonce } : undefined}
                readFile={读产物}
                loadThumb={读产物缩略}
                onOpenInFiles={openFile}
                {...(文件所在 ? { onDownload: 下载 } : {})}
                onOpenExternally={openExternally}
                onReload={重拉产物}
              />
            ) : rightDockTenant === "notebook" ? (
              /**
                * **笔记本那一格**（plan 2026-08-26-笔记本 Task 8）：cell 从转录里筛，内核状态读 `$kernels`；
                * 按会话 key 重挂，草稿与语言不跨会话。`onRun` 失败**记完再抛**——面板据此留住草稿并出声。
                */
              <NotebookPanel
                key={sessionId}
                sessionKind={session?.kind}
                remoteLabel={session?.remote?.label}
                kernels={对话内核}
                cells={笔记本cells}
                running={笔记本在跑}
                error={笔记本错}
                onRun={async (language: 内核语言, code: string) => {
                  if (!sessionId) throw new Error("没有会话，跑不了")
                  /**
                   * **收尾只认当时的会话**（审查 2026-08-26）：`await` 期间人可能已切到别的会话，
                   * 那时 `running`/`error` 已经是新会话的了——A 跑完不许把 B 的「在跑」清掉，
                   * B 一进来那条按 `sessionId` 清零的 effect 也会被这里的晚到覆盖。
                   */
                  const 当时 = sessionId
                  设笔记本在跑(true)
                  设笔记本错(undefined)
                  try {
                    await client.get<{ cellId: string }>("runInKernel", { sessionId, language, code })
                  } finally {
                    if ($activeSessionId.get() === 当时) 设笔记本在跑(false)
                  }
                }}
                onInterrupt={(language: 内核语言) => {
                  if (!sessionId) return
                  const 当时 = sessionId
                  client.get("interruptKernel", { sessionId, language }).catch((e: unknown) => {
                    // 同上：错误只落在它所属的会话里
                    if ($activeSessionId.get() === 当时) 设笔记本错(e instanceof Error ? e.message : String(e))
                    fail(e)
                  })
                }}
                onOpenVariables={() => setRightDockTenant("overview")}
                onExport={(format: "ipynb" | "md") => {
                  if (!sessionId) return Promise.reject(new Error("没有会话，导不了"))
                  return client.get<{ path: string; cells: number }>("exportNotebook", { sessionId, format })
                }}
              />
            ) : rightDockTenant === "web" ? (
              /**
                * **网页那一格**（批 1，2026-08-18）。屏幕上这一块几乎是空的——
                * 真正的网页是主进程里一个 `WebContentsView`，浮在整个 DOM 之上。
                * `workspace` 传下去是为了 `file:` 那一支：它要以工作目录为界。
                */
              <WebPanel
                workspace={currentWorkspace}
                {...(projectId ? { projectId } : {})}
                agent={{
                  observe: () => client.get("browserObserve", {}),
                  frame: async () => (await client.get<{ png: string }>("browserFrame", {})).png,
                }}
              />
            ) : (
              /**
                * **摆法跟着坞的宽度走**（2026-08-19）。
                *
                * 不另存一个「要不要两栏」的开关：那样会出现
                * 「拉得很窄却还是两栏」这种自相矛盾的状态，
                * 而人选的那个数本来就是宽度。
                */
              // 两栏判据用**有效宽度**(夹到坞此刻能占到的上界),不是存储的原值(审查 debug I8):
              // 窗口太窄时上界会把它压到 720 以下,那就该上下摞,而不是硬挤两栏
              造文件面板(Math.min(rightDockWidth, 坞的上界(视口宽 || undefined, 侧栏此刻多宽)) >= RIGHT_DOCK_两栏起点)
            )}
          </RightDock>
        ) : null}
      </div>

      <ConnectionSurface onRetry={connect} onOpenSettings={actions.openSettings} />

      {/* 命令面板。**放在最外层**——它盖住整个窗口，且要在任何视图下都能叫出来 */}
      <CommandPalette commands={commands} />

      <div className="statusbar">
        <span>{ready ? t("已连接") : t("未连接")}</span>
        {没有钥匙 ? (
          /**
           * **不说「native agent」。** 那是我们内部的词，作者已经为它抱怨过一次
           * （*「为什么还会多一个新建 agent 这种奇怪的东西呢？」*）。
           * 这一行要说的是他关心的事实：还没有钥匙，所以还不能对话。
           */
          <Button
            variant="text"
            size="inline"
            className="caveat statusbar-setup"
            onClick={() => {
              // 回到向导（2026-08-27）：跳过了的人从这里回来；也把主区切回对话那一侧
              记跳过(false)
              设跳过向导(false)
              setView("conversation")
            }}
          >
            {t("还没有填任何 API key，暂时不能对话——点这里填一个")}
          </Button>
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
