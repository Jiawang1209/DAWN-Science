import type { SkillReadReceipt } from "../protocol/skill-reads.js"
import { t, tf } from "./i18n/index.js"

export function SkillReadSummary({ receipt }: { receipt: SkillReadReceipt }) {
  const source = receipt.scope === "project" ? t("项目技能") : receipt.scope === "global" ? t("全局技能") : t("内置技能")
  return <div className="skill-read-summary">
    <span>{tf("已读取技能 {0}", receipt.name)}</span>
    <span className="hint">{source} · {receipt.resourcePath} · {receipt.partial ? t("部分内容") : t("完整内容")}</span>
  </div>
}

export function SkillReadDetails({ receipt }: { receipt: SkillReadReceipt }) {
  return <div className="skill-read-details">
    <dl>
      <dt>{t("技能清单")}</dt><dd>{receipt.manifestPath}</dd>
      <dt>{t("已读资源")}</dt><dd>{receipt.resourcePath}</dd>
      <dt>{t("读取方式")}</dt><dd>{receipt.via}</dd>
      <dt>{t("内容 SHA-256")}</dt><dd>{receipt.contentSha256}</dd>
    </dl>
    <p className="hint">{t("仅记录技能说明已读取，不代表代码已执行或科学结论已验证。")}</p>
  </div>
}
