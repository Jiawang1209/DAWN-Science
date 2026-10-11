import { CODE_LANGUAGES } from "./code-languages.js"
import { highlightScript } from "./script-highlighter.js"

export type DraftToken = { start: number; end: number; light?: string | undefined; dark?: string | undefined; marker?: boolean }
const supported = new Set<string>(CODE_LANGUAGES)

/** 原文offset是唯一坐标；围栏正文覆盖Markdown词法，不改变任何字符或排版。 */
export async function highlightDraft(text: string): Promise<DraftToken[]> {
  let tokens: DraftToken[] = (await highlightScript(text, "markdown")).flat().map(token => ({
    start: token.offset, end: token.offset + token.content.length,
    light: token.variants.light?.color, dark: token.variants.dark?.color,
  }))
  const replace = (start: number, end: number, replacement: DraftToken[]) => {
    tokens = tokens.flatMap(token => {
      if (token.end <= start || token.start >= end) return [token]
      return [
        ...(token.start < start ? [{ ...token, end: start }] : []),
        ...(token.end > end ? [{ ...token, start: end }] : []),
      ]
    }).concat(replacement)
  }
  let fence: { char: string; length: number; body: number; language: string } | undefined
  for (const line of text.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    if (!line[0]) continue
    const value = line[0].replace(/[\r\n]+$/, "")
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(value)
    if (fence) {
      if (match && match[1]![0] === fence.char && match[1]!.length >= fence.length && !match[2]!.trim()) {
        await colorBody(fence, line.index)
        replace(line.index, line.index + value.length, [{ start: line.index, end: line.index + value.length, marker: true }])
        fence = undefined
      }
    } else if (match && !(match[1]![0] === "`" && match[2]!.includes("`"))) {
      replace(line.index, line.index + value.length, [{ start: line.index, end: line.index + value.length, marker: true }])
      fence = { char: match[1]![0]!, length: match[1]!.length, body: line.index + line[0].length, language: match[2]!.trim().split(/\s+/)[0]!.toLowerCase() }
    }
  }
  if (fence) await colorBody(fence, text.length)
  return tokens.sort((a, b) => a.start - b.start)

  async function colorBody(current: NonNullable<typeof fence>, end: number) {
    if (!supported.has(current.language)) return
    const body = await highlightScript(text.slice(current.body, end), current.language as Parameters<typeof highlightScript>[1])
    replace(current.body, end, body.flat().map(token => ({
      start: current.body + token.offset, end: current.body + token.offset + token.content.length,
      light: token.variants.light?.color, dark: token.variants.dark?.color,
    })))
  }
}
