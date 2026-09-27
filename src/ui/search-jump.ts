/**
 * 跳到全文搜索的那一处：滚到、描一圈、把词标出来（会话全文搜索，2026-09-27，spec §7）。
 *
 * - 块级：`data-search-hit="true"` 2.4 秒，CSS 里淡出——**不位移**。
 * - 词级：CSS Custom Highlight API（`CSS.highlights`，Electron 43 的 Chromium 有）。**不改 React 管的 DOM**：
 *   往 markdown 渲染出来的节点里插 `<mark>`，下一次重渲染就会被抹掉、或者把 React 的对账搅乱。
 *   jsdom 没有它——先问一句，没有就只描块。
 */
export const 高亮名 = "dawn-search-hit"
const 描边毫秒 = 2_400

function 有高亮API(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined"
}

/** 在 `根` 里找那一条（文字行 `data-turn-id`、工具行 `data-item-id`），滚到中间、描一圈、标词。找不到 → false */
export function 滚到并高亮(根: HTMLElement | null, id: string, 词们: readonly string[]): boolean {
  const 转义 = CSS.escape(id)
  const el = 根?.querySelector<HTMLElement>(`[data-turn-id="${转义}"], [data-item-id="${转义}"]`)
  if (!el) return false
  el.scrollIntoView?.({ block: "center" })
  el.dataset.searchHit = "true"
  window.setTimeout(() => {
    delete el.dataset.searchHit
  }, 描边毫秒)
  标词(el, 词们)
  return true
}

/** 把 `el` 里所有文字节点中出现的词（大小写不敏感）标出来。返回标了几处 */
export function 标词(el: HTMLElement, 词们: readonly string[]): number {
  if (!有高亮API() || 词们.length === 0) return 0
  const ranges: Range[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const 原 = n.nodeValue ?? ""
    const 小 = 原.toLowerCase()
    // 小写改了长度的极少数字符：不标，免得标歪（与 `取片段` 同一条）
    if (小.length !== 原.length) continue
    for (const w of 词们) {
      for (let i = 小.indexOf(w); i >= 0; i = 小.indexOf(w, i + w.length)) {
        const r = document.createRange()
        r.setStart(n, i)
        r.setEnd(n, i + w.length)
        ranges.push(r)
      }
    }
  }
  CSS.highlights.set(高亮名, new Highlight(...ranges))
  return ranges.length
}

export function 清高亮(): void {
  if (有高亮API()) CSS.highlights.delete(高亮名)
}
