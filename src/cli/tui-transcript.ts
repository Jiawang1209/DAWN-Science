import { Markdown, wrapTextWithAnsi, type MarkdownTheme, type Component } from '@earendil-works/pi-tui'
import { plain, toolDetail } from './presentation.js'

export type ToolStart = { toolCallId: string; toolName: string; input: unknown }
export type ToolEnd = { toolCallId: string; toolName: string; isError: boolean; text: string; truncated: boolean; fullOutputPath?: string | undefined }
export type Picture = { id: string; name: string }
export type Placement = { id: string; row: number; col: number; width: number; height: number }
type Node = { kind: 'user' | 'notice'; text: string } | { kind: 'assistant'; text: string; markdown: Markdown }
  | { kind: 'tool'; start: ToolStart; end?: ToolEnd } | { kind: 'image'; image: Picture }

/** Only renderer-owned SGR styles survive; models cannot issue terminal commands. */
const styled = (text: string) => text.split(/(\x1b\[[0-9;]*m)/).map(p => /^\x1b\[[0-9;]*m$/.test(p) ? p : plain(p)).join('')
export function cliTheme(color: boolean) {
  const paint = (code: string, text: string) => color ? `\x1b[${code}m${text}\x1b[0m` : text
  const accent = (text: string) => paint('38;2;30;145;130', text)
  const dim = (text: string) => paint('2', text), bold = (text: string) => paint('1', text)
  const theme: MarkdownTheme = { heading: text => accent(bold(text)), link: accent, linkUrl: dim,
    code: accent, codeBlock: text => text, codeBlockBorder: text => dim(text.startsWith('```') ? '─ ' + text.slice(3) : text),
    quote: dim, quoteBorder: dim, hr: dim, listBullet: accent, bold, italic: text => paint('3', text),
    strikethrough: text => paint('9', text), underline: text => paint('4', text) }
  return { paint, accent, dim, bold, theme }
}
export class CliTranscript implements Component {
  private nodes: Node[] = []
  private current: Extract<Node, { kind: 'assistant' }> | undefined
  private expanded = false
  private trimmed = false
  placements: Placement[] = []
  readonly style: ReturnType<typeof cliTheme>
  constructor(color: boolean) { this.style = cliTheme(color) }
  invalidate() { for (const n of this.nodes) if (n.kind === 'assistant') n.markdown.invalidate() }
  private add(node: Node) {
    this.nodes.push(node)
    // Native conversation owns the complete record; bound the live terminal view.
    if (this.nodes.length > 500) { this.nodes.splice(0, this.nodes.length - 500); this.trimmed = true }
  }
  finish() { this.current = undefined }
  user(text: string) { this.finish(); this.add({ kind: 'user', text: plain(text) }) }
  notice(text: string) {
    this.finish(); const last = this.nodes.at(-1)
    if (last?.kind === 'notice') last.text += '\n' + plain(text)
    else this.add({ kind: 'notice', text: plain(text) })
  }
  reply(text: string) {
    if (!this.current) {
      this.current = { kind: 'assistant', text: '', markdown: new Markdown('', 0, 0, this.style.theme) }; this.add(this.current)
    }
    this.current.text += plain(text)
    if (this.current.text.length > 1_000_000) this.current.text = '较早正文已收起，返回会话可查看完整记录。\n\n' + this.current.text.slice(-800_000)
    this.current.markdown.setText(this.current.text)
  }
  toolStart(start: ToolStart) { this.finish(); this.add({ kind: 'tool', start }) }
  toolEnd(end: ToolEnd) {
    const node = this.nodes.findLast((n): n is Extract<Node, { kind: 'tool' }> => n.kind === 'tool' && n.start.toolCallId === end.toolCallId)
    if (node) node.end = end
    else this.add({ kind: 'tool', start: { ...end, input: {} }, end })
  }
  image(image: Picture) { this.finish(); this.add({ kind: 'image', image }) }
  toggleTools() { this.expanded = !this.expanded }
  render(width: number): string[] {
    const { accent, dim, bold, paint } = this.style, lines: string[] = []
    this.placements = []
    const contentWidth = Math.max(1, width - 4)
    const wrap = (text: string, indent = '  ') => wrapTextWithAnsi(text, Math.max(1, width - indent.length)).map(line => indent + styled(line).trimEnd())
    if (this.trimmed) lines.push(...wrap(dim('较早记录已收起，返回会话可查看完整过程。')), '')
    if (!this.nodes.length) lines.push(...wrap(dim('在下方输入问题，或粘贴文字与图片。')), '')
    for (const node of this.nodes) {
      switch (node.kind) {
        case 'user': lines.push(bold('› 你'), ...wrap(node.text), ''); break
        case 'assistant': lines.push(accent(bold('● DAWN')), ...node.markdown.render(contentWidth).map(line => '  ' + styled(line).trimEnd()), ''); break
        case 'notice': lines.push(...wrap(paint('33', node.text)), ''); break
        case 'tool': {
          const end = node.end, status = !end ? '› 执行中' : end.isError ? '× 失败' : '✓ 完成'
          lines.push(...wrap((end?.isError ? paint('31', status) : accent(status)) + ' · ' + plain(node.start.toolName)))
          const detail = toolDetail(node.start.input)
          if (detail) lines.push(...wrap(dim(detail), '    '))
          if (end) {
            const output = plain(end.text).trim().split('\n'), take = this.expanded ? 120 : end.isError ? 6 : 2
            if (end.text.trim()) lines.push(...wrap(output.slice(0, take).join('\n'), '    '))
            if (output.length > take) lines.push(...wrap(dim(`其余 ${output.length - take} 行已省略 · Tab ${this.expanded ? '收起' : '展开'}工具详情`), '    '))
            if (end.truncated) lines.push(...wrap(dim('工具输出已截断' + (end.fullOutputPath ? ' · 完整输出：' + plain(end.fullOutputPath) : ' · 返回会话查看过程')), '    '))
          }
          lines.push(''); break
        }
        case 'image': {
          lines.push(...wrap(dim('图像 · ' + plain(node.image.name))))
          const height = 7
          this.placements.push({ id: node.image.id, row: lines.length, col: 2, width: Math.max(1, Math.min(36, width - 4)), height })
          lines.push(...Array<string>(height).fill(''), ''); break
        }
      }
    }
    return lines
  }
}
