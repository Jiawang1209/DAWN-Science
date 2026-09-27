/**
 * 侧栏「按内容」那一片（会话全文搜索，2026-09-27，spec §2.2）。
 *
 * - 打字停 250 ms 才搜；不到两个字不搜，**说「至少两个字」**（空白会被读成「没搜到」）。
 * - 迟到的结果丢掉：组件自己数请求序号。**不用 `state/guard.ts` 的 `guard()`**——那是全局世代，
 *   一领就把转录那边飞着的请求也作废了。
 * - 截断、读不了、太大、不是内置对话：各说一句（规格 7.5）。
 * - 点哪一处由 App 决定去哪（设计契约「导航状态只在 App.tsx 里改」）。
 */
import { useEffect, useRef, useState } from "react"
import type { ResponseOf } from "../protocol/index.js"
import { 够长 } from "../protocol/search-match.js" // 2026-09-28：按码点数、与协议校验同一个判定
import { Loader, Row } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 年月日时分 } from "./format.js"

export type 全文结果 = ResponseOf<"searchSessionContent">
export type 搜到的一段 = 全文结果["sessions"][number]
export type 搜到的一处 = 搜到的一段["hits"][number]

export const 搜索停顿毫秒 = 250

type 态 = { kind: "等" } | { kind: "好"; r: 全文结果; 词: string } | { kind: "坏"; text: string }

function 处名(h: 搜到的一处): string {
  if (h.where === "user") return t("你：")
  if (h.where === "agent") return t("agent：")
  if (h.where === "toolResult") return t("输出里：")
  if (h.toolName === "bash") return t("命令里：")
  if (h.toolName === "run_code") return t("代码里：")
  return t("参数里：")
}

function 画片段(text: string, marks: readonly (readonly [number, number])[]) {
  const 出: React.ReactNode[] = []
  let 到 = 0
  marks.forEach(([a, b], i) => {
    if (a > 到) 出.push(text.slice(到, a))
    出.push(
      <mark key={i} className="cs-mark">
        {text.slice(a, b)}
      </mark>,
    )
    到 = b
  })
  if (到 < text.length) 出.push(text.slice(到))
  return 出
}

export function ContentSearchResults({
  query,
  search,
  onOpen,
}: {
  query: string
  /** **必须是稳定引用**（App 里 `useCallback`）：它变一次就重搜一次 */
  search: (q: string) => Promise<全文结果>
  onOpen: (卡: 搜到的一段, 处?: 搜到的一处) => void
}) {
  const 词 = query.trim()
  const [态, 设态] = useState<态>({ kind: "等" })
  const 序 = useRef(0)

  useEffect(() => {
    const 我 = ++序.current
    if (!够长(词)) return
    设态({ kind: "等" })
    const 定时 = setTimeout(() => {
      search(词)
        .then((r) => {
          if (序.current === 我) 设态({ kind: "好", r, 词 })
        })
        .catch((e: unknown) => {
          if (序.current === 我) 设态({ kind: "坏", text: e instanceof Error ? e.message : String(e) })
        })
    }, 搜索停顿毫秒)
    return () => clearTimeout(定时)
  }, [词, search])

  if (!够长(词)) return <p className="side-empty">{t("至少两个字")}</p>
  if (态.kind === "等") {
    return (
      <div className="cs-status">
        <Loader inline label={t("正在搜对话内容")} />
      </div>
    )
  }
  if (态.kind === "坏") {
    return (
      <p className="side-empty cs-bad" role="alert">
        {tf("搜索失败：{0}", 态.text)}
      </p>
    )
  }
  const { r } = 态
  return (
    <div className="cs-results">
      {r.sessions.length === 0 ? (
        <p className="side-empty">{tf("没有对话里出现「{0}」", 态.词)}</p>
      ) : (
        <p className="cs-summary">{tf("{0} 段对话里有", r.matchedSessions)}</p>
      )}
      {r.sessions.map((s) => (
        <div key={s.sessionId} className="cs-card">
          <Row className="cs-head" onClick={() => onOpen(s)}>
            <span className="cs-title">{s.title ?? t("新会话")}</span>
            {s.archived ? <span className="cs-badge">{t("已归档")}</span> : null}
            <span className="cs-when">{年月日时分(s.lastAt)}</span>
          </Row>
          {s.place ? (
            <p className="cs-place">{s.place.kind === "server" ? tf("服务器 {0}", s.place.name) : tf("项目 {0}", s.place.name)}</p>
          ) : null}
          {s.archived ? <p className="cs-place">{t("打开会取消归档")}</p> : null}
          {s.hits.map((h) => (
            <Row key={`${h.itemId}:${h.nth}`} className="cs-hit" onClick={() => onOpen(s, h)}>
              <span className="cs-where">{处名(h)}</span>
              <span className="cs-snippet">{画片段(h.snippet, h.marks)}</span>
            </Row>
          ))}
          {s.moreHits > 0 ? <p className="cs-more">{tf("还有 {0} 处", s.moreHits)}</p> : null}
        </div>
      ))}
      {r.truncated === "sessions" ? (
        <p className="side-empty">{tf("还有 {0} 段也有，没列出来——换个更具体的词", r.matchedSessions - r.sessions.length)}</p>
      ) : null}
      {r.truncated === "time" ? <p className="side-empty">{tf("搜到一半超时了：看了 {0} 段中的 {1} 段", r.total, r.scanned)}</p> : null}
      {r.unreadable > 0 ? <p className="side-empty">{tf("{0} 段的记录读不了，没搜", r.unreadable)}</p> : null}
      {r.tooLarge > 0 ? <p className="side-empty">{tf("{0} 段的记录太大（超过 32 MB），没搜", r.tooLarge)}</p> : null}
      {r.notSearchable > 0 ? (
        <p className="side-empty">{tf("另有 {0} 段是外部 CLI / ACP / 终端 / 内核会话，内容不在我们手里，没搜", r.notSearchable)}</p>
      ) : null}
    </div>
  )
}
