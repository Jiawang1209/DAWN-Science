/**
 * 连接状态的呈现。
 *
 * **哪一种状态配得上占满全屏，是这个组件的全部内容。**
 *
 * Hermes `DESIGN.md`：*"Reserve the full-screen boot/connecting experience for a
 * genuinely unusable backend."* DAWN 此前把「还没打开项目」也做成了这种待遇——
 * 后端完全正常，界面却什么都不让做。
 *
 *   connecting / exhausted  → 全屏（后端确实用不了）
 *   reconnecting            → 横幅（还能看已有内容）
 *   degraded                → 横幅（后端还在，只是数据可能旧了）
 *   ready                   → 什么都不画
 */
import { useStore } from "@nanostores/react"
import { $connection, MAX_CONNECT_ATTEMPTS } from "./state/index.js"
import { Button, ErrorState, Loader } from "./primitives.js"

import { t, tf } from "./i18n/index.js"
export function ConnectionSurface({
  onRetry,
  onOpenSettings,
}: {
  onRetry: () => void
  onOpenSettings: () => void
}) {
  const c = useStore($connection)

  if (c.phase === "ready") return null

  if (c.phase === "connecting") {
    return (
      <div className="boot-overlay">
        {/* label 是必填的：一个只会说「加载中」的界面说不出「在等什么」 */}
        <Loader label={t("正在连接本地后端…")} />
      </div>
    )
  }

  if (c.phase === "exhausted") {
    return (
      <div className="boot-overlay">
        <ErrorState
          title={tf("连接失败，已重试 {0} 次", c.attempts)}
          detail={c.reason}
          action={
            <div className="state-actions">
              <Button variant="primary" onClick={onRetry}>
                {t("重试")}
              </Button>
              <Button variant="text" onClick={onOpenSettings}>
                {t("检查配置")}
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  if (c.phase === "reconnecting") {
    // **必须给一个点得动的出口**（审查 debug I1）:没有自动重试定时器,`attempt` 会永远
    // 停在 1,`exhausted`(唯一带「重试 / 检查配置」的全屏)在真机上不可达——旧实现只画一个
    // 转圈横幅、零个按钮,后端没起时开 app 就是一个永远转不完、点不动的圈。给手动重试按钮:
    // 点一次 connect,失败则 attempt 累加,到上限后自然进 exhausted。
    return (
      <div className="banner banner-warn" role="status">
        <span>{tf("连接断开（第 {0} / {1} 次）：{2}", c.attempt, MAX_CONNECT_ATTEMPTS, c.reason)}</span>
        <span className="banner-actions">
          <Button variant="text" size="sm" onClick={onRetry}>
            {t("重试")}
          </Button>
          <Button variant="text" size="sm" onClick={onOpenSettings}>
            {t("检查配置")}
          </Button>
        </span>
      </div>
    )
  }

  // degraded：**后端还在**，只是这次没拿到新数据。给横幅，不给遮罩——
  // 全屏会让「还能继续用」这个事实变得不可用
  return (
    <div className="banner banner-stale" role="status">
      <span>{c.reason}</span>
      <Button variant="text" size="inline" onClick={onRetry}>
        {t("重新获取")}
      </Button>
    </div>
  )
}
