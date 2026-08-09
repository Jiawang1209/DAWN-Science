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
import { useStore } from "@nanostores/react"
import type { ProjectSummary, SessionSummary } from "../protocol/index.js"
import type { TranscriptItem } from "../protocol/index.js"
import { TerminalPane } from "./terminal.js"
import { Button, EmptyState, Row } from "./primitives.js"
import { $drafts, clearDraft, setDraft } from "./state/view.js"
import { AgentMarkdown } from "./markdown.js"
import { StickToBottom } from "use-stick-to-bottom"

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
  const active = projects.find((p) => p.projectId === activeProjectId)
  /**
   * **选 agent 这件事已经搬到 composer 的 pill 里了**（作者 2026-08-09 的要求，
   * 对标 Hermes 的 model pill）。这里不再多一层选择——按下就用默认 agent 建。
   *
   * Hermes 的说法是「一个动作只有一个家」：同一个动作有两个入口，
   * 迟早会有一个悄悄落后于另一个。
   */
  const fallbackAgent = agents[0]

  return (
    <aside className="sidebar">
      {/* 项目切换器放最上面，一行——它是上下文，不是主角 */}
      <div className="proj-switch">
        <select
          className="control"
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
        disabled={!active || !fallbackAgent}
        onClick={() => fallbackAgent && onNewSession(fallbackAgent)}
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

/* ── agent 选择器 ─────────────────────────────────────────────────── */

/**
 * agent pill。**长在 composer 右下角，不在侧栏。**
 *
 * 学自 Hermes `app/chat/composer/model-pill.tsx`，它自己的注释就是这次搬家的理由：
 * > *"Composer model selector — **the relocated status-bar pill**."*
 * > *"Display follows THIS surface's SessionView — **never the primary-only globals**
 * >  — so side-by-side panes each show their own model."*
 *
 * 后半句是作用域纪律：**显示的是「这个会话」的 agent，不是某个全局的当前值。**
 * 将来做分屏时，两个面各自显示各自的——这一点现在就定下来，比以后改便宜。
 *
 * ## 一处与 Hermes 的硬差别
 *
 * Hermes 的模型能会话中途换。**我们的 `agentId` 在 `createSession` 时就绑死了**，
 * 所以点菜单里的一项只能是「用它**新建**一个会话」。
 *
 * 让人以为是就地切换、实际悄悄开了个新会话，属于静默偏离（规格 7.5）。
 * 所以菜单标题写死「新建会话，用：」——**歧义在文案里消掉，不留给用户猜**。
 */
/**
 * agent 的类别标签。
 *
 * **三种是三件事**（①-C 起）：`native` 是我们进程内跑的 pi；
 * `cli` 是外部 CLI 的对话模式；`pty` 是一个真终端。
 * 此前只有两种，写法是 `kind === "pty" ? "外部 CLI" : "内置"`——
 * 加第三种之后那个三元会把 `cli` 说成「内置」，**而它恰恰是最外部的那个**。
 */
const KIND_LABEL: Record<"native" | "pty" | "cli", string> = {
  native: "内置",
  cli: "外部 CLI",
  pty: "终端",
}

export function AgentPill({
  agents,
  current,
  kind,
  onPick,
  triggerLabel,
}: {
  agents: readonly string[]
  /** 当前会话用的 agent。空态没有会话，因此可缺省 */
  current?: string | undefined
  kind?: "native" | "pty" | "cli" | undefined
  onPick: (agentId: string) => void
  /** 空态用「换一个 agent」，有会话时用 agent 名本身 */
  triggerLabel?: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // 点到别处就收起。**打开了就必须关得掉**——菜单赖着不走比没有菜单更烦
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", away)
    return () => document.removeEventListener("pointerdown", away)
  }, [open])

  if (agents.length === 0) return null

  return (
    <div className="pill agent-pill" ref={box}>
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {triggerLabel ?? current ?? "选择 agent"}
        {kind ? <span className="kind">{KIND_LABEL[kind]}</span> : null}
        <span aria-hidden="true">▾</span>
      </Button>

      {open ? (
        <div
          className="agent-menu"
          role="menu"
          aria-label="新建会话"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false)
          }}
        >
          {/* **这句是整个组件的要害。** agentId 建会话时绑死，换 agent 只能新建 */}
          <p className="agent-menu-head">新建会话，用：</p>
          <ul>
            {agents.map((a) => (
              <li key={a}>
                <Row
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    onPick(a)
                  }}
                >
                  <span className="name">{a}</span>
                  {a === current ? <span className="hint">当前</span> : null}
                </Row>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/**
 * 模型 pill（①-B″ · U2）。**与 agent pill 并排，但语义完全不同。**
 *
 * agent 是建会话时绑死的，换 agent 只能新建；**模型可以真正就地切换**——
 * 这一点由 Spike E 在真链路上验过（`flash → deep`，从假后端记下的请求体证明）。
 * 所以两个菜单的标题必须不一样：一个说「新建会话，用：」，一个说「切换模型」。
 * **同样的形状配不同的语义，是最容易让人按错的一种设计。**
 *
 * 「这一轮还没说完不许换」由运行时把门（它跟踪着 pending；
 * pi 自己的 `isStreaming` 在 prompt 开始前是 false，不可信——同样是 Spike E 查出来的）。
 * 这里把理由**提前显示出来**，而不是等人点了才报错。
 */
export function ModelPill({
  models,
  current,
  busy,
  onPick,
}: {
  /** 该 provider 可选的模型。来自 `getProviders` 已有的 `providers[].models` */
  models: readonly string[]
  current: string | undefined
  /** agent 还在说话。**用我们自己的判定，不问 pi** */
  busy?: boolean | undefined
  onPick: (model: string) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", away)
    return () => document.removeEventListener("pointerdown", away)
  }, [open])

  if (models.length === 0 || !current) return null

  return (
    <div className="pill model-pill" ref={box}>
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {current}
        <span aria-hidden="true">▾</span>
      </Button>

      {open ? (
        <div
          className="agent-menu"
          role="menu"
          aria-label="切换模型"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false)
          }}
        >
          <p className="agent-menu-head">切换模型</p>
          {/* **理由提前说，不等人点了才报错。** 门在运行时，这里只是把它显示出来 */}
          {busy ? <p className="hint pad">这一轮还没说完，先等它结束或中止</p> : null}
          <ul>
            {models.map((m) => (
              <li key={m}>
                <Row
                  role="menuitem"
                  aria-disabled={Boolean(busy)}
                  onClick={() => {
                    if (busy) return
                    setOpen(false)
                    onPick(m)
                  }}
                >
                  <span className="name">{m}</span>
                  {m === current ? <span className="hint">当前</span> : null}
                </Row>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/* ── 对话视图 ─────────────────────────────────────────────────────── */

export function ConversationView({
  session,
  items,
  agents,
  models,
  model,
  onSend,
  onNewSession,
  onPickModel,
  onAbort,
  disabled,
  terminalTrimmed,
}: {
  session: SessionSummary
  /** 可选的 agent 清单，给 composer 右下角那颗 pill 用 */
  agents?: readonly string[] | undefined
  /** 用另一个 agent 新建会话。**不是就地切换**——agentId 建会话时绑死 */
  onNewSession?: ((agentId: string) => void) | undefined
  /** 该会话 provider 下可选的模型 */
  models?: readonly string[] | undefined
  /** 当前模型。与 agent 不同，**它可以就地换** */
  model?: string | undefined
  onPickModel?: ((model: string) => void) | undefined
  /** transcript：对话、工具调用、系统提示。**按顺序渲染，不重排** */
  items: readonly TranscriptItem[]
  onSend: (text: string) => void
  /** 中止当前回合。native 会话才有 */
  onAbort?: (() => void) | undefined
  disabled?: boolean | undefined
  /** 终端 scrollback 被裁过。**如实标注，但不是故障**——终端本就有限回滚 */
  terminalTrimmed?: boolean | undefined
}) {
  /**
   * 草稿按**会话**取，不是按组件。
   *
   * 切会话时这个组件不卸载（位置没变、实例复用），所以本地 `useState`
   * 会把 A 的半句话原样带到 B。作用域必须写在 key 里——见 state/view.ts。
   */
  const drafts = useStore($drafts)
  const draft = drafts[session.sessionId] ?? ""

  /** agent 还在说话（最后一条 turn 未收尾）时才给停止按钮 */
  const busy = items.some((i) => i.type === "turn" && i.who === "agent" && !i.final)

  return (
    <div className="conversation">
      {/* agent 名与 kind 已经搬到 composer 的 pill 里——**一个事实只显示一次**。
          这里留下的是会话生死与中止入口，它们属于顶部 */}
      <header className="conv-head">
        <span className={`state ${session.state}`}>{session.state}</span>
        {busy && onAbort ? (
          <Button variant="outline" size="sm" className="abort" onClick={onAbort}>
            停止
          </Button>
        ) : null}
      </header>

      {/**
       * 贴底滚动交给 `use-stick-to-bottom`。
       *
       * 此前是手写的 `scrollIntoView()`，它有个硬毛病：**只要有新内容就往下拽**——
       * 用户往上翻去看前面说了什么，下一个 token 到达时又被弹回底部。
       * 这个库的行为是：贴在底部时才跟随，**一旦用户主动上滚就撒手**。
       */}
      <StickToBottom className="turns" resize="smooth" initial="smooth">
        <StickToBottom.Content>
          {terminalTrimmed ? <p className="hint">终端只保留最近的输出，更早的已滚出缓冲</p> : null}
          {items.length === 0 ? (
            <p className="empty">还没有对话</p>
          ) : (
            items.map((item) => (
              <TranscriptRow key={item.id} item={item} agentId={session.agentId} />
            ))
          )}
        </StickToBottom.Content>
      </StickToBottom>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          const text = draft.trim()
          if (!text) return
          onSend(text)
          clearDraft(session.sessionId)
        }}
      >
        <textarea
          className="control"
          value={draft}
          onChange={(e) => setDraft(session.sessionId, e.target.value)}
          placeholder={disabled ? "会话已结束" : "输入内容，回车发送"}
          disabled={disabled ?? false}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
        />
        {/**
         * 右对齐的控件行。学自 Hermes composer `controls.tsx` 的
         * `<div className="ml-auto flex …">`——**控件靠右，输入区靠左**。
         *
         * pill **不跟着 `disabled` 走**：会话结束时输入框该禁，
         * 但"用另一个 agent 开一个新的"恰恰是那时最该给的出路。
         */}
        <div className="composer-controls">
          {models && onPickModel ? (
            <ModelPill models={models} current={model} busy={busy} onPick={onPickModel} />
          ) : null}
          {agents && onNewSession ? (
            <AgentPill
              agents={agents}
              current={session.agentId}
              kind={session.kind}
              onPick={onNewSession}
            />
          ) : null}
          <Button type="submit" variant="primary" disabled={disabled ?? false}>
            发送
          </Button>
        </div>
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
  if (item.type === "subagents") {
    return <SubagentChips item={item} />
  }
  return (
    <div className={`turn ${item.who}`}>
      <span className="who">{item.who === "user" ? "你" : agentId}</span>
      {/**
       * **只有 agent 的发言走 markdown。**
       *
       * 把用户输入也当 markdown 渲染，等于替他改写他说的话——
       * 他写的 `**这里**` 就是想让人看见那四个星号（多半正是在问它为什么报错）。
       */}
      {item.who === "user" ? (
        <pre className="text">{item.text}</pre>
      ) : (
        <AgentMarkdown text={item.text} streaming={!item.final} />
      )}
      {item.final ? null : <span className="hint">…</span>}
    </div>
  )
}

/** 字节数的人类可读形式。**不四舍五入到 0**——「0 KB」会让人以为什么都没有 */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} 字节`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
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

      {item.resultTruncated ? (
        <p className="hint tool-spill">
          {/* **这一行是修复的证据。** 修复前 runtime 层砍掉 2000 字符之后的内容且
              不留痕迹，界面却在说「还有 N 行」——那个数是对残缺品数出来的 */}
          输出共 {formatBytes(item.resultBytes ?? 0)}，已截断
          {item.fullOutputPath ? `；完整内容：${item.fullOutputPath}` : "，且未能保存全文"}
        </p>
      ) : null}

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
          description="当前工作区已就绪。"
          action={
            /* 空态没有 composer，pill 就落在主动作旁边。
               **不能只给默认那一个**——否则想用 codex 开第一个会话的人，
               得先开一个 ds-chat 再换，那是为了迁就界面而多走一步 */
            <div className="empty-actions">
              <Button variant="primary" onClick={() => onStart(first)}>
                ＋ 用 {first} 开始
              </Button>
              {agents.length > 1 ? (
                <AgentPill agents={agents} onPick={onStart} triggerLabel="换一个 agent" />
              ) : null}
            </div>
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

/* ── PTY 会话的终端视图 ──────────────────────────────────────────── */

/**
 * 托管 CLI（claude / codex）的会话视图。**终端就是这个会话本身。**
 *
 * ## 这是 2026-08-09 对上一版设计的推翻，作者试用后提的
 *
 * 上一版把终端做成默认折叠的抽屉，主区域给对话视图 + 输入框。
 * 实测结果是 **claude / codex 在 app 里「不好使」**，根因两条叠加：
 *
 *   1. **PTY 的输出根本不进对话记录**——`workbench/events.ts` 的 `output`
 *      分支里，pty 只进 `terminal`。所以主区域永远显示「还没有对话」。
 *   2. 那个输入框把文本原样送进 PTY，**不带 `\r`**。CLI 收到了字符，
 *      却永远等不到提交。
 *
 * 合起来是**一个看起来能用、实际把输入送进黑洞的输入框，
 * 配一个默认折叠的、装着全部真相的终端**。
 * **这比彻底起不来更糟——起不来至少会报错。**
 *
 * 现在按键由 xterm 直接交给 PTY：回车天然就是 `\r`，
 * Ctrl-C、方向键、TUI 的一切也都天然可用。**不再有第二条输入通路，
 * 也就不会再有两条通路语义不一致这种问题。**
 *
 * ## 抽屉整个删掉了
 *
 * 它对 native 会话永远是禁用的（"仅外部 CLI 会话有终端"），
 * 对 pty 会话又不该折叠。**一个只在用不上时才出现的抽屉，删掉是净收益。**
 * 连同命令面板里的「切换终端」一并去掉——那个动作现在没有对象。
 */
export function TerminalView({
  chunks,
  onInput,
}: {
  /** 累积的字节片段，交给 xterm */
  chunks: readonly string[]
  onInput?: (data: string) => void
}) {
  return (
    <div className="term-view">
      <TerminalPane chunks={chunks} {...(onInput ? { onInput } : {})} />
    </div>
  )
}
/* ── 子 agent 的 chip 组（①-B″ · S1）────────────────────────────────── */

const CHIP_STATUS = {
  running: { mark: "⏳", label: "运行中" },
  ok: { mark: "✓", label: "完成" },
  error: { mark: "✗", label: "失败" },
} as const

/**
 * 一次 `subagent` 工具调用里那一组子 agent。
 *
 * ## 形态是抄来的，而且抄的是它的**克制**
 *
 * 计划 §6 记下 Codex 桌面版的组件名叫 `subagent-activity-chip-group`，
 * 并附了一句判断：
 *
 * > **chip 组，不是树、也不是日志。** 一行紧凑的状态芯片，点开才展开细节。
 *
 * 它回答的是「N 个并发子 agent 怎么显示才不淹掉对话」。**默认铺开任务全文
 * 就等于把对话变成日志**——8 个并发时那一屏就没法看了。所以默认只有名字、
 * 状态标记和一句概览，细节点开才有。
 *
 * ## 一处不跟着克制：失败原因
 *
 * 失败的那个**不用点开就看得见原因**。规格 7.5：失败必须出声。
 * 把它折进「点开才有」里，等于让一次失败在界面上和成功长得几乎一样——
 * 而那正是本项目反复栽过的那个坑。
 */
export function SubagentChips({
  item,
}: {
  item: Extract<TranscriptItem, { type: "subagents" }>
}) {
  const [open, setOpen] = useState<number | undefined>(undefined)
  // **空表什么都不画**，不留一个空壳占着位置
  if (item.agents.length === 0) return null

  const done = item.agents.filter((a) => a.status !== "running").length

  return (
    <div className="subagents">
      <span className="subagents-summary">
        子 agent {done}/{item.agents.length}
      </span>
      <div className="chip-group">
        {item.agents.map((a) => {
          const { mark, label } = CHIP_STATUS[a.status]
          const expanded = open === a.index
          return (
            <div key={a.index} className="chip-slot">
              <Button
                variant="text"
                size="inline"
                className={`chip ${a.status}`}
                data-status={a.status}
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? undefined : a.index)}
              >
                {mark} {a.agent}
                <span className="chip-status">{label}</span>
              </Button>
              {/**
               * **失败原因不折叠。** 与上面那句「点开才展开细节」看似矛盾，
               * 但两者管的不是一件事：细节是「它干了什么」，
               * 原因是「它为什么没干成」。后者藏起来就等于没报。
               */}
              {a.status === "error" ? (
                <p className="caveat chip-error">{a.error ?? "失败了，但没有给出原因"}</p>
              ) : null}
              {expanded ? <pre className="chip-task">{a.task}</pre> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
