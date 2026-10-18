/**
 * 对话区顶上的会话分栏（2026-08-23 作者要的，照他给的截图）：
 * **同一个项目文件夹 / 同一台服务器下的会话**横着排一行，点哪个切哪个；末尾一个「＋」在同一处再开一段。
 * 侧栏那一列照旧——这是同一件事的第二个入口，不是另一份状态：哪些会话、谁在跑、谁当前，都从 App 那份 store 来。
 *
 * 散的（临时）会话没有「同一处」，不画这一条。
 */
import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react"
import { SessionMenu, SessionMenuItems, SessionRenameInput, hasSessionMenuActions, type SessionMenuActions } from "./session-menu-items.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 加号描边图标, 关闭图标 } from "./icons.js"

export interface 分栏项 {
  sessionId: string
  title: string
  running?: boolean | undefined
  unread?: boolean | undefined
  /** 挂在坞里（侧边对话，2026-09-24）：标题后画一个「坞」——同一段只在一处，人得看得出它此刻在哪 */
  inDock?: boolean | undefined
  pinned?: boolean | undefined
  /** 终端不能放进坞，其余会话动作仍可用。 */
  canDock?: boolean | undefined
}

export function SessionTabs({
  tabs,
  current,
  onPick,
  onNew,
  onClose,
  onPutInDock,
  onSessionActions,
  onReorder,
  topbar = false,
}: {
  /** 放在应用顶栏时，选中页签承担当前会话标题。 */
  topbar?: boolean
  tabs: readonly 分栏项[]
  current: string
  onPick: (sessionId: string) => void
  /** 在同一处再开一段；没有就不画「＋」 */
  onNew?: (() => void) | undefined
  /** 关掉一段 = 收进归档（藏，不是删；侧栏「已归档」能找回）。不给就不画那颗 × */
  onClose?: ((sessionId: string) => void) | undefined
  /**
   * 右键「放进坞里」（侧边对话，2026-09-24）。只给此回调时保留原来的单项菜单。
   * **右键是看不见的入口**——坞的「对话」页签与命令面板是另两条，不靠它被发现。
   */
  onPutInDock?: ((sessionId: string) => void) | undefined
  /** 与侧栏共用动作；按被右键的 id 提供闭包，缺少任务上下文时不提供额外动作。 */
  onSessionActions?: ((sessionId: string) => SessionMenuActions | undefined) | undefined
  /** 同一处的会话按新顺序保存；不给时页签不可拖动 */
  onReorder?: ((orderedIds: string[]) => void) | undefined
}) {
  const 当前 = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const [拖动中, 设拖动中] = useState<string | undefined>(undefined)
  const [落点, 设落点] = useState<string | undefined>(undefined)
  /** 右键开着的那格菜单：哪一段、开在哪 */
  const [菜单, 设菜单] = useState<{ sessionId: string; title: string; top: number; left: number } | undefined>(undefined)
  const [editing, setEditing] = useState<{ tab: 分栏项; actions: SessionMenuActions } | undefined>(undefined)
  const restoreTabFocus = (id: string) => [...root.current?.querySelectorAll<HTMLElement>(".session-tab") ?? []].find(el => el.dataset.session === id)?.focus()
  const canOpenMenu = (tab: 分栏项) => Boolean((onPutInDock && tab.canDock !== false) || hasSessionMenuActions(onSessionActions?.(tab.sessionId)))
  const 开菜单 = (x: 分栏项, clientX: number, clientY: number) =>
    设菜单({ sessionId: x.sessionId, title: x.title, top: clientY, left: clientX })
  const menuTab = 菜单 ? tabs.find(x => x.sessionId === 菜单.sessionId) : undefined
  const menuActions = menuTab ? onSessionActions?.(menuTab.sessionId) ?? {} : {}
  const 放下 = (目标: string) => {
    设落点(undefined)
    const from = tabs.findIndex((x) => x.sessionId === 拖动中)
    const to = tabs.findIndex((x) => x.sessionId === 目标)
    设拖动中(undefined)
    if (from < 0 || to < 0 || from === to) return
    const ids = tabs.map((x) => x.sessionId)
    const [id] = ids.splice(from, 1)
    if (!id) return
    ids.splice(ids.indexOf(目标), 0, id)
    onReorder?.(ids)
  }
  // 切到哪个就把哪个滚进视野——分栏多了会横向滚
  useEffect(() => {
    // jsdom 没有 scrollIntoView（同 slash-menu 那处）——CI 的 mac runner 上它以未处理异常的形式把整轮测试打红过（2026-08-28）
    const showCurrent = () => {
      const el = 当前.current
      if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ inline: "nearest", block: "nearest" })
    }
    showCurrent()
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(showCurrent)
    if (root.current) observer?.observe(root.current)
    return () => observer?.disconnect()
  }, [current, tabs.length])
  if (tabs.length === 0) return null
  return (
    <div ref={root} className={`session-tabs${topbar ? " session-tabs-topbar" : ""}`} role="tablist" aria-label={t("同一处的会话")}>
      {tabs.map((x) => {
        const 选中 = x.sessionId === current
        return (
          // **一格 = 标签 + 一颗 ×**：× 不能嵌在标签按钮里（按钮不许套按钮），做成兄弟
          <div
            key={x.sessionId}
            {...(选中 ? { ref: 当前 } : {})}
            className={`session-tab-wrap${选中 ? " current" : ""}${拖动中 === x.sessionId ? " dragging" : ""}${落点 === x.sessionId && 拖动中 !== x.sessionId ? " drop-target" : ""}`}
            data-running={x.running ? "1" : undefined}
            data-unread={x.unread ? "1" : undefined}
            data-in-dock={x.inDock ? "1" : undefined}
            draggable={onReorder !== undefined && editing?.tab.sessionId !== x.sessionId}
            onDragStart={onReorder ? (e: DragEvent<HTMLDivElement>) => {
              e.dataTransfer.effectAllowed = "move"
              e.dataTransfer.setData("text/plain", x.sessionId)
              设拖动中(x.sessionId)
            } : undefined}
            onDragOver={onReorder ? (e: DragEvent<HTMLDivElement>) => {
              e.preventDefault()
              设落点(x.sessionId)
            } : undefined}
            onDrop={onReorder ? (e: DragEvent<HTMLDivElement>) => {
              e.preventDefault()
              放下(x.sessionId)
            } : undefined}
            onDragEnd={onReorder ? () => {
              设拖动中(undefined)
              设落点(undefined)
            } : undefined}
            {...(canOpenMenu(x)
              ? {
                  onContextMenu: (e: MouseEvent) => {
                    e.preventDefault()
                    开菜单(x, e.clientX, e.clientY)
                  },
                }
              : {})}
          >
            {editing?.tab.sessionId === x.sessionId ? (
              <SessionRenameInput title={x.title} initialValue={x.title} onSubmit={title => { editing.actions.onRename?.(title); setEditing(undefined); requestAnimationFrame(() => restoreTabFocus(x.sessionId)) }} onCancel={() => { setEditing(undefined); requestAnimationFrame(() => restoreTabFocus(x.sessionId)) }} />
            ) : <Button
              variant="ghost"
              size="inline"
              role="tab"
              aria-selected={选中}
              {...(canOpenMenu(x) ? { "aria-haspopup": "menu" as const } : {})}
              className="session-tab"
              data-session={x.sessionId}
              onKeyDown={e => {
                if (canOpenMenu(x) && (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) {
                  e.preventDefault()
                  const rect = e.currentTarget.getBoundingClientRect()
                  开菜单(x, rect.left, rect.bottom)
                }
              }}
              onClick={() => onPick(x.sessionId)}
            >
              <span className="session-tab-dot" aria-hidden="true" />
              {/* 全名给悬浮看——顶格里只留截断后的那截。title 摆在这个 span（不是按钮）上，设计契约禁按钮用原生 title */}
              <span className={`session-tab-title${topbar && 选中 ? " conv-title" : ""}`} data-authored="1" title={x.title}>{x.title}</span>
              {x.inDock ? <span className="session-tab-dock">{t("坞")}</span> : null}
            </Button>}
            {/* 走 primitive，几何仍归 `.session-tab-close`（2026-09-08：那条扫描修好后露出来的） */}
            {onClose ? (
              <Button
                variant="ghost"
                size="inline"
                className="session-tab-close"
                aria-label={tf("关掉「{0}」（收进归档）", x.title)}
                onClick={() => onClose(x.sessionId)}
              >
                <关闭图标 />
              </Button>
            ) : null}
          </div>
        )
      })}
      {onNew ? (
        <Button variant="ghost" size="icon" className="session-tab-new" aria-label={t("在这里再开一段")} onClick={onNew}>
          <加号描边图标 />
        </Button>
      ) : null}
      {菜单 && menuTab ? (
        <SessionMenu key={菜单.sessionId} label={tf("分栏操作：{0}", 菜单.title)} position={菜单} onClose={() => 设菜单(undefined)} restoreFocus={() => restoreTabFocus(菜单.sessionId)} onContextMenu={e => {
          const underneath = typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(e.clientX, e.clientY).find(el => el.classList.contains("session-tab") || el.closest(".session-tab")) : undefined
          const button = underneath?.closest<HTMLElement>(".session-tab")
          const tab = button ? tabs.find(x => x.sessionId === button.dataset.session) : undefined
          if (tab && canOpenMenu(tab)) 开菜单(tab, e.clientX, e.clientY)
          else 设菜单(undefined)
        }}>
          <SessionMenuItems pinned={menuTab.pinned} unread={menuTab.unread} actions={menuActions} onRename={() => setEditing({ tab: menuTab, actions: menuActions })} onClose={() => 设菜单(undefined)} onPutInDock={onPutInDock && menuTab.canDock !== false ? () => onPutInDock(menuTab.sessionId) : undefined} />
        </SessionMenu>
      ) : null}
    </div>
  )
}
