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
import type { ProjectSummary, SessionSummary, TaskSummary } from "../protocol/index.js"
import type { TranscriptItem } from "../protocol/index.js"
import { 没说话 } from "../protocol/events.js"
import { TerminalPane } from "./terminal.js"
import { Button, EmptyState, Loader, Row } from "./primitives.js"
import { $drafts, clearDraft, setDraft, togglePalette } from "./state/view.js"
import { AgentMarkdown } from "./markdown.js"
import { formatDuration, formatTokens, 短路径, 基名 } from "./format.js"
import { 对话图标, 文件夹图标, 文件图标, 加号图标, 停止图标, 下拉图标, 上箭头图标, 铅笔图标, 删除图标, 三角图标, 复制图标, 技能图标, 设置图标, 插件图标, 勾图标 , R图标, Python图标 , 服务器图标 , 文件夹描边图标, 对话描边图标, 服务器描边图标 } from "./icons.js"
import { StickToBottom } from "use-stick-to-bottom"

import { t, tf, msgid } from "./i18n/index.js"
/**
 * 会话行上的时间。**只到分钟**——秒在这里没有信息量，
 * 而且会让两个相邻会话看起来像在比谁更精确。
 */
function clockOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return t("时间不明")
  const 今天 = new Date().toDateString() === d.toDateString()
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  // 今天的只给时刻，别的带月日——**「昨天 14:30」和「今天 14:30」不该长得一样**
  return 今天 ? hhmm : `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`
}

/**
 * 侧栏里那两个图标（2026-08-11 起有，2026-08-12 改成实心）。
 *
 * 作者：*「对话的话，前面有一个交流的图标；项目的话，前面有一个文件夹的图标。」*
 * 后来又提：*「我们的图标也没有 workbuddy 好看……他们的图标质感非常的棒。」*
 *
 * 于是这两个改成走 `icons.tsx`——**实心、`fill: currentColor`**，
 * 那份文件的文件头写了为什么描边做不到同一件事。
 */
function 会话图标() {
  return <对话图标 className="row-icon" />
}

/**
 * 对话头上的**工作目录**（T3-b，2026-08-12）。
 *
 * 两态，各说各的事：
 *   - **没设**：「未设工作目录 · 这是一段普通对话」。
 *     **不设不是「缺了什么」**，它是一个有含义的状态，所以这句话说的是
 *     *不设意味着什么*，而不是催人去设。作者的定义就是这一句。
 *   - **设了**：写出路径，点一下能改。
 *
 * **常驻，不做悬停才出现**：本项目已经为「悬停才出现的入口」被报过两次
 * 「没有这个功能」，而两次代码都是好的。
 */
function WorkspaceEntry({
  workspace,
  onPick,
}: {
  workspace?: string | undefined
  /** 去弹原生目录选择器（设一个 / 换一个）。**不给就只显示，不画按钮** */
  onPick?: (() => void) | undefined
}) {
  /**
   * 形态是**一颗 chip**（2026-08-12，CDP 实测 WorkBuddy 的 `_chip_`）：
   * `padding: 0 8px` · 圆角 8 · **无边框无底色** · `gap: 4`
   * · 字 `14px/20px` · 色 `rgba(0,0,0,.5)` —— 比正文弱一档。
   *
   * **弱一档是有意的**：它是「这句话会在哪儿执行」的注脚，
   * 不该跟正在写的那句话抢。
   */
  const 文字 = workspace ? 短路径(workspace) : t("选择工作目录")
  if (!onPick) {
    return (
      <span className="ws-chip" title={workspace ?? undefined}>
        <文件夹图标 />
        <span className="ws-chip-label">{文字}</span>
      </span>
    )
  }
  return (
    <span className="ws-chip-group">
      <Button
        variant="ghost"
        size="sm"
        className="ws-chip"
        /**
         * **那句话从这颗按钮上摘掉了**（2026-08-13）。
         *
         * 它此前挂在原生 `title` 上（设计契约明令禁止：无样式、约 500ms
         * 系统延迟、读屏读不到）。我第一反应是改成 `aria-label`——**错的**：
         * `aria-label` 会**盖掉可见文案**作为可及名字，于是这颗按钮
         * 不再叫「选择工作目录」了，五条 e2e 当场红。
         *
         * 正确的答案是它压根不该在这儿：
         *   - 没设路径时，那句「这是一段普通对话」**是作者早就让我删掉的**
         *     （*「显示『这是一段普通对话』感觉就很无聊」*）——
         *     chip 自己写着「选择工作目录」，那已经说明没设了；
         *   - 设了路径时，**完整路径确实有用**，但它属于那段文字本身，
         *     所以挂在里面那个 `<span>` 上（span 不是按钮，不受那条规则约束）。
         */
        onClick={onPick}
      >
        <文件夹图标 />
        {/* 全路径给眼睛：chip 上显示的是缩过的 `短路径` */}
        <span className="ws-chip-label" title={workspace ?? undefined}>
          {文字}
        </span>
        <下拉图标 />
      </Button>
      {/**
        * **不在这里写「这是一段普通对话」**（2026-08-12 撤掉）。
        *
        * 我先前把它常驻在 chip 旁边，理由是「说清不设意味着什么」。
        * 作者：*「显示『这是一段普通对话』感觉就很无聊，workbuddy 里面就不会有。」*
        *
        * 他是对的，而我把两件事搞混了：**「不设意味着什么」是一次性的知识，
        * 不是一个需要每时每刻盯着的状态。** 一句永远在那儿、永远不变的话
        * 不提供信息，只占地方——它和「未选择」那种占位符是同一类东西。
        * chip 自己写着「选择工作目录」，那已经说明它还没设了。
        */}
    </span>
  )
}

function 项目图标() {
  return <文件夹图标 className="row-icon" />
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
  select,
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
  /**
   * 批量选择（2026-08-12，作者：*「会话越来越多了，能否给我来一个批量处理的
   * 选项，我可以批量删除」*）。
   *
   * **不给就整套不出现**——平时那个勾选框只是噪声，
   * 而「选择模式」这件事本身要由外面统一管：一次只能有一种模式。
   */
  select?: { checked: boolean; onToggle: () => void } | undefined
}) {
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState<string | undefined>(undefined)
  const 名字 = session.title ?? t("新会话")
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
          aria-label={tf("重命名会话：{0}", 名字)}
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
      {select ? (
        /**
         * **勾选框在行首**（2026-08-12）。
         *
         * 用原生 `<input type=checkbox>`：**键盘、读屏、空格键全都自带**，
         * 自绘一个方块要把这些一样样补回来，而本项目已经在
         * 「自绘一行丢掉所有动作」上栽过一次。
         */
        <input
          type="checkbox"
          className="sess-check"
          checked={select.checked}
          onChange={select.onToggle}
          aria-label={tf("选择会话：{0}", 名字)}
        />
      ) : null}
      <Row active={active} onClick={select ? select.onToggle : onPick}>
        <span className="sess">
          <span className="name">
            {/* 图标在最前面：**一眼分出「这是对话」还是「这是项目」**（仿 Codex） */}
            <会话图标 />
            {/* 置顶标记在名字前面：**它是这一行的属性，不是一个动作** */}
            {session.pinned ? (
              <span className="pin-mark" aria-label={t("已置顶")}>
                ▲
              </span>
            ) : null}
            {名字}
          </span>
          {/**
            * **副信息收到同一行的右端**（2026-08-12，实测 WorkBuddy）。
            *
            * 它那儿会话行是 `240×31` 单行：标题在左、时刻在右。
            * 我们此前是标题在上、来路在下——**53px，高出七成**，
            * 一屏少放三分之一的对话。
            *
            * **agent 名从这一行拿掉了**：它已经不是这一行才答得了的问题——
            * 每条回答上都记着是谁答的（`item.by`，2026-08-12 加的），
            * composer 上还有一颗 pill。留在这里只是把行撑高。
            *
            * **远端仍然写目录**：对那条线来说「在哪个目录」比「什么时候建的」
            * 要紧得多——那是一次「把这里的文件都删了」会落到哪儿。
            */}
          <span className="sub">
            {session.remote ? 短路径(session.remote.cwd) : clockOf(session.createdAt)}
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
            aria-label={tf("会话操作：{0}", 名字)}
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
                aria-label={tf("会话操作：{0}", 名字)}
                style={{ top: 位置.top, left: 位置.left }}
              >
                {onPin ? (
                  <Button variant="ghost" size="inline" role="menuitem" onClick={() => { onPin(); setMenu(false) }}>
                    {session.pinned ? t("取消置顶") : t("置顶")}
                  </Button>
                ) : null}
                {onRename ? (
                  <Button variant="ghost" size="inline" role="menuitem" onClick={() => { setEditing(session.title ?? ""); setMenu(false) }}>
                    {t("重命名")}
                  </Button>
                ) : null}
                {onMove ? (
                  <>
                    <Button variant="ghost" size="inline" role="menuitem" onClick={() => { onMove("up"); setMenu(false) }}>
                      {t("上移")}
                    </Button>
                    <Button variant="ghost" size="inline" role="menuitem" onClick={() => { onMove("down"); setMenu(false) }}>
                      {t("下移")}
                    </Button>
                  </>
                ) : null}
                {onDelete ? (
                  <Button variant="text" size="inline" role="menuitem" className="menu-danger" onClick={() => { onDelete(); setMenu(false) }}>
                    {t("删除")}
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

/**
 * 输入卡左下角那颗 `＋`（2026-08-13）。
 *
 * 作者：*「其实是一个按钮，点击进去有几个选项，上传文件，上传图片，
 * 上传数据，之类的，可以供我们进行选择。」*
 *
 * ## 三项之间的区别，是文件浏览器里的类型过滤
 *
 * 挑数据时不必在一堆截图里翻，挑图片时也一样。
 * 每一档都留着「所有文件」那条退路：过滤器猜错扩展名时，人得能自己绕过去。
 *
 * ## 关于图片：**能不能认图是模型的事，不是这个菜单的事**
 *
 * 作者纠正过我一次：*「是否识别图片，那是 LLM 的事情，而不是我们工具的事情，
 * 别忘了我还有 kimi-2.7，这是带有图像识别的。」* 他是对的——
 * 我上一版拿「模型看不见图」当理由去限定这个入口，**那个判断不该由这里做**。
 *
 * **但有一件事必须说清楚，因为它是我们这一侧的欠账**：
 * 这颗按钮现在插进去的是**一个路径**。带视觉的模型看得懂图，
 * 却看不懂一个路径——要真的把图送到它眼前，得让消息带上图片内容
 * （协议、`runtime/native.ts` 的提示词装配、以及 pi 那边的 `processImage`
 * 三处都要动）。**那件事还没做。**
 * 在做之前，agent 对图片能干的是 bash / Python 够得着的那些
 * （读尺寸、转格式、跑处理）——**这不是「图像识别」，不该混为一谈**。
 *
 * ## 它做的事：把路径插进输入框
 *
 * 不是真的「上传」——**东西本来就在这台机器上**，而 agent 的手也在
 * （bash 的 cwd 就是这段对话的工作目录）。所以「把这个文件给它」的真实含义
 * 是**告诉它去看哪儿**，那就是一个路径。
 */
const 上传项 = [
  { kind: "any", 名: msgid("上传文件") },
  { kind: "image", 名: msgid("上传图片") },
  { kind: "data", 名: msgid("上传数据") },
] as const

function AttachButton({
  workspace,
  onInsert,
  onAttachImages,
}: {
  /** 这段对话的工作目录。**用来把路径缩成相对的**，也用作浏览器的起点 */
  workspace?: string | undefined
  /** 文件与数据：**把路径写进输入框**——agent 用 bash 去读它 */
  onInsert: (文本: string) => void
  /**
   * 图片：**真的随这一轮送进模型**（协议 4.12，2026-08-13）。
   *
   * 与上面那条是两回事，而这个区别是实打实的：一个 CSV 的路径正是 agent 要的
   * （它会去 `read` 那个文件）；而一张图的路径对带视觉的模型毫无用处——
   * 它要的是字节。**同一个菜单里的两项，走两条不同的路，因为它们本来就是两件事。**
   *
   * **不给就不画「上传图片」那一项**：不摆一个按下去没有下文的入口。
   */
  onAttachImages?: ((paths: readonly string[]) => void) | undefined
}) {
  const [开着, 设开着] = useState(false)
  const 盒 = useRef<HTMLDivElement>(null)

  // 点别处收起来。**菜单赖着不走**是本项目已经修过一次的毛病
  useEffect(() => {
    if (!开着) return
    const 关 = (e: MouseEvent) => {
      if (!盒.current?.contains(e.target as Node)) 设开着(false)
    }
    document.addEventListener("mousedown", 关)
    return () => document.removeEventListener("mousedown", 关)
  }, [开着])

  const 挑 = async (kind: "any" | "image" | "data") => {
    设开着(false)
    const 选中 = await 挑文件(kind, workspace)
    if (选中.length === 0) return // 取消了：什么都不做，也不吭声
    /**
     * **图片走附件，别的走文本。**
     *
     * 图片给的是**绝对路径**：主进程要按它读盘，而相对路径的参照系
     * 在那一侧不一定是同一个目录。别处（文件 / 数据）缩成相对路径是为了好读，
     * 而它最终是给人和 agent 看的字，不是给 fs 用的。
     */
    if (kind === "image" && onAttachImages) {
      onAttachImages(选中)
      return
    }
    onInsert(选中.map((p) => 相对于(p, workspace)).join(" "))
  }

  return (
    <div
      className="attach"
      ref={盒}
      /**
       * **Esc 也能收**（2026-08-13 补）。
       *
       * 别处每一个浮层都有这条退路（模型菜单、agent 菜单、侧栏搜索、
       * 改一句话的输入框），**只有这个菜单漏了**——
       * 一个只能用鼠标关掉的菜单，对键盘用户等于挡住了整张输入卡。
       */
      onKeyDown={(e) => {
        if (e.key === "Escape" && 开着) {
          e.stopPropagation()
          设开着(false)
        }
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        className="attach-trigger"
        /**
         * **不叫「上传」**：那三项都以「上传」开头，一个裸的「上传」
         * 会同时指向四个东西——`getByRole(name)` 是子串匹配，
         * 读屏与 Playwright 都一样。设计契约里那条扫描盯着这件事。
         */
        aria-label={t("添加内容")}
        aria-haspopup="menu"
        aria-expanded={开着}
        onClick={() => 设开着((v) => !v)}
      >
        <加号图标 />
      </Button>
      {开着 ? (
        <div className="menu attach-menu" role="menu" aria-label={t("添加内容")}>
          {上传项
            .filter((项) => 项.kind !== "image" || onAttachImages)
            .map((项) => (
            <Button
              key={项.kind}
              variant="ghost"
              size="inline"
              role="menuitem"
              onClick={() => void 挑(项.kind)}
            >
              {t(项.名)}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 一张待发的图（协议 4.13）。
 *
 * 两个来源的形状不同，**因为它们手上的东西本来就不同**：
 * 从磁盘挑的有路径（主进程去读），粘贴板里的只有字节（它压根不是磁盘上的文件）。
 * `名` 只用来在 chip 上显示。
 */
type 待发的图 = { 名: string; 预览?: string } & (
  | { from: "path"; path: string }
  | { from: "bytes"; data: string; mimeType: string }
)

/** 协议 4.13 里 `images` 那一项的形状。**渲染侧只认这两种来源** */
export type 图片来源 =
  | { from: "path"; path: string }
  | { from: "bytes"; data: string; mimeType: string }

/** 送给协议的形状——把只给人看的 `名` 摘掉 */
function 报给协议(x: 待发的图) {
  return x.from === "path"
    ? ({ from: "path", path: x.path } as const)
    : ({ from: "bytes", data: x.data, mimeType: x.mimeType } as const)
}

/**
 * 一批 `File` → 待发的图（2026-08-13，粘贴与拖拽共用）。
 *
 * **能拿到磁盘路径就走 `path`**——那样它与「＋ 挑文件」是完全同一条路，
 * 主进程读盘、按上限缩放。拿不到（从浏览器里拖来的图、剪贴板里的截图）
 * 才退回字节。
 *
 * 不这么分的话会出现一种很难解释的不一致：**同一张大图，用 ＋ 挑进来没事，
 * 拖进来却说太大**——因为字节那条路没有主进程那一步缩放。
 */
async function 文件们成图(files: readonly File[]): Promise<待发的图[]> {
  const w = window as unknown as { dawn?: { pathForFile?: (f: File) => string } }
  const 出: 待发的图[] = []
  const 见过 = new Set<string>()
  for (const blob of files) {
    if (!blob.type.startsWith("image/")) continue
    // 两个来源可能指向同一张：**按「名字+大小」去重**，否则一次进来两张
    const 记号 = `${blob.name}|${blob.size}|${blob.type}`
    if (见过.has(记号)) continue
    见过.add(记号)

    const path = w.dawn?.pathForFile?.(blob) ?? ""
    if (path) {
      出.push({ from: "path", path, 名: blob.name || 基名(path) })
      continue
    }
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.onerror = () => rej(r.error ?? new Error("读不出这张图"))
      r.readAsDataURL(blob)
    })
    出.push({
      from: "bytes",
      data: dataUrl.slice(dataUrl.indexOf(",") + 1),
      mimeType: blob.type,
      // 剪贴板里的截图没有名字，**给一个说得清来路的**，而不是「未命名」
      名: blob.name || "粘贴的图片",
      /** 字节这一支的预览不用问主进程：它已经在手上了 */
      预览: dataUrl,
    })
  }
  return 出
}

/** 一次拖拽/粘贴里所有的图片文件。**`items` 与 `files` 都要看**，见下 */
function 捡出图片文件(dt: DataTransfer | null): File[] {
  if (!dt) return []
  return [
    ...Array.from(dt.items)
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f),
    ...Array.from(dt.files).filter((f) => f.type.startsWith("image/")),
  ]
}

/**
 * 给 `path` 那一支补上缩略图（异步，后到）。
 *
 * **chip 先出现、预览后到**：反过来（等缩略图回来再画）会让人
 * 松手之后有一段什么都不发生的空窗，而那正是「点了没反应」的样子。
 */
function 补预览(批: readonly 待发的图[], 设: (f: (前: 待发的图[]) => 待发的图[]) => void): void {
  for (const one of 批) {
    if (one.from !== "path" || one.预览) continue
    const path = one.path
    void 要缩略图(path).then((预览) => {
      if (!预览) return
      设((前) => 前.map((x) => (x.from === "path" && x.path === path ? { ...x, 预览 } : x)))
    })
  }
}

/** 这一次粘贴里有没有图片。**两处 composer 共用同一个判据** */
function 粘的是图(e: React.ClipboardEvent): boolean {
  return 捡出图片文件(e.clipboardData).length > 0
}

/**
 * 从一次粘贴里捡出图片（2026-08-13，作者提）。
 *
 * **渲染进程这一侧不需要 fs**：剪贴板给的就是 `File`，
 * 而拖进来的那些能问出磁盘路径（`webUtils`）。
 * 两条来路在 `文件们成图` 里合并，**所以粘贴与拖拽的结果完全一样**——
 * 两份实现迟早有一份忘了处理其中一种。
 *
 * 非图片的粘贴一律不碰：**粘一段文字仍然是粘一段文字**。
 */
async function 从粘贴里捡图(e: React.ClipboardEvent): Promise<待发的图[]> {
  return 文件们成图(捡出图片文件(e.clipboardData))
}

/**
 * 问主进程要一张缩略图（`data:` URL）。**拿不到就返回 undefined**——
 * 预览出不来只是看不见，不该拦住发送。
 */
async function 要缩略图(path: string): Promise<string | undefined> {
  const w = window as unknown as { dawn?: { imageThumb?: (p: string) => Promise<string | null> } }
  return (await w.dawn?.imageThumb?.(path)) ?? undefined
}

/**
 * 开系统的文件浏览器，拿回选中的路径（协议 4.12 那条通道的渲染侧）。
 *
 * **抽出来是因为有两个入口**：`＋` 菜单，以及输入框行首那个 `@`。
 * 抄两遍的话，其中一份迟早会忘了处理「取消」。
 */
async function 挑文件(kind: "any" | "image" | "data", workspace?: string): Promise<string[]> {
  const w = window as unknown as {
    dawn?: { pickFiles?: (k: string, d?: string) => Promise<string[]> }
  }
  return (await w.dawn?.pickFiles?.(kind, workspace)) ?? []
}

/**
 * 能缩成相对路径就缩，否则原样。
 *
 * **判据是「真的在里面」，不是「前缀对得上」**：`/w/paper2` 的前缀
 * 也匹配 `/w/paper`，缩出来会得到 `2` 这种指向不明的东西。
 * 所以要连分隔符一起比。
 */
function 相对于(路径: string, 根?: string): string {
  if (!根) return 路径
  const 前缀 = 根.endsWith("/") ? 根 : `${根}/`
  return 路径.startsWith(前缀) ? 路径.slice(前缀.length) : 路径
}

/* ── 侧栏 ─────────────────────────────────────────────────────────── */

/**
 * 侧栏与正文之间那条可以拖的缝（2026-08-13，作者：*「侧边栏其实可以挪动，
 * 往左挪动，可以看到更少的信息，往右挪动，可以看到更多的信息」*）。
 *
 * ## 量出来的（CDP 连运行中的 WorkBuddy，`_sash_`）
 *
 * ```
 * width: 4px   cursor: col-resize   position: absolute   z-index: 10
 * 背景透明；::before 是居中的 1px 细线，平时也透明
 * hover / 拖动中 细线才亮起来
 * ```
 *
 * **4px 宽、1px 可见**这件事是刻意的：命中区要比看得见的那条粗，
 * 否则拖它成了一件靠手稳的事。（Fitts 定律的老结论，它那儿是照做的。）
 *
 * ## 它是 `separator`，不是 `button`
 *
 * ARIA 的窗格分隔条模式：`role="separator"` + `aria-valuenow/min/max`，
 * 并且**可聚焦、方向键能调**。
 * 「拖」是鼠标独占的动作——只给拖的话，这个能力对键盘用户等于不存在，
 * 而那正是本项目已经踩过两次的那条（*「看不见的能力等于不存在」*）。
 */
export function SideSash({
  width,
  min,
  max,
  onResize,
}: {
  width: number
  min: number
  max: number
  onResize: (px: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  /**
   * **记下按下那一刻的锚点，不用每次事件的增量累加。**
   * 累加会在夹到上下界时丢步：手往左推过了头再推回来，
   * 侧栏不跟手——因为越界的那几十像素被吃掉了，没人记得它们。
   */
  const 锚 = useRef({ x: 0, w: width })

  return (
    <div
      className={`side-sash${dragging ? " dragging" : ""}`}
      style={{ left: `${width - 2}px` }}
      role="separator"
      aria-orientation="vertical"
      aria-label={t("调整侧栏宽度")}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        锚.current = { x: e.clientX, w: width }
        setDragging(true)
        // **抓住指针**：不抓的话手一滑出这 4px，拖动就断在半路
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!dragging) return
        onResize(锚.current.w + (e.clientX - 锚.current.x))
      }}
      onPointerUp={(e) => {
        setDragging(false)
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        // 一步 16px：够看得出来，又不至于两下就撞到界
        if (e.key === "ArrowLeft") {
          onResize(width - 16)
          e.preventDefault()
        } else if (e.key === "ArrowRight") {
          onResize(width + 16)
          e.preventDefault()
        }
      }}
    />
  )
}

export function SessionSidebar({
  服务器名,
  projects,
  sessions,
  agents,
  agentLabel,
  projectSessions = [],
  activeProjectId,
  activeSessionId,
  view,
  onPickProject,
  onPickSession,
  onShowPanel,
  onShowFiles,
  onShowSkills,
  onShowPlugins,
  onShowMcp,
  onDeleteSession,
  onRenameSession,
  onPinSession,
  onMoveSession,
  onReorderSessions,
  onOpenSettings,
  onDeleteProject,
  settingsActive,
  remote,
  tasks,
  onNewTask,
  onPickTask,
  activeTaskId,
  sessionOf,
  sessionRank,
  onDeleteMany,
  onDeleteProjects,
  search,
  onDeleteTask,
  onNewTaskIn,
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
  onShowPanel: () => void
  onShowFiles: () => void
  /** 技能那一屏。**不给就不画那一行**——不摆一个点了没反应的入口 */
  onShowSkills?: (() => void) | undefined
  /** 插件那一屏。同上 */
  onShowPlugins?: (() => void) | undefined
  /** MCP 那一屏。同上 */
  onShowMcp?: (() => void) | undefined
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
  /**
   * 任务（T2）。**它将取代上面那两列**（会话 / 项目）——
   * 但这一批先并排放着：那两个名字被几十条 e2e 当作选择器用，
   * **一次换掉会红一大片，而红成一片就没人看得出哪条是真问题**。
   * 删旧列连同测试一起改，放在下一批。
   */
  tasks?: readonly TaskSummary[] | undefined
  onNewTask?: (() => void) | undefined
  onPickTask?: ((t: TaskSummary) => void) | undefined
  activeTaskId?: string | undefined
  /**
   * 任务的会话摘要从哪来（T3-a）。
   *
   * **侧栏不自己取数**：它只知道「这个 sessionId 对应哪一条摘要」。
   * 查不到就退回一行纯文字——**不假装那一行有删除和改名**。
   */
  sessionOf?: ((sessionId: string) => SessionSummary | undefined) | undefined
  /**
   * 这段会话在会话列表里排第几（T3-a）。**列表的顺序由它决定**，
   * 因为置顶／上下挪／拖拽改的都是会话那一套次序。
   * 排不上号返回 `-1` 或 `undefined`。
   */
  sessionRank?: ((sessionId: string) => number) | undefined
  /**
   * 批量删除（2026-08-12，作者要的）。**不给就不出现「选择」入口**——
   * 一个进得去、却删不掉的选择模式比没有更坏。
   *
   * 第二个参数是「删完之后收摊」：**由外面在真的删完之后调**，
   * 而不是按下就退出选择模式——那样人会以为删完了，而确认框还开着。
   */
  onDeleteMany?: ((tasks: readonly TaskSummary[], done: () => void) => void) | undefined
  /**
   * **批量删项目**（2026-08-13，作者：*「项目里面没有批量删除项目的选项，
   * 可以模仿一下会话的批量管理」*）。**不给就不出现「批量」入口**——
   * 与会话那颗同一条：一个进得去、却删不掉的选择模式比没有更坏。
   *
   * 每一项都带着 `tasks`，**因为 `projectId` 可能没有**：
   * 项目在新模型里是从**路径**长出来的，而 projectId 要从它底下某段会话的
   * 摘要里取——迁移过来、界面还没认识的那些取不到。
   * 取不到时删的就是它底下那些任务（`deleteTask` 只要 taskId）。
   * **「拿不到 id 所以这一条删不掉」正是作者报过的那个 bug 的形状。**
   */
  /**
   * 搜索（2026-08-13，作者要的）。**不给就不画那个框**——
   * 与别处同一条：一个进得去、却什么都过滤不了的框比没有更坏。
   *
   * **它搜的是名字与路径，不是对话内容**。后者要后端出一个全文检索，
   * 现在没有——而一个看起来什么都能搜、其实只搜标题的框，
   * 比一个说清楚自己搜什么的更坏（不变式 5）。占位符把范围写出来。
   */
  search?: { value: string; onChange: (v: string) => void; onClose: () => void } | undefined
  onDeleteProjects?:
    | ((
        groups: readonly { workspace: string; projectId?: string; tasks: readonly TaskSummary[] }[],
        done: () => void,
      ) => void)
    | undefined
  /**
   * 删掉一个任务。**给了它，拿不到会话摘要的那些行也删得掉**——
   * 而那正是「历史遗留的对话删不掉」的形状。
   */
  onDeleteTask?: ((task: TaskSummary) => void) | undefined
  /** 在某个已有的工作路径下再开一段任务。**不给就不画那颗 `＋`** */
  onNewTaskIn?: ((workspace: string) => void) | undefined
  /**
   * 连接 id → 这台服务器叫什么（2026-08-14）。
   *
   * **取不到就显示 id**：编一个「未命名服务器」出来，与「这台就叫这个名字」
   * 在屏幕上分不开。**可选**——不给的话服务器那一列显示的是 id，
   * 仍然分得开是哪台，只是不好看；而这比让整列消失诚实。
   */
  服务器名?: ((connectionId: string) => string | undefined) | undefined
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
   * **哪个项目展开着**（T3-a）。默认收起，但**当前那段对话所在的项目自动展开**——
   * 否则点进一段对话之后，侧栏上找不到它在哪，人会以为它没了。
   */
  /**
   * 哪个项目是展开的。**三态**（2026-08-15 修作者报的「折叠不进去」）：
   *
   * - `undefined`：人还没选过 → 自动展开**当前那段会话所在的**那个
   * - `null`：人明确把它收起来了 → 谁都不自动展开
   * - 路径：人明确展开了这一个
   *
   * 上一版只有两态，判据是
   * `展开的项目 === 路径 || 里面的.some(是当前会话)`——
   * **第二个条件让点击失效了**：你正在用的那段会话所在的项目永远展开，
   * 点了也收不起来（作者：*「`未命名文件夹` 折叠不进去，但 `tmp_dir` 可以」*，
   * 差别正是前者装着当前会话）。**自动展开是个默认值，不该压过人的选择。**
   */
  const [展开的项目, 设展开] = useState<string | undefined | null>(undefined)

  /**
   * **批量选择**（2026-08-12，作者：*「会话越来越多了，能否给我来一个
   * 批量处理的选项，我可以批量删除」*）。
   *
   * `undefined` = 不在选择模式。**用「有没有这个集合」表示模式**，
   * 而不是再加一个布尔——两个状态可以互相矛盾（模式开着但集合没清），
   * 一个不会。
   */
  /**
   * **两列共用一个选择模式**（2026-08-13 扩到项目，作者：*「项目里面没有
   * 批量删除项目的选项，可以模仿一下会话的批量管理」*）。
   *
   * 用「哪一列 + 一个集合」表示，而不是两个各自的集合：
   * 两个集合可以**同时非空**，那时屏幕上会有两条批量条、两颗「全选」、
   * 两颗「删除」——而按名字找东西是子串匹配，读屏、Playwright、人脑都一样
   * （CLAUDE.md：*「两处长得一样的东西，等于没有判据」*）。
   * 一个状态表达不出那种情形。
   */
  const [多选中, 设多选] = useState<{ 列: "会话" | "项目" | "服务器"; 集合: ReadonlySet<string> } | undefined>(
    undefined,
  )
  const 选会话中 = 多选中?.列 === "会话"
  /** 正在多选服务器那一列（2026-08-14 作者要的，与另两列同一套状态） */
  const 选服务器中 = 多选中?.列 === "服务器"
  /**
   * 收起来的那些（2026-08-15 作者要的）：机器按 `connectionId`，会话那一列用 `"会话"`。
   * **默认全展开**——收起是人的动作，不是我们替他做的决定。
   */
  const [收起的, 设收起] = useState<ReadonlySet<string>>(new Set())
  const 收起了 = (k: string) => 收起的.has(k)
  const 切收起 = (k: string) =>
    设收起((前) => {
      const 新 = new Set(前)
      if (新.has(k)) 新.delete(k)
      else 新.add(k)
      return 新
    })
  const 选项目中 = 多选中?.列 === "项目"
  const 已选 = 多选中?.集合
  const 切一个 = (id: string) =>
    设多选((前) => {
      if (!前) return 前
      const n = new Set(前.集合)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return { ...前, 集合: n }
    })
  const 进选择 = (列: "会话" | "项目" | "服务器") =>
    设多选((前) => (前?.列 === 列 ? undefined : { 列, 集合: new Set<string>() }))

  /**
   * 归类：**有路径 → 项目，没路径 → 会话**（作者 2026-08-12 定案）。
   *
   * 分组在这里算，不在后端算——**它是一个显示上的归类，不是一张新表**。
   * 后端只记「这个任务的路径是什么」，多了一张表就多了一处会与事实脱节的地方。
   */
  /**
   * **按会话的顺序排，不按任务的**（T3-a，2026-08-12）。
   *
   * 两张表各有一套 `pinned` / `sortOrder`，而**置顶、上下挪、拖拽改的是会话那一套**。
   * 照任务那一套排的话，症状是**点了置顶什么都不动**——
   * 又一次「能点、没报错、然后什么都没发生」，本项目已经吃过三回。
   *
   * 排不上号的（拿不到会话摘要）沉到最后，且彼此保持原有次序。
   */
  const 名次 = (t: TaskSummary) => {
    const r = t.sessionId ? sessionRank?.(t.sessionId) : undefined
    return r === undefined || r < 0 ? Number.MAX_SAFE_INTEGER : r
  }
  /**
   * 搜索过滤（2026-08-13）。**在分组之前筛**——分完再筛的话，
   * 一个项目底下的对话全被筛掉之后那个项目还挂在那儿，点开是空的。
   *
   * 匹配的是**标题与路径**，大小写不敏感。**空词等于不筛**，
   * 而不是「什么都不匹配」——缺失不等于某个具体值。
   */
  const 词 = (search?.value ?? "").trim().toLowerCase()
  /**
   * **拿屏幕上显示的那个名字去比，不是任务表上那个**（2026-08-13 修）。
   *
   * 行上写的标题来自**会话摘要**（`sessionOf(...)`），任务表上那一份可能
   * 还是空的——标题是第一句话定的，落在会话那一侧。
   * 拿任务表那份去筛，症状是**打上正确的词却一条都搜不出来**：
   * 人看得见「甲测试会话」，搜「甲测试」却是空的。
   *
   * 同一件事有两个来源，就一定要挑**人看见的那一个**去比。
   */
  const 名字of = (t: TaskSummary) =>
    (t.sessionId ? sessionOf?.(t.sessionId)?.title : undefined) ?? t.title ?? ""
  const 命中 = (t: TaskSummary) =>
    词 === "" ||
    名字of(t).toLowerCase().includes(词) ||
    (t.workspace ?? "").toLowerCase().includes(词)

  const 全部任务 = [...(tasks ?? [])].filter(命中).sort((a, b) => 名次(a) - 名次(b))

  /**
   * **服务器自成一列**（2026-08-14，作者要的）。
   *
   * 作者：*「我们不是有会话和项目吗？我们可以再增加一个服务器的会话，
   * 这样服务器的会话就可以进行归类了。」*
   *
   * 判据是任务身上的 `connectionId`——**不是「有没有工作目录」**：
   * 一段远端任务同样可以设了远端路径，此前它会掉进「项目」那一列，
   * 与本地项目混在一起，而**那两者根本不是同一台机器上的东西**。
   *
   * 顺序：服务器优先于工作目录。远端任务即使设了路径也归服务器这一列，
   * 否则同一段会话会同时满足两边，而**一段会话只该有一个家**。
   */
  const 服务器组: [string, TaskSummary[]][] = []
  for (const t of 全部任务) {
    if (!t.connectionId) continue
    const 已有 = 服务器组.find(([c]) => c === t.connectionId)
    if (已有) 已有[1].push(t)
    else 服务器组.push([t.connectionId, [t]])
  }

  /** 服务器那一列能批量删的。**就是这一列里的全部**——它们都是任务 */
  const 服务器可批量的 = 服务器组.flatMap(([, 些]) => 些)

  // **远端的不再落进这两列**：它们有自己的家了
  const 散的 = 全部任务.filter((t) => !t.workspace && !t.connectionId)
  const 项目组: [string, TaskSummary[]][] = []
  for (const t of 全部任务) {
    if (!t.workspace || t.connectionId) continue
    // **同一路径合并成一条**：作者选的是「一个项目底下挂两段」，不是两条同名并列
    const 已有 = 项目组.find(([p]) => p === t.workspace)
    if (已有) 已有[1].push(t)
    else 项目组.push([t.workspace, [t]])
  }

  /**
   * **任务行就是会话行**（T3-a）。
   *
   * 不另写一种行：删除、改名、置顶、上下挪都长在 `SessionRow` 上，
   * 自绘一行就会把它们**一次性全丢掉**——而作者已经为这件事报过一次错
   * （*「我们现在在服务器的对话，我发现不能删除，也不能挪动顺序」*，
   * 那时远端那一列正是自绘的）。
   *
   * 拿不到会话摘要时退回一行纯文字：**不画一个点了没反应的 `⋯`**。
   */
  /**
   * **它是一个函数，不是一个组件——这一点是必须的。**
   *
   * 写成 `const 任务行 = (...) => <li>…` 再当 `<任务行 />` 用的话，
   * 它在**每次渲染都是一个新的组件类型**，React 于是把整列行卸载重挂。
   * 症状不是「慢」，是**拖拽永远落不下去**：`dragstart` 之后第一次重渲染
   * 就把那个元素换掉了。e2e 的两条拖拽用例当场超时，
   * 而单元测试全绿——它们不拖。
   *
   * 直接调用（`任务行(t)`）返回的是元素，参与的是父组件自己的那次渲染，
   * 不产生新类型，也就不重挂。
   */
  /**
   * 这一组任务落在哪个项目上。**从会话摘要取，不在任务上再记一份**——
   * 同一件事记两处，迟早有一处是旧的。
   */
  const 项目id = (组: TaskSummary[]): string | undefined => {
    for (const t of 组) {
      const s = t.sessionId ? sessionOf?.(t.sessionId) : undefined
      if (s?.projectId) return s.projectId
    }
    return undefined
  }

  /**
   * 能批量删的那些：**「会话」栏里、且拿得到会话摘要的**。
   *
   * 拿不到摘要的（刚迁过来、还没拉起来）不进这个集合——
   * 删一个我们手上没有的东西，报错会出现在一个人看不懂的地方。
   */
  /**
   * 能批量删的：**「会话」栏里的全部**。
   *
   * 上一版这里先把任务换成会话摘要，拿不到的就丢掉——于是
   * **迁移过来的那些一条都进不来**（它们的会话在别的项目里，界面手上没有）。
   * 作者报的正是这个：*「历史遗留的对话……我现在无法删除。」*
   *
   * 现在按 `taskId` 删（协议 4.9 的 `deleteTask`），**界面不必先认识那段会话**。
   */
  const 可批量的 = 散的

  /**
   * @param 可勾 这一行**这一轮选择模式管不管得着它**（2026-08-13 加）。
   *
   * 项目底下那些会话行也走这个函数。此前它们在「会话多选」时
   * **照样长出勾选框**，勾上了却删不掉——`可批量的` 只有 `散的`，
   * 删除那一步 `filter` 一过就把它们悄悄丢了。
   * 能勾、勾得上、按下删除、然后它还在：**这就是静默截断**（规格 7.5）。
   */
  const 任务行 = (task: TaskSummary, 可勾: boolean) => {
    /**
     * **哪一列在多选，就只有那一列长勾选框**（2026-08-14 扩到三列）。
     *
     * 上一版写死 `选会话中`，于是服务器那一列的行**永远长不出勾选框**——
     * 而按钮却在，点了像什么都没发生。这类「入口在、底下没接」
     * 本项目栽过好几次，所以判据要按**这一行属于哪一列**来算。
     */
    const 属于服务器列 = task.connectionId !== undefined
    const 选中它 = 可勾 && (属于服务器列 ? 选服务器中 : 选会话中)
    const s = task.sessionId ? sessionOf?.(task.sessionId) : undefined
    if (!s) {
      /**
       * **界面不认识这段会话，但这一行照样要能删**（2026-08-12）。
       *
       * 上一版这里是一行纯文字：没有勾选框、没有 `⋯`。
       * 而「界面认不认识它」取决于它挂在哪个项目——
       * 迁移过来的那些**永远认不识**，于是永远删不掉。
       * 作者：*「历史遗留的对话……我现在无法删除。」*
       *
       * 删除只需要 `taskId`（协议 4.9），所以这里给得起。
       */
      return (
        <li key={task.taskId} className="sess-item">
          {选中它 ? (
            <input
              type="checkbox"
              className="sess-check"
              checked={已选!.has(task.taskId)}
              onChange={() => 切一个(task.taskId)}
              aria-label={tf("选择会话：{0}", task.title ?? t("新任务"))}
            />
          ) : null}
          <Row
            active={task.taskId === activeTaskId}
            className="task-row"
            onClick={() => (选中它 ? 切一个(task.taskId) : onPickTask?.(task))}
          >
            <对话图标 className="row-icon" />
            <span className="name">{task.title ?? t("新任务")}</span>
          </Row>
          {onDeleteTask ? (
            <div className="row-actions">
              <Button
                variant="ghost"
                size="icon"
                className="row-more"
                aria-label={tf("删除会话：{0}", task.title ?? t("新任务"))}
                onClick={() => onDeleteTask(task)}
              >
                <删除图标 />
              </Button>
            </div>
          ) : null}
        </li>
      )
    }
    return (
      <SessionRow
        key={task.taskId}
        session={s}
        {...(选中它 ? { select: { checked: 已选!.has(task.taskId), onToggle: () => 切一个(task.taskId) } } : {})}
        active={s.sessionId === activeSessionId && view === "conversation"}
        current={s.sessionId === activeSessionId}
        {...(agentLabel ? { label: agentLabel } : {})}
        onPick={() => onPickTask?.(task)}
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
    )
  }

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
      {/**
        * **新建任务**（T2，作者要的，学自 WorkBuddy 的「新建任务」）。
        *
        * 任务 = 一段对话 + 一个可选的工作路径。**不设路径就是普通对话**——
        * 那正是此前「临时会话」在做的事，只是它把「有没有路径」这件事
        * 藏在了一个用户看不见的概念里。
        */}
      {/**
        * **只有一个入口**（T3-a，作者 2026-08-12 定案）。
        *
        * 作者：*「点击完新建任务后，在对话窗口选择文件夹之后，就属于是一个
        * 项目管理，那么就会归类到左边侧边栏的项目里面。然后如果……不选择文件夹，
        * 直接对话，那么就属于是一个会话，那么就会归类到左边侧边栏的会话里面。」*
        *
        * **动作一个，去处两个——分栏是结果，不是选择。**
        * 此前这里有三颗按钮（新建任务 / 新建会话 / 新建项目），
        * 而作者点一次「新建任务」，侧栏冒出**两行**：任务表列一次、
        * 旧的「对话」列又列一次。**同一段会话被两套列表各画了一遍**，
        * 他的原话是「我感觉我们目前还没有实现这个功能」。
        */}
      {/**
        * 搜索框（2026-08-13）。**在最上面，不在分区标题旁**——
        * 它管的是下面所有列，不是某一列。
        *
        * `autoFocus`：这个框是**按钮按下去才出现的**，出现了却还要再点一下
        * 才能打字，等于把一个动作拆成两下。
        */}
      {search ? (
        <div className="side-search">
          <input
            className="control side-search-field"
            value={search.value}
            autoFocus
            placeholder={t("搜索项目与会话的名字")}
            aria-label={t("搜索项目与会话的名字")}
            onChange={(e) => search.onChange(e.target.value)}
            onKeyDown={(e) => {
              // **Esc 关掉它**：这个框遮着一行列表，得有一条不用鼠标的退路
              if (e.key === "Escape") search.onClose()
            }}
          />
        </div>
      ) : null}
      <div className="side-actions">
        <Row className="side-action" disabled={!fallbackAgent} onClick={onNewTask}>
          <加号图标 className="row-icon" />
          <span className="name">{t("新建任务")}</span>
        </Row>
        {/**
          * **「远端连接」挪到顶部固定区**（2026-08-12，作者定的顺序）。
          *
          * 作者：*「左边的侧边栏，从上到下设置一下固定的：第一个新建任务……
          * 然后画一个横线，下面是项目 然后是会话。」*
          *
          * 它此前在项目下面，理由是「它是另一台机器上的东西」。
          * 但作者的分法更清楚：**上面那一块是「我能用什么」（固定的能力入口），
          * 下面那一块是「我做过什么」（项目与会话）**——
          * 远端连接属于前者。
          *
          * **技能与 MCP 那两条还没上**（作者定的）：它们现在几乎是空的，
          * 而本项目已经为「看得见却点不动」被报过两次。
          * 能用了再放上来，位置留在这儿。
          */}
        {/**
          * **技能与 MCP**（2026-08-12，作者要的四项里的两条）。
          *
          * 我提过它们现在几乎是空的、建议等能用了再上；作者要求先做出来。
          * 那就做出来，但**两屏都只说真话**：
          * 技能列的是真实存在的子 agent（`.dawn/agents/*.md`，本来就能跑），
          * MCP 那屏如实说清它目前只对托管的 claude / codex 生效、还没有配置界面。
          *
          * **不存在的能力不该看起来存在**——这是「看不见的能力等于不存在」的反面。
          */}
        {onShowSkills ? (
          <Row active={view === "skills"} className="side-action" onClick={onShowSkills}>
            <技能图标 className="row-icon" />
            <span className="name">{t("技能")}</span>
          </Row>
        ) : null}
        {/**
          * **插件**（2026-08-12，作者要的，放在技能下面）。
          *
          * 与技能、MCP 同一条边界：**这一屏只说真话**。
          * 插件在我们这儿还没有承载体——不像技能（`.dawn/agents/*.md` 本来就能跑）、
          * 也不像 MCP（管道通了、只差界面）。所以它如实说清「还没有」，
          * 并指出**现在能装的能力是哪两样**，而不是摆一个空列表。
          */}
        {onShowPlugins ? (
          <Row active={view === "plugins"} className="side-action" onClick={onShowPlugins}>
            <插件图标 className="row-icon" />
            <span className="name">{t("插件")}</span>
          </Row>
        ) : null}
        {onShowMcp ? (
          <Row active={view === "mcp"} className="side-action" onClick={onShowMcp}>
            <设置图标 className="row-icon" />
            <span className="name">{t("MCP 服务器")}</span>
          </Row>
        ) : null}
        {remote ?? null}
      </div>
      {/**
        * **一条横线**（作者明确要的）。
        *
        * 它把「我能用什么」与「我做过什么」分开。
        * 注：WorkBuddy 那边是靠留白分、一条线都没有——
        * **但那是它的选择，不是作者的**。这里照作者说的做。
        */}
      <hr className="side-divider" />

      {agents.length === 0 ? (
        <div className="pad">
          <p className="hint">{t("配置里还没有可用的 agent")}</p>
          {onOpenSettings ? (
            <Button variant="text" size="inline" onClick={onOpenSettings}>
              {t("去设置")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/**
        * **项目 = 一个工作路径**（不是一个要新建、要选中的对象）。
        *
        * 作者定的第一条：**文件夹即项目身份**——两段对话选了同一个路径，
        * 是「一个项目底下挂两段」，不是两条同名并列项。它要回答的是
        * 「我上次在这个目录聊过什么」，而并列的重名条目回答不了。
        *
        * **一条都没有时整块不出现**：一个写着 `(0)` 的标题占一行、什么都没说。
        */}
      {项目组.length > 0 ? (
        <>
          <p className="side-section">
            {/* **整个收纳也能收起来**（2026-08-15 作者要的）：标题可点，三角靠旋转表达两态 */}
            <Button
              variant="text"
              size="inline"
              className="side-section-toggle"
              aria-expanded={!收起了("项目")}
              onClick={() => 切收起("项目")}
            >
              <三角图标 className={`twisty${收起了("项目") ? "" : " open"}`} />
              {/**
                * 三个收纳各有一个图标，**一眼看得出它们是同级的三样东西**；
                * 而**实心／描边表达的是收起／展开**（2026-08-15 作者要的）：
                * *「点开之后是空心的，这样可以看到开启和压缩之后的差别。」*
                *
                * 这是三角之外的**第二个记号**。冗余在这里是划算的：
                * 三角只有三度旋转的差别，扫一眼容易看漏；虚实是整块面积的差别。
                */}
              {收起了("项目") ? (
                <文件夹图标 className="side-section-icon" />
              ) : (
                <文件夹描边图标 className="side-section-icon" />
              )}
              {t("项目")} <span className="side-count">{项目组.length}</span>
            </Button>
            {/**
              * **入口叫「批量」，不叫「多选」**（2026-08-13）。
              *
              * 会话那一列那颗已经叫「多选」了。两颗同名的话，
              * `getByRole(name)` 会同时指向两个元素——本项目 2026-08-12
              * 一天之内被这件事咬了三次，设计契约里那条
              * 「没有一个按钮文案是另一个的子串」就是它的自动化形式。
              * 「多选项目」也不行：它把「多选」整个包在里面。
              */}
            {onDeleteProjects ? (
              <Button
                variant="text"
                size="inline"
                className="side-bulk"
                /**
                 * **看得见的是「多选」，读屏听见的是「多选项目」**（2026-08-13，
                 * 作者：*「项目里面应该不是批量，应该和会话一样，应该是多选」*）。
                 *
                 * 他是对的：**两处是同一件事，就该同一个名字**。
                 * 上一版把项目那颗改叫「批量」，是为了躲开
                 * 「`getByRole(name)` 会同时指向两个元素」——那是拿**人看的字**
                 * 去解决**机器找元素**的问题，代价付错了地方。
                 *
                 * `aria-label` 才是那个「机器与读屏用的名字」。
                 * 而且它顺带修好了一件事：读屏念到一个孤零零的「多选」，
                 * 本来就说不出它管的是哪一列。
                 */
                aria-label={选项目中 ? t("结束多选项目") : t("多选项目")}
                onClick={() => 进选择("项目")}
              >
                {选项目中 ? t("完成") : t("多选")}
              </Button>
            ) : null}
          </p>
          {选项目中 ? (
            <div className="side-bulkbar">
              <span className="side-bulk-count">已选 {已选!.size}</span>
              <Button
                variant="text"
                size="inline"
                onClick={() =>
                  设多选({
                    列: "项目",
                    集合:
                      已选!.size === 项目组.length
                        ? new Set()
                        : new Set(项目组.map(([路径]) => 路径)),
                  })
                }
              >
                {已选!.size === 项目组.length ? t("全不选") : t("全选")}
              </Button>
              <Button
                variant="text"
                size="inline"
                className="menu-danger"
                disabled={已选!.size === 0}
                onClick={() => {
                  const 要删的 = 项目组
                    .filter(([路径]) => 已选!.has(路径))
                    .map(([路径, 里面的]) => ({
                      workspace: 路径,
                      ...(项目id(里面的) ? { projectId: 项目id(里面的)! } : {}),
                      tasks: 里面的,
                    }))
                  onDeleteProjects?.(要删的, () => 设多选(undefined))
                }}
              >
                {t("删除")}
              </Button>
            </div>
          ) : null}
          {收起了("项目") ? null : (
          <ul className="proj-list">
            {项目组.map(([路径, 里面的]) => {
              const 展开 =
                展开的项目 === 路径 ||
                // **只在人没选过时才自动展开**（见 `展开的项目` 的三态说明）
                (展开的项目 === undefined && 里面的.some((t) => t.taskId === activeTaskId))
              return (
                <li key={路径} className={`proj-item${展开 ? " current" : ""}`}>
                  <div className="proj-head">
                    {选项目中 ? (
                      <input
                        type="checkbox"
                        className="sess-check"
                        checked={已选!.has(路径)}
                        onChange={() => 切一个(路径)}
                        aria-label={tf("选择项目：{0}", 基名(路径))}
                      />
                    ) : null}
                    <Row
                      active={展开}
                      onClick={() => (选项目中 ? 切一个(路径) : 设展开(展开 ? null : 路径))}
                    >
                      <span className="sess">
                        <span className="name">
                          {/* 展开标记：**它同时是「这里面还有东西」的唯一提示** */}
                          <三角图标 className={`twisty${展开 ? " open" : ""}`} />
                          <项目图标 />
                          {基名(路径)}
                        </span>
                        {/* 全路径常驻一行：**同名文件夹到处都是**，只写 basename 分不出哪个是哪个 */}
                        <span className="sub" title={路径}>{短路径(路径)}</span>
                      </span>
                    </Row>
                    {/**
                      * **在这个项目里再开一段**（T3-a 保留下来的）。
                      *
                      * 没有它，往同一个文件夹加第二段对话就得
                      * 「新建任务 → 再把同一个路径选一遍」——**它已经知道路径了**。
                      *
                      * 措辞刻意避开「新建任务」四个字：侧栏顶上那颗就叫这个，
                      * 两处同名会让「按名字找按钮」变成靠运气的事，
                      * 读屏与测试都一样。2026-08-11 撞过一次。
                      */}
                    <div className="row-actions">
                      {onNewTaskIn ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="row-more"
                          aria-label={tf("在「{0}」里开一段新对话", 基名(路径))}
                          onClick={() => onNewTaskIn(路径)}
                        >
                          <加号图标 />
                        </Button>
                      ) : null}
                      {/**
                        * **删除项目留在这一行上**（作者 2026-08-11 要的）。
                        *
                        * *「删除项目的话，项目里面包含的之前的所有对话，则都删除掉了。」*
                        * 项目在新模型里是**从路径长出来的**，但这个动作不是——
                        * 它要收掉的是那些对话，而**磁盘上的文件一个都不动**
                        * （路径是用户自己选的目录，绝对不能删）。
                        *
                        * projectId 从它下面第一段会话上取：任务只记路径，
                        * **不重复记一份项目 id**——两处记同一件事迟早不一致。
                        */}
                      {onDeleteProject && 项目id(里面的) ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="row-more"
                          aria-label={tf("删除项目：{0}", 基名(路径))}
                          onClick={() => onDeleteProject(项目id(里面的)!)}
                        >
                          <删除图标 />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {展开 ? (
                    <ul className="proj-session-list">
                      {/* **不可勾**：会话那一轮多选管不着项目底下的行，见 `任务行` 的注 */}
                      {里面的.map((t) => 任务行(t, false))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
          )}
        </>
      ) : null}

      {/**
        * **服务器自成一列**（2026-08-14，作者要的）。
        *
        * 作者：*「我们可以再增加一个服务器的会话，这样服务器的会话就可以进行归类了。」*
        *
        * 它排在项目与会话之间：**远端的东西不属于本地项目那一列**——
        * 混在一起时，「这段活干在哪台机器上」要点进去才知道，
        * 而那正是这一列存在的理由。
        *
        * **名字取不到就显示连接 id**：编一个「未命名服务器」出来，
        * 与「这台服务器就叫这个」在屏幕上分不开。
        */}
      {服务器组.length > 0 ? (
        <>
          <p className="side-section">
            {/**
              * **带图标**（2026-08-14 作者要的）。
              * 它与「项目」「会话」是并列的三个收纳，图标让这一点一眼可见。
              */}
            <Button
              variant="text"
              size="inline"
              className="side-section-toggle"
              aria-expanded={!收起了("服务器")}
              onClick={() => 切收起("服务器")}
            >
              <三角图标 className={`twisty${收起了("服务器") ? "" : " open"}`} />
              {/* 实心＝收起、描边＝展开，与另外两个收纳同一套 */}
              {收起了("服务器") ? (
                <服务器图标 className="side-section-icon" />
              ) : (
                <服务器描边图标 className="side-section-icon" />
              )}
              {t("服务器")} <span className="side-count">{服务器组.length}</span>
            </Button>
            {/**
              * **看得见的是「多选」，读屏听见的是「多选服务器」**——
              * 与项目、会话那两颗同一副做法（2026-08-13 定的）：
              * 三处是同一件事就该同一个名字，而
              * `getByRole(name)` 是子串匹配，所以**可及名字必须互不为子串**
              * （「多选项目」「多选会话」「多选服务器」谁也不是谁的子串）。
              */}
            {onDeleteMany ? (
              <Button
                variant="text"
                size="inline"
                className="side-bulk"
                aria-label={选服务器中 ? t("结束多选服务器") : t("多选服务器")}
                onClick={() => 进选择("服务器")}
              >
                {选服务器中 ? t("完成") : t("多选")}
              </Button>
            ) : null}
          </p>
          {/**
            * 选择模式下那一条：**已选几段、全选、删除**。
            * 数字常驻——按下之前就该知道自己要删掉几个。
            */}
          {选服务器中 ? (
            <div className="side-bulkbar">
              <span className="side-bulk-count">{tf("已选 {0}", String(已选!.size))}</span>
              <Button
                variant="text"
                size="inline"
                onClick={() =>
                  设多选({
                    列: "服务器",
                    集合:
                      已选!.size === 服务器可批量的.length
                        ? new Set()
                        : new Set(服务器可批量的.map((x) => x.taskId)),
                  })
                }
              >
                {已选!.size === 服务器可批量的.length ? t("全不选") : t("全选")}
              </Button>
              <Button
                variant="text"
                size="inline"
                className="danger"
                disabled={已选!.size === 0}
                onClick={() =>
                  onDeleteMany?.(
                    服务器可批量的.filter((x) => 已选!.has(x.taskId)),
                    () => 设多选(undefined),
                  )
                }
              >
                {t("删除")}
              </Button>
            </div>
          ) : null}
          {/**
            * **一个收纳，里面再列各台机器**（2026-08-14 改的形状）。
            *
            * 上一版做成了「每台服务器各自一个分区标题」——作者看过之后指出那是错的：
            * *「会话有一个收纳叫做会话，项目有一个收纳叫做项目，
            * 其实服务器有一个收纳，那就叫服务器。」*
            *
            * 差别在屏幕上很大：机器一多，那种做法会摊出好几个平级标题；
            * 而「项目」那一列不管几个项目都只占一个标题。
            */}
          {收起了("服务器") ? null : 服务器组.map(([connectionId, 些]) => (
            <div key={connectionId} className="side-server">
              {/**
                * **每台机器都能收起来**（2026-08-15 作者要的）。
                * 照项目那一列的做法：整行可点，三角靠旋转表达两态——
                * 两个不同的字形会让展开看起来像换了个东西。
                */}
              {/**
                * **一行两样：可点的标题 + 整台的勾选框**（2026-08-15 作者要的位置）。
                *
                * 作者：*「IP 整体选中的时候，选择框应该在 IP 的后面，现在不在一个水平线上。」*
                *
                * 勾选框**不能塞进那颗按钮里**——`<input>` 嵌在 `<button>` 里是无效的，
                * 而且点它会连带触发折叠。所以外面套一行，两者并排、同一条基线。
                */}
              <div className="side-subhead-row">
                <Button
                  variant="text"
                  size="inline"
                  className="side-subhead"
                  aria-expanded={!收起了(connectionId)}
                  onClick={() => 切收起(connectionId)}
                >
                  <三角图标 className={`twisty${收起了(connectionId) ? "" : " open"}`} />
                  {/* **名字取不到就显示 id**：编一个占位名与「它就叫这个」分不开 */}
                  <span className="name">{服务器名?.(connectionId) ?? connectionId}</span>
                  <span className="side-count">{些.length}</span>
                </Button>
                {/**
                  * **多选时整台也能选**（2026-08-15 作者要的：
                  * *「服务器的多选，也可以删除不同的 IP，现在仅仅是一个 IP 下的不同会话」*）。
                  *
                  * 勾这一台 = 勾上它底下的全部。**半选状态如实画成 indeterminate**——
                  * 只勾了其中两段却显示成全勾，人会以为按删除会删掉整台。
                  */}
                {选服务器中 ? (
                  <input
                    type="checkbox"
                    className="sess-check"
                    checked={些.every((x) => 已选!.has(x.taskId))}
                    ref={(el) => {
                      if (el) {
                        const 勾了 = 些.filter((x) => 已选!.has(x.taskId)).length
                        el.indeterminate = 勾了 > 0 && 勾了 < 些.length
                      }
                    }}
                    onChange={() =>
                      设多选((前) => {
                        const 集合 = new Set(前?.集合 ?? [])
                        const 全在 = 些.every((x) => 集合.has(x.taskId))
                        for (const x of 些) {
                          if (全在) 集合.delete(x.taskId)
                          else 集合.add(x.taskId)
                        }
                        return { 列: "服务器", 集合 }
                      })
                    }
                    aria-label={tf("选择这台服务器：{0}", 服务器名?.(connectionId) ?? connectionId)}
                  />
                ) : null}
              </div>
              {收起了(connectionId) ? null : (
                <ul className="server-session-list">{些.map((t) => 任务行(t, true))}</ul>
              )}
            </div>
          ))}
        </>
      ) : null}

      {/**
        * **会话 = 没给路径的那些。**
        *
        * 缺席不是「缺了什么」，是「这是一段普通对话」——所以这一列里
        * **一个路径占位符都不写**。作者的原话：*「如果在任务里面不设置任何
        * 工作目录的话，那么其实就是我们的普通对话。」*
        */}
      {散的.length > 0 ? (
        <>
          <p className="side-section">
            <Button
              variant="text"
              size="inline"
              className="side-section-toggle"
              aria-expanded={!收起了("会话")}
              onClick={() => 切收起("会话")}
            >
              <三角图标 className={`twisty${收起了("会话") ? "" : " open"}`} />
              {/* 实心＝收起、描边＝展开，与另外两个收纳同一套 */}
              {收起了("会话") ? (
                <对话图标 className="side-section-icon" />
              ) : (
                <对话描边图标 className="side-section-icon" />
              )}
              {t("会话")} <span className="side-count">{散的.length}</span>
            </Button>
            {/**
              * **「选择」在分区标题上**（2026-08-12）。
              *
              * 它管的是这一整列，所以它的家在这一列的标题上，不在某一行里。
              * **常驻，不做悬停才出现**——本项目为此被报过两次「没有这个功能」。
              */}
            {onDeleteMany ? (
              <Button
                variant="text"
                size="inline"
                className="side-bulk"
                /* 与项目那颗同一副做法：字一样，`aria-label` 说清管的是哪一列 */
                aria-label={选会话中 ? t("结束多选会话") : t("多选会话")}
                onClick={() => 进选择("会话")}
              >
                {选会话中 ? t("完成") : t("多选")}
              </Button>
            ) : null}
          </p>
          {/**
            * 选择模式下的那一条：**已选几段、全选、删除**。
            *
            * 数字常驻：*「删掉 3 段对话」*比*「删掉选中的」*可判断得多——
            * 按下之前就该知道自己要删掉几个。
            */}
          {选会话中 ? (
            <div className="side-bulkbar">
              <span className="side-bulk-count">已选 {已选!.size}</span>
              <Button
                variant="text"
                size="inline"
                onClick={() =>
                  设多选({
                    列: "会话",
                    集合:
                      已选!.size === 可批量的.length
                        ? new Set()
                        : new Set(可批量的.map((x) => x.taskId)),
                  })
                }
              >
                {已选!.size === 可批量的.length ? t("全不选") : t("全选")}
              </Button>
              <Button
                variant="text"
                size="inline"
                className="menu-danger"
                disabled={已选!.size === 0}
                onClick={() => {
                  const 要删的 = 可批量的.filter((x) => 已选!.has(x.taskId))
                  onDeleteMany?.(要删的, () => 设多选(undefined))
                }}
              >
                {t("删除")}
              </Button>
            </div>
          ) : null}
          {收起了("会话") ? null : (
            <ul className="session-list">{散的.map((t) => 任务行(t, true))}</ul>
          )}
        </>
      ) : null}


      {/**
        * **搜了却什么都没有，要说出来**（2026-08-13）。
        *
        * 不说的话，屏幕上是「新建任务 / 技能 / …」加一条横线，底下空空——
        * 与「一条对话都还没有」长得一模一样。
        * **两处长得一样的东西，等于没有判据。**
        */}
      {词 !== "" && 项目组.length === 0 && 散的.length === 0 && 服务器组.length === 0 ? (
        <p className="side-empty">{tf("没有匹配「{0}」的项目或会话", search!.value.trim())}</p>
      ) : null}

      {/**
        * 底部那一组入口（**2026-08-12 收进一个盒子**）。
        *
        * 它们原先是三个各自带 `margin-top: auto` 的兄弟。
        * 会话列表撑满剩余高度时看不出问题；T3-a 之后列表**空着就一行不占**，
        * 于是那点剩余空间被三个 `auto` **各分了一份**——
        * 「项目概览 / 文件 / 设置」在侧栏上摊成了三段，中间空出两大块。
        *
        * 收进一个盒子，`auto` 只留一个：它们仍然贴着底，彼此挨着。
        */}
      <div className="side-bottom">
        {/* 项目面板与文件都降为侧栏底部的入口，不再是首页 */}
        {active ? (
          <>
            {/* **再点一次就回去**：一个亮着的入口点下去毫无反应，人会以为它坏了 */}
            <Row active={view === "panel"} className="panel-entry" onClick={onShowPanel}>
              {t("项目概览")}
            </Row>
            {/* 文件：**产出栏点文件名是主入口**，这里是「agent 没碰过的东西只能靠翻」那条路 */}
            <Row active={view === "files"} className="panel-entry" onClick={onShowFiles}>
              {t("文件")}
            </Row>
          </>
        ) : null}
      {/**
        * **设置常驻，不跟着项目走**（2026-08-12 挪出那个条件，T3-a 顺手修的）。
        *
        * 它原本与「项目概览 / 文件」一起挂在 `active ?` 里面——
        * 那在旧模型下勉强成立（启动就保证有一个默认项目）。
        * 新模型下一段普通对话**没有用户项目**，于是设置整个消失，
        * 而状态栏那句提示还写着「去『设置 → 模型服务』加一个」——
        * **一句指路的话，指向一个不存在的入口**。
        *
        * 「项目概览 / 文件」留在条件里是对的：没有工作路径时它们确实无处可看。
        */}
        {onOpenSettings ? (
          <Row active={settingsActive ?? false} className="panel-entry" onClick={onOpenSettings}>
            {t("设置")}
          </Row>
        ) : null}
      </div>
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
              <三角图标 className={`twisty${current ? " open" : ""}`} />
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
              aria-label={tf("在「{0}」里开一段新对话", project.name)}
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
              aria-label={tf("删除项目：{0}", project.name)}
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
  onConfigure,
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
   * 「这里没有我要的」的去处（2026-08-13，作者提：*「新建任务页面对话框里面
   * 选择 LLM 的地方，也要加一个配置自定义模型」*）。
   *
   * 对话里那颗 `ModelPill` 早就有这一条了，**而空态这颗没有**——
   * 于是「我想加一家」这件事在首页上唯一的出路是自己想到去翻设置。
   * 同一个需求在两个屏上应该有同一个出口。
   *
   * **不给就不画那一条**：不摆一个点了没反应的入口。
   */
  onConfigure?: (() => void) | undefined
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
        {triggerLabel ?? currentLabel ?? (current ? (label ? label(current) : current) : t("选择 agent"))}
        {kind ? <span className="kind">{KIND_LABEL[kind]}</span> : null}
        <下拉图标 />
      </Button>

      {open ? (
        <div
          className="agent-menu"
          role="menu"
          aria-label={services && services.length > 0 ? t("切换服务或新建会话") : t("新建会话")}
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
              <p className="agent-menu-head">{t("就地换服务（对话不断）")}</p>
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
                      {sv.name === currentLabel ? <span className="hint">{t("当前")}</span> : null}
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
          <p className="agent-menu-head">{t("新建会话，用哪个 LLM：")}</p>
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
                  {a === current ? <span className="hint">{t("当前")}</span> : null}
                </Row>
              </li>
            ))}
          </ul>
          </div>
          {/**
            * **底一条把「这里没有我要的」接到「去哪加一个」**（2026-08-13）。
            * 与对话里那颗 `ModelPill` 底下那条是同一句话、同一个去处——
            * 一个需求在两个屏上不该有两种答案。
            */}
          {onConfigure ? (
            <div className="model-menu-foot">
              <Button
                variant="text"
                size="inline"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onConfigure()
                }}
              >
                {t("配置自定义模型")}
              </Button>
            </div>
          ) : null}
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
  serviceLabel,
  onConfigure,
  kind,
}: {
  /** 能换到哪些。native 会话是「所有配好的服务 × 各自的模型」 */
  choices: readonly ModelChoice[]
  /** 当前这一轮用的是谁。**provider 也要**——两家可以有同名模型 */
  current: { provider?: string | undefined; model: string } | undefined
  /** agent 还在说话。**用我们自己的判定，不问 pi** */
  busy?: boolean | undefined
  onPick: (choice: ModelChoice) => void
  /** provider id → 该怎么称呼（`deepseek` → `DeepSeek`）。缺省时用 id */
  serviceLabel?: ((providerId: string) => string) | undefined
  /** 「配置自定义模型」通向哪。**不给就不画那一条**——不摆点了没反应的入口 */
  onConfigure?: (() => void) | undefined
  /**
   * 这段会话是哪一类。**只在不是内置时标出来**——
   * 它决定了能不能就地换服务、模型清单从哪来、「CLI 默认」是什么意思。
   */
  kind?: SessionSummary["kind"] | undefined
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
   * 那条件逼着配置去钉一个 `model`，而钉模型会**覆盖用户自己 CLI 的配置**。
   * 当前未知时如实标「CLI 默认」——**那是实情，不是缺陷**。
   */
  if (choices.length === 0) return null

  const 同一条 = (c: ModelChoice) => c.model === current?.model && c.provider === current?.provider
  const 叫什么 = (p: string | undefined) => (p ? (serviceLabel?.(p) ?? p) : "CLI")

  /**
   * **按服务分组**（2026-08-12）。
   *
   * 合并成一颗 pill 之后，「哪家」不再由旁边那颗说了——它得在这个列表里说。
   * 分组标题是唯一说得出这件事的地方：`kimi-k3` 与 `deepseek-v4` 并排列着，
   * 不分组的话没人知道换过去意味着换了一家。
   *
   * **保持 `choices` 的原始顺序**，只是把同一家的收拢到一起：
   * 那个顺序是后端给的（配置里的顺序），重排等于替用户做决定。
   */
  const 分组: { provider: string | undefined; items: ModelChoice[] }[] = []
  for (const c of choices) {
    const 已有 = 分组.find((g) => g.provider === c.provider)
    if (已有) 已有.items.push(c)
    else 分组.push({ provider: c.provider, items: [c] })
  }

  return (
    <div className="pill model-pill" ref={box}>
      {/**
        * **一颗 pill，不是两颗**（2026-08-12，作者指的那件）。
        *
        * 实测 WorkBuddy 的输入卡右下角只有一颗 `◐ Hy3 ⌃`；我们此前摊着
        * 「哪家」与「哪个模型」两颗，而**它们回答的是同一个问题**。
        *
        * 触发器上写模型名、前面一个服务标记：**哪家由那个标记说**，
        * 不再写两遍——两处一旦不同步就是互相打架的两句话。
        */}
      <Button
        variant="ghost"
        size="sm"
        className="model-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tf("当前模型：{0}。点击切换", current?.model ?? t("CLI 默认"))}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="svc-mark" aria-hidden="true">
          {叫什么(current?.provider).slice(0, 1).toUpperCase()}
        </span>
        <span className="model-name">{current?.model ?? t("CLI 默认")}</span>
        <三角图标 className={`model-caret${open ? " open" : ""}`} />
      </Button>

      {open ? (
        <div
          className="model-menu"
          role="menu"
          aria-label={t("切换模型")}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false)
          }}
        >
          {/**
            * **就地换，不新建对话**——这句话是 2026-08-11 那次改动的一半：
            * 作者原本以为换一家就得新建对话，因为唯一摆在眼前的入口是那个意思。
            */}
          {busy ? <p className="hint pad">{t("这一轮还没说完，先等它结束或中止")}</p> : null}
          <ul className="model-list">
            {分组.map((g) => (
              <li key={g.provider ?? "cli"} className="model-group">
                {/* **组头说的是「哪家」**：合并成一颗之后，这是唯一说得出它的地方 */}
                <p className="model-group-head">{叫什么(g.provider)}</p>
                <ul>
                  {g.items.map((c) => (
                    <li key={`${c.provider ?? ""}/${c.model}`}>
                      <Row
                        role="menuitem"
                        active={同一条(c)}
                        aria-disabled={Boolean(busy)}
                        onClick={() => {
                          if (busy) return
                          setOpen(false)
                          onPick(c)
                        }}
                      >
                        <span className="svc-mark" aria-hidden="true">
                          {叫什么(c.provider).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="name">{c.model}</span>
                        {/**
                          * **当前那条打勾，且同时留一个字**——
                          * 「只用形状表达含义是不够的」，读屏拿不到一个 ✓ 的意思。
                          */}
                        {同一条(c) ? <span className="sr-only">{t("当前")}</span> : null}
                        {同一条(c) ? <勾图标 className="model-check" /> : null}
                      </Row>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {/**
            * **配置自定义模型**（2026-08-12，学自 WorkBuddy 那个浮层的底一条）。
            *
            * 它把「这里没有我要的那个」接到「去哪加一个」——
            * 没有这一条，人只能自己想到去设置里翻。
            */}
          {onConfigure ? (
            <div className="model-menu-foot">
              <Row
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onConfigure()
                }}
              >
                <铅笔图标 className="row-icon" />
                <span className="name">{t("配置自定义模型")}</span>
              </Row>
            </div>
          ) : null}
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
    const 计时 = setTimeout(() => 设态("闲"), 2000)
    return () => clearTimeout(计时)
  }, [态])
  return (
    <Button
      variant="ghost"
      size="icon"
      className="copy-btn"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => 设态("好了"))
          .catch(() => 设态("不行"))
      }}
    >
      {/**
        * **成败用字说，静止态用图标。**
        * 「只用形状表达含义是不够的」——一个变了的图形说不清成没成，
        * 而下面那个 `.sr-only` 是给读屏的，眼睛也需要同样的信息。
        */}
      {/**
        * **按钮永远是图标，提示浮在旁边**（2026-08-14，作者定的形态）。
        *
        * 上一版是把图标换成「已复制」三个字——而按钮是按图标尺寸排的，
        * 内容盒只有 20px 而那三个字要 45.6px（实测），于是字**溢到按钮外面**，
        * 看起来像竖着排了一列。作者：*「实在是太丑陋了。」*
        *
        * 换成浮层之后**按钮宽度再也不变**，那个挤压问题从根上不存在了。
        */}
      <span aria-hidden="true">
        <复制图标 />
      </span>
      {态 !== "闲" ? (
        <span className={`copied-toast${态 === "不行" ? " bad" : ""}`} aria-hidden="true">
          {态 === "好了" ? t("已复制") : t("复制不了")}
        </span>
      ) : null}
      {/* 读屏要听得到结果，不能只有一个变了的图形 */}
      <span className="sr-only">{态 === "好了" ? t("已复制") : 态 === "不行" ? t("复制不了") : label}</span>
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
        <三角图标 className={`caret${open ? " open" : ""}`} />
        {/* **秒数放在方块里**：它是这一行里唯一会动的东西，要好认 */}
        <span className="thought-secs">{秒}s</span>
        {/**
         * **「正在思考」只说一遍**（2026-08-12 修）。
         *
         * 上一版这里写了「正在思考」，而下面那个动画自带一句给读屏的
         * 「正在思考」——作者截图里因此出现了两行一模一样的字。
         * 动画那句留着（读屏要听得到状态），文字这句换个说法。
         */}
        <span className="thought-label">{在想 ? t("思考中") : t("想了一下")}</span>
        {在想 ? <Thinking /> : null}
      </Button>
      {open ? <div className="thought-body">{text}</div> : null}
    </div>
  )
}

/**
 * 「还在等」这条记号（2026-08-14 重做）。
 *
 * **它会走秒。** 作者：*「我也可以看到 模型思考 1s 2s --- 53s 的这种感觉。」*
 * 一个不动的转圈无法回答「它是慢，还是卡住了」——而那正是人盯着屏幕时
 * 唯一想知道的事。秒数从**按下发送**那一刻数起，不是从某个内部事件。
 *
 * 模型开始思考之后这条记号**不撤**，只是换句话说：
 * 思考块是过程不是结果，撤掉它等于宣布「好了」，而屏幕上还什么都没有。
 */
function 等着({ 从, 在想 }: { 从: number; 在想: boolean }) {
  const now = useTick(true)
  const 秒 = Math.max(0, Math.round((now - 从) / 1000))
  return (
    <div className="waiting">
      {/* `Loader` 的 label 是必填的：**说不出在等什么的加载指示等于没说** */}
      <Loader label={在想 ? t("模型正在思考") : t("正在等模型回话")} />
      {/* **秒数与思考块里那个同一个样式**：它们是同一件事的两段 */}
      <span className="thought-secs">{秒}s</span>
    </div>
  )
}

/**
 * 这一整段对话的用量（2026-08-12）。
 *
 * 数据就在手上——每一轮的 `usage` 都在 transcript 里，**不必另外去问后端**。
 * 少一次请求，也少一处会与对话对不上的数。
 */
function SessionUsage({ items }: { items: readonly TranscriptItem[] }) {
  const 合 = useMemo(() => {
    let input = 0
    let output = 0
    let cache = 0
    let 有过 = false
    for (const it of items) {
      if (it.type !== "turn" || !it.usage) continue
      有过 = true
      input += it.usage.input ?? 0
      output += it.usage.output ?? 0
      cache += it.usage.cacheRead ?? 0
    }
    return 有过 ? { input, output, cache } : undefined
  }, [items])

  // **一轮都还没说过话时什么都不显示**：一排 0 会被读成「不花钱」
  if (!合) return null
  return (
    <span className="session-usage" title={t("这一整段对话累计")}>
      本次 输入 {formatTokens(合.input)} · 输出 {formatTokens(合.output)} · 缓存{" "}
      {formatTokens(合.cache)}
    </span>
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
  onPickModel,
  onAbort,
  disabled,
  terminalTrimmed,
  kernelInstanceId,
  workspace,
  onPickWorkspace,
  serviceLabel,
  onOpenSettings,
}: {
  session: SessionSummary
  /**
   * 这段对话的工作目录（T3-b）。**缺省 = 没设 = 这是一段普通对话**。
   *
   * 它来自**任务**，不是会话——会话总有一个目录（服务端给的 scratch），
   * 而那个目录是实现细节。摆出来只会让人看见一个自己从没选过的路径。
   */
  workspace?: string | undefined
  /** 去弹原生目录选择器（设一个 / 换一个）。**不给就不画那颗按钮** */
  onPickWorkspace?: (() => void) | undefined
  /** provider id → 该怎么称呼（`deepseek` → `DeepSeek`）。模型 pill 的分组标题用它 */
  serviceLabel?: ((providerId: string) => string) | undefined
  /** 「配置自定义模型」通向哪。**不给就不画那一条** */
  onOpenSettings?: (() => void) | undefined
  /** 可选的 agent 清单，给 composer 右下角那颗 pill 用 */
  agents?: readonly string[] | undefined
  /** 用另一个 agent 新建会话。**不是就地切换**——agentId 建会话时绑死 */
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
  /**
   * @param images 随这一轮送进模型的图片（协议 4.13）。
   *   两个来源：从磁盘挑的给 `path`，粘贴板里的给 `bytes`。
   *   **不给或空数组是同一个意思。**
   */
  /**
   * **返回一个 Promise 就能被等**（2026-08-13）。
   *
   * 之前它是 `void`：发失败时输入框已经清空、附件已经丢掉，
   * 而失败只在别处留下一条容易错过的提示——**人看见的是「什么都没发生」**。
   * 作者报的正是这个（*「粘贴一个图片……但是没有任何反应呢」*）。
   *
   * 能等，就能在失败时**把字和图原样还回去**，并且把原因摆在输入卡旁边。
   */
  /**
   * @param behavior 上一轮**还在跑**时这一条怎么进去（协议 5.6，2026-08-15）：
   *   `steer` 插队、`followUp` 排队。不忙时不给。
   */
  onSend: (
    text: string,
    images?: readonly 图片来源[],
    behavior?: "steer" | "followUp",
  ) => void | Promise<void>
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
  /**
   * 挑好还没发出去的图（协议 4.12，2026-08-13）。
   *
   * **不进 `$drafts`**：那份按会话分家的是文字。图片是「这一次要发的东西」，
   * 发出去就没了——它的生命周期比草稿短，混在一起只会让「切回来草稿还在、
   * 图却已经发过了」这种事变得可能。
   */
  const [待发图, 设待发图] = useState<待发的图[]>([])
  /** 有东西正拖在这张卡上。**看得见才知道松手会发生什么** */
  const [拖着, 设拖着] = useState(false)
  /** 上一次发送为什么没成。**摆在输入卡旁边**，不是丢进某个角落的提示 */
  const [发送出错, 设发送出错] = useState<string | undefined>(undefined)
  /**
   * 这一次提交要的是**排队**还是**插队**（2026-08-15）。
   *
   * **用 ref 不用 state**：`requestSubmit()` 是同步的，提交处理器紧接着就跑，
   * 而 state 要等下一次渲染才更新——那时这一条早就发出去了。
   * 每次提交后清回 false：默认是插队（回车），排队要按住 Cmd/Ctrl。
   */
  const 排队ref = useRef(false)
  const 存草稿 = useRef("")
  // 换会话就归位——**在别人的历史里翻到一半，那个位置没有意义**
  useEffect(() => 设位置(-1), [session.sessionId])

  /**
   * **「发出去了，还没回来」那段的记号**（2026-08-13 重做，作者要的：
   * *「kimi 的回复其实略微有点儿慢，导致我以为是端口卡住了，
   * 你其实可以给我一个动态响应的图，让我知道这个对话是在的。」*）。
   *
   * ## 2026-08-10 做过一次，被撤掉了
   *
   * 那一版靠「最后一条是自己说的」判断——**而这个条件在回复到达之后
   * 仍然成立过一会儿**，症状是回来了那三个点还在转。
   * 「一个永远在转的记号比没有更糟」是本项目自己写下的话。
   *
   * ## 这一版换了判据：**有确定的起点，也有确定的终点**
   *
   * 起点是「我刚把一句话发出去」（那一刻只有这里知道）；
   * 终点是**「我发出去之后，又有新东西冒出来了」**——
   * 不管那是回复、是工具调用、还是一条 notice。
   *
   * 它不靠「最后一条是谁的」去推断，所以不会因为顺序或时序而挂住；
   * 而且**换会话时无条件清掉**——别人的历史里不该留着我的等待。
   */
  const [等回话, 设等回话] = useState<number | undefined>(undefined)
  /** 按下发送的那一刻。**秒数从这里数起**——人等的是从他按下开始的那段 */
  const [等回话时刻, 设等回话时刻] = useState(() => Date.now())
  /**
   * 人主动喊过停。**它挡住「从转录推导」那条**——
   * 停下来之后转录里最后一条仍是用户那句，不挡就会被重新推成「在等」。
   * 下一次发送时清掉。
   */
  const [喊停过, 设喊停过] = useState(false)
  useEffect(() => {
    设等回话(undefined)
    设喊停过(false)
  }, [session.sessionId])
  useEffect(() => {
    // **新东西冒出来了就收**：`发出去时的条数 + 我自己那一条` 之后再多，就是对面动了
    const 最后 = items[items.length - 1]
    /**
     * **从转录推导「在不在等」**（2026-08-14 作者报的）。
     *
     * 此前只有对话里那个输入框会 `设等回话`，而**第一句走的是空态那条路**
     * （`App.tsx` 的 `新建任务` → `writeToSession`），对话视图是随后才挂载的。
     * 于是第一句永远没有等待记号——作者：*「界面没有任何的变化，
     * 我甚至以为是对话死掉了。」*
     *
     * 更坏的是它还牵出第二个 bug：`busy` 也因此为假，
     * 发送按钮没变成停止，**人可以再发一次**，pi 当场回
     * `Agent is already processing`。**两个症状，同一个根。**
     *
     * 记一笔这种做法，只要多一条发送路径就会漏一次；而「最后一条是用户发言」
     * 是**转录自己说得出来的事实**，哪条路发的都算数。
     */
    const 转录在等 = 最后?.type === "turn" && 最后.who === "user"
    if (等回话 === undefined) {
      if (转录在等 && !喊停过) {
        设等回话(items.length - 1)
        设等回话时刻(Date.now())
      }
      return
    }
    /**
     * **等到「有东西可读」，不是「有新条目」**（2026-08-14 作者报的）。
     *
     * 上一版的判据是 `items.length > 等回话 + 1`——只要冒出**任何**新条目就撤销。
     * 而带思考的模型，第一个到达的往往是**思考块**，且它整块完成后才落地。
     * 于是屏幕上是这样：等待动画消失 → 弹出一行「53s 想了一下」→
     * 而真正的回答还没开始。作者的原话：
     * *「等待模型响应的动作结束之后，结果还没有映射完，我其实是在等待 DAWN 的回复。」*
     *
     * 现在只认**agent 说出了字**：思考块、工具调用都不算数——
     * 它们是过程，不是结果。
     *
     * **内核会话的「说出字了」是一条输出**（2026-08-15 实测补的）。
     *
     * 内核吐的是 `kernelOutput`，一条 `turn` 都不会有。于是上面那个判据
     * **永远为假**：`print('PROBE', 1+1)` 的结果早就显示在屏幕上了，
     * 那个「正在等模型回话」还在转——探针实测 `等待记号还在: 1`。
     * 而这个文件自己写过：**一个永远在转的记号比没有更糟**。
     *
     * 它同时是 `busy` 恒为真的来源。今天不显形只因为内核会话没有 `onAbort`，
     * 界面从不显示「停止」；但守卫只要挂在 `busy` 上就会误伤它——
     * 2026-08-15 已经当场误伤过一次，两条内核 e2e 全红。
     *
     * `status` 不进转录（它是执行状态不是输出），所以这里不必再筛一次：
     * **能进转录的每一条 `kernelOutput` 都是「有东西可读」**。
     */
    const 说出字了 = items
      .slice(等回话)
      .some(
        (i) =>
          (i.type === "turn" && i.who === "agent" && (i.text ?? "").length > 0) ||
          i.type === "kernelOutput",
      )
    if (说出字了) 设等回话(undefined)
  }, [items, 等回话, 喊停过])

  /**
   * agent 还在说话（最后一条 turn 未收尾），**或者刚发出去还没回音**。
   *
   * 两种都算「这一轮在跑」：停止按钮、模型菜单的禁用都据它——
   * 而**等回音的那段恰恰是最想按停止的时候**。
   */
  const 说着 = items.some((i) => i.type === "turn" && i.who === "agent" && !i.final)
  /**
   * 等待期间模型已经在思考了没有。
   *
   * **两件事合成一条指示**（2026-08-14 作者要的）：
   * *「等待模型响应 以及 模型思考过程，其实可以一起展示给我。」*
   * 分成两个记号的话，思考块一落地等待记号就该消失，而那正是
   * 「等待结束了、结果却还没出来」的来源。
   */
  const 正在想 =
    等回话 !== undefined &&
    items
      .slice(等回话)
      // **思考不是独立条目，它挂在 turn 上**（协议 `thinking` / `thinkingMs`）
      .some((i) => i.type === "turn" && i.who === "agent" && (i.thinking ?? "").length > 0)

  const busy = 说着 || 等回话 !== undefined
  /**
   * 框里有没有东西可发。**只有图也算**（协议 4.12）：
   * 「看看这张图」这种意图人常常懒得打字。
   */
  const 有东西要发 = draft.trim().length > 0 || 待发图.length > 0

  return (
    <div className="conversation">
      {/* agent 名与 kind 已经搬到 composer 的 pill 里——**一个事实只显示一次**。
          这里留下的是会话生死与中止入口，它们属于顶部 */}
      <header className="conv-head">
        {/* 会话标题：**人一进来最想知道的是「我在哪段对话里」** */}
        <h1 className="conv-title">{session.title ?? t("新对话")}</h1>
        {/**
          * **不是内置那条时说一声**（2026-08-12）。
          *
          * 「这段会话是外部 CLI / 终端 / 内核，还是内置 API」——
          * 它决定了能不能就地换服务、模型清单从哪来、「CLI 默认」是什么意思。
          *
          * 摆在**对话头上**而不是模型 pill 上：它是**这段会话的属性**，
          * 与「现在用哪个模型」不是一回事；而且模型清单为空时那颗 pill
          * 整个不画，挂在它上面等于「有时说有时不说」。
          *
          * **只在非内置时出现**：内置是常态，常态不占位。
          */}
        {session.kind !== "native" ? (
          <>
            {/**
              * **是哪个 agent 也要说**（2026-08-12）。
              *
              * 对外部 CLI / 终端 / 内核这几类，「claude」还是「codex」
              * 决定了对话里发生什么——而它们**没有 provider**，
              * 模型 pill 上那个服务标记说不出来。
              *
              * 而且这一条守着一个更要紧的不变式：**显示的东西跟着
              * 当前这段会话走，不是某个全局值**——并排开两段对话时，
              * 各自显示各自的（`session-rehome` 那条用例盯的就是它）。
              */}
            <span className="conv-agent">
              {agentLabel ? agentLabel(session.agentId) : session.agentId}
            </span>
            <span className="kind">{KIND_LABEL[session.kind]}</span>
          </>
        ) : null}
        {/**
         * **这一整段对话花了多少**（2026-08-12，作者要的）。
         *
         * 他先问每一轮那个「共 N」是什么意思，然后说：*「其实我想展示的是
         * 某次对话，我们消耗了多少 token。」* ——那才是要对的账。
         *
         * **三项分开列，不合成一个数**：合成需要先确定「`输入` 里是否已经
         * 含了 `缓存`」——各家口径不同，我还没验过。
         * **一个口径不明的合计，比没有合计更容易让人算错账。**
         */}
        <SessionUsage items={items} />
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
        {/**
         * **顶栏左边是这段对话的名字**（2026-08-12，学自 WorkBuddy）。
         *
         * 此前这里挂的是一个 `alive` —— **那是给开发者看的状态字**，
         * 不该出现在成品里；而人一进来最想知道的是「我在哪段对话里」。
         *
         * **只在不正常时才说状态**：活着是常态，把常态写在屏幕上等于噪声；
         * 而「已结束」是必须说的（规格 7.5：失败与终止不许静默）。
         */}
        {session.state === "alive" ? null : (
          <span className={`state ${session.state}`}>
            {session.state === "exited" ? "已结束" : session.state}
          </span>
        )}
        {/**
          * **「停止」搬到了输入卡上那颗按钮里**（2026-08-13）。
          *
          * 它此前在这儿——而人正盯着输入框等回答，
          * 中止的入口离他的手有半个屏幕。作者的原话是
          * *「我没有看到哪里结束或者中止」*。
          *
          * 不两处都留：**一个动作一个家**。
          */}
      </header>

      {/**
       * 贴底滚动交给 `use-stick-to-bottom`。
       *
       * 此前是手写的 `scrollIntoView()`，它有个硬毛病：**只要有新内容就往下拽**——
       * 用户往上翻去看前面说了什么，下一个 token 到达时又被弹回底部。
       * 这个库的行为是：贴在底部时才跟随，**一旦用户主动上滚就撒手**。
       */}
      <StickToBottom className="turns" resize="smooth" initial="smooth">
        {/**
          * **宽度上限挂在这一层，不挂在 `.turn` 上**（2026-08-13，作者提：
          * *「会话里面会有 Linux 的命令……其长度应该和真实回复的内容的宽度保持一致」*）。
          *
          * 他说的是事实：`.tool` / `.caveat` / 子 agent 那几行**根本不在 `.turn` 里**，
          * 它们是这一层的直接子节点。上限只写在 `.turn` 上，于是
          * **只有发言被管住了**，命令行一路铺到窗口右缘。
          *
          * 挂在这里之后，**现在与将来的每一种行都自动被管住**——
          * 而写在 `.turn` 上是「每加一种行就得记得再写一遍」，
          * 那种规则迟早会漏，这一次就是。
          */}
        <StickToBottom.Content className="turns-inner">
          {terminalTrimmed ? <p className="hint">{t("终端只保留最近的输出，更早的已滚出缓冲")}</p> : null}
          {items.length === 0 ? (
            <p className="empty">{t("还没有对话")}</p>
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
          {/**
            * **发出去了、还没回音时的那个动记号**（2026-08-13，作者要的）。
            *
            * 他的原话：*「kimi 的回复其实略微有点儿慢，导致我以为是端口卡住了，
            * 你其实可以给我一个动态响应的图，让我知道这个对话是在的。」*
            *
            * 摆在**转录的末尾**，紧跟着刚发出去那句话——它说的是
            * 「这一句我收到了，正在等对面」，所以它属于那句话的后面，
            * 不属于输入框旁边。
            *
            * `Loader` 的 label 是必填的（primitives 那条纪律：
            * **说不出在等什么的加载指示等于没说**）。
            */}
          {等回话 !== undefined ? <等着 从={等回话时刻} 在想={正在想} /> : null}
        </StickToBottom.Content>
      </StickToBottom>

      <form
        className={`composer${拖着 ? " dropping" : ""}`}
        /**
         * **拖一张图进来，和粘贴、和 `＋` 是同一件事**（2026-08-13，作者要的）。
         *
         * `onDragOver` 必须 `preventDefault`——**不拦，浏览器就不认这里能放东西**，
         * 而且松手时它会把整个窗口导航到那张图上（那时对话就没了）。
         *
         * 挂在整张 `form` 上而不是 textarea 上：**人是往「输入卡」上拖的**，
         * 而不是往那个精确的文字区域。命中区小一圈的表现是
         * 「有时候能放、有时候放不进去」。
         */
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return
          e.preventDefault()
          设拖着(true)
        }}
        onDragLeave={(e) => {
          // **只有真的离开这张卡才收**：拖过内部的按钮也会冒出 dragleave
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) 设拖着(false)
        }}
        onDrop={(e) => {
          const 图们 = 捡出图片文件(e.dataTransfer)
          设拖着(false)
          if (图们.length === 0) return // 拖的不是图：交给浏览器，我们不掺和
          e.preventDefault()
          void 文件们成图(图们).then((批) => {
            设待发图((前) => [...前, ...批])
            补预览(批, 设待发图)
          })
        }}
        onSubmit={(e) => {
          e.preventDefault()
          const text = draft.trim()
          /**
           * **只有图、没有字也算一句话**（协议 4.12）。
           * 「看看这张图」这种意图，人常常懒得打字——
           * 拦下来的话表现是「按了发送什么都没发生」。
           */
          if (!text && 待发图.length === 0) return
          /**
           * **上一轮还在跑就不许再发**（2026-08-15 作者第三次报同一句报错）。
           *
           * > `[native runtime 错误] Agent is already processing. Specify
           * > streamingBehavior ('steer' or 'followUp') to queue the message.`
           *
           * 守卫此前只挂在那颗按钮上——忙的时候它变成「停止」，于是**用鼠标发不出去**。
           * 但**回车走的是表单提交**（`requestSubmit()`），根本不经过那颗按钮。
           * 实测：屏幕上明明是「停止」，按下回车照样发出去，pi 当场回上面那句。
           *
           * 这是「两条路只堵了一条」的又一次。判据挂在**提交**这一处——
           * 它是所有发送路径的必经之地，按钮也好回车也好都从这儿过。
           *
           * **不清空、不静默**（规格 7.5）：那句话留在框里，并说清为什么没发出去。
           * 上一版的表现是最坏的一种——话被清空、发出去了、然后回来一句
           * 看不懂的英文报错。
           */
          /**
           * **上一轮还在跑：不拦，交给 pi 插队或排队**（2026-08-15 作者要的）。
           *
           * 上一版是拦下来说一句「上一条还在回」。**堵住不是答案**——
           * 作者看过 Hermes 之后要的是：*「对话框依旧能传上去，
           * 但是却不执行新的内容，而是等上一条结束，再执行新的内容。」*
           *
           * 两条路都是 pi 原生的（`AgentSession.prompt` 的 `streamingBehavior`），
           * 我们只负责说要哪一条：
           *   回车         → `steer`，插队（当前轮跑完工具、下次调模型之前送进去）
           *   Cmd/Ctrl+回车 → `followUp`，排队（这一轮彻底完了才送）
           *
           * **判据仍然挑「界面此刻是不是正告诉你它在忙」**（`busy && onAbort`），
           * 而不是内部那个布尔值：内核会话的 `busy` 恒为真却从不显示「停止」，
           * 上一版只写 `busy` 当场误伤了它，两条内核 e2e 全红。
           */
          const 要排队 = 排队ref.current
          排队ref.current = false
          const 忙着 = busy && !!onAbort
          const 送法 = 忙着 ? (要排队 ? ("followUp" as const) : ("steer" as const)) : undefined

          /**
           * **乐观清空，失败还回去。**
           *
           * 清空要在前面：不清的话，从按下到回执之间那句话还留在框里，
           * 人会以为没发出去而再按一次。
           * 但**清了就必须接得住失败**——否则字和图一起消失，
           * 而屏幕上什么都没有，那正是作者看见的「没有任何反应」。
           */
          const 这次的图 = 待发图
          设待发图([])
          clearDraft(session.sessionId)
          设位置(-1)
          设发送出错(undefined)
          // **从这一刻起显示「在等它」**，直到有新东西冒出来（见 `等回话` 的注）
          设等回话(items.length)
          设等回话时刻(Date.now())
          设喊停过(false)
          void Promise.resolve(
            /**
             * **不忙时一个多余的参数都不传。**「空数组」「不给」在协议上同义，
             * 在调用点上不是：多一个 `undefined` 会让所有
             * 「这一句是怎么发出去的」的断言都要跟着改，而它们关心的不是这个。
             */
            这次的图.length > 0
              ? onSend(text, 这次的图.map(报给协议), ...(送法 ? [送法] : []))
              : 送法
                ? onSend(text, undefined, 送法)
                : onSend(text),
          ).catch((e: unknown) => {
            设发送出错(e instanceof Error ? e.message : String(e))
            // **原样还回去**：人不该为一次失败重打一遍、重挑一遍
            setDraft(session.sessionId, text)
            设待发图(这次的图)
          })
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
          {/**
            * 待发的图片（协议 4.12，2026-08-13）。
            *
            * **在输入卡里面，不在它上面**（2026-08-13 挪的，作者要的，
            * 也是他那张 Codex 截图的样子）。浮在卡外面时它是**另一个盒子**——
            * 而「这几张图属于我正在写的这句话」这层关系，
            * 只能靠「它们在同一张卡里」来表达。
            *
            * **挑完到发出去之间必须看得见**——否则人不知道自己到底附上没有，
            * 而「附了图它却说没看见」正是这条路上最难查的那种错。
            * 每一张都能单独摘掉：挑错一张不该逼人把三张全清了重来。
            */}
          {待发图.length > 0 ? (
            <ul className="attached">
              {待发图.map((图, i) => (
                <li key={`${图.名}-${i}`} className="attached-one">
                  {/**
                    * **画图本身，不画文件名**（2026-08-13，作者给了一张 Codex 的截图）。
                    *
                    * 一行文件名回答不了「我挑对了吗」——同一个目录里
                    * `截图 2026-08-13 上午11.02.31.png` 有七张，名字长得一模一样。
                    * **缩略图是唯一能一眼确认的东西。**
                    *
                    * 拿不到预览时退回名字：**缩略图出不来只是看不见，
                    * 图本身还是好的**，不该因此把这一项整个藏起来。
                    */}
                  {图.预览 ? (
                    <img className="attached-thumb" src={图.预览} alt={图.名} />
                  ) : (
                    <span className="attached-name">{图.名}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="attached-x"
                    aria-label={tf("不发这张：{0}", 图.名)}
                    onClick={() => 设待发图((前) => 前.filter((_, j) => j !== i))}
                  >
                    <删除图标 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <textarea
            className="control composer-field"
            value={draft}
            onChange={(e) => setDraft(session.sessionId, e.target.value)}
            /**
             * **粘一张图进来就当附件**（协议 4.13，2026-08-13，作者提）。
             *
             * `preventDefault` **只在真的捡到图时才调**：
             * 粘一段文字仍然要照常粘进去——把最常用的那个动作拦坏，
             * 换来的功能再好也是赔的。
             */
            onPaste={(e) => {
              void 从粘贴里捡图(e).then((图们) => {
                if (图们.length === 0) return
                设待发图((前) => [...前, ...图们])
              })
              if (粘的是图(e)) e.preventDefault()
            }}
            placeholder={disabled ? t("会话已结束") : t("今天帮你做些什么？@引用工作区文件，/调用技能与指令")}
            disabled={disabled ?? false}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                /**
                 * **Cmd/Ctrl+回车 = 排队，光回车 = 插队**（2026-08-15，学自 Hermes）。
                 *
                 * 记在 ref 上而不是靠事件传下去：这里走的是 `requestSubmit()`，
                 * 提交处理器收到的是 `SubmitEvent`，**按了什么键在那儿已经问不出来了**。
                 */
                排队ref.current = e.metaKey || e.ctrlKey
                e.currentTarget.form?.requestSubmit()
                return
              }
              /**
               * **占位符里承诺的两件事，必须真的会发生**（2026-08-13）。
               *
               * 那句提示写着「@引用工作区文件，/调用技能与指令」。
               * **一句会撒谎的提示比没有提示坏得多**——人照着敲一个 `@`，
               * 什么都不发生，此后他就再也不信这个输入框说的任何话了。
               *
               * 所以：
               *   `@` 在**空输入框的行首**打开文件浏览器（挑完把路径写进来）；
               *   `/` 在同样的位置打开命令面板（技能与指令都在那儿）。
               *
               * **只在行首、且输入框是空的时候拦**：一句话中间打 `@`
               * 多半是在写邮箱或者 handle，那时候弹出个浏览器是在捣乱。
               */
              const 空且在头 = draft.length === 0
              if (空且在头 && e.key === "/") {
                e.preventDefault()
                togglePalette()
                return
              }
              if (空且在头 && e.key === "@") {
                e.preventDefault()
                void 挑文件("any", workspace).then((选中) => {
                  if (选中.length === 0) return
                  setDraft(
                    session.sessionId,
                    选中.map((p) => 相对于(p, workspace)).join(" "),
                  )
                })
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
          {/**
            * **发送失败就摆在这儿**（2026-08-13）。
            *
            * 它此前只经 `note()` 走到别处——而那条路人看不见，
            * 于是「发失败」在屏幕上与「什么都没发生」长得一模一样。
            */}
          {发送出错 ? <p className="caveat composer-problem">⚠ {发送出错}</p> : null}
          {/**
            * **两条路都要看得见**（2026-08-15）。
            *
            * 原生 `title=` 被设计契约挡下（无样式、约 500ms 延迟、与主题不符），
            * 而**只写在无障碍标签里等于没写**——这个项目栽过两次：
            * 「新建项目」是个没标签的 `＋`、删除键是 `opacity: 0` 的裸 `×`，
            * 两次作者的反馈都是「没有这个功能」，而两次代码都是好的。
            *
            * 所以忙着、且框里有东西时，就在这儿明写一行。
            */}
          {busy && onAbort && 有东西要发 ? (
            <p className="caveat composer-hint">{t("回车插队 · Cmd/Ctrl+回车排到这一轮后面")}</p>
          ) : null}
          <div className="composer-controls">
            {/**
              * **`＋` 在最左**（2026-08-13，作者截图里的位置）。
              * 它属于「要发出去的这件事」，与右边那些「用谁发」是两类，
              * 所以分居两端——中间那段空白就是它们的分界。
              */}
            <AttachButton
              {...(workspace ? { workspace } : {})}
              /* 草稿住在 `$drafts` 里、按会话分家——不是组件里的一个 useState */
              onInsert={(文本) => setDraft(session.sessionId, draft ? `${draft} ${文本}` : 文本)}
              /**
               * **去重**：同一张图挑两次只算一张。
               * 不去重的话它会被送两遍，而人在 chip 上看见两个一样的名字，
               * 分不出「我挑重了」还是「界面画重了」。
               */
              /**
               * **只有内置对话收得下图片**（2026-08-13）。
               *
               * cli（claude / codex 的 headless）与 kernel 会话的运行时
               * 没有把图片喂进去的入口——`SessionManager.write` 会当场报错。
               * 报错是对的（**不静默丢掉**），但**更该做的是不摆这个入口**：
               * 一个点下去只会得到「这类会话不能附图片」的菜单项，
               * 比没有更坏。
               *
               * 不给 `onAttachImages` 时，`AttachButton` 自己就不画「上传图片」那一项。
               */
              {...(session.kind !== "native"
                ? {}
                : {
              onAttachImages: (paths: readonly string[]) => {
                设待发图((前) => [
                  ...前,
                  ...paths
                    .filter((p) => !前.some((x) => x.from === "path" && x.path === p))
                    .map((p) => ({ from: "path" as const, path: p, 名: 基名(p) })),
                ])
                /**
                 * **预览后到，chip 先出现。** 反过来的话（等缩略图回来再画）
                 * 人按完「上传图片」会有一段什么都不发生的空窗，
                 * 而那正是「点了没反应」的样子。
                 */
                for (const p of paths) {
                  void 要缩略图(p).then((预览) => {
                    if (!预览) return
                    设待发图((前) =>
                      前.map((x) => (x.from === "path" && x.path === p ? { ...x, 预览 } : x)),
                    )
                  })
                }
              },
                  })}
            />
            {/**
              * **一颗 pill，不是两颗**（2026-08-12，作者指的那件）。
              *
              * 实测 WorkBuddy 的输入卡右下角只有 `◐ Hy3 ⌃` 一颗。
              * 我们此前是「厂家」+「模型」两颗——2026-08-11 定的「先厂家、
              * 后模型」在那时是对的（那会儿换厂家真的要新建对话），
              * 但**换服务已经能就地换了**，两颗就成了同一个问题的两种问法。
              *
              * 「用别的 agent 开一段新对话」（claude / codex 这类）
              * **留在命令面板**（`⌘K` →「新建会话：…」）：
              * 它与「换模型」不是同一件事，混进同一个菜单正是
              * 2026-08-11 那个「点了以为换模型、结果新开了对话」的来源。
              */}
            {models && onPickModel ? (
              <ModelPill
                choices={models}
                current={model}
                busy={busy}
                kind={session.kind}
                onPick={onPickModel}
                {...(serviceLabel ? { serviceLabel } : {})}
                {...(onOpenSettings ? { onConfigure: onOpenSettings } : {})}
              />
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
                {/* **不叫「终端」**：那两个字是「打开终端」「＋ 新终端」的一部分。
                    这颗掀开的是下面那条 dock，所以就照着说 */}
                终端面板
              </Button>
            ) : null}
            {/**
             * **圆形填充的发送键**（2026-08-12，学自 WorkBuddy）。
             *
             * 作者：*「对话框也完全不像啊。」* 最显眼的就是这颗——
             * 它那儿是一个深色圆形，**整屏只有这一处强调色**；
             * 我们是一个绿色方按钮，旁边还有一排绿字，
             * **强调色一多就谁也不强调了**。
             *
             * 文字留在无障碍标签里：**图形按钮不能只有图形**
             * （DESIGN.md：no meaning conveyed by shape alone）。
             */}
            {/**
              * **跑起来之后，这颗按钮就是「停止」**（2026-08-13，作者提：
              * *「我没有看到哪里结束或者中止，我的发送按钮一直是好的。
              * 是不是需要在模型响应的过程中，这个发送按钮要变化一下呢？」*）。
              *
              * 他说的是对的，而且这是这类应用的通行做法：**中止的入口，
              * 应该在你手已经在的地方**。此前它在对话标题栏上——
              * 那儿离输入框很远，而人正盯着输入框等回答。
              *
              * **一个动作一个家**：标题栏那颗同时摘掉了，不是两处都留。
              *
              * `type` 也要跟着换：留着 `submit` 的话，按下停止会顺手提交一次表单
              * （空的，会被 `if (!text …) return` 挡下，但那是靠运气）。
              */}
            {/**
              * **忙着而框里有字：这颗是「插队」，不是「停止」**（2026-08-15，学自 Hermes）。
              *
              * Hermes 的原则写在它 composer 的注释里：*「While busy: text redirects
              * the live turn, attachments queue for the next turn, an empty composer stops.」*
              * ——**按钮说的是「你现在按下去会发生什么」**，而那取决于框里有没有东西。
              *
              * 代价说清楚：框里有字时，停止的入口就没了（得先清空）。
              * 换来的是**打了字的人按下去不会把自己的话丢掉**——
              * 而那正是这一版要解决的事。
              */}
            {busy && onAbort && 有东西要发 ? (
              <Button
                type="submit"
                variant="primary"
                className="send-btn"
                aria-label={t("插队")}
                disabled={disabled ?? false}
              >
                <上箭头图标 />
              </Button>
            ) : busy && onAbort ? (
              <Button
                type="button"
                variant="primary"
                className="send-btn stopping"
                aria-label={t("停止")}
                onClick={() => {
                  /**
                   * **按下停止，记号也要跟着停**（2026-08-13）。
                   *
                   * `等回话` 的终点是「有新东西冒出来」——**而中止不一定
                   * 产生任何新条目**。不在这里显式收掉的话，人按了停止，
                   * 那三个点还在转：他会以为没停住，而实际上已经停了。
                   *
                   * 这正是 2026-08-10 那一版被撤掉的形态
                   * （**一个永远在转的记号比没有更糟**），只是换了一条触发路径。
                   * 那次的教训是「判据要有确定的终点」——
                   * **而「人主动喊停」本身就是一个终点，只是我上一版漏了它。**
                   */
                  设等回话(undefined)
                  // **喊停也要挡住「从转录推导」那条**：转录里最后一条仍是用户那句，
                  // 不挡的话下一个 tick 就把记号又推回来了
                  设喊停过(true)
                  onAbort()
                }}
              >
                <停止图标 />
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                className="send-btn"
                aria-label={t("发送")}
                disabled={disabled ?? false}
              >
                <上箭头图标 />
              </Button>
            )}
          </div>
          {/**
            * **输入卡自己的那一行**（2026-08-12，作者截图指的就是这里）。
            *
            * 实测 WorkBuddy 的 `wb-input-footer`：与输入卡同宽、高 32、
            * `padding: 0 12px`、`gap: 4`，里面是一颗颗 chip
            * （`选择工作空间 ⌄`、`默认权限 ⌄`）。
            *
            * **我上一版把它放在了对话标题栏的右上角**——那是我自己想的位置，
            * 从没量过它在哪。作者：*「这不是我想要的效果。」*
            * 摆在输入卡下面才对：它说的是**这一句话会在哪儿执行**，
            * 属于「要发出去的这件事」，不属于「这段对话叫什么」。
            */}
          {onPickWorkspace || workspace ? (
            <div className="composer-footer">
              <WorkspaceEntry
                {...(workspace ? { workspace } : {})}
                {...(onPickWorkspace ? { onPick: onPickWorkspace } : {})}
              />
            </div>
          ) : null}
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
   * **只留一个思考块**（2026-08-12，作者定的）：*「我只想保留 DeepSeek
   * 回复我真实问题请求时候的时间。」*
   *
   * 中间那条（想一下就去调工具）不单独露面——它的思考已经并进了后面那条
   * （`events.ts` 的 `吸收只想没说的`，两边现在共用 `没说话()` 这一个判据）。
   *
   * **代价说清楚**：这条发言的 token 用量因此不在对话里显示。
   * 它没有丢——账本（项目概览）记着，而那本来就是查用量的地方。
   */
  if (没说话(item)) return null

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
        <span className="sr-only">{t("正在修改你说过的一段话")}</span>
        <div className="bubble">
          <textarea
            className="control turn-edit"
            autoFocus
            value={编辑}
            aria-label={t("修改这段话")}
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
            {/* **不叫「取消」**：编辑不是模态——确认框会开在它上面，
                那时屏幕上就有两颗同名的。照着「按下去会变成什么」说 */}
            <Button variant="secondary" size="inline" onClick={() => 设编辑(undefined)}>
              {t("不改了")}
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
              {t("发送")}
            </Button>
          </div>
          {/* **说清楚它会做什么**：不是改掉上面那句，是照这个再说一遍 */}
          <p className="hint">{t("发送会在对话末尾新说一句，上面那句留在原处")}</p>
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
      {/**
       * **头像 + 名字**（2026-08-12，学自 WorkBuddy）。
       *
       * 它那儿是一个圆形标记加粗体名字——**一眼就分出「这是谁在说话」**。
       * 我们此前只有一行字，几段之后就分不清了。
       *
       * 头像取名字首字：**没有素材就不要画一个假的头像**，
       * 一个字母比一个占位图形诚实。
       */}
      <span className={`who${mine ? " sr-only" : ""}`}>
        {mine ? null : (
          <span className="who-avatar" aria-hidden="true">
            {(item.by ? (nameOf?.(item.by) ?? item.by) : agentId).slice(0, 1).toUpperCase()}
          </span>
        )}
        {/* **名字单独一个元素**：与头像混在同一个 span 里，
            读到的文本会变成「DDeepSeek」——`who-answered` 那条 e2e 当场抓到 */}
        <span className="who-name">
          {mine ? t("你") : item.by ? (nameOf?.(item.by) ?? item.by) : agentId}
        </span>
      </span>
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
          * **发完之后，附的图仍然看得见**（协议 4.14，2026-08-13，
          * 作者：*「能否放入到对话窗口里面？」*）。
          *
          * 只有一句文字的话，**「我到底附上没有」这个问题在发出去之后
          * 就再也答不了了**——而它恰恰是这条路上最容易出错的一环。
          *
          * 画在文字**上面**：先看见附了什么，再读那句话，
          * 与人打字时的顺序一致（图先粘进来，字后打）。
          */}
        {item.images && item.images.length > 0 ? (
          <ul className="turn-images">
            {item.images.map((src, i) => (
              <li key={i}>
                <img className="turn-image" src={src} alt={tf("这一轮附的第 {0} 张图", i + 1)} />
              </li>
            ))}
          </ul>
        ) : null}
        {/**
         * **只有 agent 的发言走 markdown。**
         *
         * 把用户输入也当 markdown 渲染，等于替他改写他说的话——
         * 他写的 `**这里**` 就是想让人看见那四个星号（多半正是在问它为什么报错）。
         */}
        {/**
         * **两边都走 markdown**（2026-08-14，作者定的：*「我输入的内容，
         * 也要写成 markdown 的格式」*）。
         *
         * 此前只有 agent 那侧走，理由是「把用户输入当 markdown 渲染等于替他改写
         * 他说的话——他写的 `**这里**` 可能正是在问它为什么报错」。
         * **那个取舍作者知道，并且选了另一边。**
         *
         * `.text` 必须落在 markdown 自己那个容器上，不能外面再包一层：
         * 「短问句不该被折行」那条判据是量 `.turn.user .text` 的 `scrollHeight`，
         * 包一层就会把里面段落的外边距一起算进去。
         */}
        <AgentMarkdown
          text={item.text}
          streaming={!mine && !item.final}
          {...(mine ? { className: "text" } : {})}
        />
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
          <CopyButton text={item.text} label={mine ? t("复制我说的这段") : t("复制这段回答")} />
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
              aria-label={t("修改")}
              onClick={() => 设编辑(item.text)}
            >
              <铅笔图标 />
            </Button>
          ) : null}
          {/**
           * **用量摆在动作行的右端**（2026-08-12，学自 WorkBuddy）。
           *
           * 此前它单独占一行，夹在正文和动作之间——**把一段话和「对它做什么」
           * 隔开了**，而它自己只是个脚注。挪到这一行的尾巴上，
           * 正文与动作就贴在一起了。
           */}
          {item.final && item.usage ? <TurnUsage usage={item.usage} /> : null}
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
      <span className="sr-only">{t("正在思考")}</span>
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
  if (usage.input !== undefined) 段.push(tf("输入 {0}", formatTokens(usage.input)))
  if (usage.output !== undefined) 段.push(tf("输出 {0}", formatTokens(usage.output)))
  // **缓存命中单独说**：它与输入 token 计费不同，混进去会让账对不上
  if (usage.cacheRead !== undefined) 段.push(tf("缓存 {0}", formatTokens(usage.cacheRead)))
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
  /**
   * **这条输出是哪台内核吐的**（②，作者要的徽标）。
   *
   * 只有「普通对话挂内核」那条路会带 `language`——一段对话可以同时挂
   * Python 与 R，不标的话两台的输出混在一起就没有判据。
   * **`kind: kernel` 那条既有的路不填，于是这里什么都不画**，与从前一模一样。
   */
  const 来源 =
    item.language === "python" ? (
      <span className="kout-lang" title="Python 内核">
        <Python图标 className="kout-lang-icon" />
      </span>
    ) : item.language === "R" ? (
      <span className="kout-lang" title="R 内核">
        <R图标 className="kout-lang-icon" />
      </span>
    ) : null

  const 陈旧记号 = stale ? (
    <p className="kout-stale">
      {/* 纯文本里不写 markdown 记号——它不会被渲染，只会显示成星号 */}
      ⚠ 这条结果来自上一个内核实例，它描述的状态已经不存在了
    </p>
  ) : null
  const mark = (
    <>
      {来源}
      {陈旧记号}
    </>
  )

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
    return <img className="kout-img" src={`data:${mediaType};base64,${data}`} alt={t("内核输出的图")} />
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
        <p className="kout-note">{t("HTML 输出按纯文本显示（渲染它需要沙箱，见阶段 ④）")}</p>
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
  if (n < 1024) return tf("{0} 字节", n)
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
  running: { mark: "…", label: msgid("执行中") },
  ok: { mark: "✓", label: msgid("成功") },
  error: { mark: "✗", label: msgid("失败") },
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
  const { mark, label: 状态msgid } = TOOL_STATUS[item.status]
  // **表是模块级常量**：在那里 `t()` 会在 `loadLang()` 之前跑，取到的是默认语言
  const label = t(状态msgid)
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
        <三角图标 className={`caret${open ? " open" : ""}`} />
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
          <span className="tool-elapsed" title={item.status === "running" ? t("已经跑了") : t("耗时")}>
            {item.status === "running" ? tf("已跑 {0}", 用时) : 用时}
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
          {input.truncated ? <span className="hint">{t("入参已截断")}</span> : null}

          {item.resultTruncated ? (
            <p className="hint tool-spill">
              {/* **这一行是修复的证据。** 修复前 runtime 层砍掉 2000 字符之后的内容且
                  不留痕迹，界面却在说「还有 N 行」——那个数是对残缺品数出来的 */}
              输出共 {formatBytes(item.resultBytes ?? 0)}，已截断
              {item.fullOutputPath ? tf("；完整内容：{0}", item.fullOutputPath) : t("，且未能保存全文")}
            </p>
          ) : null}

          {result ? (
            <>
              {/* 命令输出与报错是最常被复制走的东西——贴进搜索框或另一段对话 */}
              <CopyButton text={item.result ?? result.text} label={t("复制这段输出")} />
              <pre className="tool-result">{result.text}</pre>
              {result.hidden > 0 ? (
                <Button
                  variant="text"
                  size="inline"
                  className="tool-expand"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                >
                  {expanded ? t("收起") : tf("展开全部（还有 {0} 行）", result.hidden)}
                </Button>
              ) : null}
            </>
          ) : item.status === "error" ? (
            // 失败且无正文。**这一支是本次修复的重点**：此前它渲染成空白
            <p className="caveat">{t("这次调用失败了，但没有给出原因")}</p>
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
  { 标题: msgid("看看这里有什么"), 说明: msgid("先摸清工作区"), 发出去的话: msgid("看一下当前工作区里有哪些文件和数据，说说它的结构。") },
  { 标题: msgid("读一份数据"), 说明: msgid("字段、规模、缺失"), 发出去的话: msgid("找到工作区里的数据文件，读进来，告诉我它有多少行、哪些字段、缺失情况如何。") },
  { 标题: msgid("做一次探索性分析"), 说明: msgid("分布与异常"), 发出去的话: msgid("对工作区里的数据做一次探索性分析：分布、相关性、明显的异常值。") },
  { 标题: msgid("把结果写成说明"), 说明: msgid("给人看的那一版"), 发出去的话: msgid("把目前得到的结果整理成一段能给别人看的说明，写清楚做了什么、发现了什么。") },
]

/** 还没有任何会话时的主区域。**给出下一步动作，而不是一片空白。** */
export function EmptyConversation({
  agents,
  agentLabel,
  onStart,
  onToggleDock,
  onOpenSettings,
  onPickDirectory,
}: {
  agents: readonly string[]
  /** agent id → 该怎么称呼（`ds-chat` → `DeepSeek`）。缺省时用 id */
  agentLabel?: ((agentId: string) => string) | undefined
  /** 掀开／收起底部终端。**与 composer 上那颗、命令面板那条是同一个动作** */
  onToggleDock?: (() => void) | undefined
  /**
   * 第二个参数给了的话，**建完之后把这句话真的发出去**。
   * 第三个是工作目录（2026-08-12）——**给了就归「项目」，不给就归「会话」**。
   */
  /**
   * **返回 Promise 就能被等**（2026-08-13）。
   *
   * 建会话 + 发第一句是**一个意图**：话没送出去，这段对话就不该存在，
   * 而人打的字和挑的图也不该跟着消失。能等，才能在失败时把它们还回去。
   */
  onStart: (
    agentId: string,
    firstMessage?: string,
    workspace?: string,
    images?: readonly 图片来源[],
  ) => void | Promise<void>
  /**
   * 弹原生目录选择器（2026-08-12）。**不给就不画那颗 chip**。
   *
   * 作者：*「默认的 App 的面板，也应该和新建任务一样，带有一个选择工作目录，
   * 因为只有选择了，才归类为项目，如果不选择目录，那么就是会话。」*
   * ——**归类的那个决定应该在开口之前就能做**。
   */
  onPickDirectory?: (() => Promise<string | null>) | undefined
  onOpenSettings: () => void
}) {
  const first = agents[0]
  /** 这一屏的草稿。**不进 `$drafts`**：那份是按会话分的，而这里还没有会话 */
  const [草稿, 设草稿] = useState("")
  /**
   * 还没建任务，所以工作目录先记在这一屏上（2026-08-12）。
   * 发出去的那一刻它跟着 `onStart` 一起走——**归到哪一栏由它决定**。
   */
  const [工作目录, 设工作目录] = useState<string | undefined>(undefined)
  /**
   * 这一屏粘/挑进来、还没发出去的图（2026-08-13）。
   *
   * 与对话里那份是两个 state，**因为它们的生命周期不同**：
   * 这一份在「第一句话发出去、会话建出来」的那一刻整个消失。
   */
  const [空态图, 设空态图] = useState<待发的图[]>([])
  const [空态拖着, 设空态拖着] = useState(false)
  /** 第一句话没发出去的原因。**摆在输入卡旁边**，不是丢进某个角落的提示 */
  const [开场出错, 设开场出错] = useState<string | undefined>(undefined)
  return (
    <div className="conversation empty-conv">
      {first ? (
        <div className="welcome">
          {/* 标记，不是 logo：一个 56×56 的方块（规范 §3.4 的尺寸），
              用品牌色，**不引入任何图片资源** */}
          <div className="welcome-mark" aria-hidden="true">
            D
          </div>
          <h2 className="welcome-title">{t("开始一段对话")}</h2>
          <p className="welcome-sub">{t("当前工作区已就绪。挑一个起手，或者直接说你要做什么。")}</p>

          {/**
           * 建议卡片。**点了要真的发生事情**——建会话，并把这句话发出去。
           * 只把文字填进输入框是做不到的：空态根本没有输入框。
           *
           * **工作目录必须跟着走**（2026-08-13 修，作者报的）：
           * *「这四个，无论你是否选择文件夹，都会进入到会话里面。」*
           *
           * 这一行此前只传两个参数，第三个（`工作目录`）漏了。
           * 于是「选了文件夹 → 归项目」这条规则**只对手打的那句话成立**，
           * 对这四张卡不成立——而它们恰恰是这一屏最显眼的四个入口。
           *
           * 归类的判据一共只有一处（`onStart` 的第三个参数给没给），
           * **调用点漏传就等于悄悄改了规则**，而且不报错。
           */}
          <ul className="openers">
            {OPENERS.map((o) => (
              <li key={o.标题}>
                <Button
                  variant="outline"
                  size="card"
                  onClick={() => onStart(first, t(o.发出去的话), 工作目录)}
                >
                  <span className="opener-title">{t(o.标题)}</span>
                  <span className="opener-sub">{t(o.说明)}</span>
                </Button>
              </li>
            ))}
          </ul>

          {/**
            * **空态也是一个对话窗口**（2026-08-12，作者提）。
            *
            * 作者：*「不要上来就是用 Deepseek 开始，而是要直接是对话窗口。」*
            *
            * 上一版这里是一颗 `＋ 用 DeepSeek 开始`——**它多要了一步**：
            * 人已经知道自己要说什么了，却得先回答「用谁」。
            * 而「用谁」在 composer 的 pill 上一直都能改，**且大多数时候不需要改**。
            * WorkBuddy 的新建任务页就是这样：标题 + 一排起手 +
            * **一个能直接打字的输入卡**。
            *
            * **卡的几何只有一个家**：这里复用的是同一套类名
            * （`.composer` / `.composer-box` / `.composer-field`），
            * 不同的只是行为——这一屏没有历史可翻，也没有按会话分的草稿。
            */}
          <form
            className={`composer${空态拖着 ? " dropping" : ""}`}
            /* 与对话里那一份同一副做法——**同一件事不该有两种手感** */
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return
              e.preventDefault()
              设空态拖着(true)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) 设空态拖着(false)
            }}
            onDrop={(e) => {
              const 图们 = 捡出图片文件(e.dataTransfer)
              设空态拖着(false)
              if (图们.length === 0) return
              e.preventDefault()
              void 文件们成图(图们).then((批) => {
                设空态图((前) => [...前, ...批])
                补预览(批, 设空态图)
              })
            }}
            onSubmit={(e) => {
              e.preventDefault()
              const t = 草稿.trim()
              // **只有图、没有字也算一句话**（与对话里那一份同一条）
              if (!t && 空态图.length === 0) return
              /**
               * **没有图就只传三个参数。**「空数组」与「不给」在协议上是同一个意思，
               * 而在调用点上不是：多传一个 `undefined` 会让所有
               * 「这一屏是怎么开出会话的」的断言都要跟着改，而它们关心的不是图片。
               */
              /**
               * **乐观清空，失败还回去**——与对话里那条同一副做法。
               *
               * 不清的话，从按下到回执之间那句话还留在框里，人会以为没发出去
               * 而再按一次；而清了不接失败，就是作者报过的那个
               * 「字和图一起消失，屏幕上什么都没有」。
               */
              const 这次的图 = 空态图
              设空态图([])
              设草稿("")
              设开场出错(undefined)
              void Promise.resolve(
                这次的图.length > 0
                  ? onStart(first, t || undefined, 工作目录, 这次的图.map(报给协议))
                  : onStart(first, t || undefined, 工作目录),
              ).catch((e: unknown) => {
                设开场出错(e instanceof Error ? e.message : String(e))
                设草稿(t)
                设空态图(这次的图)
              })
            }}
          >
            <div className="composer-box">
              {/**
                * 待发的图（2026-08-13）。**与对话里那一份共用同一套类名**——
                * 它们是同一个东西，长得不一样只会让人以为是两回事。
                */}
              {空态图.length > 0 ? (
                <ul className="attached">
                  {空态图.map((图, i) => (
                    <li key={`${图.名}-${i}`} className="attached-one">
                      {图.预览 ? (
                        <img className="attached-thumb" src={图.预览} alt={图.名} />
                      ) : (
                        <span className="attached-name">{图.名}</span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="attached-x"
                        aria-label={tf("不发这张：{0}", 图.名)}
                        onClick={() => 设空态图((前) => 前.filter((_, j) => j !== i))}
                      >
                        <删除图标 />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <textarea
                className="control composer-field"
                value={草稿}
                autoFocus
                onChange={(e) => 设草稿(e.target.value)}
                /**
                 * **这一屏也能粘图**（2026-08-13 补，作者报的：
                 * *「我现在复制一个图片，然后粘贴到窗口，为什么不显示图片呢？」*）。
                 *
                 * 上一版只给了对话那个输入框——**而应用打开就落在这一屏上**，
                 * 所以最常见的那一次粘贴恰恰是不工作的那一次。
                 *
                 * 我写占位符时明明说过「每个对话框都要有」，
                 * **却没把同一条规则套到粘贴上**。同一份代码里有两个 composer，
                 * 就得每次都问一句「另一个呢」。
                 */
                onPaste={(e) => {
                  void 从粘贴里捡图(e).then((图们) => {
                    if (图们.length === 0) return
                    设空态图((前) => [...前, ...图们])
                  })
                  if (粘的是图(e)) e.preventDefault()
                }}
                placeholder={t("今天帮你做些什么？@引用工作区文件，/调用技能与指令")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    e.currentTarget.form?.requestSubmit()
                    return
                  }
                  /**
                   * **与对话里那一份同样的 `@` 与 `/`**（2026-08-13）。
                   *
                   * 作者：*「每个对话框都要有这个提示的功能奥。」*
                   * 提示一样，那么提示承诺的事就得一样——**只在一屏上兑现的承诺，
                   * 换一屏就成了谎**。
                   */
                  const 空且在头 = 草稿.length === 0
                  if (空且在头 && e.key === "/") {
                    e.preventDefault()
                    togglePalette()
                    return
                  }
                  if (空且在头 && e.key === "@") {
                    e.preventDefault()
                    void 挑文件("any", 工作目录).then((选中) => {
                      if (选中.length > 0) {
                        设草稿(选中.map((p) => 相对于(p, 工作目录)).join(" "))
                      }
                    })
                  }
                }}
              />
              {/**
                * **第一句没发出去的原因，摆在这儿**（2026-08-13）。
                * 它此前只经 `note()` 走到别处——而那条路人看不见，
                * 于是「发失败」在屏幕上与「什么都没发生」长得一模一样。
                */}
              {开场出错 ? <p className="caveat composer-problem">⚠ {开场出错}</p> : null}
              <div className="composer-controls">
                {/* 空态这一屏同样给 `＋`：**一个动作只有一个家，但可以有两个入口** */}
                <AttachButton
                  {...(工作目录 ? { workspace: 工作目录 } : {})}
                  onInsert={(文本) => 设草稿((前) => (前 ? `${前} ${文本}` : 文本))}
                  onAttachImages={(paths) => {
                    设空态图((前) => [
                      ...前,
                      ...paths
                        .filter((p) => !前.some((x) => x.from === "path" && x.path === p))
                        .map((p) => ({ from: "path" as const, path: p, 名: 基名(p) })),
                    ])
                    // 预览后到，chip 先出现——与对话里那一份同一条
                    for (const p of paths) {
                      void 要缩略图(p).then((预览) => {
                        if (!预览) return
                        设空态图((前) =>
                          前.map((x) => (x.from === "path" && x.path === p ? { ...x, 预览 } : x)),
                        )
                      })
                    }
                  }}
                />
                {/**
                  * **不叫「agent」，叫「LLM」**（2026-08-11）。
                  *
                  * 作者：*「我做的这个就属于是一个 agent，因此首页不应该是
                  * 更换一个 agent，而应该是更换一个 LLM。」*
                  *
                  * 他是对的：**DAWN 自己就是那个 agent**——它有工具、有账本、
                  * 有授权门。人在这一屏挑的是**让哪个模型来跑它**。
                  *
                  * **挑完把手上那句话一起带走**：人可能先打了字才想起来换模型，
                  * 不带走的话那句话就凭空消失了。
                  */}
                {/**
                  * **只配了一家也画这颗 pill**（2026-08-13 去掉 `> 1` 的门槛）。
                  *
                  * 门槛的原意是「只有一家时没什么可挑的」。但这颗 pill 现在
                  * 还挂着「配置自定义模型」——**而只配了一家的人，
                  * 恰恰是最需要那条入口的人**。
                  *
                  * 它同时也是「我这一句会用哪个模型」的唯一答案，
                  * 一家时那句话照样值得说。
                  *
                  * 这个洞是被一条**被跳过的用例**暴露的：那条用例写着
                  * 「没有 pill 就 skip」，于是它在汇总里只是「1 skipped」——
                  * **看起来全绿，而那个功能从来没被验过**。
                  */}
                {first ? (
                  <AgentPill
                    agents={agents}
                    {...(agentLabel ? { label: agentLabel } : {})}
                    /**
                     * **失败要在这一屏说出来**（T4，2026-08-13 修）。
                     *
                     * 上一版这里是 `onPick={(a) => onStart(...)}`——promise 直接丢掉了。
                     * 于是「挑了一个起不来的 agent」的表现是**什么都不发生**：
                     * pill 上还写着原来那个名字，人站在原地，屏幕上一个字都没有。
                     * 规格 7.5 说的静默失败，就是这个样子。
                     *
                     * 这个洞一直在，只是此前守它的那条 e2e 走的是命令面板里的
                     * 「新建会话：X」；T4 把那条命令收掉之后，**pill 成了唯一的门**，
                     * 用例改走这扇门，当场就红了。
                     *
                     * 走的是与「打字发送」同一个出口（`设开场出错`）——
                     * 一个失败一个家，不再多一处长得不一样的报错。
                     */
                    onPick={(a) => {
                      设开场出错(undefined)
                      void Promise.resolve(onStart(a, 草稿.trim() || undefined, 工作目录)).catch(
                        (e: unknown) => 设开场出错(e instanceof Error ? e.message : String(e)),
                      )
                    }}
                    {...(onOpenSettings ? { onConfigure: onOpenSettings } : {})}
                    triggerLabel={agentLabel ? agentLabel(first) : first}
                  />
                ) : null}
                {/**
                  * **空态也要够得着终端**（2026-08-11）。
                  * 入口从侧栏挪到了对话这一侧（作者：*「侧边栏这边不能有终端」*）。
                  */}
                {onToggleDock ? (
                  <Button variant="text" size="sm" onClick={onToggleDock}>
                    {t("终端面板")}
                  </Button>
                ) : null}
                <Button type="submit" variant="primary" className="send-btn" aria-label={t("发送")}>
                  <上箭头图标 />
                </Button>
              </div>
              {/**
                * **与对话里那张同一颗 chip、同一处位置**（2026-08-12）。
                *
                * 作者：*「默认的 App 的面板，也应该和新建任务一样，带有一个
                * 选择工作目录，因为只有选择了，才归类为项目，如果不选择目录，
                * 那么就是会话。」*
                *
                * 放在这儿而不是建完之后再设：**归类的那个决定应该在开口之前
                * 就能做**——建完再改要搬运行时（`SessionManager.rehome`），
                * 而一开始就选对，什么都不用搬。
                */}
              {onPickDirectory ? (
                <div className="composer-footer">
                  {/**
                    * **「改回普通对话」这里也没有了**（2026-08-13，作者截图圈的）。
                    *
                    * 我上一轮只摘了对话里那颗，空态这颗留着，理由是
                    * 「这里还什么都没发生」。作者又圈了一次——他是对的，
                    * 而我把「这个动作无害」当成了「这个动作有用」：
                    * **选错了文件夹，再点一次 chip 换成对的那个就行**，
                    * 「清空」多出来的只是一条通向同一个地方的岔路。
                    *
                    * **一个入口存在的理由不能是「它不会造成伤害」。**
                    */}
                  <WorkspaceEntry
                    {...(工作目录 ? { workspace: 工作目录 } : {})}
                    onPick={() => {
                      void onPickDirectory().then((d) => {
                        // **取消就什么都不做**：改主意不是错误
                        if (d) 设工作目录(d)
                      })
                    }}
                  />
                </div>
              ) : null}
            </div>
          </form>
        </div>
      ) : (
        <EmptyState
          title={t("还没有可用的 agent")}
          description={t("配置文件里没有 agent，或它需要的 API key 还没填。")}
          action={
            <Button variant="primary" onClick={onOpenSettings}>
              {t("去设置")}
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
  running: { mark: "⏳", label: msgid("运行中") },
  ok: { mark: "✓", label: msgid("完成") },
  error: { mark: "✗", label: msgid("失败") },
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
          const { mark, label: 状态msgid } = CHIP_STATUS[a.status]
          const label = t(状态msgid)
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
                <p className="caveat chip-error">{a.error ?? t("失败了，但没有给出原因")}</p>
              ) : null}
              {expanded ? <pre className="chip-task">{a.task}</pre> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
