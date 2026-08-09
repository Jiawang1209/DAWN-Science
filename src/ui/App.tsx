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
import { useCallback, useEffect, useMemo } from "react"
import { useStore } from "@nanostores/react"
import type { ProjectSummary, SessionSummary, SessionUpdate } from "../protocol/index.js"
import {
  ChangesPanel,
  ContextPanel,
  CostPanel,
  ProvenanceBadge,
  RunsPanel,
  StatusPanel,
  ToolChangesPanel,
} from "./panels.js"
import {
  ConversationView,
  EmptyConversation,
  SessionSidebar,
  TerminalView,
} from "./views.js"
import { AppearancePanel, SettingsPanel } from "./Settings.js"
import { Button } from "./primitives.js"
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
  $terminal,
  $terminalTrimmed,
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
  loadSessions,
  note,
  resyncSession,
  resetTranscript,
  setActiveProjectId,
  setActiveSessionId,
  setSessionModel,
  setTheme,
  setView,
  upsertItem,
} from "./state/index.js"

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
  }, [ready, client])

  /**
   * 有项目就选中第一个。
   *
   * 不这么做的话，重开 app 时侧栏列着项目、「＋ 新建会话」却是禁用的，
   * 还提示「先打开一个项目文件夹」——**明明已经有项目了**。
   * 这个缺陷是 Task 2.23 的 App 级测试撞出来的，叶子组件测试碰不到它。
   */
  useEffect(() => {
    if (projectId === undefined && projects.length > 0) setActiveProjectId(projects[0]!.projectId)
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
        if (u.sessionId !== $activeSessionId.get()) return
        if (u.type === "item") upsertItem(u.item)
        if (u.type === "bytes") appendBytes(u.data)
        if (u.type === "snapshot") {
          applySnapshot({
            items: u.snapshot.items,
            terminal: u.snapshot.terminal,
            trimmed: u.snapshot.terminalTrimmed,
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

  /** 切会话：清空 transcript 并作废飞行中的请求，再取新会话的全量快照 */
  useEffect(() => {
    resetTranscript()
    if (!sessionId) return
    void resyncSession(client, sessionId)
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

  const agentIds = useMemo(() => providers.agents.map((a) => a.agentId), [providers])

  /**
   * 新建会话并直接进对话。
   *
   * **侧栏与空对话区共用它**——Hermes：*"One action, one home. A command may have
   * keyboard, palette, and visible affordances, but they invoke the same action
   * and state. Do not fork behavior per entry point."*
   */
  const startSession = useCallback(
    (agentId: string) => {
      const pid = $activeProjectId.get()
      if (!pid) return
      /**
       * **记下按下时人在哪一屏。**
       *
       * 2026-08-09：这个回调此前无条件 `setView("conversation")`，
       * 于是「按下新建会话 → 会话还没建好 → 用户切到项目概览 → 回调到了」
       * 这条路径会把人**从他刚打开的那一屏上拽走**，而且之后没有任何东西
       * 会把他送回去，屏幕就那么停在错的地方。
       *
       * 它在 e2e 全量跑（56 条串行 Electron）里出现过两次，单独跑必绿——
       * 轻负载下 `createSession` 总是快于用户的下一次点击。
       * **「只在忙的时候错」不是偶发，是窗口小。**
       */
      const from = $view.get()
      client
        .get<SessionSummary>("createSession", { projectId: pid, agentId })
        .then((s) => {
          void loadSessions(client, pid)
          setActiveSessionId(s.sessionId)
          // 人还在原地才进对话。**他自己切走了就尊重他的选择**
          if ($view.get() === from) setView("conversation")
          // 取写权，否则第一句就会被租约挡下
          return client.get("acquireLease", { sessionId: s.sessionId, holder: "user" })
        })
        .catch(fail)
    },
    [client],
  )

  const session = sessions.find((s) => s.sessionId === sessionId)

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
  const modelChoices =
    agentCfg?.kind === "cli"
      ? (agentCfg.models ?? [])
      : (providers.providers.find((p) => p.providerId === agentCfg?.provider)?.available ?? [])
  const currentModel = sessionId ? (sessionModels[sessionId] ?? agentCfg?.model) : undefined

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
      showConversation: () => setView("conversation"),
      showProjectPanel: () => setView("panel"),
      newSession: startSession,
      abort: () => {
        if (!session) return
        client.get("abortSession", { sessionId: session.sessionId }).catch(fail)
      },
      openProject: () => {
        // 原生目录选择器。初版让人往 prompt 里粘绝对路径——**那是命令行思路的残留**
        client
          .pickDirectory()
          .then((ws) => {
            // 取消：什么都不做，不报错
            if (!ws) return
            return client.get<ProjectSummary>("openProject", { workspace: ws }).then((p) => {
              void loadProjects(client)
              setActiveProjectId(p.projectId)
              setActiveSessionId(undefined)
              setView("conversation")
            })
          })
          .catch(fail)
      },
      setTheme,
    }),
    [client, startSession, session],
  )

  const commands = useMemo(
    () => buildCommands({ actions, agents: agentIds, session, busy, view }),
    [actions, agentIds, session, busy, view],
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
    <div className="app-shell">
      <div className="topbar">
        <span className="brand">DAWN Science</span>
        <span className="spacer" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView(view === "settings" ? "conversation" : "settings")}
        >
          {view === "settings" ? "返回" : "设置"}
        </Button>
      </div>

      <div className="body">
        <SessionSidebar
          projects={projects}
          sessions={sessions}
          agents={agentIds}
          activeProjectId={projectId}
          activeSessionId={sessionId}
          showingPanel={view === "panel"}
          onPickProject={(id) => {
            setActiveProjectId(id)
            setActiveSessionId(undefined)
            setView("conversation")
          }}
          onPickSession={(id) => {
            setActiveSessionId(id)
            setView("conversation")
          }}
          onShowPanel={actions.showProjectPanel}
          onOpenProject={actions.openProject}
          onNewSession={actions.newSession}
          onOpenSettings={actions.openSettings}
        />

        <main className="main">
          {view === "settings" ? (
            <div className="panels">
              <AppearancePanel />
              <SettingsPanel
                providers={providers.providers.map((p) => p.providerId)}
                credentials={creds}
                onSet={(id, secret) =>
                  client.get("setCredential", { providerId: id, secret }).then(() => loadCredentials(client)).catch(fail)
                }
                onDelete={(id) =>
                  client.get("deleteCredential", { providerId: id }).then(() => loadCredentials(client)).catch(fail)
                }
              />
            </div>
          ) : view === "panel" ? (
            <div className="panels">
              <StatusPanel sessions={sessions} />
              <ChangesPanel facts={runDetail?.fileChanges} />
              {/* 逐次工具调用那一层。**不变式 5 第一次有用户可见面** */}
              <ToolChangesPanel runs={runs} />
              {/* 成本优先用 getRun 的详情，退回摘要里的——两处都没有时面板说「尚未记录」 */}
              <CostPanel cost={runDetail?.cost ?? latestRun?.cost} />
              {/* 上下文用量。**已用 token 尚未采集，面板如实说，不拿字节去凑** */}
              <ContextPanel usage={contextUsage} />
              <RunsPanel runs={runs} />
              {provenance ? (
                <section className="panel">
                  <h3 className="panel-title">溯源</h3>
                  <div className="panel-body">
                    <ProvenanceBadge link={provenance} />
                  </div>
                </section>
              ) : null}
            </div>
          ) : session && session.kind === "pty" ? (
            /**
             * **托管 CLI 的会话：终端就是主体。**（2026-08-09，作者试用后推翻旧设计）
             *
             * 不给对话视图，也不给输入框——PTY 的输出根本不进对话记录，
             * 而那个输入框此前把文本原样送进 PTY **不带 `\r`**，
             * CLI 收到字符却永远等不到提交。按键现在由 xterm 直接交给 PTY。
             */
            <TerminalView
              chunks={termChunks}
              onInput={(data) =>
                client
                  .get("writeToSession", { sessionId: session.sessionId, data, as: "user" })
                  .catch(fail)
              }
            />
          ) : session ? (
            <>
              <ConversationView
                session={session}
                items={items}
                agents={agentIds}
                onNewSession={actions.newSession}
                models={modelChoices}
                model={currentModel}
                onPickModel={(m) => {
                  if (!session) return
                  /**
                   * **`provider` 只有 native 有。**
                   *
                   * 此前这里写的是 `if (!session || !agentCfg?.provider) return`——
                   * 加了 cli 之后，那个卫语句会让**换模型静静地什么都不做**：
                   * 点了没反应，而用户无从知道为什么。协议已把它放宽为可选（2.4）。
                   */
                  client
                    .get("setSessionModel", {
                      sessionId: session.sessionId,
                      ...(agentCfg?.provider ? { provider: agentCfg.provider } : {}),
                      model: m,
                    })
                    // **成功之后才更新缓存。** 失败时 fail() 会把后端给的理由
                    // （没配 key / 这一轮还没说完）原样显示出来
                    .then(() => setSessionModel(session.sessionId, m))
                    .catch(fail)
                }}
                terminalTrimmed={termTrimmed}
                disabled={session.state === "exited"}
                onAbort={
                  session.kind === "native" ? actions.abort : undefined
                }
                onSend={(text) => {
                  // **不做本地乐观追加**：事件流是对话的唯一事实来源。
                  // 两条路各写一半迟早对不上——自己发的话会经事件回灌进来。
                  client
                    .get("writeToSession", { sessionId: session.sessionId, data: text, as: "user" })
                    .catch(fail)
                }}
              />
            </>
          ) : (
            <EmptyConversation
              agents={agentIds}
              onStart={actions.newSession}
              onOpenSettings={actions.openSettings}
            />
          )}
        </main>
      </div>

      <ConnectionSurface onRetry={connect} onOpenSettings={actions.openSettings} />

      {/* 命令面板。**放在最外层**——它盖住整个窗口，且要在任何视图下都能叫出来 */}
      <CommandPalette commands={commands} />

      <div className="statusbar">
        <span>{ready ? "已连接" : "未连接"}</span>
        {creds.configured.length === 0 && providers.providers.length > 0 ? (
          <span className="caveat">未配置任何 API key——native agent 无法建会话，点「设置」填写</span>
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
