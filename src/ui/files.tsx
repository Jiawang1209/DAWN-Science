/**
 * 文件浏览与预览（②-A′ · F3/F4）。
 *
 * ## 它回答的问题
 *
 * 作者 2026-08-10：*「agent 调本地 R/Python 跑完分析，**这时候我们又需要查看结果**
 * ——查看项目文件夹、查看生成的图片、查看保存好的 png 或 pdf。」*
 *
 * ## 两个入口，主次分明
 *
 * **产出栏里那些文件名，本来就该能点开**——不变式 5 让我们已经知道
 * agent 写了哪些文件，那是最短的路径。这里的目录树是**补充**：
 * agent 没碰过的数据文件、上一次会话留下的东西，那些只能靠翻。
 */
import { useEffect, useMemo, useRef, useState } from "react"
import type { ResponseOf } from "../protocol/index.js"
import { Button, EmptyState, Loader, Row } from "./primitives.js"
import { AgentMarkdown } from "./markdown.js"
import {
  三角图标,
  刷新图标,
  搜索图标,
  文件夹图标,
  文件图标,
  文本文件图标,
  Markdown图标,
  表格文件图标,
  图片文件图标,
  代码文件图标,
  脚本文件图标,
  笔记本文件图标,
  压缩包文件图标,
  PDF文件图标,
  下载图标,
  上传图标,
} from "./icons.js"
import { 文件类按名字, type 文件类 } from "./file-kind.js"

import { t, tf, msgid } from "./i18n/index.js"
import { useStore } from "@nanostores/react"
import { SideSash } from "./sash.js"
import { HoverCard, 浮层事件, type 悬停浮层, type 详情行 } from "./hover-card.js"
import { $fileTreeHeight, $fileTreeWidth, FILE_TREE_MIN, setFileTreeHeight, setFileTreeWidth } from "./state/right-dock.js"
import { 年月日时分 } from "./format.js"
/**
 * 目录与文件内容的类型**从协议推导**，不在这里再抄一份。
 * 抄一份的代价：协议改了之后两边各自自洽，编译器一句话都不会说。
 */
export type Listing = ResponseOf<"listDirectory">
export type FileContent = ResponseOf<"readFile">
export type DirEntry = Listing["entries"][number]

/** 字节数的人类可读形式。**不四舍五入到 0**——「0 KB」会让人以为文件是空的 */
function bytes(n: number): string {
  if (n < 1024) return tf("{0} 字节", n)
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/* ── 目录树 ──────────────────────────────────────────────────────── */

/**
 * 每一类一个图标（2026-08-20，作者要的）。**映射只有这一张表**，
 * 树里目录行与文件行都从这儿取。类别怎么判在 `file-kind.ts`。
 */
function 类型图标({ 类 }: { 类: 文件类 }) {
  switch (类) {
    case "dir": return <文件夹图标 className="row-icon" />
    case "markdown": return <Markdown图标 className="row-icon" />
    case "text": return <文本文件图标 className="row-icon" />
    case "table": return <表格文件图标 className="row-icon" />
    case "image": return <图片文件图标 className="row-icon" />
    case "code": return <代码文件图标 className="row-icon" />
    case "shell": return <脚本文件图标 className="row-icon" />
    case "notebook": return <笔记本文件图标 className="row-icon" />
    case "archive": return <压缩包文件图标 className="row-icon" />
    case "pdf": return <PDF文件图标 className="row-icon" />
    default: return <文件图标 className="row-icon" />
  }
}

/**
 * 拖进来的那些东西，哪些是**本机文件**（2026-08-18）。
 *
 * 上传走的是 `localPath`——**拿不到磁盘路径就传不了**，
 * 而那时必须响亮地说出来：从浏览器里拖来一张图、从压缩包里拖一个条目，
 * 都是「看起来拖进去了，其实什么都没发生」。
 *
 * `pathForFile` 是 preload 暴露的那一个（composer 的附件拖拽用的同一条）——
 * **Electron 32 起 `File.path` 已经没有了**。
 */
export function 拖进来的本机路径(files: readonly File[]): { 有: string[]; 没有: number } {
  const w = window as unknown as { dawn?: { pathForFile?: (f: File) => string } }
  const 有: string[] = []
  let 没有 = 0
  for (const f of files) {
    const p = w.dawn?.pathForFile?.(f) ?? ""
    if (p) 有.push(p)
    else 没有 += 1
  }
  return { 有, 没有 }
}

/**
 * 一层目录。**按需展开，不预取整棵树**——
 * 一个 `node_modules` 就能让「打开文件视图」变成几十秒。
 */
/**
 * 树行上的操作（dock-polish ⑤，2026-08-21，学自 DSH-better-sidebar 的右键菜单）：
 * 复制相对 / 绝对路径、把 `@路径` 塞进输入框、删除。
 * **两个入口**：行上那颗常驻的「⋯」与右键——右键是看不见的能力，所以「⋯」不能省。
 * 路径怎么算由 `FilesView` 给（本地 = 工作区 + 相对；远端 = 本来就是绝对的）。
 */
export interface 行操作 {
  /** 回 `{ 相对, 绝对 }`。本地相对工作区、绝对拼上工作区；远端绝对就是路径本身、相对是去掉树根 */
  路径: (path: string) => { 相对: string; 绝对: string }
  /** 给了才有「插进输入框」 */
  onInsert?: ((text: string) => void) | undefined
  /** 给了才有「删除」。目录与文件各自的删法由调用方按 `kind` 分 */
  onDelete?: ((path: string, kind: "file" | "dir") => void) | undefined
  /** 复制成没成，往面板顶上那句说 */
  onNote: (msg: string) => void
}

function TreeRowMenu({ path, name, kind, 操作, 位置, onClose }: { path: string; name: string; kind: "file" | "dir"; 操作: 行操作; 位置: { top: number; left: number }; onClose: () => void }) {
  const { 相对, 绝对 } = 操作.路径(path)
  const 复制 = (文本: string, 成了: string) => {
    onClose()
    navigator.clipboard
      .writeText(文本)
      .then(() => 操作.onNote(成了))
      // **复制失败要出声**：剪贴板被拒（焦点不在窗口里）时，人以为粘出来的是刚才那条
      .catch((e: unknown) => 操作.onNote(tf("复制不了：{0}", e instanceof Error ? e.message : String(e))))
  }
  return (
    <>
      <div className="menu-scrim" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div className="row-menu tree-row-menu" role="menu" aria-label={kind === "dir" ? tf("目录操作：{0}", name) : tf("文件操作：{0}", name)} style={{ top: 位置.top, left: 位置.left }}>
        <Button variant="ghost" size="inline" role="menuitem" onClick={() => 复制(相对, tf("已复制相对路径：{0}", 相对))}>
          {t("复制相对路径")}
        </Button>
        <Button variant="ghost" size="inline" role="menuitem" onClick={() => 复制(绝对, tf("已复制绝对路径：{0}", 绝对))}>
          {t("复制绝对路径")}
        </Button>
        {操作.onInsert ? (
          <Button variant="ghost" size="inline" role="menuitem" onClick={() => { onClose(); 操作.onInsert!(`@${相对}`) }}>
            {t("插进输入框")}
          </Button>
        ) : null}
        {操作.onDelete ? (
          <Button variant="text" size="inline" role="menuitem" className="menu-danger" onClick={() => { onClose(); 操作.onDelete!(path, kind) }}>
            {t("删除")}
          </Button>
        ) : null}
      </div>
    </>
  )
}

/** 菜单开在哪：按钮旁边（点「⋯」）或指针处（右键）。下面放不下就往上翻 */
function 菜单位置(e: { clientX: number; clientY: number }, 按钮?: HTMLElement | null): { top: number; left: number } {
  const 高 = 160
  if (按钮) {
    const r = 按钮.getBoundingClientRect()
    return { top: Math.min(Math.max(8, r.top - 4), window.innerHeight - 高 - 8), left: r.right + 6 }
  }
  return { top: Math.min(Math.max(8, e.clientY), window.innerHeight - 高 - 8), left: Math.min(e.clientX, window.innerWidth - 220) }
}

/** 行上那颗「⋯」+ 它开出来的菜单。文件行与目录行共用 */
function 行操作钮({ path, name, kind, 操作, 菜单, 设菜单 }: { path: string; name: string; kind: "file" | "dir"; 操作: 行操作; 菜单: { top: number; left: number } | undefined; 设菜单: (p: { top: number; left: number } | undefined) => void }) {
  const 按钮 = useRef<HTMLButtonElement>(null)
  return (
    <span className="row-actions">
      <Button
        variant="ghost"
        size="icon"
        className="row-more"
        ref={按钮}
        aria-label={kind === "dir" ? tf("目录操作：{0}", name) : tf("文件操作：{0}", name)}
        aria-expanded={Boolean(菜单)}
        onClick={(e) => 设菜单(菜单 ? undefined : 菜单位置(e, 按钮.current))}
      >
        ⋯
      </Button>
      {菜单 ? <TreeRowMenu path={path} name={name} kind={kind} 操作={操作} 位置={菜单} onClose={() => 设菜单(undefined)} /> : null}
    </span>
  )
}

/** 悬停卡往哪儿开：标题是 `.name`、贴坞的左缘（坞贴着屏幕右缘，往右开就出屏了） */
const 树上的卡 = { 标题: ".name", 容器: ".right-dock", 开在: "左边" as const }
/** 路径里最后一个斜杠之前的那段；根写成「／」 */
const 所在目录 = (path: string) => {
  const i = path.lastIndexOf("/")
  return i > 0 ? path.slice(0, i) : "／"
}

/** 文件那一行。拆出来是因为每一行要有自己的菜单状态 */
function FileRow({ path, entry: e, depth, selected, onSelect, 操作, 浮 }: { path: string; entry: Listing["entries"][number]; depth: number; selected: string | undefined; onSelect: (path: string) => void; 操作?: 行操作; 浮?: ((x: 悬停浮层 | undefined) => void) | undefined }) {
  const [菜单, 设菜单] = useState<{ top: number; left: number } | undefined>(undefined)
  /**
   * 悬停卡（2026-08-21 作者要的：*「鼠标悬浮在文件/文件夹上的时候，弹出文件信息，模仿左边侧边栏」*）。
   * 行上那截时间 · 大小在树拖窄时会被省略掉，**卡上是全的**：所在目录、修改时间、大小。
   */
  const 详情: 详情行[] = [
    { 图: "文件夹", 文: 所在目录(path) },
    { 图: "时钟", 文: 年月日时分(e.modifiedAt) },
    ...(e.size === undefined ? [] : [{ 图: "文件" as const, 文: bytes(e.size) }]),
  ]
  return (
    <li className="tree-node">

                  <Row
                    className="tree-row"
                    active={selected === path}
                    style={{ paddingLeft: `calc(var(--dawn-space-2) + ${depth + 1} * var(--dawn-space-3))` }}
                    onClick={() => onSelect(path)}
                    {...浮层事件(浮, e.name, undefined, 详情, "文件", 树上的卡)}
                    onContextMenu={
                      操作
                        ? (ev) => {
                            ev.preventDefault()
                            ev.stopPropagation()
                            设菜单(菜单位置(ev))
                          }
                        : undefined
                    }
                  >
                    <span className="name">
                      <类型图标 类={文件类按名字(e.name, "file")} />
                      {e.name}
                    </span>
                    {/**
                      * **什么时候改的**（2026-08-19 起）。作者：*「我只需要在文件树里看到
                      * 生成了什么数据就好，有时间戳我就知道哪个文件是新生成的了。」*
                      *
                      * 服务器上的目录多半不是 git 仓库，时间戳是那儿唯一现成的
                      * 「什么是新的」。第一版写的是相对时间（`刚刚 / 3m`），
                      * 作者次日改成**正规的年月日时分**——理由见 `年月日时分`。
                      * 目录行不写——目录的 mtime 含糊（里面动一个文件它就变），
                      * 与目录不报大小同一口径。
                      */}
                    <span className="sub">
                      <span className="file-when">{年月日时分(e.modifiedAt)}</span>
                      {e.size === undefined ? "" : ` · ${bytes(e.size)}`}
                    </span>
                  </Row>

      {操作 ? <行操作钮 path={path} name={e.name} kind="file" 操作={操作} 菜单={菜单} 设菜单={设菜单} /> : null}
    </li>
  )
}

function DirNode({
  path,
  name,
  depth,
  selected,
  onSelect,
  load,
  操作,
  onDrop,
  刷新令牌,
  展开,
  onToggle,
  浮,
}: {
  path: string
  name: string
  depth: number
  selected: string | undefined
  onSelect: (path: string) => void
  load: (path: string) => Promise<Listing>
  /** 悬停卡往哪儿报。树根那一行不弹 */
  浮?: ((x: 悬停浮层 | undefined) => void) | undefined
  /** 行上的操作（复制路径、插进输入框、删）。**给了才画那颗「⋯」**；树根那一行不画 */
  操作?: 行操作
  /** 有文件被拖到这个目录上。**拖到哪一行就传到哪个目录** */
  onDrop?: (dir: string, files: readonly File[]) => void
  /**
   * 变一下这个数，**这一层就重读一遍——但不重新挂载**（2026-08-19）。
   *
   * 上一版是把它拌进树根的 `key` 里，靠整棵树重挂来刷新。那确实会刷新，
   * 代价是**每个人展开过的目录全部塌回去**：传完一个文件，
   * 你刚翻到第三层的位置就没了。上传不常做，所以一直没人报。
   *
   * 现在它进 effect 的依赖：**展开状态是这一层自己的 `useState`，不动它**。
   */
  刷新令牌?: number | undefined
  /**
   * **展开状态由外面给**（2026-08-21）：此前住在每个节点自己的 `useState` 里，树一重挂全塌。
   * 现在是一张按路径记的表，面板切走再切回来照样展开着（`state/files-memory.ts`）。
   * 不给就退回旧行为（根展开、别的收着）。
   */
  展开?: ReadonlySet<string> | undefined
  onToggle?: ((path: string, open: boolean) => void) | undefined
}) {
  const [自开, 设自开] = useState(depth === 0)
  const open = 展开 ? 展开.has(path) : 自开
  const setOpen = (f: (v: boolean) => boolean) => {
    const 下 = f(open)
    if (展开 && onToggle) onToggle(path, 下)
    else 设自开(下)
  }
  /** 有东西悬在这一行上。**放置高亮**——不给的话人不知道会落到哪个目录 */
  const [悬着, 设悬着] = useState(false)
  const [菜单, 设菜单] = useState<{ top: number; left: number } | undefined>(undefined)
  const [listing, setListing] = useState<Listing | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  /**
   * **收到过的那个令牌**。用来分辨「第一次读」与「被要求重读」——
   * 后者要清掉上一次的错误（上一次读失败的目录，重读时应当有机会成功）。
   */
  const 读过的令牌 = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!open) return
    const 要重读 = 读过的令牌.current !== undefined && 读过的令牌.current !== 刷新令牌
    // 已经读到了、也没人要求重读，就不再问
    if (!要重读 && (listing || error)) return
    读过的令牌.current = 刷新令牌
    load(path)
      .then((r) => {
        setListing(r)
        // **重读成功就把上一次的错抹掉**：留着的话人看到的是一段过期的坏消息
        setError(undefined)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [open, listing, error, load, path, 刷新令牌])

  return (
    <li
      className={`tree-node${悬着 ? " drop-on" : ""}`}
      onDragOver={
        onDrop
          ? (e) => {
              /**
               * **最里面那一层赢**：不 `stopPropagation` 的话事件冒到父目录，
               * 高亮与落点就不是你看到的那一行了。
               */
              e.preventDefault()
              e.stopPropagation()
              设悬着(true)
            }
          : undefined
      }
      onDragLeave={onDrop ? () => 设悬着(false) : undefined}
      onDrop={
        onDrop
          ? (e) => {
              e.preventDefault()
              e.stopPropagation()
              设悬着(false)
              onDrop(path, [...e.dataTransfer.files])
            }
          : undefined
      }
    >
      <Row
        className="tree-row"
        /* 缩进量**是数据**（树的层级），不是设计决定——与内核占比条同一条理由 */
        style={{ paddingLeft: `calc(var(--dawn-space-2) + ${depth} * var(--dawn-space-3))` }}
        onClick={() => setOpen((v) => !v)}
        {...(depth > 0 ? 浮层事件(浮, name, undefined, [{ 图: "文件夹", 文: 所在目录(path) }], "文件夹", 树上的卡) : {})}
        onContextMenu={
          操作 && depth > 0
            ? (e) => {
                e.preventDefault()
                e.stopPropagation()
                设菜单(菜单位置(e))
              }
            : undefined
        }
      >
        <span className="name">
          {/* 一个三角靠旋转表达两态：两个不同的字形会让展开看起来像换了个东西 */}
          <三角图标 className={`tree-caret${open ? " open" : ""}`} />
          <类型图标 类="dir" />
          {name || "／"}
        </span>
      </Row>
      {/**
        * **目录的删除入口：一颗常驻的「⋯」**（2026-08-18）。
        *
        * 照会话行那颗——**不做成悬停才出现的**。这个项目为
        * 「看不见的能力等于不存在」栽过两次（没标签的 `＋`、
        * `opacity: 0` 的删除键），两次作者的话都是「没有这个功能」，
        * 而两次代码都是好的。
        *
        * **必须在 `</Row>` 外面**：`Row` 自己就是个 `<button>`，
        * 套进去既是非法的 HTML，也会让外层那颗的可及名字**吞掉**
        * 内层的 `aria-label`——`getByRole` 于是一次匹配到两个元素。
        * （2026-08-18 e2e 当场抓到。）
        *
        * 树根那一行不给：**删掉你正站着的那个目录之后，树指向哪儿？**
        */}
      {操作 && depth > 0 ? <行操作钮 path={path} name={name} kind="dir" 操作={操作} 菜单={菜单} 设菜单={设菜单} /> : null}
      {open ? (
        error ? (
          // **读不了要说出来**，不是显示成一个空目录
          <p className="caveat tree-note">{error}</p>
        ) : !listing ? (
          <Loader label={t("正在读目录")} inline />
        ) : (
          <ul className="tree-list">
            {listing.entries.map((e) =>
              e.kind === "dir" ? (
                <DirNode
                  key={e.name}
                  path={path ? `${path}/${e.name}` : e.name}
                  name={e.name}
                  depth={depth + 1}
                  selected={selected}
                  onSelect={onSelect}
                  load={load}
                  {...(刷新令牌 === undefined ? {} : { 刷新令牌 })}
                  {...(操作 ? { 操作 } : {})}
                  {...(浮 ? { 浮 } : {})}
                  {...(onDrop ? { onDrop } : {})}
                  {...(展开 ? { 展开 } : {})}
                  {...(onToggle ? { onToggle } : {})}
                />
              ) : (
                <FileRow
                  key={e.name}
                  path={path ? `${path}/${e.name}` : e.name}
                  entry={e}
                  depth={depth}
                  selected={selected}
                  onSelect={onSelect}
                  {...(操作 ? { 操作 } : {})}
                  {...(浮 ? { 浮 } : {})}
                />
              ),
            )}
            {/* **忽略与省略都要出声**，否则人会以为那些文件不存在 */}
            {listing.ignored > 0 || listing.omitted > 0 ? (
              <li>
                <p className="hint tree-note">
                  {listing.ignored > 0 ? tf("已忽略 {0} 项（.git / node_modules 等）", listing.ignored) : ""}
                  {listing.ignored > 0 && listing.omitted > 0 ? "；" : ""}
                  {listing.omitted > 0 ? tf("另有 {0} 项未列出（一层最多 1000）", listing.omitted) : ""}
                </p>
              </li>
            ) : null}
          </ul>
        )
      ) : null}
    </li>
  )
}

/* ── 预览面 ──────────────────────────────────────────────────────── */

/**
 * 一个文件的预览。
 *
 * **三态各说各的话**：图直接显示、文本显示内容、**其它说清是什么多大**——
 * 一片空白会被读成「这个文件是空的」。
 */
/** 一次传输此刻的样子。**速度在这一层算**——底下那层不认识时钟 */
export interface 传输态 {
  transferred: number
  total?: number
  state: "running" | "done" | "failed" | "cancelled"
  error?: string
  /** 每秒多少字节。**刚开始没有**，不拿 0 冒充「一点都不动」 */
  速度?: number
  /** 落在本机哪儿。传完之后要说得出来，否则人得自己去猜 */
  target?: string
  /** 传的是哪个文件（basename）。卡上第一行写它——一根没有名字的条不知道在传谁 */
  name?: string
  方向?: "下载" | "上传"
}

export function FilePreview({
  path,
  content,
  onOpenExternally,
  onDownload,
  onDelete,
  进废纸篓,
}: {
  path: string | undefined
  content: FileContent | undefined
  onOpenExternally: (path: string) => void
  /** 给了才画「下载」。**本地文件不给**——它已经在这台机器上了 */
  onDownload?: (path: string) => void
  /** 给了才画那颗删除。**文案跟着 `进废纸篓` 走** */
  onDelete?: (path: string) => void
  /** 这台机器上删了还回得来吗。**本地 true、远端 false** */
  进废纸篓?: boolean
}) {
  if (!path) {
    return <EmptyState title={t("选一个文件")} description={t("上面是这台机器上的目录。")} />
  }
  if (!content) return <Loader label={t("正在读文件")} />

  return (
    <div className="preview">
      <header className="preview-head">
        <span className="name">{path}</span>
        <span className="sub">
          {content.mediaType} · {bytes(content.bytes)}
        </span>
        {onDownload ? (
          <Button variant="ghost" size="sm" onClick={() => onDownload(path)}>
            {t("下载")}
          </Button>
        ) : null}
        {/**
          * **本地删和远端删不是同一个操作，所以文案必须不同**（批 5）。
          *
          * 本地走 Electron 的废纸篓（后悔得回来），远端只有 SFTP `unlink`
          * （没了就是没了）。同一颗按钮、同一个「删除」二字，
          * 一边可恢复一边不可恢复——**这次的代价是数据**。
          */}
        {onDelete ? (
          <Button variant="ghost" size="sm" onClick={() => onDelete(path)}>
            {进废纸篓 ? t("移到废纸篓") : t("永久删除")}
          </Button>
        ) : null}
      </header>

      {content.kind === "table" ? (
        <数据表 t={content.table} />
      ) : content.kind === "pdf" ? (
        <PdfPreview base64={content.base64} path={path} onOpenExternally={onOpenExternally} />
      ) : content.kind === "image" ? (
        <img
          className="preview-img"
          src={`data:${content.mediaType};base64,${content.base64}`}
          alt={tf("预览：{0}", path)}
        />
      ) : content.kind === "text" ? (
        <>
          {/* markdown 走渲染，别的按原文——**代码不该被当成 markdown 改写** */}
          {content.mediaType === "text/markdown" ? (
            <AgentMarkdown text={content.text} streaming={false} />
          ) : (
            <pre className="preview-text">{content.text}</pre>
          )}
          {content.truncated ? (
            <p className="hint">
              文件较大，只显示了前 {bytes(content.truncated.keptBytes)}（共{" "}
              {bytes(content.truncated.originalBytes)}）
            </p>
          ) : null}
        </>
      ) : (
        <div className="preview-other">
          {/* **说清是什么、多大**，并给一条出路 */}
          <p className="unknown">{t("不能在应用里预览")}</p>
          <p className="caveat">{content.reason}</p>
          <div className="state-action">
            <Button variant="outline" size="sm" onClick={() => onOpenExternally(path)}>
              {t("用系统程序打开")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * PDF（②-A′ · F5）。交给 **Chromium 自带的阅读器**——它就在这个进程里，
 * 而自己拿 pdf.js 再实现一遍是拿一个几百 KB 的依赖去换一个已经有的东西。
 *
 * ## 为什么是 blob，不是 `file://` 也不是 `data:`
 *
 * - **`file://` 会开第二条读盘的路**，那意味着路径守卫要在两个地方各写一遍——
 *   而两份守卫迟早有一份落后（②-A′ · F1 的全部重量就在那一份上）。
 * - **`data:` 在 frame 里被 Chromium 拦掉**（navigation to data: URL 的老限制）。
 *
 * blob 用的是**渲染进程已经拿到的字节**，不新增任何读取能力，
 * CSP 里因此只需要 `object-src blob:` 这一条。
 */
function PdfPreview({
  base64,
  path,
  onOpenExternally,
}: {
  base64: string
  path: string
  onOpenExternally: (path: string) => void
}) {
  const url = useMemo(() => {
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))
  }, [base64])

  /**
   * **用完要还。** blob URL 活到文档结束为止——翻十个 PDF 就是十份字节
   * 一直躺在内存里，而它们的原件还在磁盘上好好的。
   */
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <>
      <embed className="preview-pdf" src={url} type="application/pdf" aria-label={tf("预览：{0}", path)} />
      {/* **留一条出路**：内嵌阅读器不是万能的，而人可能只是想拿它去打印 */}
      <div className="state-action">
        <Button variant="text" size="sm" onClick={() => onOpenExternally(path)}>
          {t("用系统程序打开")}
        </Button>
      </div>
    </>
  )
}

/* ── 整个视图 ────────────────────────────────────────────────────── */

/**
 * 一张表（2026-08-14）。
 *
 * **摘要在上、数据在下**：人打开一个数据文件，第一个问题是「多大、有哪些列」，
 * 第二个才是「长什么样」。反过来排的话，得先滚过一屏数据才知道它有多少行。
 *
 * **推断出来的类型要写着「推断」**：CSV 没有 schema，
 * 把猜出来的摆成事实，下一步就会有人拿它当依据。
 *
 * 类型**从协议推导**（`FileContent`），不从 `files/table.ts` 引——
 * 那是后端模块，而这一屏与后端之间只该有协议这一层
 * （本文件头注的原话：*「目录与文件内容的类型从协议推导，不在这里再抄一份」*）。
 */
/**
 * 推断出来的那几个类型名。**它们既是值又是标签**——
 * 与命令分组（`commands.ts` 的 `COMMAND_GROUPS`）同一个形状：
 * 协议上传过来的是中文原文，那就是 msgid；翻译发生在渲染处。
 *
 * `msgid()` 只是让扫描看得见这几句，运行时什么都不做。
 * 不写的话，英文表里那六条会被判成「谁也不用的孤儿」——
 * 而它们其实天天在用，只是调用点是个变量。
 */
const 类型名 = [
  msgid("数值"),
  msgid("整数"),
  msgid("布尔"),
  msgid("日期"),
  msgid("文本"),
  msgid("空"),
] as const

function 数据表({ t: 表 }: { t: Extract<FileContent, { kind: "table" }>["table"] }) {
  return (
    <div className="table-preview">
      <p className="table-summary">
        {表.totalRows === undefined
          ? tf("{0} 列 · 行数未知（文件没读完）", String(表.columns.length))
          : tf("{0} 行 × {1} 列", String(表.totalRows), String(表.columns.length))}
      </p>
      {/* **截断要出声**（规格 7.5）：一份被砍过的表和完整的长得一模一样 */}
      {表.truncated ? <p className="caveat">{表.truncated}</p> : null}
      {表.columns.length === 0 ? (
        <EmptyState title={t("这个文件里没有列")} description={t("它可能是空的，或者不是分隔文本。")} />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {表.columns.map((c, i) => (
                  <th key={`${c.name}-${i}`}>
                    <span className="col-name">{c.name}</span>
                    {/* 类型与缺失各占一行：**它们是两个问题**，挤在一起谁都看不清 */}
                    <span className="col-type">{tf("推断：{0}", t(c.inferred))}</span>
                    {c.missing > 0 ? (
                      <span className="col-missing">{tf("缺 {0}", String(c.missing))}</span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {表.rows.map((r, i) => (
                <tr key={i}>
                  {表.columns.map((_c, j) => (
                    <td key={j}>{r[j] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * 传输卡（2026-08-21 重画；作者：*「服务器下载的进度条，太丑了」*）。
 *
 * 上一版是一根 4px 的线加一串字挤在一行。现在三行：
 *   ① 方向图标 + 文件名 + 右边的百分比（或状态词）
 *   ② 进度条（总量未知时走不定式的流光，**不拿 0 当分母**——那会画出一根永远是满的条）
 *   ③ 已传 / 总量 · 速度 · 预计剩余 + 取消
 * 完成 / 失败 / 取消各自换色换词；完成写落在哪儿。
 */
function 传输卡({ 传输, onCancel }: { 传输: 传输态; onCancel?: () => void }) {
  const 有总量 = Boolean(传输.total && 传输.total > 0)
  const 比 = 有总量 ? Math.min(1, 传输.transferred / 传输.total!) : undefined
  const 剩秒 =
    有总量 && 传输.速度 && 传输.速度 > 0 && 传输.state === "running"
      ? Math.max(0, Math.round((传输.total! - 传输.transferred) / 传输.速度))
      : undefined
  const 剩余 =
    剩秒 === undefined ? undefined : 剩秒 >= 3600 ? tf("约 {0} 小时", Math.round(剩秒 / 360) / 10) : 剩秒 >= 60 ? tf("约 {0} 分钟", Math.ceil(剩秒 / 60)) : tf("约 {0} 秒", 剩秒)
  // 完成时右上角写 100%，「传好了：落点」在下面那行说；失败 / 取消用词
  const 状态词 =
    传输.state === "done" ? "100%" : 传输.state === "failed" ? t("失败") : 传输.state === "cancelled" ? t("已取消") : undefined
  return (
    <div className={`xfer xfer-${传输.state}`} role="status" aria-live="polite">
      <div className="xfer-head">
        <span className="xfer-icon" aria-hidden="true">
          {传输.方向 === "上传" ? <上传图标 /> : <下载图标 />}
        </span>
        <span className="xfer-name" title={传输.name ?? ""}>
          {传输.name ?? (传输.方向 === "上传" ? t("上传") : t("下载"))}
        </span>
        <span className="xfer-pct">
          {状态词 ?? (比 === undefined ? "…" : `${Math.floor(比 * 100)}%`)}
        </span>
      </div>
      <div className={`xfer-bar${比 === undefined && 传输.state === "running" ? " indeterminate" : ""}`}>
        <div
          className="xfer-fill"
          style={{ width: `${比 === undefined ? (传输.state === "running" ? 40 : 100) : 比 * 100}%` }}
        />
      </div>
      <div className="xfer-foot">
        <span className="xfer-text">
          {传输.state === "done"
            ? tf("传好了：{0}", 传输.target ?? "")
            : 传输.state === "cancelled"
              ? t("取消了，没有留下半截文件")
              : 传输.state === "failed"
                ? tf("传输失败：{0}", 传输.error ?? "")
                : [
                    `${bytes(传输.transferred)} / ${有总量 ? bytes(传输.total!) : "？"}`,
                    传输.速度 ? tf("{0}/秒", bytes(Math.round(传输.速度))) : undefined,
                    剩余,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
        </span>
        {传输.state === "running" && onCancel ? (
          <Button variant="text" size="inline" onClick={onCancel}>
            {t("取消")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export type SearchResult = ResponseOf<"searchFiles">

/**
 * 搜索结果单（dock-polish ③）。**截断要出声**：停在哪条预算上、看了多少、跳过了几个目录，
 * 一句话说清——「只有这些」与「只看了这些」在屏幕上必须长得不一样。
 */
function SearchResults({
  查询,
  结果,
  错,
  忙,
  根,
  selected,
  onPick,
}: {
  查询: string
  结果: SearchResult | undefined
  错: string | undefined
  忙: boolean
  根: string
  selected: string | undefined
  onPick: (m: SearchResult["matches"][number]) => void
}) {
  if (!查询) return <div className="files-search-results"><EmptyState title={t("输文件名的一部分开始搜")} /></div>
  if (错) return <div className="files-search-results"><EmptyState title={t("搜不了")} description={错} /></div>
  if (!结果) return <Loader label={t("搜索中")} />
  const 根前缀 = 根 === "" ? "" : `${根.replace(/\/+$/, "")}/`
  const 显示 = (p: string) => (根前缀 && p.startsWith(根前缀) ? p.slice(根前缀.length) : p)
  const 截断句 = 结果.truncated
    ? 结果.truncated === "matches"
      ? tf("只列了前 {0} 条就停了——再打几个字缩小范围", 结果.matches.length)
      : 结果.truncated === "visited"
        ? tf("看了 {0} 条还没看完就停了——换个起点或再打几个字", 结果.visited)
        : tf("搜了一会儿没搜完（看了 {0} 条）——换个起点或再打几个字", 结果.visited)
    : undefined
  const 跳过句 = 结果.skippedDirs > 0 ? tf("没进 {0} 个默认忽略的目录（.git、node_modules 这类）", 结果.skippedDirs) : undefined
  return (
    <nav className="file-tree files-search-results" aria-label={t("搜索结果")} aria-busy={忙}>
      {结果.matches.length === 0 ? (
        <EmptyState title={tf("没有名字里带「{0}」的", 查询)} description={tf("看了 {0} 条", 结果.visited)} />
      ) : (
        <ul className="tree-list">
          {结果.matches.map((m) => {
            const 相 = 显示(m.path)
            const 斜 = 相.lastIndexOf("/")
            const 名 = 斜 >= 0 ? 相.slice(斜 + 1) : 相
            const 在 = 斜 >= 0 ? 相.slice(0, 斜) : ""
            return (
              <li key={m.path}>
                <Row active={m.path === selected} className="tree-row search-hit" onClick={() => onPick(m)}>
                  {m.kind === "dir" ? <文件夹图标 className="row-icon" /> : <文件图标 className="row-icon" />}
                  <span className="sess">
                    <span className="name">{名}</span>
                    {在 ? <span className="sub">{在}</span> : null}
                  </span>
                </Row>
              </li>
            )
          })}
        </ul>
      )}
      {截断句 || 跳过句 ? (
        <p className="caveat files-search-note">
          {截断句}
          {截断句 && 跳过句 ? " · " : ""}
          {跳过句}
        </p>
      ) : null}
    </nav>
  )
}

export function FilesView({
  selected,
  content,
  loadDir,
  onSelect,
  onOpenExternally,
  onInitLayout,
  layoutNote,
  机器,
  初始根,
  onDownload,
  传输,
  onCancel,
  onUpload,
  onDelete,
  onDeleteDir,
  onDropUpload,
  进废纸篓,
  刷新令牌 = 0,
  铺开,
  onExpand,
  onShrink,
  search,
  路径,
  onInsert,
  展开,
  onToggle,
}: {
  selected: string | undefined
  content: FileContent | undefined
  loadDir: (path: string) => Promise<Listing>
  onSelect: (path: string) => void
  onOpenExternally: (path: string) => void
  /**
   * 按科研目录结构初始化（2026-08-14）。
   *
   * **入口放在文件这一屏**，因为它做的事就是在这棵树上建目录——
   * 放进设置里的话，人得先想到「这是个设置」才找得到它。
   */
  onInitLayout?: () => void
  /** 上一次初始化做了什么。**做完要出声**，否则按下去像什么都没发生 */
  layoutNote?: string | undefined
  /**
   * 这棵树长在哪台机器上（批 2，2026-08-17）。
   *
   * **硬要求，不是装饰**：不写的话本地与远端在屏幕上长得一模一样，
   * 而那正是这一片此前坏掉的方式——远端会话里打开「文件」，
   * 它安静地给你看本机的一个临时目录，你根本没机会发现。
   *
   * 现在只有「本机」一种（批 3 接远端），但**位置与措辞先立好**。
   */
  机器?: string
  /**
   * 树从哪儿开始（批 3，2026-08-17）。
   *
   * **跟着你点进来的那个东西**：项目 → 工作区根（空串）；
   * 远端会话 → 那段会话在服务器上的当前目录；服务器 → 家目录。
   * 换机器时 `App` 会给这个组件换 `key`，于是状态从头来——
   * **上一台机器的路径留在这儿，比空着更坏**。
   */
  初始根?: string
  /** 给了才画「下载」。**本地文件不给**——它已经在这台机器上了 */
  onDownload?: (path: string) => void
  传输?: 传输态 | undefined
  onCancel?: () => void
  /**
   * 传一个本机文件到**树上当前这个目录**。给了才画那颗按钮。
   *
   * **不长第二棵树**：另一头永远交给系统对话框，
   * 与 composer 里那颗「上传文件」是同一条路。两棵树的话，
   * 「我现在看的是哪边」就得靠人一直盯着。
   */
  onUpload?: (dir: string) => void
  /**
   * 变一下这个数，树就重读一遍（2026-08-17，e2e 撞出来的）。
   *
   * `DirNode` 读过一次就缓存住了——**传完一个文件之后树不会自己跟上**，
   * 屏幕上说「传好了」而树里没有它。那正是「看起来一切正常」的反面。
   */
  刷新令牌?: number
  onDelete?: (path: string) => void
  /** 删一个目录（树行上那颗「⋯」）。**与删文件分开传**：调用方要能只给其中一个 */
  onDeleteDir?: (path: string) => void
  /**
   * 把本机文件拖到某个目录上（2026-08-18）。
   *
   * **拖到哪一行就传到哪个目录**，而不是一律传到「当前目录」——
   * 后者要人自己记住当前是哪儿，而**拖拽这个动作本身就在指位置**。
   * 代价是每一行都要有放置高亮，不然人不知道会落在哪儿。
   */
  onDropUpload?: (dir: string, files: readonly File[]) => void
  进废纸篓?: boolean
  /**
   * **横着分两栏的那一种摆法**（2026-08-19）。
   *
   * 同一个组件两种排布，**由坞的宽度决定**（`RIGHT_DOCK_两栏起点`）：
   *   - 窄：**上下**摞——树在上、预览在下。280px 横着切两半，两边都读不出来。
   *   - 宽：**左树、右预览**（08-20 作者定的；08-19 那版是反过来的，理由见 `.files-wide`）。
   *
   * **不为此复制一个组件**：两份长得一样的东西迟早各自漂移，
   * 而这里真正不同的只有一件事——横着还是竖着。
   */
  铺开?: boolean
  /** 展开状态与切换（按路径记，面板外面持有；见 `DirNode.展开`） */
  展开?: ReadonlySet<string> | undefined
  onToggle?: ((path: string, open: boolean) => void) | undefined
  /**
   * 「加宽」那颗按钮。**给了才画**——已经宽了的那一份不给：
   * 一颗按下去什么都不变的按钮，比没有这颗更让人怀疑自己点错了。
   */
  onExpand?: () => void
  /**
   * 「收窄」——加宽的反向（2026-08-21，作者：*「有加宽选项，怎么能没有恢复选项呢」*）。
   * 只在已经铺开时给；与「加宽」互斥，同一个位置两颗里永远只有一颗。
   */
  onShrink?: () => void
  /** 按名字搜（dock-polish ③）。没给就不画那颗放大镜 */
  search?: ((query: string, 根: string) => Promise<SearchResult>) | undefined
  /**
   * 行菜单要的两样（dock-polish ⑤）：怎么把树上的路径算成「相对 / 绝对」，
   * 以及「插进输入框」往哪儿插。`路径` 没给就没有行菜单（连「⋯」也不画）。
   */
  路径?: ((path: string) => { 相对: string; 绝对: string }) | undefined
  onInsert?: ((text: string) => void) | undefined
}) {
  const [跳到, 设跳到] = useState("")
  /**
   * **搜索模式**（2026-08-21，dock-polish ③）。放大镜一按，路径框换成搜索框，
   * 树换成结果单；Esc 或再按一次放大镜退出。两个框**占位符不同**——
   * 长得一样的两个输入框等于没有判据（2026-08-12 那三次）。
   */
  const [搜着, 设搜着] = useState(false)
  const [查询, 设查询] = useState("")
  const [结果, 设结果] = useState<SearchResult | undefined>(undefined)
  const [搜错, 设搜错] = useState<string | undefined>(undefined)
  const [搜忙, 设搜忙] = useState(false)
  /**
   * 树根。**跳转就是换根**（批 2，2026-08-17）。
   *
   * 只跳转，不搜索（见设计文档第三节）：跳转是一次 `readdir`，
   * 而搜索在 SFTP 里**没有原语**，得递归走目录或者在别人机器上起一个 `find`
   * ——那要有上界，而且截断了必须出声。等真的点累了再做。
   *
   * **路径不存在不用我们报**：换了根之后 `DirNode` 自己会把 `readdir`
   * 的错误显示出来。多写一处校验就是多一份会说不同话的实现。
   */
  const [根, 设根] = useState(初始根 ?? "")
  /**
   * **手动刷新**（2026-08-19，作者要的）。
   *
   * 作者：*「可以给 DAWN 的文件里面增加一个刷新的按钮，这样就不需要
   * 试试更新了，多刷新其实就好了。」*
   *
   * 自动刷新只管三件事（传完、删完、切回窗口）；在服务器上跑着的脚本
   * 把文件写出来的那一刻，**界面上没有任何东西会知道**。与其替它猜
   * 什么时候该刷，不如给一颗按钮——**自己按一下，比「怎么还不出来」好**。
   *
   * 它与外面传进来的令牌**相加**：两个来源，任一个动一下这一层就重读，
   * 而且走的是同一条路（展开状态不丢）。
   */
  const [手动刷新, 设手动刷新] = useState(0)
  const 合令牌 = (刷新令牌 ?? 0) + 手动刷新
  /** 悬停在哪一行上（那张卡是 fixed 的，画在面板最外层） */
  const [浮着的, 设浮着的] = useState<悬停浮层 | undefined>(undefined)
  /** 行菜单做完一件事说一句（复制成没成）；三秒后自己消失 */
  const [行注, 设行注] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!行注) return
    const id = setTimeout(() => 设行注(undefined), 3000)
    return () => clearTimeout(id)
  }, [行注])
  const 操作: 行操作 | undefined = useMemo(
    () =>
      路径
        ? {
            路径,
            onInsert,
            onDelete: onDelete || onDeleteDir ? (p, kind) => (kind === "dir" ? onDeleteDir?.(p) : onDelete?.(p)) : undefined,
            onNote: 设行注,
          }
        : undefined,
    [路径, onInsert, onDelete, onDeleteDir],
  )
  // 打字停 250ms 再搜；结果回来时查询已经变了就丢掉——晚到的旧结果不许盖新的
  useEffect(() => {
    if (!搜着 || !search) return
    const q = 查询.trim()
    if (!q) {
      设结果(undefined)
      设搜错(undefined)
      return
    }
    let 作废 = false
    const id = setTimeout(() => {
      设搜忙(true)
      search(q, 根)
        .then((r) => {
          if (作废) return
          设结果(r)
          设搜错(undefined)
        })
        .catch((e: unknown) => {
          if (作废) return
          设搜错(e instanceof Error ? e.message : String(e))
        })
        .finally(() => {
          if (!作废) 设搜忙(false)
        })
    }, 250)
    return () => {
      作废 = true
      clearTimeout(id)
    }
  }, [搜着, 查询, 根, search])
  const 树宽 = useStore($fileTreeWidth)
  const 树高 = useStore($fileTreeHeight)
  const 容器 = useRef<HTMLDivElement>(null)
  const 容器宽 = () => 容器.current?.clientWidth ?? 0
  // 减掉「这是哪台机器」那一条：它占的是第一行，树从第二行起
  const 容器高 = () =>
    (容器.current?.clientHeight ?? 0) -
    (容器.current?.querySelector<HTMLElement>(".files-where")?.offsetHeight ?? 0)
  return (
    <div
      ref={容器}
      className={铺开 ? "files-view files-wide" : "files-view"}
      /**
       * **树那一栏的尺寸由人拖**（2026-08-21，作者：*「面板中的文件和预览之间，应该可以挪动」*）。
       * 宽坞是列宽、窄坞是行高——两个数两个键，上下界按容器此刻的尺寸夹。
       */
      style={
        铺开
          ? { gridTemplateColumns: `${树宽}px minmax(0, 1fr)` }
          : { gridTemplateRows: `auto ${树高}px minmax(0, 1fr)` }
      }
    >
      <HoverCard 浮着的={浮着的} />
      <div className="files-where">
        <span className="files-where-name">{机器 ?? t("本机")}</span>
        {搜着 && search ? (
          <input
            className="control files-jump files-search"
            value={查询}
            autoFocus
            aria-label={t("搜文件名")}
            placeholder={t("输文件名的一部分，Esc 退出搜索")}
            onChange={(e) => 设查询(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                设搜着(false)
                设查询("")
              }
            }}
          />
        ) : (
          <input
            className="control files-jump"
            value={跳到}
            aria-label={t("跳到路径")}
            placeholder={t("输一个目录路径，回车跳过去")}
            onChange={(e) => 设跳到(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              const p = 跳到.trim()
              // **空的就不跳**：那不是「回到根目录」，那是「什么都没输」
              /**
               * **只削结尾的斜杠，不削开头的**（2026-08-17 修）。
               *
               * 削开头对本地是对的（那边是相对工作区的路径），
               * 对远端是错的——**那边绝对路径才是常态**，
               * `/home/dawn` 被削成 `home/dawn` 之后 `readdir` 当然找不到。
               *
               * 本地输了绝对路径会被守卫**响亮拒绝**，那比悄悄改写它好：
               * 悄悄改写等于替人决定他想去哪儿。
               */
              if (p) 设根(p.replace(/\/+$/, ""))
            }}
          />
        )}
        {search ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={搜着 ? t("退出搜索") : t("搜文件名")}
            aria-pressed={搜着}
            onClick={() => {
              设搜着((v) => !v)
              设查询("")
            }}
          >
            <搜索图标 />
          </Button>
        ) : null}
        {/**
         * **跳走之后要有路回来**（2026-08-17）。
         * 没有这颗的话，一次手滑的跳转会让人以为整棵树没了——
         * 而这个项目已经为「进得去出不来」改过一次（项目概览与文件的返回键）。
         */}
        {/**
          * 图标按钮，照作者常用的 SFTP 客户端那一颗。读屏名字是「刷新当前文件夹」。
          * **不用 `title=`**（设计契约：无样式、半秒延迟、与主题不符）。
          */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("刷新当前文件夹")}
          onClick={() => 设手动刷新((n) => n + 1)}
        >
          <刷新图标 />
        </Button>
        {onUpload ? (
          <Button variant="ghost" size="sm" onClick={() => onUpload(根)}>
            {t("传到这里")}
          </Button>
        ) : null}
        {根 !== (初始根 ?? "") ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              设根(初始根 ?? "")
              设跳到("")
            }}
          >
            {t("回到根目录")}
          </Button>
        ) : null}
        {/**
          * **「加宽」常驻在这一行**（2026-08-19）。
          *
          * 拖坞边上那根把手也能加宽，**但那条路没人找得到**——
          * 本项目为「看不见的能力等于不存在」栽过两次（没有标签的 `＋`、
          * `opacity: 0` 的 `×`），两次作者的反馈都是「没有这个功能」，
          * 而两次代码都是好的。
          *
          * 也**不自动加宽**（比如「一选中图片就把坞拉开」）：
          * 那会在人只想瞄一眼文件名的时候把对话挤窄。
          */}
        {onExpand ? (
          <Button variant="ghost" size="sm" onClick={onExpand}>
            {t("加宽")}
          </Button>
        ) : null}
        {onShrink ? (
          <Button variant="ghost" size="sm" onClick={onShrink}>
            {t("收窄")}
          </Button>
        ) : null}
      </div>
      {/**
        * 树外面套一层盒子，缝贴在盒子的尾边（宽坞在右、窄坞在下）。
        * **不能直接贴在 `nav` 上**：它 `overflow: auto`，贴在外沿的 4px 会被裁掉、点不到
        * （e2e 第一次跑就是这么红的）。
        */}
      {行注 ? (
        <p className="caveat files-row-note" role="status">
          {行注}
        </p>
      ) : null}
      <div className="file-tree-box">
      {搜着 && search ? (
        <SearchResults
          查询={查询.trim()}
          结果={结果}
          错={搜错}
          忙={搜忙}
          根={根}
          selected={selected}
          onPick={(m) => {
            if (m.kind === "dir") {
              // 选中目录 = 跳过去；搜索到此为止
              设根(m.path)
              设搜着(false)
              设查询("")
            } else onSelect(m.path)
          }}
        />
      ) : (
      <nav className="file-tree" aria-label={t("工作区文件")}>
        {onInitLayout ? (
          <div className="tree-actions">
            <Button variant="ghost" size="sm" onClick={onInitLayout}>
              {t("按科研目录结构初始化")}
            </Button>
            {/* **做完要出声**：建了几个目录、约定写没写进去，各说各的话 */}
            {layoutNote ? <p className="caveat">{layoutNote}</p> : null}
          </div>
        ) : null}
        <ul className="tree-list">
          {/**
            * `key` **只跟着根走**：换根要重新挂载，否则上一处的列表还留在那儿。
            *
            * **令牌不再拌进 key**（2026-08-19）：拌进去等于「刷新 = 重挂整棵树」，
            * 而重挂会把每一层展开状态清零。它现在作为 prop 往下走，
            * 每一层自己重读——**展开的还展开着**。
            */}
          <DirNode
            key={根}
            path={根}
            name={根}
            depth={0}
            selected={selected}
            onSelect={onSelect}
            load={loadDir}
            刷新令牌={合令牌}
            {...(操作 ? { 操作 } : {})}
            浮={设浮着的}
            {...(onDropUpload ? { onDrop: onDropUpload } : {})}
            {...(展开 ? { 展开 } : {})}
            {...(onToggle ? { onToggle } : {})}
          />
        </ul>
      </nav>
      )}
        <SideSash
          attach="edge"
          orientation={铺开 ? "vertical" : "horizontal"}
          width={铺开 ? 树宽 : 树高}
          min={FILE_TREE_MIN}
          max={铺开 ? 容器宽() : 容器高()}
          onResize={(px, phase) => (铺开 ? setFileTreeWidth(px, 容器宽(), phase === "commit") : setFileTreeHeight(px, 容器高(), phase === "commit"))}
          label={铺开 ? t("调整文件树宽度") : t("调整文件树高度")}
        />
      </div>
      {/**
        * **传输条属于这个面板，不属于预览**（2026-08-17，e2e 撞出来的）。
        *
        * 作者要的是*「当前文件下面有一个传输条」*，第一版我照字面把它放进了
        * `FilePreview`——**而上传时根本没有选中文件**，预览是空态，
        * 条子压根不存在。屏幕上的表现是「点了传到这里，什么都没发生」。
        *
        * 文案也不能写死方向：同一根条子两头都用。
        *
        * 总大小取不到时不画那根条，只报已传了多少——
        * **拿 0 当分母会让进度条一直是满的**，那比没有条更骗人。
        */}
      {传输 ? <传输卡 传输={传输} {...(onCancel ? { onCancel } : {})} /> : null}
      <section className="file-preview">
        <FilePreview
          path={selected}
          content={content}
          onOpenExternally={onOpenExternally}
          {...(onDownload ? { onDownload } : {})}
          {...(onDelete ? { onDelete } : {})}
          {...(进废纸篓 === undefined ? {} : { 进废纸篓 })}
        />
      </section>
    </div>
  )
}
