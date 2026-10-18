/** 只给已筛选的可见资源排序；不读取文件、不扩大索引范围。 */
interface SearchableResource {
  kind: "skill" | "memory"
  name: string
  description: string
  searchText?: string
  content?: string
}

const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim()
const segmenter = new Intl.Segmenter("zh", {granularity: "word"})
const words = (text: string) => [...segmenter.segment(text)].filter(part => part.isWordLike).map(part => part.segment)
const functionalWords = new Set(["相关", "关于", "查询", "检索", "记忆", "请问", "一下", "the", "and", "or", "of", "for", "to", "in", "with", "please", "find", "search", "memory"])
const hasHan = (text: string) => /\p{Script=Han}/u.test(text)

export function searchResources<T extends SearchableResource>(entries: readonly T[], query: string): T[] {
  const phrase = normalize(query)
  if (!phrase) return [...entries]
  const terms = [...new Set(words(phrase))].filter(word => Array.from(word).length > 1 && !functionalWords.has(word))
  const needsWordBoundaries = terms.some(term => !hasHan(term))
  const ranked = entries.map((entry, index) => {
    const text = normalize(`${entry.name}\n${entry.searchText ?? entry.description}\n${entry.content ?? ""}`)
    const exact = text.includes(phrase)
    if (exact) return {entry, index, exact, hits: 0, length: 0}
    // 技能继续只查名称/用途的字面匹配；记忆至少两个有效词命中，避免一个泛词扩大目录。
    if (entry.kind !== "memory" || terms.length < 2) return undefined
    const wordSet = needsWordBoundaries ? new Set(words(text)) : undefined
    const matched = terms.filter(term => hasHan(term) ? text.includes(term) : wordSet!.has(term))
    if (matched.length < 2) return undefined
    return {entry, index, exact, hits: matched.length, length: matched.reduce((n, term) => n + Array.from(term).length, 0)}
  }).filter(row => row !== undefined)
  ranked.sort((a, b) => Number(b.exact) - Number(a.exact) || b.hits - a.hits || b.length - a.length || a.index - b.index)
  return ranked.map(row => row.entry)
}
