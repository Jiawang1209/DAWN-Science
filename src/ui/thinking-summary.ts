/**
 * 流式期间只公开最近一段由空行封口的思考段落；思考结束后，末尾段落也算完整。
 * 摘要只取该段第一条非空行，正文仍保留在可展开区域里。
 */
export function 思考段落摘要(text: string, complete: boolean): string | undefined {
  const normalized = text.replace(/\r\n?/g, "\n")
  const paragraphs = normalized.split(/\n[ \t]*\n+/)
  const candidates = complete ? paragraphs : paragraphs.slice(0, -1)

  for (let i = candidates.length - 1; i >= 0; i--) {
    const first = candidates[i]!
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean)
    if (first) return first
  }
  return undefined
}
