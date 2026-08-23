/**
 * 对话区顶上的会话分栏（2026-08-23 作者要的，照他给的截图）：
 * **同一个项目文件夹 / 同一台服务器下的会话**横着排一行，点哪个切哪个；末尾一个「＋」在同一处再开一段。
 * 侧栏那一列照旧——这是同一件事的第二个入口，不是另一份状态：哪些会话、谁在跑、谁当前，都从 App 那份 store 来。
 *
 * 散的（临时）会话没有「同一处」，不画这一条。
 */
import { useEffect, useRef } from "react"
import { Button } from "./primitives.js"
import { t } from "./i18n/index.js"
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
}: {
  tabs: readonly 分栏项[]
  current: string
  onPick: (sessionId: string) => void
  /** 在同一处再开一段；没有就不画「＋」 */
  onNew?: (() => void) | undefined
}) {
  const 当前 = useRef<HTMLButtonElement>(null)
  // 切到哪个就把哪个滚进视野——分栏多了会横向滚
  useEffect(() => {
    当前.current?.scrollIntoView({ inline: "nearest", block: "nearest" })
  }, [current])
  if (tabs.length === 0) return null
  return (
    <div className="session-tabs" role="tablist" aria-label={t("同一处的会话")}>
      {tabs.map((x) => {
        const 选中 = x.sessionId === current
        return (
          <Button
            key={x.sessionId}
            {...(选中 ? { ref: 当前 } : {})}
            variant="ghost"
            size="inline"
            role="tab"
            aria-selected={选中}
            className={`session-tab${选中 ? " current" : ""}`}
            data-session={x.sessionId}
            data-running={x.running ? "1" : undefined}
            data-unread={x.unread ? "1" : undefined}
            onClick={() => onPick(x.sessionId)}
          >
            <span className="session-tab-dot" aria-hidden="true" />
            <span className="session-tab-title" data-authored="1">{x.title}</span>
          </Button>
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
