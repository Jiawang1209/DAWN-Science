/** 转录里的一轮失败：醒目标出原因，原始错误保留在折叠区。 */
import { t } from "./i18n/index.js"

export function FailedNotice({ text, rawError }: { text: string; rawError?: string }) {
  return (
    <div className="failed-notice" role="status" aria-label={t("这一轮没做成")}>
      <p className="failed-notice-line">
        <span className="failed-notice-dot" aria-hidden="true" />
        <strong className="failed-notice-title">{t("这一轮没做成")}</strong>
        <span className="failed-notice-reason">{text}</span>
      </p>
      {rawError ? (
        <details className="failed-notice-details">
          <summary>{t("查看原始错误")}</summary>
          <pre>{rawError}</pre>
        </details>
      ) : null}
    </div>
  )
}
