import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { SessionSummary, TaskSummary } from "../protocol/index.js"
import { Button } from "./primitives.js"
import { 关闭图标, 对话描边图标, 文件夹描边图标 } from "./icons.js"
import { 年月日时分 } from "./format.js"
import { t, tf, $lang } from "./i18n/index.js"

// Match the sidebar hover card's single-card behavior; explicit reading takes priority.
let activeInfo: { card: HTMLDivElement; explicit: boolean; dismiss: () => void } | undefined

/** Project identity and recent conversations, separate from the row's expand action. */
export function ProjectInfo({ name, workspace, tasks, sessionOf, onPick, children }: {
  name: string
  workspace: string
  tasks: readonly TaskSummary[]
  sessionOf?: ((id: string) => SessionSummary | undefined) | undefined
  onPick?: ((task: TaskSummary) => void) | undefined
  children: (showInfo: () => void) => ReactNode
}) {
  const [open, setOpen] = useState<"hover" | "explicit" | undefined>()
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const anchor = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancel = () => clearTimeout(timer.current)
  const close = (restore = false) => {
    cancel()
    setOpen(undefined)
    if (restore) anchor.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus()
  }
  const show = (mode: "hover" | "explicit") => {
    cancel()
    if (activeInfo && activeInfo.card !== card.current) {
      if (mode === "hover" && (activeInfo.explicit || activeInfo.card.contains(document.activeElement))) return
      activeInfo.dismiss()
    }
    setOpen(mode)
  }
  const leave = () => {
    cancel()
    if (open === "hover") timer.current = setTimeout(() => {
      if (!card.current?.contains(document.activeElement)) setOpen(undefined)
    }, 180)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  useLayoutEffect(() => {
    if (!open || !anchor.current || !card.current) return
    const record = { card: card.current, explicit: open === "explicit", dismiss: () => close() }
    activeInfo = record
    const row = anchor.current.getBoundingClientRect()
    const side = anchor.current.closest(".sidebar")?.getBoundingClientRect() ?? row
    const bounds = card.current.getBoundingClientRect()
    const right = side.right + 8
    const left = right + bounds.width <= window.innerWidth - 8 ? right : row.left - bounds.width - 8
    setPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(row.top, window.innerHeight - bounds.height - 8)),
    })
    if (open === "explicit") card.current.focus({ preventScroll: true })
    return () => { if (activeInfo === record) activeInfo = undefined }
  }, [open, name, workspace, tasks.length])
  useEffect(() => {
    if (!open) return
    const outside = (e: Event) => {
      if (!card.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) close()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        close(open === "explicit" || Boolean(card.current?.contains(document.activeElement)))
      }
    }
    const resize = () => close()
    const scroll = (e: Event) => { if (!card.current?.contains(e.target as Node)) close() }
    document.addEventListener("pointerdown", outside)
    document.addEventListener("focusin", outside)
    document.addEventListener("keydown", escape)
    window.addEventListener("resize", resize)
    window.addEventListener("scroll", scroll, true)
    return () => {
      document.removeEventListener("pointerdown", outside)
      document.removeEventListener("focusin", outside)
      document.removeEventListener("keydown", escape)
      window.removeEventListener("resize", resize)
      window.removeEventListener("scroll", scroll, true)
    }
  }, [open])
  const recent = tasks.map(task => {
    const session = task.sessionId ? sessionOf?.(task.sessionId) : undefined
    return { task, title: session?.title ?? task.title ?? t("新任务"), at: session?.lastActiveAt ?? session?.createdAt ?? task.createdAt }
  }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5)
  return <div ref={anchor} className="proj-head" onMouseEnter={() => {
    cancel()
    if (!open) timer.current = setTimeout(() => show("hover"), 420)
  }} onMouseLeave={leave}>
    {children(() => show("explicit"))}
    {open ? createPortal(<div ref={card} className="project-info-card" role="dialog" aria-label={tf("项目信息：{0}", name)}
      lang={$lang.get()} tabIndex={-1} style={position} onMouseEnter={cancel} onMouseLeave={leave}>
      <header className="project-info-head">
        <文件夹描边图标 className="row-icon" /><span>{name}</span>
        <Button variant="ghost" size="icon" aria-label={t("收起信息卡")} onClick={() => close(true)}><关闭图标 /></Button>
      </header>
      <p className="project-info-count"><对话描边图标 className="row-icon" />{tf("{0} 段对话", tasks.length)}</p>
      <p className="project-info-path"><文件夹描边图标 className="row-icon" /><span>{workspace}</span></p>
      <h3 className="project-info-label">{t("最近会话")}</h3>
      {recent.length ? <ul className="project-info-sessions">{recent.map(({ task, title, at }) => <li key={task.taskId}>
        <Button variant="ghost" size="sm" disabled={!onPick} aria-label={tf("打开会话：{0}", title)} onClick={() => { close(); onPick?.(task) }}>
          <对话描边图标 className="row-icon" /><span className="project-info-session"><span>{title}</span><time dateTime={at}>{年月日时分(at)}</time></span>
        </Button>
      </li>)}</ul> : <p className="project-info-empty">{t("还没有会话")}</p>}
    </div>, document.body) : null}
  </div>
}
