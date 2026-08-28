/**
 * 对话区顶上的会话分栏（2026-08-23 作者要的，照他给的截图）：
 * **同一个项目文件夹 / 同一台服务器下的会话**横着排一行，点哪个切哪个；末尾一个「＋」在同一处再开一段。
 * 侧栏那一列照旧——这是同一件事的第二个入口，不是另一份状态：哪些会话、谁在跑、谁当前，都从 App 那份 store 来。
 *
 * 散的（临时）会话没有「同一处」，不画这一条。
 */
import { useEffect, useRef } from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 加号描边图标 } from "./icons.js"

export interface 分栏项 {
  sessionId: string
  title: string
  running?: boolean | undefined
  unread?: boolean | undefined
}

export function SessionTabs({
  tabs,
  current,
  onPick,
  onNew,
  onClose,
}: {
  tabs: readonly 分栏项[]
  current: string
  onPick: (sessionId: string) => void
  /** 在同一处再开一段；没有就不画「＋」 */
  onNew?: (() => void) | undefined
  /** 关掉一段 = 收进归档（藏，不是删；侧栏「已归档」能找回）。不给就不画那颗 × */
  onClose?: ((sessionId: string) => void) | undefined
}) {
  const 当前 = useRef<HTMLDivElement>(null)
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
            </Button>
            {onClose ? (
              <button
                type="button"
                className="session-tab-close"
                aria-label={tf("关掉「{0}」（收进归档）", x.title)}
                onClick={() => onClose(x.sessionId)}
              >
                ×
              </button>
            ) : null}
          </div>
        )
      })}
      {onNew ? (
        <Button variant="ghost" size="icon" className="session-tab-new" aria-label={t("在这里再开一段")} onClick={onNew}>
          <加号描边图标 />
        </Button>
      ) : null}
    </div>
  )
}
