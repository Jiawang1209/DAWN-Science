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
import { useEffect, useMemo, useState } from "react"
import type { ResponseOf } from "../protocol/index.js"
import { Button, EmptyState, Loader, Row } from "./primitives.js"
import { AgentMarkdown } from "./markdown.js"
import { 三角图标 } from "./icons.js"

import { t, tf, msgid } from "./i18n/index.js"
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
 * 一层目录。**按需展开，不预取整棵树**——
 * 一个 `node_modules` 就能让「打开文件视图」变成几十秒。
 */
function DirNode({
  path,
  name,
  depth,
  selected,
  onSelect,
  load,
  onDelete,
}: {
  path: string
  name: string
  depth: number
  selected: string | undefined
  onSelect: (path: string) => void
  load: (path: string) => Promise<Listing>
  /** 删这个目录。**给了才画那颗「⋯」** */
  onDelete?: (path: string) => void
}) {
  const [open, setOpen] = useState(depth === 0)
  const [listing, setListing] = useState<Listing | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!open || listing || error) return
    load(path)
      .then(setListing)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [open, listing, error, load, path])

  return (
    <li className="tree-node">
      <Row
        className="tree-row"
        /* 缩进量**是数据**（树的层级），不是设计决定——与内核占比条同一条理由 */
        style={{ paddingLeft: `calc(var(--dawn-space-2) + ${depth} * var(--dawn-space-3))` }}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="name">
          {/* 一个三角靠旋转表达两态：两个不同的字形会让展开看起来像换了个东西 */}
          <三角图标 className={`tree-caret${open ? " open" : ""}`} /> {name || "／"}
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
      {onDelete && depth > 0 ? (
        <span className="row-actions">
          <Button
            variant="ghost"
            size="icon"
            className="row-more"
            aria-label={tf("目录操作：{0}", name)}
            onClick={() => onDelete(path)}
          >
            ⋯
          </Button>
        </span>
      ) : null}
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
                  {...(onDelete ? { onDelete } : {})}
                />
              ) : (
                <li key={e.name}>
                  <Row
                    className="tree-row"
                    active={selected === (path ? `${path}/${e.name}` : e.name)}
                    style={{ paddingLeft: `calc(var(--dawn-space-2) + ${depth + 1} * var(--dawn-space-3))` }}
                    onClick={() => onSelect(path ? `${path}/${e.name}` : e.name)}
                  >
                    <span className="name">{e.name}</span>
                    <span className="sub">{e.size === undefined ? "" : bytes(e.size)}</span>
                  </Row>
                </li>
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
  进废纸篓,
  刷新令牌 = 0,
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
  进废纸篓?: boolean
}) {
  const [跳到, 设跳到] = useState("")
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
  return (
    <div className="files-view">
      <div className="files-where">
        <span className="files-where-name">{机器 ?? t("本机")}</span>
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
        {/**
         * **跳走之后要有路回来**（2026-08-17）。
         * 没有这颗的话，一次手滑的跳转会让人以为整棵树没了——
         * 而这个项目已经为「进得去出不来」改过一次（项目概览与文件的返回键）。
         */}
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
      </div>
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
          {/** `key` 跟着根走：换根要**重新挂载**，否则上一处的列表还留在那儿 */}
          <DirNode
            key={`${根}#${刷新令牌}`}
            path={根}
            name={根}
            depth={0}
            selected={selected}
            onSelect={onSelect}
            load={loadDir}
            {...(onDeleteDir ? { onDelete: onDeleteDir } : {})}
          />
        </ul>
      </nav>
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
      {传输 ? (
        <div className="xfer">
          {传输.total ? (
            <div className="xfer-bar">
              <div
                className="xfer-fill"
                style={{ width: `${Math.min(100, (传输.transferred / 传输.total) * 100)}%` }}
              />
            </div>
          ) : null}
          <span className="xfer-text">
            {传输.state === "done"
              ? tf("传好了：{0}", 传输.target ?? "")
              : 传输.state === "cancelled"
                ? t("取消了，没有留下半截文件")
                : 传输.state === "failed"
                  ? tf("传输失败：{0}", 传输.error ?? "")
                  : tf(
                      "{0} / {1}{2}",
                      bytes(传输.transferred),
                      传输.total ? bytes(传输.total) : "？",
                      传输.速度 ? tf("　{0}/秒", bytes(Math.round(传输.速度))) : "",
                    )}
          </span>
          {传输.state === "running" && onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t("取消")}
            </Button>
          ) : null}
        </div>
      ) : null}
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
