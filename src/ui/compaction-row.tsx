/**
 * 转录里的压缩标记（2026-09-27，spec `2026-09-27-上下文用量与压缩-design.md` §2.3）。
 *
 * 每次压缩一定有一条：正在压、压完、没压成（`role="alert"`）、停下了。压完那条说清两件事：
 * **上面的记录都还在**（可见的转录不删任何东西），**模型现在读的是摘要**（点「这次的摘要」看原文）。
 * 按钮不叫「展开 / 收起」——「收起」已经是另一颗按钮的全名（文案互不为子串）。
 */
import { useState } from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { formatTokens } from "./format.js"
import type { TranscriptItem } from "../protocol/index.js"

type 压缩项 = Extract<TranscriptItem, { type: "compaction" }>

/** 起因的说法。缺省（从记录恢复的）不写 */
export function 压缩原因字(r: 压缩项["reason"]): string | undefined {
  return r === "manual"
    ? t("你让压的")
    : r === "threshold"
      ? t("自动：快到上限了")
      : r === "overflow"
        ? t("自动：超过了上限，压完重试这一轮")
        : undefined
}

export function CompactionRow({ item }: { item: 压缩项 }) {
  const [看, 设看] = useState(false)
  const 因 = 压缩原因字(item.reason)
  const 题 =
    item.status === "running"
      ? 因
        ? tf("正在压缩上下文…（{0}）", 因)
        : t("正在压缩上下文…")
      : item.status === "done"
        ? t("已压缩上下文")
        : item.status === "cancelled"
          ? t("上下文压缩停下了，没有改动")
          : tf("上下文没压缩成：{0}", item.error ?? t("没有给出原因"))
  const 量 =
    item.status === "done" && item.tokensBefore !== undefined
      ? item.tokensAfter !== undefined
        ? tf("{0} → 约 {1} tokens", formatTokens(item.tokensBefore), formatTokens(item.tokensAfter))
        : tf("之前约 {0} tokens", formatTokens(item.tokensBefore))
      : undefined
  return (
    <div className="compaction-mark" data-status={item.status} {...(item.status === "failed" ? { role: "alert" } : {})}>
      <p className="compaction-line">
        <span className="compaction-title">{题}</span>
        {item.status === "done" && 因 ? <span className="compaction-meta">{因}</span> : null}
        {量 ? <span className="compaction-meta">{量}</span> : null}
        {item.summary ? (
          <Button variant="ghost" size="inline" className="compaction-toggle" aria-expanded={看} onClick={() => 设看((v) => !v)}>
            {t("这次的摘要")}
          </Button>
        ) : null}
      </p>
      {item.status === "done" ? <p className="hint">{t("早先的对话换成了一段摘要交给模型；上面的记录都还在，模型现在读的是摘要。")}</p> : null}
      {item.status === "done" && item.usage ? (
        <p className="hint">{tf("压缩本身用了 输入 {0} · 输出 {1}", formatTokens(item.usage.input ?? 0), formatTokens(item.usage.output ?? 0))}</p>
      ) : null}
      {看 && item.summary ? <pre className="compaction-summary">{item.summary}</pre> : null}
    </div>
  )
}
