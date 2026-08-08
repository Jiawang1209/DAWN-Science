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
import { ChangesPanel, CostPanel, ProvenanceBadge, RunsPanel, StatusPanel } from "./panels.js"
import {
  ConversationView,
  EmptyConversation,
  SessionSidebar,
  TerminalDock,
} from "./views.js"
import { SettingsPanel } from "./Settings.js"
import { Button } from "./primitives.js"
import { createClient, type WorkbenchClient } from "./client.js"
import {
  $activeProjectId,
  $activeSessionId,
  $credentials,
  $dockOpen,
  $fatal,
  $items,
  $notes,
  $projects,
  $providers,
  $provenance,
  $ready,
  $runDetail,
  $runs,
  $sessions,
  $terminal,
  $terminalTrimmed,
  $view,
  appendBytes,
  applySnapshot,
  fail,
  loadCredentials,
  loadProjects,
  loadProviders,
  loadRunDetail,
  loadRuns,
  loadSessions,
  note,
  resyncSession,
  resetTranscript,
  setActiveProjectId,
  setActiveSessionId,
  setDockOpen,
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
  const fatal = useStore($fatal)
  const notes = useStore($notes)
  const projects = useStore($projects)
  const sessions = useStore($sessions)
  const runs = useStore($runs)
  const runDetail = useStore($runDetail)
  const provenance = useStore($provenance)
  const providers = useStore($providers)
  const creds = useStore($credentials)
  const projectId = useStore($activeProjectId)
  const sessionId = useStore($activeSessionId)
  const view = useStore($view)
  const dockOpen = useStore($dockOpen)
  const items = useStore($items)
  const termChunks = useStore($terminal)
  const termTrimmed = useStore($terminalTrimmed)

  useEffect(() => {
    client
      .handshake()
      .then(() => $ready.set(true))
      .catch((e: unknown) => $fatal.set(e instanceof Error ? e.message : String(e)))
  }, [client])

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
      client
        .get<SessionSummary>("createSession", { projectId: pid, agentId })
        .then((s) => {
          void loadSessions(client, pid)
          setActiveSessionId(s.sessionId)
          setView("conversation")
          // 取写权，否则第一句就会被租约挡下
          return client.get("acquireLease", { sessionId: s.sessionId, holder: "user" })
        })
        .catch(fail)
    },
    [client],
  )

  if (fatal) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">DAWN Science</span>
        </div>
        <div className="panels">
          <section className="panel">
            <h3 className="panel-title">无法启动</h3>
            <div className="panel-body">
              <p className="caveat">{fatal}</p>
            </div>
          </section>
        </div>
        <div className="statusbar" />
      </div>
    )
  }

  const session = sessions.find((s) => s.sessionId === sessionId)
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
          onShowPanel={() => setView("panel")}
          onOpenProject={() => {
            // 原生目录选择器。初版让人往 prompt 里粘绝对路径——**那是命令行思路的残留**
            client
              .pickDirectory()
              .then((ws) => {
                // 取消：什么都不做，不报错
                if (!ws) return
                return client
                  .get<ProjectSummary>("openProject", { workspace: ws })
                  .then((p) => {
                    void loadProjects(client)
                    setActiveProjectId(p.projectId)
                    setActiveSessionId(undefined)
                    setView("conversation")
                  })
              })
              .catch(fail)
          }}
          onNewSession={startSession}
          onOpenSettings={() => setView("settings")}
        />

        <main className="main">
          {view === "settings" ? (
            <div className="panels">
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
              {/* 成本优先用 getRun 的详情，退回摘要里的——两处都没有时面板说「尚未记录」 */}
              <CostPanel cost={runDetail?.cost ?? latestRun?.cost} />
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
          ) : session ? (
            <>
              <ConversationView
                session={session}
                items={items}
                terminalTrimmed={termTrimmed}
                disabled={session.state === "exited"}
                onAbort={
                  session.kind === "native"
                    ? () => client.get("abortSession", { sessionId: session.sessionId }).catch(fail)
                    : undefined
                }
                onSend={(text) => {
                  // **不做本地乐观追加**：事件流是对话的唯一事实来源。
                  // 两条路各写一半迟早对不上——自己发的话会经事件回灌进来。
                  client
                    .get("writeToSession", { sessionId: session.sessionId, data: text, as: "user" })
                    .catch(fail)
                }}
              />
              <TerminalDock
                open={dockOpen}
                onToggle={() => setDockOpen(!$dockOpen.get())}
                chunks={termChunks}
                available={session.kind === "pty"}
                onInput={(data) =>
                  client
                    .get("writeToSession", { sessionId: session.sessionId, data, as: "user" })
                    .catch(fail)
                }
              />
            </>
          ) : (
            <EmptyConversation
              agents={agentIds}
              onStart={startSession}
              onOpenSettings={() => setView("settings")}
            />
          )}
        </main>
      </div>

      <div className="statusbar">
        <span>{ready ? "已连接" : "连接中…"}</span>
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
