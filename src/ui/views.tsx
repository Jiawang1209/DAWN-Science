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
import { Button, EmptyState, Row } from "./primitives.js"

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
  onOpenSettings,
}: {
  projects: readonly ProjectSummary[]
  sessions: readonly SessionSummary[]
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
  /** 没有可用 agent 时的去处。**说清为什么还不够，要能点到能解决它的地方** */
  onOpenSettings?: (() => void) | undefined
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
        {/* 原生 title= 无样式、约 500ms 系统延迟、与主题不符——用 aria-label */}
        <Button variant="ghost" size="icon" onClick={onOpenProject} aria-label="打开文件夹为新项目">
          ＋
        </Button>
      </div>

      {/* 新建会话是主动作，放显眼位置——Claude app 的「新建对话」 */}
      <Button
        variant="outline"
        className="new-session"
        disabled={!active || agents.length === 0}
        onClick={() => setPicking((v) => !v)}
      >
        ＋ 新建会话
      </Button>
      {/* 此前这里有一句「先打开一个项目文件夹」。**那是一句描述，不是一条出路**——
          而且它已经不成立了：启动时保证至少有一个默认项目（ProjectManager.ensureDefault） */}
      {agents.length === 0 ? (
        <div className="pad">
          <p className="hint">配置里还没有可用的 agent</p>
          {onOpenSettings ? (
            <Button variant="text" size="inline" onClick={onOpenSettings}>
              去设置
            </Button>
          ) : null}
        </div>
      ) : null}

      {picking && active ? (
        <ul className="agent-pick">
          {agents.map((a) => (
            <li key={a}>
              <Row
                onClick={() => {
                  setPicking(false)
                  onNewSession(a)
                }}
              >
                {a}
              </Row>
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
              <Row
                active={s.sessionId === activeSessionId && !showingPanel}
                onClick={() => onPickSession(s.sessionId)}
              >
                <span className="name">{s.agentId}</span>
                <span className={`state ${s.state}`}>{s.state}</span>
              </Row>
            </li>
          ))
        )}
      </ul>

      {/* 项目面板降为侧栏底部的一个入口，不再是首页 */}
      {active ? (
        <Row active={showingPanel} className="panel-entry" onClick={onShowPanel}>
          项目概览
        </Row>
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
  items: readonly TranscriptItem[]
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
          <Button variant="outline" size="sm" className="abort" onClick={onAbort}>
            停止
          </Button>
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
        <Button type="submit" variant="primary" disabled={disabled ?? false}>
          发送
        </Button>
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
    return <ToolRow item={item} />
  }
  return (
    <div className={`turn ${item.who}`}>
      <span className="who">{item.who === "user" ? "你" : agentId}</span>
      <pre className="text">{item.text}</pre>
      {item.final ? null : <span className="hint">…</span>}
    </div>
  )
}

/** 折叠前展示的结果行数。**十几行足够判断发生了什么**，再多就该主动展开 */
const TOOL_RESULT_HEAD_LINES = 12
/** 入参摘要的字符上界 */
const TOOL_INPUT_MAX = 200

/**
 * 状态的**文字**标签。
 *
 * 图形符号（…/✓/✗）留着，但不能只有它——DESIGN.md 的
 * 「no meaning conveyed by color alone」同样适用于「只靠一个符号」。
 * 无障碍树里必须能读到「执行中 / 成功 / 失败」。
 */
const TOOL_STATUS = {
  running: { mark: "…", label: "执行中" },
  ok: { mark: "✓", label: "成功" },
  error: { mark: "✗", label: "失败" },
} as const

/**
 * 一次工具调用的呈现。
 *
 * 三条纪律，都是踩过或读到的：
 *
 * 1. **长结果默认折叠** —— 一次 `bash` 的输出能把整个对话区淹掉。
 * 2. **截断必须出声，且说清省了多少**（规格 7.5）。一个省略号不构成说明——
 *    Rho 的每个预览字段都配一个显式的 `*_truncated` 布尔，而不是让读者
 *    从标点里猜。这里给的是行数。
 * 3. **失败不许静默** —— `status: "error"` 而 `result` 为空时，界面上此前
 *    什么都不显示，等于一次失败被吞掉。宁可说「没有给出原因」，
 *    也不能让它看起来什么都没发生。
 */
function ToolRow({ item }: { item: Extract<TranscriptItem, { type: "tool" }> }) {
  const [expanded, setExpanded] = useState(false)
  const { mark, label } = TOOL_STATUS[item.status]
  const input = summarize(item.input)
  const result = foldResult(item.result, expanded)

  return (
    <div className={`tool ${item.status}`} data-status={item.status}>
      <span className="tool-name">
        {mark} {item.name}
      </span>
      <span className="tool-status">{label}</span>

      {input.text ? <pre className="tool-input">{input.text}</pre> : null}
      {input.truncated ? <span className="hint">入参已截断</span> : null}

      {result ? (
        <>
          <pre className="tool-result">{result.text}</pre>
          {result.hidden > 0 ? (
            <Button
              variant="text"
              size="inline"
              className="tool-expand"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "收起" : `展开全部（还有 ${result.hidden} 行）`}
            </Button>
          ) : null}
        </>
      ) : item.status === "error" ? (
        // 失败且无正文。**这一支是本次修复的重点**：此前它渲染成空白
        <p className="caveat">这次调用失败了，但没有给出原因</p>
      ) : null}
    </div>
  )
}

/** 按行折叠结果，并如实返回**被藏起来多少行** */
function foldResult(
  result: string | undefined,
  expanded: boolean,
): { text: string; hidden: number } | undefined {
  if (result === undefined) return undefined
  const lines = result.split("\n")
  const hidden = Math.max(0, lines.length - TOOL_RESULT_HEAD_LINES)
  if (expanded || hidden === 0) return { text: result, hidden }
  return { text: lines.slice(0, TOOL_RESULT_HEAD_LINES).join("\n"), hidden }
}

/**
 * 工具入参的一行摘要。**不展开整个对象**——那会把对话区淹掉。
 *
 * 返回值带 `truncated`，因为调用方需要**说出来**，而不是靠省略号暗示。
 */
function summarize(input: unknown): { text: string; truncated: boolean } {
  if (input === undefined || input === null) return { text: "", truncated: false }
  if (typeof input === "string") return clip(input)
  const o = input as Record<string, unknown>
  // 常见工具的主参数直接提出来——`bash` 看命令、读写文件看路径、搜索看模式
  const first = o.command ?? o.path ?? o.pattern ?? o.file_path
  if (typeof first === "string") return clip(first)
  return clip(JSON.stringify(input))
}

function clip(s: string): { text: string; truncated: boolean } {
  return s.length > TOOL_INPUT_MAX
    ? { text: `${s.slice(0, TOOL_INPUT_MAX)}…`, truncated: true }
    : { text: s, truncated: false }
}

/** 还没有任何会话时的主区域。**给出下一步动作，而不是一片空白。** */
export function EmptyConversation({
  agents,
  onStart,
  onOpenSettings,
}: {
  agents: readonly string[]
  onStart: (agentId: string) => void
  onOpenSettings: () => void
}) {
  const first = agents[0]
  return (
    <div className="conversation empty-conv">
      {first ? (
        <EmptyState
          title="开始一段对话"
          description={`当前工作区已就绪。用 ${first} 开始，或在左栏挑一个别的 agent。`}
          action={
            <Button variant="primary" onClick={() => onStart(first)}>
              ＋ 用 {first} 开始
            </Button>
          }
        />
      ) : (
        <EmptyState
          title="还没有可用的 agent"
          description="配置文件里没有 agent，或它需要的 API key 还没填。"
          action={
            <Button variant="primary" onClick={onOpenSettings}>
              去设置
            </Button>
          }
        />
      )}
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
  chunks: readonly string[]
  available: boolean
  onInput?: (data: string) => void
}) {
  return (
    <div className={open ? "dock open" : "dock"}>
      <div className="dock-tabs">
        <Button variant="ghost" size="sm" onClick={onToggle} disabled={!available}>
          终端 {open ? "▾" : "▸"}
        </Button>
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
