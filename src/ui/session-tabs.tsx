/**
 * 对话区顶上的会话分栏（2026-08-23 作者要的，照他给的截图）：
 * **同一个项目文件夹 / 同一台服务器下的会话**横着排一行，点哪个切哪个；末尾一个「＋」在同一处再开一段。
 * 侧栏那一列照旧——这是同一件事的第二个入口，不是另一份状态：哪些会话、谁在跑、谁当前，都从 App 那份 store 来。
 *
 * 散的（临时）会话没有「同一处」，不画这一条。
 */
import { useEffect, useRef, useState, type MouseEvent } from "react"
import { createPortal } from "react-dom"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 加号描边图标 } from "./icons.js"

export interface 分栏项 {
  sessionId: string
  title: string
  running?: boolean | undefined
  unread?: boolean | undefined
  /** 挂在坞里（侧边对话，2026-09-24）：标题后画一个「坞」——同一段只在一处，人得看得出它此刻在哪 */
  inDock?: boolean | undefined
}

export function SessionTabs({
  tabs,
  current,
  onPick,
  onNew,
  onClose,
  onPutInDock,
}: {
  tabs: readonly 分栏项[]
  current: string
  onPick: (sessionId: string) => void
  /** 在同一处再开一段；没有就不画「＋」 */
  onNew?: (() => void) | undefined
  /** 关掉一段 = 收进归档（藏，不是删；侧栏「已归档」能找回）。不给就不画那颗 × */
  onClose?: ((sessionId: string) => void) | undefined
  /**
   * 右键「放进坞里」（侧边对话，2026-09-24）。不给就没有右键菜单。
   * **右键是看不见的入口**——坞的「对话」页签与命令面板是另两条，不靠它被发现。
   */
  onPutInDock?: ((sessionId: string) => void) | undefined
}) {
  const 当前 = useRef<HTMLDivElement>(null)
  /** 右键开着的那格菜单：哪一段、开在哪 */
  const [菜单, 设菜单] = useState<{ sessionId: string; title: string; top: number; left: number } | undefined>(undefined)
  // 切到哪个就把哪个滚进视野——分栏多了会横向滚
  useEffect(() => {
    // jsdom 没有 scrollIntoView（同 slash-menu 那处）——CI 的 mac runner 上它以未处理异常的形式把整轮测试打红过（2026-08-28）
    const el = 当前.current
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ inline: "nearest", block: "nearest" })
  }, [current])
  if (tabs.length === 0) return null
  return (
    <div className="session-tabs" role="tablist" aria-label={t("同一处的会话")}>
      {tabs.map((x) => {
        const 选中 = x.sessionId === current
        return (
          // **一格 = 标签 + 一颗 ×**：× 不能嵌在标签按钮里（按钮不许套按钮），做成兄弟
          <div
            key={x.sessionId}
            {...(选中 ? { ref: 当前 } : {})}
            className={`session-tab-wrap${选中 ? " current" : ""}`}
            data-running={x.running ? "1" : undefined}
            data-unread={x.unread ? "1" : undefined}
            data-in-dock={x.inDock ? "1" : undefined}
            {...(onPutInDock
              ? {
                  onContextMenu: (e: MouseEvent) => {
                    e.preventDefault()
                    // 下面、右边放不下就往里收（与文件树那份菜单同一个算法，高度只有一项）
                    设菜单({ sessionId: x.sessionId, title: x.title, top: Math.min(e.clientY, window.innerHeight - 48), left: Math.min(e.clientX, window.innerWidth - 160) })
                  },
                }
              : {})}
          >
            <Button
              variant="ghost"
              size="inline"
              role="tab"
              aria-selected={选中}
              className="session-tab"
              data-session={x.sessionId}
              onClick={() => onPick(x.sessionId)}
            >
              <span className="session-tab-dot" aria-hidden="true" />
              {/* 全名给悬浮看——顶格里只留截断后的那截。title 摆在这个 span（不是按钮）上，设计契约禁按钮用原生 title */}
              <span className="session-tab-title" data-authored="1" title={x.title}>{x.title}</span>
              {x.inDock ? <span className="session-tab-dock">{t("坞")}</span> : null}
            </Button>
            {/* 走 primitive，几何仍归 `.session-tab-close`（2026-09-08：那条扫描修好后露出来的） */}
            {onClose ? (
              <Button
                variant="ghost"
                size="inline"
                className="session-tab-close"
                aria-label={tf("关掉「{0}」（收进归档）", x.title)}
                onClick={() => onClose(x.sessionId)}
              >
                ×
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
      {/* 与文件树那份右键菜单同一个写法（`files.tsx` 的 `menu-scrim`）：点空处、再右键都收起。
          挂到 body 上：分栏那一条会横向滚，`fixed` 的菜单留在里面会被它的裁切与叠放层级管住 */}
      {菜单 && onPutInDock ? createPortal(
        <>
          <div className="menu-scrim" onClick={() => 设菜单(undefined)} onContextMenu={(e) => { e.preventDefault(); 设菜单(undefined) }} />
          <div className="row-menu" role="menu" aria-label={tf("分栏操作：{0}", 菜单.title)} style={{ top: 菜单.top, left: 菜单.left }}>
            <Button
              variant="ghost"
              size="inline"
              role="menuitem"
              onClick={() => {
                const id = 菜单.sessionId
                设菜单(undefined)
                onPutInDock(id)
              }}
            >
              {t("放进坞里")}
            </Button>
          </div>
        </>,
        document.body,
      ) : null}
    </div>
  )
}
