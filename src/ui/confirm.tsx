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

export interface ConfirmRequest {
  title: string
  /** 会发生什么。**带真数字**，不是「相关数据」 */
  detail: React.ReactNode
  /** 不会发生什么。**移除项目时这一句是要害** */
  safety?: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
}

export function ConfirmDialog({
  request,
  onCancel,
}: {
  request: ConfirmRequest | undefined
  onCancel: () => void
}) {
  if (!request) return null

  return (
    <div
      className="confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel()
      }}
    >
      <div className="confirm">
        <h2 className="confirm-title">{request.title}</h2>
        <div className="confirm-detail">{request.detail}</div>
        {request.safety ? <p className="confirm-safety">{request.safety}</p> : null}
        <div className="confirm-actions">
          {/* **焦点落在「取消」上**：危险的那个要多按一下才够得到 */}
          <Button autoFocus variant="secondary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              request.onConfirm()
              onCancel()
            }}
          >
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
