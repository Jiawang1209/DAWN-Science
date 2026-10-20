import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { TranscriptItem } from "../protocol/index.js"
import { 拆词, 命中 } from "../protocol/search-match.js"
import { 在组词 } from "./ime.js"
import { Button } from "./primitives.js"
import { 关闭图标, 搜索图标, 下拉图标 } from "./icons.js"
import { t, tf } from "./i18n/index.js"

/** 只搜索当前已订阅的完整转录，与全局搜索共用匹配规则；按条目导航。 */
export function ConversationSearch({ items, onJump, onClose, focusSignal }: {
  items: readonly TranscriptItem[]
  focusSignal?: number
  onJump: (id: string, words: string[]) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const tipId = useId()
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
  const controls = [
    { key: "prev", label: t("上一条匹配"), icon: <下拉图标 className="conversation-search-up" />, disabled: !hits.length, run: () => move(-1) },
    { key: "next", label: t("下一条匹配"), icon: <下拉图标 />, disabled: !hits.length, run: () => move(1) },
    { key: "close", label: t("收起查找"), icon: <关闭图标 />, disabled: false, run: onClose },
  ]
  return <div className="conversation-search" role="search" aria-label={t("当前会话内容搜索")}
    onKeyDown={e => {
      if (在组词(e)) return
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose() }
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); move(e.shiftKey ? -1 : 1) }
    }}>
    <搜索图标 />
    <input ref={input} autoFocus type="search" className="control control-integrated" aria-label={t("搜索当前会话内容")}
      placeholder={t("搜索当前会话内容")} maxLength={200} value={query}
      onChange={e => { setQuery(e.target.value); setIndex(0) }} />
    <span className="conversation-search-count" aria-hidden="true">{words.length ? `${hits.length ? selected + 1 : 0}/${hits.length}` : ""}</span>
    <span className="sr-only" role="status" aria-live="polite">{words.length === 0 ? t("输入关键词") : hits.length ? tf("{0} / {1} 条匹配", selected + 1, hits.length) : t("没有匹配内容")}</span>
    {controls.map(control => <span className="conv-action-tip-wrap" key={control.key}>
      <Button variant="ghost" size="icon" disabled={control.disabled} aria-label={control.label}
        aria-describedby={`${tipId}-${control.key}`} onClick={control.run}>{control.icon}</Button>
      <span id={`${tipId}-${control.key}`} role="tooltip" className="conv-action-tip">{control.label}</span>
    </span>)}
  </div>
}
