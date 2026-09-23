/**
 * 轮次导航（codex-polish ①，2026-08-22，学自 dsh-codex-ui 的 `TurnNavigator`，Apache-2.0，思路借、代码自己写）。
 *
 * 对话左缘一条竖的刻度尺：**一刻一轮你说的话**。鼠标靠近时刻度像鱼眼一样放大（离指针越近越长），
 * 旁边浮出那一轮的头几十个字；点了就把那一轮滚到视野里。科研会话动辄几十轮，没有它只能靠滚。
 *
 * 只画用户那一方的轮——「我问过什么」才是人找位置的锚；agent 的回答跟在后面。
 * 少于 3 轮不画：两刻的尺子没有信息。
 */
import { memo, useEffect, useMemo, useRef, useState } from "react"
import type { TranscriptItem } from "../protocol/index.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"

const 摘要上限 = 48

/** 离指针越近越长：高斯一样的鼓包 */
export function 刻度宽(i: number, 悬在: number | null): number {
  if (悬在 === null) return 6
  const d = Math.abs(i - 悬在)
  return Math.round(6 + 14 * Math.exp(-(d * d) / 2.2))
}

/**
 * **它只认你说过的话，所以模型在写的时候它不该动**（2026-09-22，`perf-render`）。
 *
 * 它吃的是整份 `items`，而那份每 33ms 换一次——诊断里它在 30 轮历史时
 * 每次落字重画一整列刻度（每刻一颗 `Button`，每次提交约 14 个）。
 * 比较器只看**用户那几轮的 id 与文字**：模型在写的是 agent 那一条，两边一样就不重画。
 */
export const TurnNavigator = memo(TurnNavigatorImpl, (a, b) => 同用户轮(a.items, b.items))

function 同用户轮(a: readonly TranscriptItem[], b: readonly TranscriptItem[]): boolean {
  if (a === b) return true
  const 取 = (xs: readonly TranscriptItem[]) => xs.filter((x) => x.type === "turn" && x.who === "user")
  const x = 取(a)
  const y = 取(b)
  if (x.length !== y.length) return false
  return x.every((it, i) => {
    const o = y[i]!
    return it.id === o.id && it.type === "turn" && o.type === "turn" && it.text === o.text
  })
}

function TurnNavigatorImpl({
  items,
  确保可见,
}: {
  items: readonly TranscriptItem[]
  /**
   * 那一轮还没渲染出来时（在「只渲染最近若干条」的预算之外）先把它放出来。
   * **必须是稳定引用**：这个组件是 `memo` 的，比较器只看用户那几轮。
   */
  确保可见?: ((id: string) => void) | undefined
}) {
  const 轮 = useMemo(
    () => items.filter((x): x is Extract<TranscriptItem, { type: "turn" }> => x.type === "turn" && x.who === "user").map((x) => ({ id: x.id, 摘要: x.text.replace(/\s+/g, " ").trim().slice(0, 摘要上限) })),
    [items],
  )
  const [悬在, 设悬在] = useState<number | null>(null)
  const [当前, 设当前] = useState<string | undefined>(undefined)
  const 尺 = useRef<HTMLDivElement>(null)

  /**
   * 真正滚的那一层：`use-stick-to-bottom` 把 `.turns` 当外壳，**自己再套一层无类名的滚动容器**。
   * 监听挂在 `.turns` 上永远收不到 scroll（2026-08-22 e2e 抓的），所以要找真正 overflow 的那一层。
   */
  const 找滚动层 = (): HTMLElement | undefined => {
    const 壳 = 尺.current?.parentElement?.querySelector<HTMLElement>(".turns")
    if (!壳) return undefined
    const 内 = 壳.firstElementChild as HTMLElement | null
    return 内 && /auto|scroll/.test(getComputedStyle(内).overflowY) ? 内 : 壳
  }

  // 看着哪一轮：滚动容器里最靠上、且进入视野的那一轮
  useEffect(() => {
    if (轮.length === 0) return
    const 容器 = 找滚动层()
    if (!容器) return
    const 算 = () => {
      // 滚到底了就是在看最后一轮——不然最后一轮太短时永远轮不到它
      if (容器.scrollTop + 容器.clientHeight >= 容器.scrollHeight - 2) {
        设当前(轮[轮.length - 1]!.id)
        return
      }
      const 顶 = 容器.getBoundingClientRect().top
      let 命中: string | undefined
      for (const { id } of 轮) {
        const el = 容器.querySelector<HTMLElement>(`[data-turn-id="${CSS.escape(id)}"]`)
        if (!el) continue
        if (el.getBoundingClientRect().top - 顶 <= 容器.clientHeight * 0.4) 命中 = id
      }
      设当前(命中 ?? 轮[0]!.id)
    }
    算()
    容器.addEventListener("scroll", 算, { passive: true })
    return () => 容器.removeEventListener("scroll", 算)
  }, [轮])

  if (轮.length < 3) return null

  const 跳 = (id: string) => {
    const 找 = () => 找滚动层()?.querySelector<HTMLElement>(`[data-turn-id="${CSS.escape(id)}"]`)
    const el = 找()
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
    /**
     * **点了没反应是最坏的一种**（2026-09-22）：那一轮在「只渲染最近若干条」的预算之外时，
     * DOM 里根本没有它。先请调用方把它放出来，渲染完再滚——这时不用 smooth，
     * 平滑滚动的起点是刚插进来的一大段内容，看起来像乱跳。
     */
    确保可见?.(id)
    requestAnimationFrame(() => requestAnimationFrame(() => 找()?.scrollIntoView({ block: "start" })))
  }

  return (
    <div
      ref={尺}
      className="turn-nav"
      role="navigation"
      aria-label={t("轮次导航")}
      onMouseLeave={() => 设悬在(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const y = Math.min(Math.max(e.clientY - r.top, 0), r.height)
        设悬在((y / r.height) * 轮.length - 0.5)
      }}
    >
      {轮.map((x, i) => {
        const 近 = 悬在 !== null && Math.abs(i - 悬在) < 0.5
        return (
          /* 走 primitive，几何仍归 `.turn-tick`（2026-09-08：那条扫描修好后露出来的） */
          <Button
            key={x.id}
            variant="ghost"
            size="inline"
            className={`turn-tick${x.id === 当前 ? " current" : ""}${近 ? " near" : ""}`}
            style={{ ["--tick-w" as string]: `${刻度宽(i, 悬在)}px` }}
            aria-label={tf("第 {0} 轮：{1}", i + 1, x.摘要 || t("（空）"))}
            aria-current={x.id === 当前 ? "true" : undefined}
            onClick={() => 跳(x.id)}
          >
            {近 ? <span className="turn-tick-summary">{x.摘要 || t("（空）")}</span> : null}
          </Button>
        )
      })}
    </div>
  )
}
