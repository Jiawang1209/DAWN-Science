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
import { useCallback, useEffect, useState } from "react"
import type { ProjectSummary, RunSummary, SessionSummary } from "../protocol/index.js"
import { ChangesPanel, CostPanel, RunsPanel, StatusPanel } from "./panels.js"
import {
  ConversationView,
  EmptyConversation,
  SessionSidebar,
  TerminalDock,
  type Turn,
} from "./views.js"
import { SettingsPanel, type CredentialState } from "./Settings.js"
import { WorkbenchClientError, createClient, type WorkbenchClient } from "./client.js"

interface Providers {
  agents: { agentId: string; kind: "native" | "pty" }[]
  endpoints: { endpointId: string }[]
}

type View = "conversation" | "panel" | "settings"

export function App({ client = createClient() }: { client?: WorkbenchClient }) {
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState<string | undefined>()
  const [notes, setNotes] = useState<string[]>([])

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [providers, setProviders] = useState<Providers>({ agents: [], endpoints: [] })
  const [creds, setCreds] = useState<CredentialState>({ configured: [], encrypted: false })

  const [projectId, setProjectId] = useState<string | undefined>()
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [view, setView] = useState<View>("conversation")

  const [dockOpen, setDockOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])

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

  useEffect(() => {
    if (!projectId) return
    void refreshSessions(projectId)
    client.get<RunSummary[]>("listRuns", { projectId }).then(setRuns).catch(fail)
  }, [client, projectId, refreshSessions, fail])

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
            // ①-B 暂用 prompt 取路径。**这也是命令行思路的残留**，
            // 原生目录对话框已记为待办——但它不阻塞「能不能聊起来」
            const ws = window.prompt("输入项目文件夹的绝对路径")
            if (!ws) return
            client
              .get<ProjectSummary>("openProject", { workspace: ws })
              .then((p) => {
                void refreshProjects()
                setProjectId(p.projectId)
                setSessionId(undefined)
                setView("conversation")
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
                endpoints={providers.endpoints.map((e) => e.endpointId)}
                credentials={creds}
                onSet={(id, secret) =>
                  client.get("setCredential", { endpointId: id, secret }).then(refreshCreds).catch(fail)
                }
                onDelete={(id) =>
                  client.get("deleteCredential", { endpointId: id }).then(refreshCreds).catch(fail)
                }
              />
            </div>
          ) : view === "panel" ? (
            <div className="panels">
              <StatusPanel sessions={sessions} />
              <ChangesPanel facts={undefined} />
              <CostPanel cost={latestRun?.cost} />
              <RunsPanel runs={runs} />
            </div>
          ) : session ? (
            <>
              <ConversationView
                session={session}
                turns={turns}
                disabled={session.state === "exited"}
                onSend={(text) => {
                  setTurns((t) => [...t, { id: `${Date.now()}`, who: "user", text }])
                  client
                    .get("writeToSession", { sessionId: session.sessionId, data: text, as: "user" })
                    .catch(fail)
                }}
              />
              <TerminalDock
                open={dockOpen}
                onToggle={() => setDockOpen((v) => !v)}
                output=""
                available={session.kind === "pty"}
              />
            </>
          ) : (
            <EmptyConversation canStart={Boolean(projectId)} />
          )}
        </main>
      </div>

      <div className="statusbar">
        <span>{ready ? "已连接" : "连接中…"}</span>
        {creds.configured.length === 0 && providers.endpoints.length > 0 ? (
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
