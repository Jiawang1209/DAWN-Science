/**
 * **待发条**（2026-09-23，学自 Codex；spec `2026-09-23-待发消息-design.md`）。
 *
 * 回复还在跑时发的话先排着，排着的就摆在输入框上方：一条一行，标出它在哪张单子上
 * （`排队中` = 这一轮彻底完了才送；`插队中` = 当前工具跑完、下次调模型前送），
 * 后面两颗**常驻**的按钮（悬停才出现的东西等于不存在）：
 *   - 插队：只在排队中的那条上有——不等这一轮完了，下一步就送进去；
 *   - 取回：从单子上拿下来，原文与原图放回输入框，人改完可以再发。
 *
 * 真送到模型的那一刻它从这里消失，同时作为一条用户发言出现在转录里——位置就是模型读到它的位置。
 */
import { useState } from "react"
import type { QueuedMessage } from "../protocol/index.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"

export function 待发条({
  items,
  onEdit,
  onError,
}: {
  items: readonly QueuedMessage[]
  /** 取回 / 改插队。失败要出声：那条多半刚好已经送出去了 */
  onEdit: (id: string, action: "remove" | "steer") => Promise<void>
  onError: (message: string) => void
}) {
  // 一次只动一条：按下之后到回执之间再按，会拿一个已经不在单上的 id 去撤
  const [忙着的, 设忙着的] = useState<string | undefined>(undefined)
  if (items.length === 0) return null
  const 动 = (id: string, action: "remove" | "steer") => {
    设忙着的(id)
    onEdit(id, action)
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
      .finally(() => 设忙着的(undefined))
  }
  return (
    <section className="queued-strip" aria-label={t("待发")}>
      <p className="queued-head">{tf("待发 · {0}", items.length)}</p>
      <ul>
        {items.map((q) => (
          // 8.0 只剩一张单子（插队中没了）；三颗按钮的整份改写是 Task 5
          <li key={q.id} className="queued-one">
            <span className="queued-tag">{t("排队中")}</span>
            <span className="queued-text">
              {q.text || tf("{0} 张图", q.images?.length ?? 0)}
            </span>
            {q.images?.length ? <span className="queued-imgs">{tf("{0} 张图", q.images.length)}</span> : null}
            {q.behavior === "followUp" ? (
              <Button size="xs" variant="ghost" disabled={忙着的 !== undefined} onClick={() => 动(q.id, "steer")}>
                {t("插队")}
              </Button>
            ) : null}
            <Button size="xs" variant="ghost" disabled={忙着的 !== undefined} onClick={() => 动(q.id, "remove")}>
              {t("取回")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
