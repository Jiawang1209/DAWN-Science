import { useEffect, useMemo, useRef, useState } from "react"
import type { TranscriptItem } from "../protocol/index.js"
import { 拆词, 命中 } from "../protocol/search-match.js"
import { 在组词 } from "./ime.js"
import { Button } from "./primitives.js"
import { 关闭图标, 搜索图标 } from "./icons.js"
import { t, tf } from "./i18n/index.js"

/** 只搜索当前已订阅的完整转录，与全局搜索共用匹配规则；按条目导航。 */
export function ConversationSearch({ items, onJump, onClose, focusSignal }: {
  items: readonly TranscriptItem[]
  focusSignal?: number
  onJump: (id: string, words: string[]) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [focusSignal])
  const [index, setIndex] = useState(0)
  const words = useMemo(() => 拆词(query), [query])
  const hits = useMemo(() => words.length ? items.filter(item => 命中(item, words)) : [], [items, words])
  const selected = Math.min(index, Math.max(0, hits.length - 1))
  const id = hits[selected]?.id
  useEffect(() => {
    onJump(id ?? "", words)
  }, [id, words, onJump])
  const move = (step: number) => {
    if (hits.length) setIndex((selected + step + hits.length) % hits.length)
  }
  return <div className="conversation-search" role="search" aria-label={t("当前会话内容搜索")}
    onKeyDown={e => {
      if (在组词(e)) return
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose() }
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); move(e.shiftKey ? -1 : 1) }
    }}>
    <搜索图标 />
    <input ref={input} autoFocus type="search" className="control" aria-label={t("搜索当前会话内容")}
      placeholder={t("搜索当前会话内容")} maxLength={200} value={query}
      onChange={e => { setQuery(e.target.value); setIndex(0) }} />
    <span role="status" aria-live="polite">{words.length === 0 ? t("输入关键词") : hits.length ? tf("{0} / {1} 条匹配", selected + 1, hits.length) : t("没有匹配内容")}</span>
    <Button variant="ghost" size="sm" disabled={!hits.length} aria-label={t("上一条匹配")} onClick={() => move(-1)}>{t("上一条匹配")}</Button>
    <Button variant="ghost" size="sm" disabled={!hits.length} aria-label={t("下一条匹配")} onClick={() => move(1)}>{t("下一条匹配")}</Button>
    <Button variant="ghost" size="icon" aria-label={t("收起查找")} onClick={onClose}><关闭图标 /></Button>
  </div>
}
