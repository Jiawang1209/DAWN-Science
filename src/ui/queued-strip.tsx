/**
 * **待发条**（2026-09-23，学自 Codex；spec `2026-09-23-待发消息-design.md`；2026-09-25 调整方向改，spec `2026-09-25-调整方向-design.md` §2）。
 *
 * 回复还在跑时发的话先排着，排着的就摆在输入框上方：一条一行，标「排队中」（这一轮做完才送），
 * 后面三颗**常驻**的按钮（悬停才出现的东西等于不存在）：
 *   - 调整方向：不等了——停掉当前这一步，这句起新的一轮，其余排着的照排；
 *   - 到坞里问：这句拿去坞里另开一段问，主区不动（只有主区给；坞里那段本来就在坞里，不画）；
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
  onToDock,
  onError,
  disabled,
}: {
  items: readonly QueuedMessage[]
  /** 取回 / 调整方向。失败要出声：那条多半刚好已经送出去了 */
  onEdit: (id: string, action: "remove" | "redirect") => Promise<void>
  /** 到坞里问。**不给 = 不画那颗**（坞里那段） */
  onToDock?: ((id: string) => Promise<void>) | undefined
  onError: (message: string) => void
  /**
   * 从外面把整条置灰（复审 m-C，2026-09-25）：Cmd/Ctrl+回车的调整方向走的是 `writeToSession`，这条不知道它在进行——
   * 那次请求回来之前，其余几条不在运行时的镜像里，点取回 / 调整方向只会得「不在待发单上」。「停止」不在这条上，不受影响。
   */
  disabled?: boolean | undefined
}) {
  // 一次只动一条：按下之后到回执之间再按，会拿一个已经不在单上的 id 去动
  const [忙着的, 设忙着的] = useState<string | undefined>(undefined)
  if (items.length === 0) return null
  const 灰 = disabled === true || 忙着的 !== undefined
  const 动 = (id: string, 做: () => Promise<void>) => {
    设忙着的(id)
    做()
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
      .finally(() => 设忙着的(undefined))
  }
  return (
    <section className="queued-strip" aria-label={t("待发")}>
      <p className="queued-head">{tf("待发 · {0}", items.length)}</p>
      <ul>
        {items.map((q) => (
          <li key={q.id} className="queued-one">
            <span className="queued-tag">{t("排队中")}</span>
            <span className="queued-text">
              {q.text || tf("{0} 张图", q.images?.length ?? 0)}
            </span>
            {q.images?.length ? <span className="queued-imgs">{tf("{0} 张图", q.images.length)}</span> : null}
            <Button size="xs" variant="ghost" disabled={灰} onClick={() => 动(q.id, () => onEdit(q.id, "redirect"))}>
              {t("调整方向")}
            </Button>
            {onToDock ? (
              <Button size="xs" variant="ghost" disabled={灰} onClick={() => 动(q.id, () => onToDock(q.id))}>
                {t("到坞里问")}
              </Button>
            ) : null}
            <Button size="xs" variant="ghost" disabled={灰} onClick={() => 动(q.id, () => onEdit(q.id, "remove"))}>
              {t("取回")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
