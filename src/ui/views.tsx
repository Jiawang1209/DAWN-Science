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
import { useEffect, useMemo, useRef, useState } from "react"
import type { View } from "./state/view.js"
import { useStore } from "@nanostores/react"
import type { ProjectSummary, SessionSummary } from "../protocol/index.js"
import type { TranscriptItem } from "../protocol/index.js"
import { TerminalPane } from "./terminal.js"
import { Button, EmptyState, Row } from "./primitives.js"
import { $drafts, clearDraft, setDraft } from "./state/view.js"
import { AgentMarkdown } from "./markdown.js"
import { formatDuration, formatTokens, 短路径 } from "./format.js"
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
 * 侧栏里那两个图标（2026-08-11）。
 *
 * 作者：*「对话的话，前面有一个交流的图标；项目的话，前面有一个文件夹的图标。
 * 模仿一下 codex 的页面。」*
 *
 * **内联 SVG，不引入任何图片资源**（与欢迎屏那个「D」同一条：规范 §3.4）。
 * `currentColor` 让它跟着行的文字色走——选中、悬停、暗色主题都不用另外配一份。
 * 16×16、`stroke-width: 1.5`：与 12px 的行文字放在一起不抢戏。
 */
function 会话图标() {
  return (
    <svg className="row-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {/* 一个对话气泡：交流 */}
      <path
        d="M13.5 8.2c0 2.5-2.5 4.5-5.5 4.5-.7 0-1.4-.1-2-.3L2.5 13.5l1-2.4C2.6 10.3 2 9.3 2 8.2 2 5.7 4.5 3.7 7.5 3.7s6 2 6 4.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function 项目图标() {
  return (
    <svg className="row-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {/* 一个文件夹 */}
      <path
        d="M2 4.5c0-.6.4-1 1-1h3.2c.3 0 .6.1.8.4l.8 1.1H13c.6 0 1 .4 1 1v5.5c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1v-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
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
export function SessionRow({
  session,
  active,
  current,
  label,
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
  /** agent id → 该怎么称呼（`ds-chat` → `DeepSeek`）。缺省时用 id */
  label?: ((agentId: string) => string) | undefined
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
  /**
   * 菜单开在哪（2026-08-11 改）。
   *
   * ## 它为什么必须脱离那个滚动容器
   *
   * 作者：*「即便是有多少对话，我只要是弹出 `⋯` 的时候，应该在对话的右侧
   * 弹出，而不是在对话的地方弹出来滚动条。」*
   *
   * 会话列表是 `max-height: 45vh; overflow-y: auto`，而菜单原来是
   * `position: absolute` —— **它被这个滚动容器裁掉**，浏览器于是给出一条
   * 滚动条让你去够它。只有一条对话时更难受：列表本身没得滚，
   * 那个菜单就永远只露半截。
   *
   * 改成 `fixed` 并按按钮的位置算：**它不再属于任何一个会滚的盒子**。
   */
  const 按钮 = useRef<HTMLButtonElement>(null)
  const [位置, 设位置] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const 打开菜单 = () => {
    const r = 按钮.current?.getBoundingClientRect()
    if (r) {
      /**
       * **开在行的右侧**（作者的原话）。贴着按钮右边一点，垂直居中对齐它。
       * 下面放不下就往上翻——**宁可翻上去，也不要露半截**。
       */
      const 高 = 200
      const top = Math.min(Math.max(8, r.top - 4), window.innerHeight - 高 - 8)
      设位置({ top, left: r.right + 6 })
    }
    setMenu(true)
  }

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
            {/* 图标在最前面：**一眼分出「这是对话」还是「这是项目」**（仿 Codex） */}
            <会话图标 />
            {/* 置顶标记在名字前面：**它是这一行的属性，不是一个动作** */}
            {session.pinned ? (
              <span className="pin-mark" aria-label="已置顶">
                ▲
              </span>
            ) : null}
            {名字}
          </span>
          <span className="sub">
            {/**
             * **远端会话的副行写「它此刻在哪个目录」**（②-B · R4′）。
             *
             * 那一行本来写的是 agent 与建立时间。对远端会话来说，
             * **在哪个目录比什么时候建的要紧得多**——那是一次
             * 「把这里的文件都删了」会落到哪儿。
             */}
            {session.remote
              ? 短路径(session.remote.cwd)
              : `${label ? label(session.agentId) : session.agentId} · ${clockOf(session.createdAt)}`}
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
            ref={按钮}
            aria-label={`会话操作：${名字}`}
            aria-expanded={menu}
            onClick={() => (menu ? setMenu(false) : 打开菜单())}
          >
            ⋯
          </Button>
          {menu ? (
            <>
              {/* 点别处关掉。**一层透明背板**，比在 document 上挂监听可控 */}
              <div className="menu-scrim" onClick={() => setMenu(false)} />
              <div
                className="row-menu"
                role="menu"
                aria-label={`会话操作：${名字}`}
                style={{ top: 位置.top, left: 位置.left }}
              >
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
  agentLabel,
  projectSessions = [],
  onNewSessionIn,
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
  onDeleteProject,
  settingsActive,
  remote,
}: {
  projects: readonly ProjectSummary[]
  sessions: readonly SessionSummary[]
  /** 可选的 agent（来自 providers.yaml）。空数组时新建按钮禁用并说明原因 */
  agents: string[]
  /**
   * **当前展开那个项目里的会话**（2026-08-11）。
   *
   * 与上面那个 `sessions` 是两拨人：那一拨是**临时会话**
   * （没有指定项目的），这一拨属于某个项目。
   */
  projectSessions?: readonly SessionSummary[] | undefined
  /** 在某个项目里开一段新会话 */
  onNewSessionIn?: ((projectId: string, agentId: string) => void) | undefined
  /** agent id → 该怎么称呼（`ds-chat` → `DeepSeek`）。缺省时用 id */
  agentLabel?: ((agentId: string) => string) | undefined
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
  /** 删掉某个项目。**与项目概览里那个是同一个动作**，不是第二份实现 */
  onDeleteProject?: ((projectId: string) => void) | undefined
  /** 正开着设置屏。左下角那一行据此高亮 */
  settingsActive?: boolean | undefined
  /**
   * **终端不在侧栏**（2026-08-11 挪走）。
   *
   * 作者：*「这个终端的感觉差点意思，应该在对话框的这边，
   * 侧边栏这边不能有终端。」* 侧栏是**导航**——它回答「我在哪、有什么」；
   * 终端是**在这段对话里干活**，所以它的入口跟着对话走
   * （composer 上那颗，以及命令面板）。
   */
  /** 删除一个会话。**不给就不显示那个按钮**——不是显示一个点了没反应的 */
  onDeleteSession?: ((session: SessionSummary) => void) | undefined
  onRenameSession?: ((session: SessionSummary, title: string) => void) | undefined
  onPinSession?: ((session: SessionSummary, pinned: boolean) => void) | undefined
  onMoveSession?: ((session: SessionSummary, direction: "up" | "down") => void) | undefined
  /** 拖拽排序。**菜单里的上移／下移仍然留着**——那是键盘可达的那条路 */
  onReorderSessions?: ((orderedIds: string[]) => void) | undefined
  /** 没有可用 agent 时的去处。**说清为什么还不够，要能点到能解决它的地方** */
  onOpenSettings?: (() => void) | undefined
  /**
   * 「远端连接」那一区（②-B · R3）。**整块由外面传进来**——
   * 侧栏只负责它坐在哪里，不负责它怎么取数。
   *
   * **不给就整区不出现**：一个点了没反应的区比没有更坏。
   */
  remote?: React.ReactNode | undefined
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
        * **两段，各自「一个动作 + 它管的那一列」**（2026-08-11 重排）。
        *
        * 作者：*「新建的项目，就在左侧的新建项目的下面；新建的会话，
        * 就在左侧的新建会话下面。然后新建完的项目，里面可以有多个会话。
        * 这一个完全仿制 claude code app 和 codex app。」*
        *
        * 此前项目是一个**下拉框**——那是「一个值」的形状，
        * 而项目是一列东西，每个里面还装着若干会话。下拉框把这层包含关系压没了：
        * 你看不见有几个项目，更看不见哪个项目里有多少会话。
        *
        * 两个动作仍然**同级**（同一种 `.side-action` 行，2026-08-10 定的），
        * 只是各自领着自己那一列。
        */}
      <div className="side-actions">
        {/**
          * **这一颗开的是临时会话**（2026-08-11）。
          *
          * 作者：*「会话其实更倾向于，没有设置工作路径的、或者没有设置项目的
          * 临时会话。」* 所以它不再依赖「当前有没有项目」——
          * 它自己就会得到一个独立目录。
          * 想在某个项目里开，走那个项目行上的 `＋`。
          */}
        <Row className="side-action" disabled={!fallbackAgent} onClick={() => fallbackAgent && onNewSession(fallbackAgent)}>
          <span className="glyph" aria-hidden="true">＋</span>
          <span className="name">新建会话</span>
        </Row>
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

      {/**
        * **上面这一列是临时会话，而且它空着的时候一行都不占**（2026-08-11）。
        *
        * 作者：*「没有项目没有会话的时候，新建会话和新建项目是连着的。
        * 如果有一个临时的会话，那么新建会话和新建项目中间会有一个临时会话。」*
        *
        * 所以这里**没有空态占位**，列表也**不撑满剩余高度**——
        * 两颗按钮之间的距离就等于中间有几条会话，一条不多。
        */}
      <ul className="session-list">
        {sessions.length === 0 ? null : (
          sessions.map((s) => (
            <SessionRow
              key={s.sessionId}
              session={s}
              active={s.sessionId === activeSessionId && view === "conversation"}
              current={s.sessionId === activeSessionId}
              {...(agentLabel ? { label: agentLabel } : {})}
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

      {/**
        * **项目那一段。** 在会话列表下面——作者要的顺序就是这个：
        * 「新建会话」领着会话，「新建项目」领着项目。
        */}
      <div className="side-actions proj-actions">
        <Row className="side-action" onClick={onOpenProject}>
          <span className="glyph" aria-hidden="true">＋</span>
          <span className="name">新建项目</span>
        </Row>
      </div>

      <ul className="proj-list">
        {projects.length === 0 ? (
          <li>
            <p className="hint pad">还没有项目</p>
          </li>
        ) : (
          projects.map((p) => (
            <ProjectRow
              key={p.projectId}
              project={p}
              current={p.projectId === activeProjectId}
              onPick={() => onPickProject(p.projectId)}
              {...(onDeleteProject ? { onDelete: () => onDeleteProject(p.projectId) } : {})}
              {...(fallbackAgent
                ? { onNewSession: () => onNewSessionIn?.(p.projectId, fallbackAgent) }
                : {})}
            >
              {/**
                * **展开的项目，它的会话就在这里**。
                * 只有当前那个项目的会话在手上（`listSessions` 是按项目问的），
                * 所以嵌套只画展开的那一个——**不假装知道别的项目里有什么**。
                */}
              <ul className="proj-session-list">
                {projectSessions.length === 0 ? (
                  <li>
                    <p className="hint pad">这个项目里还没有会话</p>
                  </li>
                ) : (
                  projectSessions.map((x) => (
                    <SessionRow
                      key={x.sessionId}
                      session={x}
                      active={x.sessionId === activeSessionId && view === "conversation"}
                      current={x.sessionId === activeSessionId}
                      {...(agentLabel ? { label: agentLabel } : {})}
                      onPick={() => onPickSession(x.sessionId)}
                      {...(onDeleteSession ? { onDelete: () => onDeleteSession(x) } : {})}
                      {...(onRenameSession ? { onRename: (t: string) => onRenameSession(x, t) } : {})}
                      {...(onPinSession ? { onPin: () => onPinSession(x, !x.pinned) } : {})}
                    />
                  ))
                )}
              </ul>
            </ProjectRow>
          ))
        )}
      </ul>

      {/**
        * **「远端连接」在项目下面、设置上面**（②-B · R3）。
        *
        * 作者：*「左边搞一个固定的『远端连接』，可以增加分组，
        * 分组里面是 ssh 的服务器。」*
        *
        * 放在这里而不是最上面：它是**另一台机器上的东西**，
        * 而上面两段是「我手头在做什么」。默认收起，
        * 于是没有远端的人一行都不多占。
        */}
      {remote ?? null}

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
          {/**
            * **设置在左下角**（2026-08-11，作者提）。
            * 它与「项目概览 / 文件」是同一类——都是「去另一屏」，所以排在一起。
            */}
          {onOpenSettings ? (
            <Row
              active={settingsActive ?? false}
              className="panel-entry"
              onClick={onOpenSettings}
            >
              设置
            </Row>
          ) : null}
        </>
      ) : null}
    </aside>
  )
}

/**
 * 侧栏里的一行项目（2026-08-11）。
 *
 * **它必须说出「里面有几个会话」**——作者：*「新建完的项目，里面可以有多个会话。」*
 * 一行只有名字的话，「项目装着会话」这层关系在界面上根本不存在，
 * 而那正是这次重排要表达的东西。
 *
 * 删除键的可见性沿用会话行那一套：**当前这一行常驻，其余悬停才出现**。
 * （`opacity: 0` 的删除键已经被作者报过一次「没有这个功能」。）
 */
function ProjectRow({
  project,
  current,
  onPick,
  onDelete,
  onNewSession,
  children,
}: {
  project: ProjectSummary
  /** 是不是**展开的那一个**。展开 = 选中：一个项目被选中就该看见它装着什么 */
  current: boolean
  onPick: () => void
  onDelete?: (() => void) | undefined
  /** 在这个项目里开一段新会话。**入口就在它自己那一行上** */
  onNewSession?: (() => void) | undefined
  /** 展开时嵌在下面的会话列表 */
  children?: React.ReactNode
}) {
  return (
    <li className={`proj-item${current ? " current" : ""}`}>
      <div className="proj-head">
        <Row active={current} onClick={onPick}>
          <span className="sess">
            <span className="name">
              {/* 展开标记：**它同时是「这里面还有东西」的唯一提示** */}
              <span className="twisty" aria-hidden="true">
                {current ? "▾" : "▸"}
              </span>
              <项目图标 />
              {project.name}
            </span>
            {/* **会话数就是那层包含关系**：没有它，项目只是一个名字 */}
            <span className="sub">{project.totalSessionCount} 个会话</span>
          </span>
        </Row>
        <div className="row-actions">
          {onNewSession ? (
            <Button
              variant="ghost"
              size="icon"
              className="row-more"
              /**
               * **措辞刻意避开「新建会话」四个字。**
               *
               * 侧栏顶上那颗按钮就叫「新建会话」，两处同名会让
               * 「按名字找按钮」变成一件靠运气的事——屏幕阅读器与测试都一样。
               * 2026-08-11 第一版没避开，一下子撞红了大半套 e2e。
               */
              aria-label={`在「${project.name}」里开一段新对话`}
              onClick={onNewSession}
            >
              ＋
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="row-more"
              aria-label={`删除项目：${project.name}`}
              onClick={onDelete}
            >
              🗑
            </Button>
          ) : null}
        </div>
      </div>
      {/**
        * **展开的那个项目，会话就嵌在它下面**（2026-08-11）。
        * 作者：*「项目下也需要嵌套会话，因为一个项目下面可能会有多个会话。」*
        */}
      {current ? <div className="proj-sessions">{children}</div> : null}
    </li>
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
/**
 * 这个会话**是怎么接上模型的**（2026-08-11 改口径）。
 *
 * 作者：*「不能在模型厂家的地方写内置，要协商是 cli 还是 API，
 * 这个区分还是很关键的。」*
 *
 * 他是对的。「内置」说的是**我们的实现**（跑在本进程里），
 * 而人要判断的是**钱和上下文走哪条路**：
 *   - `API`：我们拿你的 key 直接调服务商，token 算在你的账上，模型由这里选
 *   - `CLI`：外部命令行自己去调（claude / codex 有自己的订阅与配置），
 *     **模型也由它自己管**——这正是两者最容易搞混、后果又最实的差别
 */
const KIND_LABEL: Record<"native" | "pty" | "cli" | "kernel", string> = {
  native: "API",
  cli: "CLI",
  pty: "终端",
  kernel: "内核",
}

/** 一家能就地换过去的服务 */
export interface ServiceChoice {
  providerId: string
  /** 显示名（pi 给的），如 `DeepSeek` */
  name: string
}

export function AgentPill({
  agents,
  current,
  currentLabel,
  kind,
  label,
  services,
  onSwitchService,
  onPick,
  triggerLabel,
}: {
  agents: readonly string[]
  /** 当前会话用的 agent。空态没有会话，因此可缺省 */
  current?: string | undefined
  /**
   * 触发器上显示的名字。**给了就压过 `current`**——
   * native 会话中途换过服务之后，这颗 pill 要跟着现在真正在答话的那家走
   * （作者：*「我选择 kimi-k3 的时候，后面的模型厂家能否帮我自动设置为 kimi」*）。
   */
  currentLabel?: string | undefined
  kind?: "native" | "pty" | "cli" | "kernel" | undefined
  /** agent id → 该怎么称呼（`ds-chat` → `DeepSeek`）。缺省时用 id */
  label?: ((agentId: string) => string) | undefined
  /**
   * 能**就地换过去**的服务（2026-08-11）。只有 native 会话有——
   * 一个 shell 或 claude 会话没法半路变成 API 会话。
   *
   * **给了才有那一组**；不给时这颗 pill 还是原来那颗「新建会话，用：」。
   */
  services?: readonly ServiceChoice[] | undefined
  /** 就地换到这家。**同一段对话，上下文不变** */
  onSwitchService?: ((providerId: string) => void) | undefined
  onPick: (agentId: string) => void
  /** 空态用「换一个 agent」，会话里用「新会话」——**都是动作，不是身份** */
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
        {/**
          * **显示这家服务的名字，不是配置里那个键**（2026-08-11）。
          * 作者：*「ds-chat 我感觉不如直接叫 DeepSeek。」*
          * `label` 缺省时退回 id——那至少是实话。
          */}
        {triggerLabel ?? currentLabel ?? (current ? (label ? label(current) : current) : "选择 agent")}
        {kind ? <span className="kind">{KIND_LABEL[kind]}</span> : null}
        <span aria-hidden="true">▾</span>
      </Button>

      {open ? (
        <div
          className="agent-menu"
          role="menu"
          aria-label={services && services.length > 0 ? "切换服务或新建会话" : "新建会话"}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false)
          }}
        >
          {/**
            * **两组，各说各的语义**（2026-08-11）。
            *
            * 上一版这颗只有「新建会话，用：」一组，于是「换一家」这件事
            * 在界面上唯一的入口就是它——作者点了，然后对话被开成了新的。
            *
            * 现在换服务在上面一组，就地生效；新建会话在下面一组，照旧。
            * **两组之间必须有一条线和两句不同的话**——
            * 同样的形状配不同的语义，是最容易让人按错的一种设计。
            */}
          {services && services.length > 0 ? (
            <div className="svc-group">
              <p className="agent-menu-head">就地换服务（对话不断）</p>
              <ul>
                {services.map((sv) => (
                  <li key={sv.providerId}>
                    <Row
                      role="menuitem"
                      onClick={() => {
                        setOpen(false)
                        onSwitchService?.(sv.providerId)
                      }}
                    >
                      <span className="name">{sv.name}</span>
                      {sv.name === currentLabel ? <span className="hint">当前</span> : null}
                    </Row>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {/**
            * **这句是整个组件的要害。** 会话一旦建好就绑死了它的 agent，
            * 换只能新建。
            *
            * 措辞 2026-08-11 从「用哪个 agent」改成「用哪个 LLM」：
            * **DAWN 自己才是那个 agent**，人挑的是让哪个模型来跑它。
            */}
          <div className="new-group">
          <p className="agent-menu-head">新建会话，用哪个 LLM：</p>
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
                  <span className="name">{label ? label(a) : a}</span>
                  {a === current ? <span className="hint">当前</span> : null}
                </Row>
              </li>
            ))}
          </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** 模型选择器里的一条。**provider 仍要带着**——换模型的请求按它路由 */
export interface ModelChoice {
  /** native 才有；cli 会话没有 provider 这个概念 */
  provider?: string | undefined
  model: string
}

/**
 * 模型 pill（①-B″ · U2；2026-08-11 扩成跨服务）。
 *
 * ## 它和 agent pill 的区别，就是作者踩的那一脚
 *
 * *「同一个对话，比如 DeepSeek 的对话，我切换到 Kimi 的时候，直接就重新新建对话了。
 * 这不是我所期待的。一个对话之间，可以切换不同的 API。」*
 *
 * 他点的是 **agent pill**——那个菜单的语义确实是「新建会话，用：」。
 * 而**在同一段对话里换一家**这件事，运行时早就支持
 * （`setSessionModel` 收 provider + model，pi 的 `session.setModel()` 换的是
 * 下一轮用谁，上下文原样留在会话里）——**只是选择器没把别家摆出来**：
 * 它只列当前 provider 的模型，于是「换到 Kimi」在这里根本无从点起，
 * 人只能去点旁边那个会新建会话的。
 *
 * 所以现在这个菜单**按服务分组，列出全部配好的家**，点哪个都是就地换。
 * 那句「不会新建对话」也写在菜单里——**能力看不见等于不存在**。
 *
 * 「这一轮还没说完不许换」由运行时把门（它跟踪着 pending；
 * pi 自己的 `isStreaming` 在 prompt 开始前是 false，不可信——Spike E 查出来的）。
 * 这里把理由**提前显示出来**，而不是等人点了才报错。
 */
export function ModelPill({
  choices,
  current,
  busy,
  onPick,
}: {
  /** 能换到哪些。native 会话是「所有配好的服务 × 各自的模型」 */
  choices: readonly ModelChoice[]
  /** 当前这一轮用的是谁。**provider 也要**——两家可以有同名模型 */
  current: { provider?: string | undefined; model: string } | undefined
  /** agent 还在说话。**用我们自己的判定，不问 pi** */
  busy?: boolean | undefined
  onPick: (choice: ModelChoice) => void
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
  if (choices.length === 0) return null

  const 同一条 = (c: ModelChoice) => c.model === current?.model && c.provider === current?.provider

  return (
    <div className="pill model-pill" ref={box}>
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {/**
          * **只写模型名。**
          *
          * 作者：*「我在选择 kimi-k3 这个具体的模型的时候，前面其实不用出现 Kimi，
          * 因为后面就选择了是哪一个模型厂家的了。」*——是哪家由旁边那颗 pill 说，
          * 两处都写一遍只是噪声，而且它们一旦不同步就成了互相打架的两句话。
          */}
        {current?.model ?? "CLI 默认"}
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
          {/**
            * **这句话是这次改动的一半。**
            * 作者原本以为换一家就得新建对话——因为唯一摆在眼前的入口
            * （agent pill）确实是那个意思。
            */}
          {/* **JSX 纯文本不渲染 markdown**：强调一律走 CSS，写 `**` 只会显示成星号 */}
          <p className="hint pad">
            就地换，<em className="set-emph">不会新建对话</em>。
            换到别家去旁边那颗
          </p>
          {/* **理由提前说，不等人点了才报错。** 门在运行时，这里只是把它显示出来 */}
          {busy ? <p className="hint pad">这一轮还没说完，先等它结束或中止</p> : null}
          <ul>
            {choices.map((c) => (
              <li key={`${c.provider ?? ""}/${c.model}`}>
                <Row
                  role="menuitem"
                  aria-disabled={Boolean(busy)}
                  onClick={() => {
                    if (busy) return
                    setOpen(false)
                    onPick(c)
                  }}
                >
                  <span className="name">{c.model}</span>
                  {同一条(c) ? <span className="hint">当前</span> : null}
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
 * 复制一段文本，**并且让人看见它复制成功了**（2026-08-11）。
 *
 * 作者：*「我的对话能否在对话里面一键复制？类似于 codex。」*
 *
 * 两条讲究：
 *   1. **要有反馈。** 点了之后什么都不变，人会怀疑自己没点上、然后再点几次。
 *      两秒的「已复制」是最小的那份诚实。
 *   2. **失败要出声。** 剪贴板可能被拒（没有焦点、被策略挡下）。
 *      那时说「复制不了」，而不是留一个假的「已复制」——
 *      后者会让人以为东西在手上，粘出来才发现是上一次的内容。
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [态, 设态] = useState<"闲" | "好了" | "不行">("闲")
  useEffect(() => {
    if (态 === "闲") return
    const t = setTimeout(() => 设态("闲"), 2000)
    return () => clearTimeout(t)
  }, [态])
  return (
    <Button
      variant="ghost"
      size="icon"
      className="copy-btn"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => 设态("好了"))
          .catch(() => 设态("不行"))
      }}
    >
      <span aria-hidden="true">{态 === "好了" ? "✓" : 态 === "不行" ? "✗" : "⧉"}</span>
      {/* 读屏要听得到结果，不能只有一个变了的图形 */}
      <span className="sr-only">{态 === "好了" ? "已复制" : 态 === "不行" ? "复制不了" : label}</span>
    </Button>
  )
}

/**
 * 「它在想什么」那一块（2026-08-12，形态学自 Hermes）。
 *
 * **秒数只在还在想的时候自己走**：想完了就定住——
 * 一个停不下来的计时器会让人以为它还没结束。
 */
function ThinkingBlock({ text, ms }: { text: string; ms?: number | undefined }) {
  const [open, setOpen] = useState(false)
  /**
   * **还在想的时候才装定时器**（与工具那个秒表同一条纪律）：
   * 想完之后每秒重渲染一次，而屏幕上没有任何东西在变。
   */
  const 在想 = ms === undefined
  const [起点] = useState(() => Date.now())
  const now = useTick(在想)
  const 秒 = Math.max(0, Math.round((在想 ? now - 起点 : ms) / 1000))

  return (
    <div className={`thought ${open ? "open" : ""}`}>
      <Button
        variant="ghost"
        size="inline"
        className="thought-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        {/* **秒数放在方块里**：它是这一行里唯一会动的东西，要好认 */}
        <span className="thought-secs">{秒}s</span>
        {/**
         * **「正在思考」只说一遍**（2026-08-12 修）。
         *
         * 上一版这里写了「正在思考」，而下面那个动画自带一句给读屏的
         * 「正在思考」——作者截图里因此出现了两行一模一样的字。
         * 动画那句留着（读屏要听得到状态），文字这句换个说法。
         */}
        <span className="thought-label">{在想 ? "思考中" : "想了一下"}</span>
        {在想 ? <Thinking /> : null}
      </Button>
      {open ? <div className="thought-body">{text}</div> : null}
    </div>
  )
}

/* ── 对话视图 ─────────────────────────────────────────────────────── */

export function ConversationView({
  session,
  items,
  agents,
  agentLabel,
  services,
  currentServiceLabel,
  onSwitchService,
  switchProblem,
  onToggleDock,
  dockOpen,
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
  /**
   * 能换到哪些模型。**2026-08-11 起跨服务**：native 会话拿到的是
   * 「所有配好的服务 × 各自的模型」，按服务分组。
   */
  models?: readonly ModelChoice[] | undefined
  /** 当前用的是谁。与 agent 不同，**它可以就地换**，而且可以换到另一家 */
  model?: { provider?: string | undefined; model: string } | undefined
  onPickModel?: ((choice: ModelChoice) => void) | undefined
  /**
   * 能就地换过去的服务，以及当前是哪家（2026-08-11）。
   * **只有 native 会话有**——shell 或 claude 会话没法半路变成 API 会话。
   */
  services?: readonly ServiceChoice[] | undefined
  currentServiceLabel?: string | undefined
  onSwitchService?: ((providerId: string) => void) | undefined
  /**
   * 上一次换模型／换服务**为什么没成**（2026-08-11）。
   *
   * 此前这类失败只进状态栏那一行 `hint`——人在 composer 上点了一下，
   * 屏幕最下面多了一行小字，**看上去就是「点了没反应」**。
   * 而作者报的正是这句话。失败要出现在**动作发生的地方**（规格 7.5）。
   */
  switchProblem?: string | undefined
  /** 掀开／收起底部终端。**与命令面板里那条是同一个动作** */
  onToggleDock?: (() => void) | undefined
  dockOpen?: boolean | undefined
  /**
   * 这个会话的 agent 该怎么称呼（`ds-chat` → `DeepSeek`）。
   *
   * 作者：*「ds-chat 我感觉不如直接叫 DeepSeek。」*
   * **agent id 是配置里的键**，是我们的内部标识；名字该由服务自己给。
   * 缺省时退回 id——那至少是实话。
   */
  agentLabel?: ((agentId: string) => string) | undefined
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

  /**
   * **自己说过的话**，给 ↑ / ↓ 翻（2026-08-11，作者提）。
   *
   * 直接从对话里数出来，**不另存一份**：另存的那份迟早会与对话对不上
   * （删了一条、换了会话、重启之后恢复出来的历史）。
   * 恢复出来的历史因此天然也能翻——它们本来就在这份 `items` 里。
   */
  const history = useMemo(
    () =>
      items
        .filter((x): x is Extract<TranscriptItem, { type: "turn" }> => x.type === "turn" && x.who === "user")
        .map((x) => x.text)
        .filter((t) => t.trim()),
    [items],
  )
  /** 翻到第几条。**-1 = 没在翻**（手上是自己写的那半句） */
  const [位置, 设位置] = useState(-1)
  const 存草稿 = useRef("")
  // 换会话就归位——**在别人的历史里翻到一半，那个位置没有意义**
  useEffect(() => 设位置(-1), [session.sessionId])

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
        {/**
         * **这段对话的手在哪台机器的哪个目录**（②-B · R4′）。
         *
         * 它不是装饰，是这条线上唯一的防线：
         * *你以为在 A 目录、实际在 B 目录，然后说一句「把这里的文件都删了」。*
         * 所以它常驻在头上，而不是藏在某个面板里。
         */}
        {session.remote ? (
          <span className="conv-remote" title={`${session.remote.label}:${session.remote.cwd}`}>
            <span className="conv-remote-host">{session.remote.label}</span>
            <span className="conv-remote-cwd">{短路径(session.remote.cwd)}</span>
          </span>
        ) : null}
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
                agentId={agentLabel ? agentLabel(session.agentId) : session.agentId}
                currentKernel={kernelInstanceId}
                nameOf={(id) => services?.find((sv) => sv.providerId === id)?.name}
                {...(disabled
                  ? {}
                  : {
                      /**
                       * 「修改 → 发送」走的是**与手打完全同一条路**（2026-08-11）。
                       *
                       * 不另开一条：两条路各写一半，迟早有一条忘了清草稿、
                       * 忘了取写权、或者忘了把话回灌进事件流。
                       */
                      onResend: (text: string) => {
                        onSend(text)
                        设位置(-1)
                      },
                    })}
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
          // 发完就不算在翻历史了——下一次 ↑ 从最新那条开始
          设位置(-1)
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
                return
              }
              /**
               * **↑ / ↓ 翻自己说过的话**（2026-08-11，作者提）。
               *
               * 与 shell 同一套手感，但有一条**不能照抄**：shell 的输入是一行，
               * 我们这里是多行。所以只在**光标在最前 / 最后**时才翻——
               * 否则在一段三行的草稿里按 ↑ 想上移一行，会把整段换掉。
               *
               * 翻之前先把**没发出去的那半句存着**（`草稿位` 为 -1 时），
               * 翻到底再按 ↓ 就回到它。不存的话，翻一下历史就把手上写的弄丢了。
               */
              const el = e.currentTarget
              /**
               * **判据是「光标在第一行 / 最后一行」，不是「在最前 / 最后」。**
               *
               * 第一版写的是后者，于是**一句话的草稿永远翻不了历史**——
               * 人打完字光标就在末尾，`fill` 之后也一样。
               * 而多行草稿里的上下移动仍然要留给光标：
               * 在三行里按 ↑ 想上移一行，不该把整段换掉。
               */
              const 前面 = el.value.slice(0, el.selectionStart)
              const 后面 = el.value.slice(el.selectionEnd)
              const 在最前 = !前面.includes("\n")
              const 在最后 = !后面.includes("\n")
              if (e.key === "ArrowUp" && 在最前 && history.length > 0) {
                e.preventDefault()
                if (位置 < 0) 存草稿.current = el.value
                const 新位 = 位置 < 0 ? history.length - 1 : Math.max(0, 位置 - 1)
                设位置(新位)
                setDraft(session.sessionId, history[新位] ?? "")
                return
              }
              if (e.key === "ArrowDown" && 在最后 && 位置 >= 0) {
                e.preventDefault()
                const 新位 = 位置 + 1
                if (新位 >= history.length) {
                  设位置(-1)
                  // 回到刚才没发出去的那半句
                  setDraft(session.sessionId, 存草稿.current)
                  return
                }
                设位置(新位)
                setDraft(session.sessionId, history[新位] ?? "")
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
          {/* 换模型／换服务没成的原因，就摆在按下去的那个地方 */}
          {switchProblem ? <p className="caveat composer-problem">⚠ {switchProblem}</p> : null}
          <div className="composer-controls">
            {/**
              * **先厂家，后模型**（2026-08-11，作者：*「可以先放模型厂家，
              * 后选择模型是什么」*）。读的顺序就是选的顺序。
              */}
            {agents && onNewSession ? (
              <AgentPill
                agents={agents}
                current={session.agentId}
                {...(currentServiceLabel ? { currentLabel: currentServiceLabel } : {})}
                kind={session.kind}
                label={agentLabel}
                {...(services ? { services } : {})}
                {...(onSwitchService ? { onSwitchService } : {})}
                onPick={onNewSession}
              />
            ) : null}
            {models && onPickModel ? (
              <ModelPill choices={models} current={model} busy={busy} onPick={onPickModel} />
            ) : null}
            {/**
              * **终端的入口在对话这一侧**（2026-08-11）。
              *
               * 作者：*「应该在对话框的这边，侧边栏这边不能有终端。」*
              * 侧栏是导航（我在哪、有什么），而开一个终端是**在这段对话里干活**。
              *
              * pill **不跟着 `disabled` 走**：会话结束了照样可能想敲两条命令。
              */}
            {onToggleDock ? (
              <Button
                variant="ghost"
                size="sm"
                className="dock-toggle"
                aria-pressed={dockOpen ?? false}
                onClick={onToggleDock}
              >
                终端
              </Button>
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
export function TranscriptRow({
  item,
  agentId,
  nameOf,
  currentKernel,
  onResend,
}: {
  item: TranscriptItem
  agentId: string
  /**
   * provider id → 该怎么称呼（`deepseek` → `DeepSeek`）。
   * **缺省时用 id**——那不好看，但**是实话**。
   */
  nameOf?: ((providerId: string) => string | undefined) | undefined
  currentKernel?: string | undefined
  /**
   * 改一句自己说过的话，再发出去（2026-08-11，作者提，仿 Codex）。
   *
   * **不给就没有「修改」这颗**——一个点了没反应的按钮比没有更坏。
   */
  onResend?: ((text: string) => void) | undefined
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

  /**
   * **一个字都没说的发言，不画**（2026-08-12，作者截图标红的那一块）。
   *
   * 模型「想了想就去调工具」会留下一条空发言：说话人名、一个 0s 的思考、
   * 一行用量、一颗复制键——**正文一个字都没有**。它在屏幕上占四行，
   * 却什么都没告诉人。
   *
   * 那一段思考已经并进了后面那条（见 `events.ts` 的 `吸收只想没说的`）；
   * 这里是**兜底**——万一没并上，宁可少显示一个 0s 的思考，
   * 也不要在答案前面杵一个空壳。
   *
   * **代价说清楚**：这条发言的 token 用量因此不在对话里显示了。
   * 它没有丢——账本（项目概览）记着，而那本来就是查用量的地方。
   */
  if (!mine && !item.text.trim()) return null

  /** 正在改的那份文字。**undefined = 没在改** */
  const [编辑, 设编辑] = useState<string | undefined>(undefined)

  /**
   * **改一句自己说过的话，再发出去**（2026-08-11，作者提，仿 Codex）。
   *
   * 语义要说准：**它是「照这个再说一遍」，不是「把历史改掉」**。
   * 历史是事实层的一部分（不变式 5）——你上一次确实那么说了，
   * 模型也确实照那句答了。把它就地改掉，等于让记录说一件没发生的事。
   *
   * 所以「发送」= 在对话末尾发一句新的；原来那句留在原处。
   */
  if (编辑 !== undefined) {
    return (
      <div className={`turn ${item.who} editing`}>
        <span className="sr-only">正在修改你说过的一段话</span>
        <div className="bubble">
          <textarea
            className="control turn-edit"
            autoFocus
            value={编辑}
            aria-label="修改这段话"
            onChange={(e) => 设编辑(e.target.value)}
            onKeyDown={(e) => {
              // Esc 是取消——**改到一半按 Esc 却被发出去**是最气人的那种
              if (e.key === "Escape") 设编辑(undefined)
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (编辑.trim()) onResend?.(编辑)
                设编辑(undefined)
              }
            }}
          />
          <div className="turn-actions">
            <Button variant="secondary" size="inline" onClick={() => 设编辑(undefined)}>
              取消
            </Button>
            <Button
              variant="primary"
              size="inline"
              disabled={!编辑.trim()}
              onClick={() => {
                onResend?.(编辑)
                设编辑(undefined)
              }}
            >
              发送
            </Button>
          </div>
          {/* **说清楚它会做什么**：不是改掉上面那句，是照这个再说一遍 */}
          <p className="hint">发送会在对话末尾新说一句，上面那句留在原处</p>
        </div>
      </div>
    )
  }

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
      {/**
       * **谁答的这一轮，按这一轮记下的来**（2026-08-12）。
       *
       * 作者截图里 kimi 答的话被标成了「DeepSeek」——那是
       * `session.agentId`（建会话时绑死的），换服务之后不跟着变。
       * **界面在说谎，而作者正是拿它当「没换过去」的证据。**
       *
       * `item.by` 缺省时退回 agent 名：那表示还没换过，那时它本来就是对的。
       * **不拿「当前那家」去盖所有历史**——前面那些确实是 DeepSeek 答的。
       */}
      <span className={`who${mine ? " sr-only" : ""}`}>{mine ? "你" : item.by ? (nameOf?.(item.by) ?? item.by) : agentId}</span>
      <div className="turn-body">
      {/**
        * **思考**（2026-08-12，作者要的形态学自 Hermes）。
        *
        * 作者：*「回复的时候还会有思考，还会有一个方块写 0 1 2 3 s……
        * 然后是 Thought briefly，可以点击展开。」*
        *
        * 两个状态，各说各的事：
        *   - **还在想**：秒数在走。它回答的是「它没死，只是在想」——
        *     而那正是作者说的「否则我以为会话可能死掉了」。
        *   - **想完了**：收成一行「想了 N 秒」，点开才是内容。
        *     **默认收起**：思考往往比答案长得多，摊开会把答案挤到屏幕外。
        *
        * **它不是回答**，所以不进气泡、字号更小、颜色更淡——
        * 一眼要能分出「这是它对自己说的」和「这是它对我说的」。
        */}
      {!mine && item.thinking ? <ThinkingBlock text={item.thinking} ms={item.thinkingMs} /> : null}
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

      {/**
       * **操作在这一段的下面**（2026-08-11 挪下来，作者提，仿 Codex）。
       *
       * 上一版浮在右上角——那是「这一段的装饰」的位置。
       * 放在下面读起来才是「对这一段能做什么」：先读完，再决定。
       *
       * **常驻，不做悬停才出现**：本项目已经因为这个被报过两次
       * 「没有这个功能」，而两次代码都是好的。
       */}
      {/**
       * **气泡与它的操作在同一个盒子里**（2026-08-12）。
       *
       * 作者要「图标和对话的左边对齐」，选的是**跟着自己那颗气泡的左缘**。
       * 而自己说的话是靠右的：不套这一层，操作行会各自缩到内容宽度、
       * 贴在右端——图标就落在气泡的右半边，对不上任何一条边。
       * 套上之后，这个盒子的宽度等于气泡，图标从它的左缘排起。
       */}
      {item.final ? (
        <div className="turn-actions">
          <CopyButton text={item.text} label={mine ? "复制我说的这段" : "复制这段回答"} />
          {/**
           * **只有自己说的话能改。**
           *
           * 改 agent 的回答再「发送」在语义上说不通——那不是你说的话。
           * 想让它换个说法，是再说一句，不是替它改口。
           */}
          {mine && onResend ? (
            <Button
              variant="ghost"
              size="icon"
              className="edit-btn"
              aria-label="修改"
              title="修改"
              onClick={() => 设编辑(item.text)}
            >
              <span aria-hidden="true">✎</span>
            </Button>
          ) : null}
        </div>
      ) : null}
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

function TurnUsage({
  usage,
}: {
  usage: { input?: number | undefined; output?: number | undefined; cacheRead?: number | undefined }
}) {
  const 段: string[] = []
  // **k tokens**（作者 2026-08-11）：一屏里挤着三个宽度不一的数最难扫。
  // 规则见 `formatTokens`——1000 以下仍然原样，不把已知的精度扔掉
  if (usage.input !== undefined) 段.push(`输入 ${formatTokens(usage.input)}`)
  if (usage.output !== undefined) 段.push(`输出 ${formatTokens(usage.output)}`)
  // **缓存命中单独说**：它与输入 token 计费不同，混进去会让账对不上
  if (usage.cacheRead !== undefined) 段.push(`缓存 ${formatTokens(usage.cacheRead)}`)
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
 * 这一条跑了多久。**没有开始时刻就什么都不说**——
 * 拿「现在」当开始时刻会让一条跑了二十分钟的命令显示成「0 秒」，
 * 而看起来很确定的错比明说不知道坏得多。
 *
 * 一秒以内不显示：那个数每次都不一样，除了闪之外不提供任何判断依据。
 */
function useElapsed(item: Extract<TranscriptItem, { type: "tool" }>): string | undefined {
  const 在跑 = item.status === "running" && item.startedAt !== undefined
  const now = useTick(在跑)
  if (item.startedAt === undefined) return undefined
  const 止 = item.status === "running" ? now : (item.endedAt ?? now)
  const ms = 止 - item.startedAt
  if (ms < 1000) return undefined
  return formatDuration(ms)
}

/**
 * **每秒一跳的当前时刻**——只在有东西真的在跑时才跳。
 *
 * 没有运行中的工具时**不装定时器**：一个永远在跳的 setInterval 会让
 * 整个对话区每秒重渲染一次，而屏幕上没有任何东西在变。
 */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

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
/**
 * 一次工具调用。**整块可折叠**（2026-08-10）。
 *
 * 作者：*「dawn-science 回复的时候我会看到很多 Linux 的命令，
 * 这个在 codex 和 claude 里面，都是可以折叠的。」*
 *
 * ## 默认折叠，**但报错的默认展开**
 *
 * 折叠是为了让对话读得下去——一次分析可能有几十次工具调用，全摊开就没法看了。
 * 但**失败必须出声**（规格 7.5）：一个折叠起来的错误等于没报错，
 * 人要一条条点开才知道哪里出了问题，那正是把「出声」变成「藏着」。
 *
 * 所以判据不是「好不好看」，是**这一条要不要被看见**：
 *   - `error` → 默认展开
 *   - 其余（running / ok）→ 默认折叠，收成一行摘要
 *
 * 折叠状态是**每一条自己的**，不做全局「全部展开」——那会让人一按之后
 * 对话瞬间变成几千行，而他想看的只是其中一条。
 */
function ToolRow({ item }: { item: Extract<TranscriptItem, { type: "tool" }> }) {
  const { mark, label } = TOOL_STATUS[item.status]
  const 用时 = useElapsed(item)
  const input = summarize(item.input)
  /**
   * **报错的默认展开。** 用 `item.status` 做初值而不是在 effect 里改——
   * 后者会让错误先折叠一帧再弹开，那一帧的闪动比不折叠更难受。
   */
  const [open, setOpen] = useState(item.status === "error")
  const [expanded, setExpanded] = useState(false)
  const result = foldResult(item.result, expanded)

  return (
    <div className={`tool ${item.status}${open ? " open" : ""}`} data-status={item.status}>
      {/**
       * 折叠开关就是这一行本身。**整行可点**——只让那个小三角可点，
       * 等于给了一个 8×8 的靶子。
       */}
      <Button
        variant="ghost"
        size="inline"
        className="tool-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="tool-name">
          {mark} {item.name}
        </span>
        {/* **折叠时也要看得见做了什么**：命令本身就是最有信息量的那一行。
            展开之后它在下面完整出现，这里就不重复了 */}
        {!open && input.text ? <span className="tool-peek">{input.text}</span> : null}
        {用时 ? (
          /**
           * **「已经跑了多久」**（②-B · R2）。
           *
           * 作者：*「可以，不设默认超时，但把『已经跑了多久』显示出来，
           * 中止交给你按。」* 这一句是**成对的**——没有这个数，
           * 「还在跑」与「卡死了」在界面上长得一模一样，
           * 而人要按的那个「停止」就成了一次没有依据的赌。
           */
          <span className="tool-elapsed" title={item.status === "running" ? "已经跑了" : "耗时"}>
            {item.status === "running" ? `已跑 ${用时}` : 用时}
          </span>
        ) : null}
        <span className="tool-status">{label}</span>
        {/**
         * **还在跑的时候要有东西在动**（2026-08-12，作者提）。
         *
         * 作者：*「有些会话会思考以及执行很多时间……否则我以为会话可能死掉了。」*
         *
         * 旁边那个秒表已经在走，但**数字变化太安静**——人扫一眼看不出它在动。
         * 一个会动的记号才是「它还活着」这句话的形状。
         * 复用发言那三个点：同一件事在界面上只有一种长相。
         */}
        {item.status === "running" ? <Thinking /> : null}
      </Button>

      {open ? (
        <div className="tool-body">
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
              {/* 命令输出与报错是最常被复制走的东西——贴进搜索框或另一段对话 */}
              <CopyButton text={item.result ?? result.text} label="复制这段输出" />
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
  agentLabel,
  onStart,
  onToggleDock,
  onOpenSettings,
}: {
  agents: readonly string[]
  /** agent id → 该怎么称呼（`ds-chat` → `DeepSeek`）。缺省时用 id */
  agentLabel?: ((agentId: string) => string) | undefined
  /** 掀开／收起底部终端。**与 composer 上那颗、命令面板那条是同一个动作** */
  onToggleDock?: (() => void) | undefined
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
              ＋ 用 {agentLabel ? agentLabel(first) : first} 开始
            </Button>
            {/**
              * **不叫「agent」，叫「LLM」**（2026-08-11）。
              *
              * 作者：*「我做的这个就属于是一个 agent，因此首页不应该是
              * 更换一个 agent，而应该是更换一个 LLM。」*
              *
              * 他是对的：**DAWN 自己就是那个 agent**——它有工具、有账本、
              * 有授权门。人在这一屏挑的是**让哪个模型来跑它**。
              * 「换一个 agent」把我们内部的那个词又漏了出来一次。
              */}
            {agents.length > 1 ? (
              <AgentPill
                agents={agents}
                {...(agentLabel ? { label: agentLabel } : {})}
                onPick={onStart}
                triggerLabel="换一个 LLM"
              />
            ) : null}
            {/**
              * **空态也要够得着终端**（2026-08-11）。
              *
              * 入口从侧栏挪到了对话这一侧（作者：*「侧边栏这边不能有终端」*），
              * 而这一屏没有 composer——不在这里补一个，
              * 「还没开始对话时想先看一眼目录」就只剩命令面板一条路，
              * 那等于**看不见**。
              */}
            {onToggleDock ? (
              <Button variant="text" size="sm" onClick={onToggleDock}>
                终端
              </Button>
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
