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
import type { View } from "./state/view.js"
import { useStore } from "@nanostores/react"
import type { ProjectSummary, SessionSummary } from "../protocol/index.js"
import type { TranscriptItem } from "../protocol/index.js"
import { TerminalPane } from "./terminal.js"
import { Button, EmptyState, Row } from "./primitives.js"
import { $drafts, clearDraft, setDraft } from "./state/view.js"
import { AgentMarkdown } from "./markdown.js"
import { StickToBottom } from "use-stick-to-bottom"

/**
 * 会话行上的时间。**只到分钟**——秒在这里没有信息量，
 * 而且会让两个相邻会话看起来像在比谁更精确。
 */
function clockOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "时间不明"
  const 今天 = new Date().toDateString() === d.toDateString()
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  // 今天的只给时刻，别的带月日——**「昨天 14:30」和「今天 14:30」不该长得一样**
  return 今天 ? hhmm : `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`
}

/**
 * 侧栏里的一行会话（2026-08-10）。
 *
 * 作者：*「要模仿一下 codex app 或者 claude app，就是可以置顶，
 * 可以挪动对话的顺序，可以重命名，可以删除。」*
 *
 * ## 两个可见性规则，都是踩出来的
 *
 * 1. **当前那一行的动作常驻显示。** 上一版删除键是 `opacity: 0`，
 *    作者的反馈是「会话还是不能删除」——**看不见的能力等于不存在**。
 * 2. **改名就地进行。** `window.prompt` 在 Electron 里直接抛错，
 *    而且本项目已经为它栽过一次（写下规则的人是我，违反它的也是我）。
 */
function SessionRow({
  session,
  active,
  current,
  onPick,
  onDelete,
  onRename,
  onPin,
  onMove,
  drag,
}: {
  session: SessionSummary
  active: boolean
  /** 是不是选中的那一个。**动作按它决定常驻还是悬停** */
  current: boolean
  onPick: () => void
  onDelete?: (() => void) | undefined
  onRename?: ((title: string) => void) | undefined
  onPin?: (() => void) | undefined
  onMove?: ((direction: "up" | "down") => void) | undefined
  /**
   * 拖拽排序的接线。**不给就整行不可拖**——
   * 一个拖得动却什么都不会发生的列表比不能拖更糟。
   */
  drag?:
    | {
        onStart: () => void
        onOver: () => void
        onDrop: () => void
        onEnd: () => void
        /** 拖到这一行上方了。用来画那条落点线 */
        over: boolean
        /** 正在被拖的就是这一行 */
        self: boolean
      }
    | undefined
}) {
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState<string | undefined>(undefined)
  const 名字 = session.title ?? "新会话"

  if (editing !== undefined) {
    const 提交 = () => {
      onRename?.(editing)
      setEditing(undefined)
    }
    return (
      <li className="sess-item editing">
        <input
          className="control sess-rename"
          autoFocus
          value={editing}
          aria-label={`重命名会话：${名字}`}
          onChange={(e) => setEditing(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") 提交()
            // **Esc 是取消，不是提交** —— 改到一半按 Esc 却被存下来最气人
            else if (e.key === "Escape") setEditing(undefined)
          }}
          // 点到别处即提交：与 Finder / Claude 一致
          onBlur={提交}
        />
      </li>
    )
  }

  return (
    <li
      className={[
        "sess-item",
        current ? "current" : "",
        menu ? "menu-open" : "",
        drag?.over ? "drop-target" : "",
        drag?.self ? "dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      draggable={drag !== undefined}
      onDragStart={drag?.onStart}
      onDragEnd={drag?.onEnd}
      onDragOver={
        drag
          ? (e) => {
              // **必须 preventDefault**，否则这一格根本不算合法落点
              e.preventDefault()
              drag.onOver()
            }
          : undefined
      }
      onDrop={
        drag
          ? (e) => {
              e.preventDefault()
              drag.onDrop()
            }
          : undefined
      }
    >
      <Row active={active} onClick={onPick}>
        <span className="sess">
          <span className="name">
            {/* 置顶标记在名字前面：**它是这一行的属性，不是一个动作** */}
            {session.pinned ? (
              <span className="pin-mark" aria-label="已置顶">
                ▲
              </span>
            ) : null}
            {名字}
          </span>
          <span className="sub">
            {session.agentId} · {clockOf(session.createdAt)}
          </span>
        </span>
        <span className={`state ${session.state}`}>{session.state}</span>
      </Row>

      {onDelete || onRename || onPin || onMove ? (
        <div className="row-actions">
          <Button
            variant="ghost"
            size="icon"
            className="row-more"
            aria-label={`会话操作：${名字}`}
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            ⋯
          </Button>
          {menu ? (
            <>
              {/* 点别处关掉。**一层透明背板**，比在 document 上挂监听可控 */}
              <div className="menu-scrim" onClick={() => setMenu(false)} />
              <div className="row-menu" role="menu" aria-label={`会话操作：${名字}`}>
                {onPin ? (
                  <Button variant="ghost" size="inline" role="menuitem" onClick={() => { onPin(); setMenu(false) }}>
                    {session.pinned ? "取消置顶" : "置顶"}
                  </Button>
                ) : null}
                {onRename ? (
                  <Button variant="ghost" size="inline" role="menuitem" onClick={() => { setEditing(session.title ?? ""); setMenu(false) }}>
                    重命名
                  </Button>
                ) : null}
                {onMove ? (
                  <>
                    <Button variant="ghost" size="inline" role="menuitem" onClick={() => { onMove("up"); setMenu(false) }}>
                      上移
                    </Button>
                    <Button variant="ghost" size="inline" role="menuitem" onClick={() => { onMove("down"); setMenu(false) }}>
                      下移
                    </Button>
                  </>
                ) : null}
                {onDelete ? (
                  <Button variant="text" size="inline" role="menuitem" className="menu-danger" onClick={() => { onDelete(); setMenu(false) }}>
                    删除
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/* ── 侧栏 ─────────────────────────────────────────────────────────── */

export function SessionSidebar({
  projects,
  sessions,
  agents,
  activeProjectId,
  activeSessionId,
  view,
  onPickProject,
  onPickSession,
  onOpenProject,
  onNewSession,
  onShowPanel,
  onShowFiles,
  onDeleteSession,
  onRenameSession,
  onPinSession,
  onMoveSession,
  onReorderSessions,
  onOpenSettings,
}: {
  projects: readonly ProjectSummary[]
  sessions: readonly SessionSummary[]
  /** 可选的 agent（来自 providers.yaml）。空数组时新建按钮禁用并说明原因 */
  agents: string[]
  activeProjectId: string | undefined
  activeSessionId: string | undefined
  /**
   * 当前在哪个屏。**一个枚举，不是几个布尔**——
   * 布尔各自为政的话，加第三个屏时总有一处忘了改，
   * 而那一处的症状是「会话行仍然高亮着，人却已经不在会话里了」。
   */
  view: View
  onPickProject: (id: string) => void
  onPickSession: (id: string) => void
  onOpenProject: () => void
  onNewSession: (agentId: string) => void
  onShowPanel: () => void
  onShowFiles: () => void
  /** 删除一个会话。**不给就不显示那个按钮**——不是显示一个点了没反应的 */
  onDeleteSession?: ((session: SessionSummary) => void) | undefined
  onRenameSession?: ((session: SessionSummary, title: string) => void) | undefined
  onPinSession?: ((session: SessionSummary, pinned: boolean) => void) | undefined
  onMoveSession?: ((session: SessionSummary, direction: "up" | "down") => void) | undefined
  /** 拖拽排序。**菜单里的上移／下移仍然留着**——那是键盘可达的那条路 */
  onReorderSessions?: ((orderedIds: string[]) => void) | undefined
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

  /**
   * 拖拽排序的状态住在这里，不在行里——**它是「两行之间的关系」**，
   * 单独一行不知道自己该排到谁前面。
   */
  const [dragging, setDragging] = useState<string | undefined>(undefined)
  const [over, setOver] = useState<string | undefined>(undefined)

  /**
   * 把 `dragging` 挪到 `target` 的位置，算出新的完整顺序。
   *
   * **不许跨越置顶分界**：置顶只是分组，拖过去等于偷偷改了它——
   * 那是「置顶」这个动作的事，不是拖拽的事。跨了就当没拖。
   */
  const drop = (targetId: string) => {
    setOver(undefined)
    const from = sessions.find((x) => x.sessionId === dragging)
    const to = sessions.find((x) => x.sessionId === targetId)
    setDragging(undefined)
    if (!from || !to || from.sessionId === to.sessionId) return
    if (from.pinned !== to.pinned) return

    const ids = sessions.map((x) => x.sessionId)
    const next = ids.filter((id) => id !== from.sessionId)
    next.splice(next.indexOf(to.sessionId), 0, from.sessionId)
    onReorderSessions?.(next)
  }

  return (
    <aside className="sidebar">
      {/**
        * **两个动作同级。**（作者 2026-08-10：*「新建对话和新建项目应该是
        * 同一级别的吧？我觉得应该模仿 Codex 去做。」*）
        *
        * Codex 的侧栏顶部是一个动作区，New Chat 与旁边的动作**是同一种行**
        * （`c-sidebar-row`），不是「一个大按钮 + 一个小图标」。
        * 此前这里正是后者：新建会话是一整个带字的按钮，新建项目是下拉框旁边
        * 一个光秃秃的 `＋`——**同一级别的两件事，长得差了两档**。
        */}
      <div className="side-actions">
        <Row className="side-action" disabled={!active || !fallbackAgent} onClick={() => fallbackAgent && onNewSession(fallbackAgent)}>
          <span className="glyph" aria-hidden="true">＋</span>
          <span className="name">新建会话</span>
        </Row>
        <Row className="side-action" onClick={onOpenProject}>
          <span className="glyph" aria-hidden="true">＋</span>
          <span className="name">新建项目</span>
        </Row>
      </div>

      {/* 项目切换器：它是**上下文**，不是动作——所以放在动作区下面 */}
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
      </div>

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
            <SessionRow
              key={s.sessionId}
              session={s}
              active={s.sessionId === activeSessionId && view === "conversation"}
              current={s.sessionId === activeSessionId}
              onPick={() => onPickSession(s.sessionId)}
              {...(onDeleteSession ? { onDelete: () => onDeleteSession(s) } : {})}
              {...(onRenameSession ? { onRename: (t: string) => onRenameSession(s, t) } : {})}
              {...(onPinSession ? { onPin: () => onPinSession(s, !s.pinned) } : {})}
              {...(onMoveSession ? { onMove: (d: "up" | "down") => onMoveSession(s, d) } : {})}
              {...(onReorderSessions
                ? {
                    drag: {
                      onStart: () => setDragging(s.sessionId),
                      onOver: () => setOver(s.sessionId),
                      onDrop: () => drop(s.sessionId),
                      // **拖到别处松手也要收摊**，否则那条落点线会一直挂着
                      onEnd: () => {
                        setDragging(undefined)
                        setOver(undefined)
                      },
                      over: over === s.sessionId && dragging !== undefined && dragging !== s.sessionId,
                      self: dragging === s.sessionId,
                    },
                  }
                : {})}
            />
          ))
        )}
      </ul>

      {/* 项目面板与文件都降为侧栏底部的入口，不再是首页 */}
      {active ? (
        <>
          {/* **再点一次就回去**：一个亮着的入口点下去毫无反应，人会以为它坏了 */}
          <Row active={view === "panel"} className="panel-entry" onClick={onShowPanel}>
            项目概览
          </Row>
          {/* 文件：**产出栏点文件名是主入口**，这里是「agent 没碰过的东西只能靠翻」那条路 */}
          <Row active={view === "files"} className="panel-entry" onClick={onShowFiles}>
            文件
          </Row>
        </>
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
const KIND_LABEL: Record<"native" | "pty" | "cli" | "kernel", string> = {
  native: "内置",
  cli: "外部 CLI",
  pty: "终端",
  kernel: "内核",
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
  kind?: "native" | "pty" | "cli" | "kernel" | undefined
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

  /**
   * **有清单就画得出来**，不要求知道「当前是哪个」。
   *
   * 2026-08-09 反转：原来是 `models.length === 0 || !current` 才画。
   * 那条件逼着配置去钉一个 `model`，而钉模型会**覆盖用户自己 CLI 的配置**
   * （作者的 claude 默认是 `opus[1m]`、codex 是 `gpt-5.6-sol`，
   * 都被我们传的 `--model` 盖掉了，后者还直接 400）。
   *
   * 当前未知时如实标「CLI 默认」——**那是实情，不是缺陷**，
   * 而且比「选择器整个不出现」诚实得多。
   */
  if (models.length === 0) return null

  return (
    <div className="pill model-pill" ref={box}>
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {current ?? "CLI 默认"}
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
  kernelInstanceId,
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
  /**
   * **当前**内核实例（②-A · K5 · S13）。
   * 与每条输出自带的那个一比，就知道它是不是上一个内核算出来的。
   * **缺省 = 还没有内核，不做陈旧判断**——不猜。
   */
  kernelInstanceId?: string | undefined
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

  /**
   * **「发出去还没回来」那段本来也想给一个记号，去掉了**（2026-08-10）。
   *
   * 它靠「最后一条是自己说的」来判断，而实测里这个条件在回复到达之后
   * 仍然成立过一会儿——症状是**回来了那三个点还在转**。
   * 而「一个永远在转的记号比没有更糟」是本项目自己写下的话。
   *
   * 现在只在**这一段确实还没收尾时**显示（`item.final === false`），
   * 那个条件由 `turn_end` 严格关掉，不会挂住。
   */

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
              <TranscriptRow
                key={item.id}
                item={item}
                agentId={session.agentId}
                currentKernel={kernelInstanceId}
              />
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
        {/**
         * **输入框与它的控件是一个东西，所以它们在同一张卡里。**
         *
         * 上一版是「一个光秃秃的 textarea + 下面散着一排控件」——那是一张表单，
         * 不是一个输入区。规范 §3.5 量到的形态是：一个抬起的面，
         * 22px 圆角，**模型选择器长在它内部**。
         *
         * 聚焦环因此挂在**卡**上（`:focus-within`）而不是 textarea 上：
         * 环画在里面的话，卡的边缘和环会成为两条相距 8px 的线。
         */}
        <div className="composer-box">
          <textarea
            className="control composer-field"
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
function TranscriptRow({
  item,
  agentId,
  currentKernel,
}: {
  item: TranscriptItem
  agentId: string
  currentKernel?: string | undefined
}) {
  if (item.type === "notice") {
    return <p className="caveat">{item.text}</p>
  }
  if (item.type === "tool") {
    return <ToolRow item={item} />
  }
  if (item.type === "subagents") {
    return <SubagentChips item={item} />
  }
  if (item.type === "kernelOutput") {
    return <KernelOutputRow item={item} currentKernel={currentKernel} />
  }
  const mine = item.who === "user"
  return (
    <div className={`turn ${item.who}`}>
      {/**
       * **身份不能只靠底色。**
       *
       * 用户的发言是一颗有底色的气泡、agent 的是通栏正文——这是给眼睛的。
       * 但「谁说的」必须同时留在**文字**里，否则读屏用户拿到的是一串
       * 没有说话人的段落。所以标签一直在，只是用户那一侧视觉上藏起来
       * （`.sr-only`，**不是 `display:none`**——那样读屏也读不到）。
       *
       * 与本项目其他几处同一条：*「符号不够——只靠 ✓/✗ 等于只用颜色表达含义」*。
       */}
      <span className={`who${mine ? " sr-only" : ""}`}>{mine ? "你" : agentId}</span>
      <div className="bubble">
        {/**
         * **只有 agent 的发言走 markdown。**
         *
         * 把用户输入也当 markdown 渲染，等于替他改写他说的话——
         * 他写的 `**这里**` 就是想让人看见那四个星号（多半正是在问它为什么报错）。
         */}
        {mine ? (
          <pre className="text">{item.text}</pre>
        ) : (
          <AgentMarkdown text={item.text} streaming={!item.final} />
        )}
        {/**
         * **还在说的时候给一个会动的记号**（2026-08-10）。
         *
         * 作者：*「回复的时候应该增加一个类似 hermes 的思考的动图。」*
         * 此前这里是一个静止的 `…`——它与「卡住了」长得一模一样，
         * 而这两件事人最想分清。
         */}
        {/**
         * **还在说的时候给一个会动的记号**（2026-08-10）。
         *
         * 作者：*「回复的时候应该增加一个类似 hermes 的思考的动图。」*
         * 此前这里是一个静止的 `…`——它与「卡住了」长得一模一样，
         * 而这两件事人最想分清。
         *
         * 它一度被撤下过：真链路上「回复到了它还在转」。
         * **根因不在这里**——是协议 `usage` 的 `.strict()` 校验抛出，
         * 掐掉了事件流，于是这一段的 `final` 永远关不掉。修掉那个之后它就正常了。
         */}
        {item.final ? null : <Thinking />}
        {/**
         * **这一句花了多少 token。**
         *
         * 作者：*「我们现在每次消耗的 token，其实也应该展示出来。」*
         * 项目概览的成本栏回答「这个项目一共花了多少」，
         * 而人在对话里想知道的是**这一句花了多少**——两个问题。
         *
         * **没有 `usage` 就什么都不显示**：缺席表示「不知道」
         * （自有订阅额度的 agent、或这一段本来就没有新的模型调用），
         * 显示成 0 是把「不知道」说成了「没花」。
         */}
        {item.final && item.usage ? <TurnUsage usage={item.usage} /> : null}
      </div>
    </div>
  )
}

/**
 * 思考中的动记号。**三个点依次起伏**——Hermes 那个的形态，不抄它的实现。
 *
 * 用 CSS 动画而不是逐帧的 gif／svg：一张动图在暗色主题下要么发白边、
 * 要么得再准备一张，而这三个点跟着 `currentColor` 走。
 *
 * **文字也要有**（`.sr-only`）：一个只靠动画表达的状态，读屏用户拿不到。
 */
function Thinking() {
  return (
    <span className="thinking" role="status">
      <span className="sr-only">正在思考</span>
      <span className="dot" aria-hidden="true" />
      <span className="dot" aria-hidden="true" />
      <span className="dot" aria-hidden="true" />
    </span>
  )
}

/** 数字加千位分隔。**不缩写成 1.2k**——token 数是要拿来对账的 */
const 千位 = (n: number) => n.toLocaleString("en-US")

function TurnUsage({
  usage,
}: {
  usage: { input?: number | undefined; output?: number | undefined; cacheRead?: number | undefined }
}) {
  const 段: string[] = []
  if (usage.input !== undefined) 段.push(`输入 ${千位(usage.input)}`)
  if (usage.output !== undefined) 段.push(`输出 ${千位(usage.output)}`)
  // **缓存命中单独说**：它与输入 token 计费不同，混进去会让账对不上
  if (usage.cacheRead !== undefined) 段.push(`缓存 ${千位(usage.cacheRead)}`)
  if (段.length === 0) return null
  return <p className="turn-usage">{段.join(" · ")} token</p>
}

/**
 * 内核的一条输出（②-A · K4 · S11）。
 *
 * **一张图、一段报错、一行 stdout 是三种不同的东西**，所以这里是三个分支，
 * 而不是一段带样式的文本。这正是「结构化 Console 而不是终端模拟器」
 * 在渲染层的样子——Rho 明令禁止后者，理由是
 * **ANSI 字节流里的输出不可查询、不可溯源、不可审计**。
 */
function KernelOutputRow({
  item,
  currentKernel,
}: {
  item: Extract<TranscriptItem, { type: "kernelOutput" }>
  currentKernel?: string | undefined
}) {
  const o = item.output
  /**
   * **陈旧 = 这条输出是上一个内核算出来的**（S13）。
   *
   * 内核重启之后，它描述的状态已经不存在了——而 notebook 最经典的谎言
   * 正是让那样一条结果继续躺在那里，看起来像当前状态。
   *
   * **`currentKernel` 缺省时不做判断**：那意味着还没有内核（会话刚建或已退出），
   * 不是「不陈旧」。拿不到就不说话，不猜。
   */
  const stale = currentKernel !== undefined && item.kernelInstanceId !== currentKernel
  const mark = stale ? (
    <p className="kout-stale">
      {/* 纯文本里不写 markdown 记号——它不会被渲染，只会显示成星号 */}
      ⚠ 这条结果来自上一个内核实例，它描述的状态已经不存在了
    </p>
  ) : null

  if (o.kind === "stream") {
    return (
      <div className={`kout kout-${o.stream}${stale ? " kout-is-stale" : ""}`}>
        {mark}
        <pre className="kout-text">{o.text}</pre>
        {/* **截断要说清省了多少**（规格 7.5），不是「已截断」三个字 */}
        {o.truncated ? (
          <p className="kout-note">
            输出过长，只显示了前 {formatBytes(o.truncated.keptBytes)}（共{" "}
            {formatBytes(o.truncated.originalBytes)}）
          </p>
        ) : null}
      </div>
    )
  }

  if (o.kind === "error") {
    return (
      <div className={`kout kout-error${stale ? " kout-is-stale" : ""}`}>
        {mark}
        <p className="kout-ename">
          {o.ename}
          {o.evalue ? `: ${o.evalue}` : ""}
        </p>
        {/* traceback 原样给出。**ANSI 转义留着**——去掉等于丢信息 */}
        {o.traceback.length > 0 ? <pre className="kout-trace">{o.traceback.join("\n")}</pre> : null}
      </div>
    )
  }

  // result / display：按 mime 画
  return (
    <div className={`kout kout-rich${stale ? " kout-is-stale" : ""}`}>
      {mark}
      {o.tooLarge ? (
        /* **不渲染，但要说清它有多大**——界面卡死比「这张图没显示」难查得多 */
        <p className="kout-note">
          这份 {o.mediaType} 输出有 {formatBytes(o.bytes)}，超过上限没有显示。
        </p>
      ) : (
        <RichOutput mediaType={o.mediaType} data={o.data} />
      )}
      {o.truncated ? (
        <p className="kout-note">
          内容过长，只显示了前 {formatBytes(o.truncated.keptBytes)}（共{" "}
          {formatBytes(o.truncated.originalBytes)}）
        </p>
      ) : null}
      {/* 还有别的形态可选时说一声。**不摆出来人就不知道有** */}
      {o.alsoAvailable.length > 0 ? (
        <p className="kout-note">另有 {o.alsoAvailable.join(" / ")} 形态</p>
      ) : null}
    </div>
  )
}

/**
 * 按 mime 画一份富输出。
 *
 * **认不出的 mime 原样当文本显示，并说清它是什么**——
 * 不猜一个渲染方式，猜错了画出来是乱码。
 */
function RichOutput({ mediaType, data }: { mediaType: string; data: string }) {
  if (mediaType.startsWith("image/")) {
    // Jupyter 给的是 base64。**不写 alt=""**——读屏用户要知道这里有一张图
    return <img className="kout-img" src={`data:${mediaType};base64,${data}`} alt="内核输出的图" />
  }
  if (mediaType === "text/markdown") return <AgentMarkdown text={data} streaming={false} />
  if (mediaType === "text/html") {
    /**
     * **HTML 不注入，按纯文本显示。**
     *
     * `dangerouslySetInnerHTML` 会让内核输出直接进 DOM——而内核跑的是
     * 用户与 agent 的代码，那等于给它一条改写整个界面的通路。
     * 富输出的价值不值这个风险；真要渲染 HTML 得先有沙箱（阶段 ④ 的授权门）。
     */
    return (
      <>
        <p className="kout-note">HTML 输出按纯文本显示（渲染它需要沙箱，见阶段 ④）</p>
        <pre className="kout-text">{data}</pre>
      </>
    )
  }
  return (
    <>
      {mediaType === "text/plain" ? null : <p className="kout-note">{mediaType}</p>}
      <pre className="kout-text">{data}</pre>
    </>
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

/**
 * 开场建议。
 *
 * **每一条都必须是这个工作台真能做的事**——照抄通用聊天应用那种
 * 「写一首诗」「解释量子力学」，第一次点下去就会暴露它不是给那个用的。
 * 这四条对应四种起手：看清现状 → 读数据 → 做分析 → 落成文字。
 */
const OPENERS: readonly { 标题: string; 说明: string; 发出去的话: string }[] = [
  { 标题: "看看这里有什么", 说明: "先摸清工作区", 发出去的话: "看一下当前工作区里有哪些文件和数据，说说它的结构。" },
  { 标题: "读一份数据", 说明: "字段、规模、缺失", 发出去的话: "找到工作区里的数据文件，读进来，告诉我它有多少行、哪些字段、缺失情况如何。" },
  { 标题: "做一次探索性分析", 说明: "分布与异常", 发出去的话: "对工作区里的数据做一次探索性分析：分布、相关性、明显的异常值。" },
  { 标题: "把结果写成说明", 说明: "给人看的那一版", 发出去的话: "把目前得到的结果整理成一段能给别人看的说明，写清楚做了什么、发现了什么。" },
]

/** 还没有任何会话时的主区域。**给出下一步动作，而不是一片空白。** */
export function EmptyConversation({
  agents,
  onStart,
  onOpenSettings,
}: {
  agents: readonly string[]
  /** 第二个参数给了的话，**建会话之后把这句话真的发出去**——见 `App.tsx` 的 `startSession` */
  onStart: (agentId: string, firstMessage?: string) => void
  onOpenSettings: () => void
}) {
  const first = agents[0]
  return (
    <div className="conversation empty-conv">
      {first ? (
        <div className="welcome">
          {/* 标记，不是 logo：一个 56×56 的方块（规范 §3.4 的尺寸），
              用品牌色，**不引入任何图片资源** */}
          <div className="welcome-mark" aria-hidden="true">
            D
          </div>
          <h2 className="welcome-title">开始一段对话</h2>
          <p className="welcome-sub">当前工作区已就绪。挑一个起手，或者直接说你要做什么。</p>

          {/**
           * 建议卡片。**点了要真的发生事情**——建会话，并把这句话发出去。
           * 只把文字填进输入框是做不到的：空态根本没有输入框。
           */}
          <ul className="openers">
            {OPENERS.map((o) => (
              <li key={o.标题}>
                <Button
                  variant="outline"
                  size="card"
                  onClick={() => onStart(first, o.发出去的话)}
                >
                  <span className="opener-title">{o.标题}</span>
                  <span className="opener-sub">{o.说明}</span>
                </Button>
              </li>
            ))}
          </ul>

          {/* **不能只给默认那一个**——否则想用 codex 开第一个会话的人，
              得先开一个 ds-chat 再换，那是为了迁就界面而多走一步 */}
          <div className="empty-actions">
            <Button variant="primary" onClick={() => onStart(first)}>
              ＋ 用 {first} 开始
            </Button>
            {agents.length > 1 ? (
              <AgentPill agents={agents} onPick={onStart} triggerLabel="换一个 agent" />
            ) : null}
          </div>
        </div>
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
