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
import type {
  Cost,
  FileChangeFacts,
  ProjectSummary,
  ProvenanceLink,
  RunSummary,
  SessionSnapshot,
  SessionSummary,
  SessionUpdate,
  TranscriptItem,
} from "../protocol/index.js"
import { ChangesPanel, CostPanel, ProvenanceBadge, RunsPanel, StatusPanel } from "./panels.js"
import {
  ConversationView,
  EmptyConversation,
  SessionSidebar,
  TerminalDock,
} from "./views.js"
import { SettingsPanel, type CredentialState } from "./Settings.js"
import { Button } from "./primitives.js"
import { WorkbenchClientError, createClient, type WorkbenchClient } from "./client.js"

/** `getRun` 的返回：Run 摘要 + 可选的产出事实与成本 */
type RunDetail = RunSummary & { fileChanges?: FileChangeFacts; cost?: Cost }

interface Providers {
  agents: { agentId: string; kind: "native" | "pty" }[]
  providers: { providerId: string; models: string[] }[]
}

type View = "conversation" | "panel" | "settings"

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
  /** 当前会话的 transcript。**按 id 覆盖**，不必自己拼增量 */
  const [items, setItems] = useState<TranscriptItem[]>([])
  /** 终端 scrollback 是否被裁过。**如实标注，但这不是故障**——终端本就有限回滚 */
  const [termTrimmed, setTermTrimmed] = useState(false)
  /** 终端字节片段。首帧是快照里的整段，之后是增量 */
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

  /** 取一次快照并同步 revision。跳号自愈与切会话都走这里 */
  const resync = useCallback(
    (sessionId: string) => {
      client
        .get<SessionSnapshot>("subscribeSession", { sessionId })
        .then((snap) => {
          // 请求飞行期间用户可能又切走了，不认迟到的结果
          if (snap.sessionId !== watching.current) return
          setItems(snap.items)
          setTermChunks(snap.terminal ? [snap.terminal] : [])
          setTermTrimmed(snap.terminalTrimmed)
          client.expectRevision(sessionId, snap.revision)
        })
        .catch(fail)
    },
    [client, fail],
  )

  /**
   * 推送流。**只订阅一次**，进来的更新按当前正在看的会话过滤——
   * 每次切会话都退订重订会在切换的空隙里漏掉更新。
   */
  useEffect(() => {
    if (!ready) return
    return client.subscribeUpdates({
      onUpdate: (u: SessionUpdate) => {
        if (u.sessionId !== watching.current) return
        if (u.type === "item") {
          // 按 id 覆盖：服务端推的是累积后的整条，界面不必拼
          setItems((prev) => {
            const i = prev.findIndex((x) => x.id === u.item.id)
            if (i < 0) return [...prev, u.item]
            const next = [...prev]
            next[i] = u.item
            return next
          })
        }
        if (u.type === "bytes") setTermChunks((c) => [...c, u.data])
        if (u.type === "snapshot") {
          setItems(u.snapshot.items)
          setTermChunks(u.snapshot.terminal ? [u.snapshot.terminal] : [])
          setTermTrimmed(u.snapshot.terminalTrimmed)
        }
        // 会话退出要立刻反映到侧栏与输入框，否则还能继续打字却写不进去
        if (u.type === "state" && u.state === "exited" && projectId) void refreshSessions(projectId)
      },
      /**
       * **跳号不再只是报警，而是重新同步。**
       * 旧设计（seq + 环形缓冲）少的那一段补不回来，只能告诉用户「丢了」。
       */
      onResync: (sessionId) => resync(sessionId),
      onProblem: (m) => setNotes((n) => [...n.slice(-3), m]),
    })
  }, [ready, client, projectId, refreshSessions, resync])

  /** 切会话：退订旧的，订阅新的并取全量快照。**不再无脑清空。** */
  useEffect(() => {
    watching.current = sessionId
    setItems([])
    setTermChunks([])
    setTermTrimmed(false)
    if (!sessionId) return
    resync(sessionId)
    return () => {
      client.forgetRevision(sessionId)
      client.get("unsubscribeSession", { sessionId }).catch(fail)
    }
  }, [client, sessionId, fail, resync])

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
          agents={providers.agents.map((a) => a.agentId)}
          activeProjectId={projectId}
          activeSessionId={sessionId}
          showingPanel={view === "panel"}
          onPickProject={(id) => {
            setProjectId(id)
            setSessionId(undefined)
            setItems([])
            setView("conversation")
          }}
          onPickSession={(id) => {
            setSessionId(id)
            setItems([])
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
                setItems([])
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
