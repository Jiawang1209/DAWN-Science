/**
 * 会话侧栏、对话视图、终端 dock（Task 2.11 / 2.12）。
 *
 * **外壳学 Claude app**：左侧栏列项目与会话，主区是对话。
 * **终端是下钻视图，不是主界面**——放在底部 dock，按需开启
 * （Rho 实测把 consoleTerminal 放在 .dock-content 里）。
 *
 * ⚠️ **「Claude app 开启终端的具体交互」未经核实**，此处按「底部 dock、
 * 点标签开启」实现，待作者确认。
 */
import { useEffect, useRef, useState } from "react"
import type { ProjectSummary, SessionSummary } from "../protocol/index.js"

/* ── 侧栏 ─────────────────────────────────────────────────────────── */

export function SessionSidebar({
  projects,
  sessions,
  activeProjectId,
  activeSessionId,
  onPickProject,
  onPickSession,
  onOpenProject,
}: {
  projects: ProjectSummary[]
  sessions: SessionSummary[]
  activeProjectId: string | undefined
  activeSessionId: string | undefined
  onPickProject: (id: string) => void
  onPickSession: (id: string | undefined) => void
  onOpenProject: () => void
}) {
  return (
    <aside className="sidebar">
      <div className="side-head">
        <span>项目</span>
        <button type="button" onClick={onOpenProject}>
          打开文件夹
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="empty">还没有项目——点「打开文件夹」开始</p>
      ) : (
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.projectId}>
              <button
                type="button"
                className={p.projectId === activeProjectId ? "row active" : "row"}
                onClick={() => onPickProject(p.projectId)}
              >
                <span className="name">{p.name}</span>
                <span className="sub">{p.totalRunCount} 次运行</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeProjectId ? (
        <>
          <div className="side-head">
            <span>会话</span>
          </div>
          <ul className="session-list">
            <li>
              <button
                type="button"
                className={activeSessionId === undefined ? "row active" : "row"}
                onClick={() => onPickSession(undefined)}
              >
                项目主页
              </button>
            </li>
            {sessions.map((s) => (
              <li key={s.sessionId}>
                <button
                  type="button"
                  className={s.sessionId === activeSessionId ? "row active" : "row"}
                  onClick={() => onPickSession(s.sessionId)}
                >
                  <span className="name">{s.agentId}</span>
                  <span className={`state ${s.state}`}>{s.state}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  )
}

/* ── 对话视图 ─────────────────────────────────────────────────────── */

export interface Turn {
  id: string
  who: "user" | "agent"
  text: string
}

export function ConversationView({
  session,
  turns,
  onSend,
  disabled,
}: {
  session: SessionSummary
  turns: Turn[]
  onSend: (text: string) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState("")
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 可选调用：jsdom 没有实现 scrollIntoView。滚动失败不该让整个视图崩掉——
    // 它是锦上添花，不是功能本体
    bottom.current?.scrollIntoView?.()
  }, [turns.length])

  return (
    <div className="conversation">
      <header className="conv-head">
        <span className="agent">{session.agentId}</span>
        <span className={`state ${session.state}`}>{session.state}</span>
        <span className="kind">{session.kind === "pty" ? "外部 CLI" : "内置"}</span>
      </header>

      <div className="turns">
        {turns.length === 0 ? (
          <p className="empty">还没有对话</p>
        ) : (
          turns.map((t) => (
            <div key={t.id} className={`turn ${t.who}`}>
              <span className="who">{t.who === "user" ? "你" : session.agentId}</span>
              <pre className="text">{t.text}</pre>
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          const text = draft.trim()
          if (!text) return
          onSend(text)
          setDraft("")
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={disabled ? "会话已结束" : "输入内容，回车发送"}
          disabled={disabled ?? false}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
        />
        <button type="submit" disabled={disabled ?? false}>
          发送
        </button>
      </form>
    </div>
  )
}

/* ── 终端 dock ────────────────────────────────────────────────────── */

/**
 * 终端下钻。**默认收起**——终端在本项目里是下钻视图而非主界面
 * （规格阶段 ① 定位修正框）。
 *
 * ①-B 只渲染原始字节流；xterm.js 的接入留到有真实 PTY 事件流之后。
 */
export function TerminalDock({
  open,
  onToggle,
  output,
  available,
}: {
  open: boolean
  onToggle: () => void
  output: string
  available: boolean
}) {
  return (
    <div className={open ? "dock open" : "dock"}>
      <div className="dock-tabs">
        <button type="button" className="dock-handle" onClick={onToggle} disabled={!available}>
          终端 {open ? "▾" : "▸"}
        </button>
        {!available ? <span className="hint">仅外部 CLI 会话有终端</span> : null}
      </div>
      {open && available ? (
        <div className="dock-content">
          <pre className="term">{output || "（暂无输出）"}</pre>
        </div>
      ) : null}
    </div>
  )
}
