/**
 * 会话侧栏、对话视图、终端 dock。
 *
 * **信息架构学 Claude app：打开就是对话，侧栏一直在。**
 *
 * 2026-08-08 修正：初版把项目面板做成首页、侧栏默认隐藏，作者反馈
 * 「和 Claude app 完全不一样」。根因是我把「你想知道的四样（状态/产出/成本/历史）」
 * 当成了首页——但那是**偶尔查**的东西，不是**打开时要看**的东西。
 * 打开 app 时要做的事是跟 agent 说话。
 */
import { useEffect, useRef, useState } from "react"
import type { ProjectSummary, SessionSummary } from "../protocol/index.js"
import type { TranscriptItem } from "../protocol/index.js"
import { TerminalPane } from "./terminal.js"

/* ── 侧栏 ─────────────────────────────────────────────────────────── */

export function SessionSidebar({
  projects,
  sessions,
  agents,
  activeProjectId,
  activeSessionId,
  showingPanel,
  onPickProject,
  onPickSession,
  onOpenProject,
  onNewSession,
  onShowPanel,
}: {
  projects: ProjectSummary[]
  sessions: SessionSummary[]
  /** 可选的 agent（来自 providers.yaml）。空数组时新建按钮禁用并说明原因 */
  agents: string[]
  activeProjectId: string | undefined
  activeSessionId: string | undefined
  showingPanel: boolean
  onPickProject: (id: string) => void
  onPickSession: (id: string) => void
  onOpenProject: () => void
  onNewSession: (agentId: string) => void
  onShowPanel: () => void
}) {
  const [picking, setPicking] = useState(false)
  const active = projects.find((p) => p.projectId === activeProjectId)

  return (
    <aside className="sidebar">
      {/* 项目切换器放最上面，一行——它是上下文，不是主角 */}
      <div className="proj-switch">
        <select
          value={activeProjectId ?? ""}
          onChange={(e) => onPickProject(e.target.value)}
          aria-label="当前项目"
        >
          {projects.length === 0 ? <option value="">（还没有项目）</option> : null}
          {projects.map((p) => (
            <option key={p.projectId} value={p.projectId}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={onOpenProject} title="打开文件夹为新项目">
          ＋
        </button>
      </div>

      {/* 新建会话是主动作，放显眼位置——Claude app 的「新建对话」 */}
      <button
        type="button"
        className="new-session"
        disabled={!active || agents.length === 0}
        onClick={() => setPicking((v) => !v)}
      >
        ＋ 新建会话
      </button>
      {!active ? (
        <p className="hint pad">先打开一个项目文件夹</p>
      ) : agents.length === 0 ? (
        <p className="hint pad">providers.yaml 里还没有可用的 agent</p>
      ) : null}

      {picking && active ? (
        <ul className="agent-pick">
          {agents.map((a) => (
            <li key={a}>
              <button
                type="button"
                className="row"
                onClick={() => {
                  setPicking(false)
                  onNewSession(a)
                }}
              >
                {a}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="session-list">
        {sessions.length === 0 ? (
          <li>
            <p className="hint pad">还没有会话</p>
          </li>
        ) : (
          sessions.map((s) => (
            <li key={s.sessionId}>
              <button
                type="button"
                className={s.sessionId === activeSessionId && !showingPanel ? "row active" : "row"}
                onClick={() => onPickSession(s.sessionId)}
              >
                <span className="name">{s.agentId}</span>
                <span className={`state ${s.state}`}>{s.state}</span>
              </button>
            </li>
          ))
        )}
      </ul>

      {/* 项目面板降为侧栏底部的一个入口，不再是首页 */}
      {active ? (
        <button
          type="button"
          className={showingPanel ? "row panel-entry active" : "row panel-entry"}
          onClick={onShowPanel}
        >
          项目概览
        </button>
      ) : null}
    </aside>
  )
}

/* ── 对话视图 ─────────────────────────────────────────────────────── */

export function ConversationView({
  session,
  items,
  onSend,
  onAbort,
  disabled,
  terminalTrimmed,
}: {
  session: SessionSummary
  /** transcript：对话、工具调用、系统提示。**按顺序渲染，不重排** */
  items: TranscriptItem[]
  onSend: (text: string) => void
  /** 中止当前回合。native 会话才有 */
  onAbort?: (() => void) | undefined
  disabled?: boolean | undefined
  /** 终端 scrollback 被裁过。**如实标注，但不是故障**——终端本就有限回滚 */
  terminalTrimmed?: boolean | undefined
}) {
  const [draft, setDraft] = useState("")
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 可选调用：jsdom 没有实现 scrollIntoView。滚动失败不该让整个视图崩掉
    bottom.current?.scrollIntoView?.()
  }, [items.length])

  /** agent 还在说话（最后一条 turn 未收尾）时才给停止按钮 */
  const busy = items.some((i) => i.type === "turn" && i.who === "agent" && !i.final)

  return (
    <div className="conversation">
      <header className="conv-head">
        <span className="agent">{session.agentId}</span>
        <span className={`state ${session.state}`}>{session.state}</span>
        <span className="kind">{session.kind === "pty" ? "外部 CLI" : "内置"}</span>
        {busy && onAbort ? (
          <button type="button" className="abort" onClick={onAbort}>
            停止
          </button>
        ) : null}
      </header>

      <div className="turns">
        {terminalTrimmed ? <p className="hint">终端只保留最近的输出，更早的已滚出缓冲</p> : null}
        {items.length === 0 ? (
          <p className="empty">还没有对话</p>
        ) : (
          items.map((item) => <TranscriptRow key={item.id} item={item} agentId={session.agentId} />)
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

/**
 * 一条 transcript。
 *
 * **工具调用要显示出来**——①-B 的界面「看不见 agent 在干什么」，
 * 根因之一就是工具调用在 runtime 层就被丢掉了，界面连数据都拿不到。
 */
function TranscriptRow({ item, agentId }: { item: TranscriptItem; agentId: string }) {
  if (item.type === "notice") {
    return <p className="caveat">{item.text}</p>
  }
  if (item.type === "tool") {
    const mark = item.status === "running" ? "…" : item.status === "ok" ? "✓" : "✗"
    return (
      <div className={`tool ${item.status}`}>
        <span className="tool-name">
          {mark} {item.name}
        </span>
        <pre className="tool-input">{summarize(item.input)}</pre>
        {item.result ? <pre className="tool-result">{item.result}</pre> : null}
      </div>
    )
  }
  return (
    <div className={`turn ${item.who}`}>
      <span className="who">{item.who === "user" ? "你" : agentId}</span>
      <pre className="text">{item.text}</pre>
      {item.final ? null : <span className="hint">…</span>}
    </div>
  )
}

/** 工具入参的一行摘要。**不展开整个对象**——那会把对话区淹掉 */
function summarize(input: unknown): string {
  if (input === undefined || input === null) return ""
  if (typeof input === "string") return input
  const o = input as Record<string, unknown>
  const first = o.command ?? o.path ?? o.pattern ?? o.file_path
  if (typeof first === "string") return first
  const json = JSON.stringify(input)
  return json.length > 200 ? `${json.slice(0, 200)}…` : json
}

/** 还没有任何会话时的主区域。**给出下一步动作，而不是一片空白。** */
export function EmptyConversation({ canStart }: { canStart: boolean }) {
  return (
    <div className="conversation empty-conv">
      <p className="empty">
        {canStart ? "点左上角「＋ 新建会话」开始" : "先打开一个项目文件夹，再新建会话"}
      </p>
    </div>
  )
}

/* ── 终端 dock ────────────────────────────────────────────────────── */

/**
 * 终端下钻。**默认收起**——终端是下钻视图而非主界面（规格阶段 ① 定位修正框）。
 * ①-B 只渲染原始字节流；xterm.js 的接入留到有真实 PTY 事件流之后。
 */
export function TerminalDock({
  open,
  onToggle,
  chunks,
  available,
  onInput,
}: {
  open: boolean
  onToggle: () => void
  /** 累积的字节片段。展开时交给 xterm */
  chunks: string[]
  available: boolean
  onInput?: (data: string) => void
}) {
  return (
    <div className={open ? "dock open" : "dock"}>
      <div className="dock-tabs">
        <button type="button" className="dock-handle" onClick={onToggle} disabled={!available}>
          终端 {open ? "▾" : "▸"}
        </button>
        {!available ? <span className="hint">仅外部 CLI 会话有终端</span> : null}
        {available && chunks.length === 0 ? <span className="hint">暂无输出</span> : null}
      </div>
      {open && available ? (
        <div className="dock-content">
          <TerminalPane chunks={chunks} {...(onInput ? { onInput } : {})} />
        </div>
      ) : null}
    </div>
  )
}
