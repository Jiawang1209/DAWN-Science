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
import { useCallback, useEffect, useRef, useState } from "react"
import type {
  Cost,
  FileChangeFacts,
  ProjectSummary,
  ProvenanceLink,
  RunSummary,
  SessionEvent,
  SessionSummary,
  SubscribeResult,
} from "../protocol/index.js"
import { applyEvent, turnsFromEvents } from "./turns.js"
import { ChangesPanel, CostPanel, ProvenanceBadge, RunsPanel, StatusPanel } from "./panels.js"
import {
  ConversationView,
  EmptyConversation,
  SessionSidebar,
  TerminalDock,
  type Turn,
} from "./views.js"
import { SettingsPanel, type CredentialState } from "./Settings.js"
import { WorkbenchClientError, createClient, type WorkbenchClient } from "./client.js"

/** `getRun` 的返回：Run 摘要 + 可选的产出事实与成本 */
type RunDetail = RunSummary & { fileChanges?: FileChangeFacts; cost?: Cost }

interface Providers {
  agents: { agentId: string; kind: "native" | "pty" }[]
  providers: { providerId: string; models: string[] }[]
}

type View = "conversation" | "panel" | "settings"

export function App({ client = createClient() }: { client?: WorkbenchClient }) {
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState<string | undefined>()
  const [notes, setNotes] = useState<string[]>([])

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [runs, setRuns] = useState<RunSummary[]>([])
  /** 最新一个 Run 的详情。**产出与成本只有它带得来**——listRuns 只给摘要 */
  const [runDetail, setRunDetail] = useState<RunDetail | undefined>()
  const [provenance, setProvenance] = useState<ProvenanceLink | undefined>()
  const [providers, setProviders] = useState<Providers>({ agents: [], providers: [] })
  const [creds, setCreds] = useState<CredentialState>({ configured: [], encrypted: false })

  const [projectId, setProjectId] = useState<string | undefined>()
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [view, setView] = useState<View>("conversation")

  const [dockOpen, setDockOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  /** 缓冲窗口之前的输出已丢失。要在对话顶部说出来，不能让人以为对话从这里开始 */
  const [lostEarlier, setLostEarlier] = useState(false)
  /** 终端字节。切会话时清空；由事件流追加 */
  const [termChunks, setTermChunks] = useState<string[]>([])
  /** 当前正在看的会话。事件回调里要用最新值，故用 ref 而非闭包捕获 */
  const watching = useRef<string | undefined>(undefined)

  const fail = useCallback((e: unknown) => {
    const msg = e instanceof WorkbenchClientError ? e.message : String(e)
    // 失败必须出声。宁可多一条提示，也不要让界面默默停在旧数据上（规格 7.5）
    setNotes((n) => [...n.slice(-3), msg])
  }, [])

  useEffect(() => {
    client
      .handshake()
      .then(() => setReady(true))
      .catch((e: unknown) => setFatal(e instanceof Error ? e.message : String(e)))
  }, [client])

  const refreshProjects = useCallback(
    () => client.get<ProjectSummary[]>("listProjects").then(setProjects).catch(fail),
    [client, fail],
  )
  const refreshCreds = useCallback(
    () => client.get<CredentialState>("listCredentials").then(setCreds).catch(fail),
    [client, fail],
  )
  const refreshSessions = useCallback(
    (pid: string) => client.get<SessionSummary[]>("listSessions", { projectId: pid }).then(setSessions).catch(fail),
    [client, fail],
  )

  useEffect(() => {
    if (!ready) return
    void refreshProjects()
    void refreshCreds()
    client.get<Providers>("getProviders").then(setProviders).catch(fail)
  }, [ready, refreshProjects, refreshCreds, client, fail])

  /**
   * 有项目就选中第一个。
   *
   * 不这么做的话，重开 app 时侧栏列着项目、「＋ 新建会话」却是禁用的，
   * 还提示「先打开一个项目文件夹」——**明明已经有项目了**。
   * 这个缺陷是 Task 2.23 的 App 级测试撞出来的，叶子组件测试碰不到它。
   */
  useEffect(() => {
    if (projectId === undefined && projects.length > 0) setProjectId(projects[0]!.projectId)
  }, [projects, projectId])

  useEffect(() => {
    if (!projectId) return
    void refreshSessions(projectId)
    client.get<RunSummary[]>("listRuns", { projectId }).then(setRuns).catch(fail)
  }, [client, projectId, refreshSessions, fail])

  /**
   * 事件流。**只订阅一次**，进来的事件按当前正在看的会话过滤——
   * 每次切会话都退订重订会在切换的空隙里漏掉事件。
   */
  useEffect(() => {
    if (!ready) return
    return client.subscribeEvents({
      onEvent: (e: SessionEvent) => {
        if (e.sessionId !== watching.current) return
        setTurns((t) => applyEvent(t, e))
        if (e.kind === "bytes") setTermChunks((c) => [...c, e.data])
        if (e.kind === "dropped") {
          setLostEarlier(true)
          setNotes((n) => [...n.slice(-3), `会话输出过快，丢弃了 ${e.droppedChars} 个字符`])
        }
        // 会话退出要立刻反映到侧栏与输入框，否则还能继续打字却写不进去
        if (e.kind === "state" && e.state === "exited" && projectId) void refreshSessions(projectId)
      },
      // 跳号、畸形、版本不符一律显示出来（规格 7.5）
      onProblem: (m) => setNotes((n) => [...n.slice(-3), m]),
    })
  }, [ready, client, projectId, refreshSessions])

  /**
   * 切会话：退订旧的，订阅新的并重放历史。
   *
   * **不再无脑清空**——初版切回旧会话就是一片空白，那等于对话没被记住。
   */
  useEffect(() => {
    watching.current = sessionId
    setTurns([])
    setTermChunks([])
    setLostEarlier(false)
    if (!sessionId) return

    let stale = false
    client
      .get<SubscribeResult>("subscribeSession", { sessionId })
      .then((r) => {
        // 请求飞行期间用户可能又切走了。用返回值里的 sessionId 核对，不认迟到的结果
        if (stale || r.sessionId !== watching.current) return
        setTurns(turnsFromEvents(r.events))
        setTermChunks(r.events.flatMap((e) => (e.kind === "bytes" ? [e.data] : [])))
        setLostEarlier(r.truncated)
        // 让之后推来的增量接着历史往下校验（协议 §5.2：历史与增量同一套编号）
        client.expectSeq(sessionId, r.latestSeq)
      })
      .catch(fail)

    return () => {
      stale = true
      client.forgetSeq(sessionId)
      client.get("unsubscribeSession", { sessionId }).catch(fail)
    }
  }, [client, sessionId, fail])

  /**
   * 最新 Run 的详情：**产出与成本从这里来**。
   *
   * 初版把 `facts={undefined}` 写死在 JSX 里，产出栏因此永远显示「无法确定」——
   * 那三条硬要求里的第一条（可能包含你自己的修改）在真实界面上永远不会出现。
   * 测试是绿的，功能是死的。
   */
  const latestRunId = runs[0]?.runId
  useEffect(() => {
    setRunDetail(undefined)
    setProvenance(undefined)
    if (!latestRunId) return
    let stale = false
    client
      .get<RunDetail>("getRun", { runId: latestRunId })
      .then((r) => {
        if (!stale) setRunDetail(r)
      })
      .catch(fail)
    // 溯源可能压根没记过。**那不是错误**，是「不知道」——静静地留空即可，
    // 面板自己会说「无溯源记录」
    client
      .get<ProvenanceLink>("getProvenance", { resourceId: latestRunId })
      .then((p) => {
        if (!stale) setProvenance(p)
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [client, latestRunId, fail])

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
        <button type="button" onClick={() => setView(view === "settings" ? "conversation" : "settings")}>
          {view === "settings" ? "返回" : "设置"}
        </button>
      </div>

      <div className="body">
        <SessionSidebar
          projects={projects}
          sessions={sessions}
          agents={providers.agents.map((a) => a.agentId)}
          activeProjectId={projectId}
          activeSessionId={sessionId}
          showingPanel={view === "panel"}
          onPickProject={(id) => {
            setProjectId(id)
            setSessionId(undefined)
            setTurns([])
            setView("conversation")
          }}
          onPickSession={(id) => {
            setSessionId(id)
            setTurns([])
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
                    void refreshProjects()
                    setProjectId(p.projectId)
                    setSessionId(undefined)
                    setView("conversation")
                  })
              })
              .catch(fail)
          }}
          onNewSession={(agentId) => {
            if (!projectId) return
            client
              .get<SessionSummary>("createSession", { projectId, agentId })
              .then((s) => {
                void refreshSessions(projectId)
                // 建完直接进对话——新建会话的目的就是开始聊，不该还要再点一下
                setSessionId(s.sessionId)
                setTurns([])
                setView("conversation")
                // 取写权，否则第一句就会被租约挡下
                return client.get("acquireLease", { sessionId: s.sessionId, holder: "user" })
              })
              .catch(fail)
          }}
        />

        <main className="main">
          {view === "settings" ? (
            <div className="panels">
              <SettingsPanel
                providers={providers.providers.map((p) => p.providerId)}
                credentials={creds}
                onSet={(id, secret) =>
                  client.get("setCredential", { providerId: id, secret }).then(refreshCreds).catch(fail)
                }
                onDelete={(id) =>
                  client.get("deleteCredential", { providerId: id }).then(refreshCreds).catch(fail)
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
                turns={turns}
                lostEarlier={lostEarlier}
                disabled={session.state === "exited"}
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
                onToggle={() => setDockOpen((v) => !v)}
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
            <EmptyConversation canStart={Boolean(projectId)} />
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
