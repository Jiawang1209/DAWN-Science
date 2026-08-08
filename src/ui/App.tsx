/**
 * 外壳（Task 2.11 / 2.12）。
 *
 * **Rho 的 grid 骨架**：46px 顶栏 / 主体 / 24px 状态栏。
 * **默认 agent-first 单栏**——Rho 源码注释写的是
 * *"task interaction first, contextual work on demand"*，与本项目
 * 「一次一个项目、注意力串行」的结论一致。侧栏可切出来。
 *
 * 信息层级学 Claude app：项目 → 会话 → 对话。
 * **点项目名进「项目主页」（四块面板），点会话才进对话视图**——
 * 那四样是「关于项目」的，不是「关于本次对话」的。
 */
import { useCallback, useEffect, useState } from "react"
import type { ProjectSummary, RunSummary, SessionSummary } from "../protocol/index.js"
import { ChangesPanel, CostPanel, RunsPanel, StatusPanel } from "./panels.js"
import { ConversationView, SessionSidebar, TerminalDock, type Turn } from "./views.js"
import { SettingsPanel, type CredentialState } from "./Settings.js"
import { WorkbenchClientError, createClient, type WorkbenchClient } from "./client.js"

export function App({ client = createClient() }: { client?: WorkbenchClient }) {
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState<string | undefined>()
  const [notes, setNotes] = useState<string[]>([])

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [projectId, setProjectId] = useState<string | undefined>()
  const [sessionId, setSessionId] = useState<string | undefined>()

  const [creds, setCreds] = useState<CredentialState>({ configured: [], encrypted: false })
  const [endpoints, setEndpoints] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)

  const [sidebar, setSidebar] = useState(false) // 默认 agent-first：侧栏收起
  const [dockOpen, setDockOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])

  const fail = useCallback((e: unknown) => {
    const msg = e instanceof WorkbenchClientError ? e.message : String(e)
    // 失败必须出声。宁可多一条提示，也不要让界面默默停在旧数据上（规格 7.5）
    setNotes((n) => [...n.slice(-4), msg])
  }, [])

  useEffect(() => {
    client
      .handshake()
      .then(() => setReady(true))
      .catch((e: unknown) => setFatal(e instanceof Error ? e.message : String(e)))
  }, [client])

  const refreshProjects = useCallback(() => {
    client.get<ProjectSummary[]>("listProjects").then(setProjects).catch(fail)
  }, [client, fail])

  const refreshCreds = useCallback(() => {
    client.get<CredentialState>("listCredentials").then(setCreds).catch(fail)
  }, [client, fail])

  useEffect(() => {
    if (!ready) return
    refreshProjects()
    refreshCreds()
    // endpoint 清单来自 capabilities 之外的一次查询；①-B 先从 listCredentials
    // 的已配置项 + 一个静态兜底推导，等 providers 暴露到协议后再改
    client
      .get<{ configured: string[] }>("listCredentials")
      .then((c) => setEndpoints((e) => [...new Set([...e, ...c.configured, "deepseek"])]))
      .catch(fail)
  }, [ready, refreshProjects, refreshCreds, client, fail])

  useEffect(() => {
    if (!projectId) return
    client.get<SessionSummary[]>("listSessions", { projectId }).then(setSessions).catch(fail)
    client.get<RunSummary[]>("listRuns", { projectId }).then(setRuns).catch(fail)
  }, [client, projectId, fail])

  if (fatal) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">DAWN Science</span>
        </div>
        <div className="panels">
          <div className="panel">
            <h3 className="panel-title">无法启动</h3>
            <div className="panel-body">
              <p className="caveat">{fatal}</p>
            </div>
          </div>
        </div>
        <div className="statusbar" />
      </div>
    )
  }

  const session = sessions.find((s) => s.sessionId === sessionId)
  const sessionRuns = sessionId ? runs.filter((r) => r.sessionId === sessionId) : runs
  const latest = sessionRuns[0]

  return (
    <div className={sidebar ? "app-shell" : "app-shell agent-first"}>
      <div className="topbar">
        <span className="brand">DAWN Science</span>
        <button type="button" onClick={() => setSidebar((v) => !v)}>
          {sidebar ? "隐藏侧栏" : "显示侧栏"}
        </button>
        <button type="button" onClick={() => setShowSettings((v) => !v)}>
          {showSettings ? "返回" : "设置"}
        </button>
        <span className="hint">{projects.find((p) => p.projectId === projectId)?.name ?? "未选择项目"}</span>
      </div>

      <div className="body">
        <SessionSidebar
          projects={projects}
          sessions={sessions}
          activeProjectId={projectId}
          activeSessionId={sessionId}
          onPickProject={(id) => {
            setProjectId(id)
            setSessionId(undefined)
          }}
          onPickSession={setSessionId}
          onOpenProject={() => {
            // ①-B 暂用 prompt 取路径；原生目录对话框留到有真实使用反馈后再做
            const ws = window.prompt("输入项目文件夹的绝对路径")
            if (!ws) return
            client
              .get<ProjectSummary>("openProject", { workspace: ws })
              .then((p) => {
                refreshProjects()
                setProjectId(p.projectId)
                setSessionId(undefined)
              })
              .catch(fail)
          }}
        />

        <main className="main">
          {showSettings ? (
            <div className="panels">
              <SettingsPanel
                endpoints={endpoints}
                credentials={creds}
                onSet={(id, secret) => {
                  client
                    .get("setCredential", { endpointId: id, secret })
                    .then(refreshCreds)
                    .catch(fail)
                }}
                onDelete={(id) => {
                  client.get("deleteCredential", { endpointId: id }).then(refreshCreds).catch(fail)
                }}
              />
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
            <div className="panels">
              {creds.configured.length === 0 ? (
                <section className="panel">
                  <h3 className="panel-title">先配置凭证</h3>
                  <div className="panel-body">
                    <p className="caveat">
                      还没有配置任何 API key —— native agent 无法建会话。点顶栏「设置」填写。
                    </p>
                  </div>
                </section>
              ) : null}
              <StatusPanel sessions={sessions} />
              <ChangesPanel facts={undefined} />
              <CostPanel cost={latest?.cost} />
              <RunsPanel runs={runs} />
            </div>
          )}
        </main>
      </div>

      <div className="statusbar">
        <span>{ready ? "已连接" : "连接中…"}</span>
        {notes.map((n, i) => (
          <span key={i} className="hint">
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}
