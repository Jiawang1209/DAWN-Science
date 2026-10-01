/** 待答的权限询问：显式聚焦后才接管 Enter / Escape。 */
import { useRef } from "react"
import { 在组词 } from "./ime.js"
import { t } from "./i18n/index.js"
import { Button } from "./primitives.js"
import type { 待答的权限 } from "./state/transcript-slot.js"

export function PermissionCard({
  permission,
  onAnswer,
}: {
  permission: 待答的权限
  onAnswer: (requestId: string, optionId?: string) => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const allow =
    permission.options.find((option) => option.kind === "allow_once") ??
    permission.options.find((option) => option.kind.startsWith("allow"))

  return (
    <div
      ref={cardRef}
      className="perm-card"
      role="group"
      aria-label={t("这次操作要你决定")}
      aria-keyshortcuts={allow ? "Enter Escape" : "Escape"}
      tabIndex={0}
      onClick={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest("button")) cardRef.current?.focus()
      }}
      onKeyDown={(event) => {
        if (event.defaultPrevented || 在组词(event)) return

        const 是快捷键 = event.key === "Enter" || event.key === "Escape"
        const 有修饰键 = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey
        if (是快捷键 && (event.repeat || 有修饰键)) {
          // Enter 落在按钮上时浏览器会模拟 click；无效组合也得取消默认激活。
          if (event.key === "Enter") event.preventDefault()
          return
        }

        if (event.key === "Enter" && allow) {
          event.preventDefault()
          onAnswer(permission.requestId, allow.optionId)
        } else if (event.key === "Escape") {
          event.preventDefault()
          onAnswer(permission.requestId, undefined)
        }
      }}
    >
      <p className="perm-card-title">{permission.title}</p>
      <p className="perm-card-shortcuts">
        {allow ? t("回车 允许 · Esc 先不做") : t("Esc 先不做")}
      </p>
      <div className="perm-card-options">
        {permission.options.map((option) => (
          <Button
            key={option.optionId}
            variant={option.kind.startsWith("allow") ? "primary" : "outline"}
            size="sm"
            onClick={() => onAnswer(permission.requestId, option.optionId)}
          >
            {option.name}
          </Button>
        ))}
        {/* 拒绝是一个回答；此按钮则是取消这一轮，二者不能混为一谈。 */}
        <Button variant="text" size="sm" onClick={() => onAnswer(permission.requestId, undefined)}>
          {t("这一轮先不做")}
        </Button>
      </div>
    </div>
  )
}
