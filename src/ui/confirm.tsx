/**
 * 不可逆操作的确认（2026-08-10）。
 *
 * ## 为什么是自己写的，而不是 `window.confirm`
 *
 * **Electron 里 `confirm()` 直接抛错**（`prompt/alert/confirm` 都不支持），
 * 而且这条已经有扫描盯着——2026-08-08 我自己写下「不要用 `window.prompt`」
 * 然后自己违反了它，直到作者打开发现白屏。
 *
 * ## 它必须说清三件事
 *
 * 1. **要删的是哪一个**（名字，不是「这一项」）
 * 2. **会连带删掉什么，带真数字**——「确定要删除吗？」什么都没说
 * 3. **不会动什么**。移除项目最容易被误读成删文件夹，
 *    所以那句「磁盘上的文件夹不会被删除」必须在按下之前就在屏幕上。
 *
 * **摧毁性按钮不做默认焦点**：回车顺手一按就没了的东西，不该这么容易按到。
 */
import { Button } from "./primitives.js"

import { t } from "./i18n/index.js"
export interface ConfirmRequest {
  title: string
  /** 会发生什么。**带真数字**，不是「相关数据」 */
  detail: React.ReactNode
  /** 不会发生什么。**移除项目时这一句是要害** */
  safety?: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  /**
   * 第三个选项（批 4b，2026-08-17）。
   *
   * 上传撞名要给「覆盖 / 另存一份 / 取消」三条路——**两条不够**：
   * 只有「覆盖」和「取消」的话，人想两个都留就只能先改名再传一次。
   *
   * **文案不许与另外两个互为子串**（设计契约那条扫描）：
   * 「覆盖」「另存一份」「取消」三个互不包含。
   */
  altLabel?: string
  onAlt?: () => void
  /**
   * 框关掉了（不管走的哪条路）。**批量上传靠它往下走**——
   * 一批里有一个撞名、人点了取消，不能让整批就此卡住。
   */
  onDismiss?: () => void
}

export function ConfirmDialog({
  request,
  onCancel,
}: {
  request: ConfirmRequest | undefined
  onCancel: () => void
}) {
  if (!request) return null

  /**
   * **每一条出口都走这里**（2026-08-18）。
   *
   * 取消、Escape、确认、第三个选项——四条路，`onDismiss` 必须都发一次。
   * 写成四份的话迟早有一条忘了，而忘了的表现是**批量上传卡在半路**
   * （等一个永远不来的回调），看起来像应用死了。
   */
  const 收场 = (先干: (() => void) | undefined) => () => {
    先干?.()
    request.onDismiss?.()
    onCancel()
  }

  return (
    <div
      className="confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      onKeyDown={(e) => {
        if (e.key === "Escape") 收场(undefined)()
      }}
    >
      <div className="confirm">
        <h2 className="confirm-title">{request.title}</h2>
        <div className="confirm-detail">{request.detail}</div>
        {request.safety ? <p className="confirm-safety">{request.safety}</p> : null}
        <div className="confirm-actions">
          {/* **焦点落在「取消」上**：危险的那个要多按一下才够得到 */}
          <Button autoFocus variant="secondary" size="sm" onClick={收场(undefined)}>
            {t("取消")}
          </Button>
          {request.altLabel && request.onAlt ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                request.onAlt?.()
                onCancel()
              }}
            >
              {request.altLabel}
            </Button>
          ) : null}
          <Button
            variant="danger"
            size="sm"
            onClick={收场(request.onConfirm)}
          >
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
