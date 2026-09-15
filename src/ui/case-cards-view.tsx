/**
 * 对话里的 MLAI 案例卡片（2026-09-15，规格 `2026-09-15-案例卡片-design.md`）。
 *
 * 作者：*「能否每一个案例，不要显示是链接形式的，而是……一个一个真实内容的效果呢？」*
 * 以及：*「后续让 agent 学习和模仿哪个具体案例，其实也应该是我们来进行选取的。」*
 *
 * 两个动作分开：
 * - **点卡片**：右侧「网页」格开那篇的图廊详情——先看清楚，**不触发选择**。
 * - **「照这篇做」**：替人发一句带 case_id 的话，走与手打完全同一条发送路。**常驻可见**，
 *   agent 在忙时灰着（与发送键同一个判定）——看不见的按钮等于没有，点了没反应的按钮比没有更坏。
 *
 * 封面由主进程取（`fetchLocalImage`）：界面 CSP 不许直接加载 127.0.0.1 的图。取不到就**说**取不到。
 * 数据来自这一轮 MLAI 工具的返回（`case-cards.ts`），不靠模型按格式写。
 */
import { useEffect, useState } from "react"
import { Button, Loader } from "./primitives.js"
import { t } from "./i18n/index.js"
import { 封面地址, 详情地址, 选这篇的话, type 本轮案例 } from "./case-cards.js"

const 语言名 = (l: string) => (l.toLowerCase() === "r" ? "R" : l.toLowerCase() === "python" ? "Python" : l)

function 封面({
  地址,
  有图廊,
  取图,
  问着,
}: {
  地址: string | undefined
  有图廊: boolean
  /** 图廊地址还在问：先转着，别急着说「没有」 */
  问着: boolean
  取图: ((url: string) => Promise<string | undefined>) | undefined
}) {
  const [图, 设图] = useState<string | undefined | "失败">(undefined)
  useEffect(() => {
    if (!地址 || !取图) return
    let 还在 = true
    取图(地址).then(
      (u) => 还在 && 设图(u ?? "失败"),
      () => 还在 && 设图("失败"),
    )
    return () => {
      还在 = false
    }
  }, [地址, 取图])
  if (问着)
    return (
      <span className="case-cover case-cover-loading">
        <Loader label={t("正在取封面")} inline />
      </span>
    )
  if (!有图廊) return <span className="case-cover case-cover-missing">{t("这台 MCP 没有图廊")}</span>
  if (!地址) return <span className="case-cover case-cover-missing">{t("没有封面")}</span>
  if (!取图 || 图 === "失败") return <span className="case-cover case-cover-missing">{t("封面没取到")}</span>
  if (图 === undefined)
    return (
      <span className="case-cover case-cover-loading">
        <Loader label={t("正在取封面")} inline />
      </span>
    )
  return <img className="case-cover" src={图} alt="" />
}

export function 案例卡片们({
  案例们,
  载图廊根们,
  取图,
  onOpen,
  onPick,
}: {
  案例们: readonly 本轮案例[]
  /** 问一次「MCP 服务器名 → 图廊根地址」。**没有的（stdio 起的那台）就没有图廊**：卡片照出，不给封面也不能点开详情 */
  载图廊根们?: (() => Promise<Record<string, string>>) | undefined
  取图?: ((url: string) => Promise<string | undefined>) | undefined
  onOpen: (url: string) => void
  /** 不给 = 此刻不能发（agent 在忙或会话只读）：按钮照样画，灰着 */
  onPick?: ((text: string) => void) | undefined
}) {
  /** 还在问 = undefined；问完（含失败，失败按「都没有」算）= 表 */
  const [图廊根们, 设图廊根们] = useState<Record<string, string> | undefined>(undefined)
  useEffect(() => {
    let 还在 = true
    if (!载图廊根们) return void 设图廊根们({})
    载图廊根们().then(
      (表) => 还在 && 设图廊根们(表),
      () => 还在 && 设图廊根们({}),
    )
    return () => {
      还在 = false
    }
  }, [载图廊根们])
  return (
    <div className="case-cards">
      {案例们.map(({ 服务器, 案例: c, n }) => {
        const 问着 = 图廊根们 === undefined
        const 根 = 图廊根们?.[服务器]
        return (
          <div className="case-card" key={c.case_id}>
            <Button
              variant="ghost"
              size="card"
              className="case-open"
              disabled={!根}
              onClick={() => 根 && onOpen(详情地址(根, c))}
            >
              <封面 地址={根 ? 封面地址(根, c) : undefined} 有图廊={问着 || Boolean(根)} 取图={问着 ? undefined : 取图} 问着={问着} />
              <span className="case-meta">{c.language ? `${n} · ${语言名(c.language)}` : String(n)}</span>
              <span className="case-title">{c.title ?? c.case_id}</span>
              {c.summary ? <span className="case-summary">{c.summary}</span> : null}
            </Button>
            <Button variant="secondary" size="sm" className="case-pick" disabled={!onPick} onClick={() => onPick?.(选这篇的话(c))}>
              {t("照这篇做")}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
