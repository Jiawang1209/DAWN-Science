import { useId, type RefObject } from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 搜索图标, 下载图标 } from "./icons.js"

/** 当前对话只有查找、导出两个动作，直接展示，避免多点一层菜单。 */
export function ConversationActions({ title, triggerRef, onFind, onExport, exporting }: {
  title: string
  triggerRef: RefObject<HTMLButtonElement | null>
  onFind: () => void
  onExport?: (() => void) | undefined
  exporting?: boolean
}) {
  const findTip = useId()
  const exportTip = useId()
  return <div className="conv-actions" role="group" aria-label={tf("会话操作：{0}", title)}>
    <span className="conv-action-tip-wrap">
      <Button ref={triggerRef} variant="secondary" size="icon" aria-label={t("查找当前对话")} aria-describedby={findTip} onClick={onFind}>
        <搜索图标 />
      </Button>
      <span id={findTip} role="tooltip" className="conv-action-tip">{t("查找当前对话")}</span>
    </span>
    {onExport ? <span className="conv-action-tip-wrap">
      <Button variant="secondary" size="icon" className="conv-export" aria-label={t("导出对话")} aria-describedby={exportTip} disabled={exporting} onClick={onExport}>
        <下载图标 />
      </Button>
      <span id={exportTip} role="tooltip" className="conv-action-tip">{t("导出对话")}</span>
    </span> : null}
  </div>
}
