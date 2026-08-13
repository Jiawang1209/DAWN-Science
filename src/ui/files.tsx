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

import { t, tf } from "./i18n/index.js"
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
}: {
  path: string
  name: string
  depth: number
  selected: string | undefined
  onSelect: (path: string) => void
  load: (path: string) => Promise<Listing>
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
export function FilePreview({
  path,
  content,
  onOpenExternally,
}: {
  path: string | undefined
  content: FileContent | undefined
  onOpenExternally: (path: string) => void
}) {
  if (!path) {
    return <EmptyState title={t("选一个文件")} description={t("左边是这个项目的工作区。")} />
  }
  if (!content) return <Loader label={t("正在读文件")} />

  return (
    <div className="preview">
      <header className="preview-head">
        <span className="name">{path}</span>
        <span className="sub">
          {content.mediaType} · {bytes(content.bytes)}
        </span>
      </header>

      {content.kind === "pdf" ? (
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

export function FilesView({
  selected,
  content,
  loadDir,
  onSelect,
  onOpenExternally,
  onInitLayout,
  layoutNote,
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
}) {
  return (
    <div className="files-view">
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
          <DirNode path="" name="" depth={0} selected={selected} onSelect={onSelect} load={loadDir} />
        </ul>
      </nav>
      <section className="file-preview">
        <FilePreview path={selected} content={content} onOpenExternally={onOpenExternally} />
      </section>
    </div>
  )
}
