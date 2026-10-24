import { Markdown, wrapTextWithAnsi, visibleWidth, truncateToWidth, type MarkdownTheme, type Component } from '@earendil-works/pi-tui'
import { plain, toolDetail } from './presentation.js'
import { highlightCliCode } from './code-highlighting.js'
import type { PlanItem } from '../protocol/events.js'
import type { QuestionRecord, QuestionAnswer } from '../protocol/questions.js'
export type CliPlan = Omit<PlanItem, 'id' | 'type'>

export type ToolStart = { toolCallId: string; toolName: string; input: unknown }
export type ToolEnd = { toolCallId: string; toolName: string; isError: boolean; text: string; truncated: boolean; fullOutputPath?: string | undefined }
export type Picture = { id: string; name: string }
export type Placement = { id: string; row: number; col: number; width: number; height: number }
type Node = { kind: 'user' | 'notice'; text: string } | { kind: 'assistant'; text: string; markdown: Markdown }
  | { kind: 'plan'; plan: CliPlan; markdown: Markdown }
  | { kind: 'question'; record: QuestionRecord; index: number; answers: QuestionAnswer['answers'] }
  | { kind: 'tool'; start: ToolStart; end?: ToolEnd } | { kind: 'image'; image: Picture }

/** Only renderer-owned SGR styles survive; models cannot issue terminal commands. */
const styled = (text: string) => text.split(/(\x1b\[[0-9;]*m)/).map(p => /^\x1b\[[0-9;]*m$/.test(p) ? p : plain(p)).join('')
export function cliTheme(color: boolean) {
  const paint = (code: string, text: string) => color ? `\x1b[${code}m${text}\x1b[0m` : text
  const accent = (text: string) => paint('38;2;30;145;130', text)
  const dim = (text: string) => paint('2', text), bold = (text: string) => paint('1', text)
  const theme: MarkdownTheme = { heading: text => accent(bold(text)), link: accent, linkUrl: dim,
    code: accent, codeBlock: text => text, codeBlockBorder: dim, highlightCode: (text, lang) => highlightCliCode(text, lang, color),
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
  invalidate() { for (const n of this.nodes) if (n.kind === 'assistant' || n.kind === 'plan') n.markdown.invalidate() }
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
  question(record: QuestionRecord, index = 0, answers: QuestionAnswer['answers'] = record.answer?.answers ?? []) {
    const next = { kind: 'question' as const, record, index, answers: structuredClone(answers) }
    const existing = this.nodes.find((n): n is Extract<Node, { kind: 'question' }> => n.kind === 'question' && n.record.requestId === record.requestId)
    if (existing) Object.assign(existing, next)
    else { this.finish(); this.add(next) }
  }
  plan(plan: CliPlan) {
    const existing = this.nodes.find((n): n is Extract<Node, { kind: 'plan' }> => n.kind === 'plan' && n.plan.planId === plan.planId)
    if (existing) {
      const old = existing.plan
      if (old.version === plan.version && old.title === plan.title && old.markdown === plan.markdown && old.status === plan.status && old.savedPath === plan.savedPath && old.edited === plan.edited && old.fileChanged === plan.fileChanged) return
      existing.plan = plan; existing.markdown.setText(plain(plan.markdown)); return
    }
    this.finish()
    for (const n of this.nodes) if (n.kind === 'plan' && n.plan.status === 'proposed' && n.plan.version < plan.version) n.plan = { ...n.plan, status: 'superseded' }
    this.add({ kind: 'plan', plan, markdown: new Markdown(plain(plan.markdown), 0, 0, this.style.theme) })
  }
  toggleTools() { this.expanded = !this.expanded }
  render(width: number): string[] {
    const { accent, dim, paint } = this.style, lines: string[] = []
    this.placements = []
    const contentWidth = Math.max(1, width - 4)
    const wrap = (text: string, indent = '  ') => wrapTextWithAnsi(text, Math.max(1, width - indent.length)).map(line => indent + styled(line).trimEnd())
    if (this.trimmed) lines.push(...wrap(dim('较早记录已收起，返回会话可查看完整过程。')), '')
    if (!this.nodes.length) lines.push(...wrap(dim('在下方输入问题，或粘贴文字与图片。')), '')
    for (const node of this.nodes) {
      switch (node.kind) {
        case 'user': {
          const prefix = '❯ ', indent = ' '.repeat(visibleWidth(prefix))
          lines.push(...wrapTextWithAnsi(node.text, Math.max(1, width - visibleWidth(prefix))).map((line, i) => (i ? indent : dim(prefix)) + styled(line).trimEnd()), '')
          break
        }
        case 'assistant': lines.push(...node.markdown.render(contentWidth).map((line, i) => (i ? '  ' : accent('● ')) + styled(line).trimEnd()), ''); break
        case 'notice': lines.push(...wrap(paint('33', node.text)), ''); break
        case 'question': {
          const { record, index, answers } = node
          const pending = record.state === 'pending'
          if (record.state === 'cancelled' || record.state === 'interrupted') {
            lines.push(...wrap(dim(record.state === 'cancelled' ? '已取消提问' : '提问已中断')), '')
            break
          }
          for (const [i, q] of record.questions.entries()) {
            if (pending && i > index) break
            const a = answers.find(a => a.id === q.id)
            lines.push(...wrap(paint('33', plain(q.question))))
            for (const [optionIndex, option] of (q.options ?? []).entries()) {
              lines.push(...wrap(paint('33', `${optionIndex + 1}. ${plain(option.label)}${option.description ? ' · ' + plain(option.description) : ''}`), '    '))
            }
            if (a) {
              const selected = a.selected.map(plain).join('、')
              if (selected) lines.push(...wrap('✓ 已选：' + selected))
              if (a.custom) lines.push(...wrap('你的回答：' + plain(a.custom)))
              if (!selected && !a.custom) lines.push(...wrap(dim('已跳过')))
            } else if (pending) lines.push(...wrap(paint('33', q.multi_select ? '输入选项编号（逗号分隔）或自己的回答。' : '输入选项编号或自己的回答。')))
            lines.push('')
          }
          if (!pending) lines.push(...wrap(dim('已提交答案')), '')
          else if (index >= record.questions.length) lines.push(...wrap(dim('正在提交答案')), '')
          break
        }
        case 'plan': {
          const p = node.plan
          const status = ({ proposed: '等你看', approved: '已批准', superseded: '已被新的一版取代', discarded: '没采用' })[p.status]
          lines.push(...wrap(accent(`方案 · 第 ${p.version} 版 · ${status}`)), ...wrap(this.style.bold(plain(p.title))))
          lines.push(...node.markdown.render(contentWidth).map(line => '  ' + styled(line).trimEnd()))
          if (p.savedPath) lines.push(...wrap(dim('存档：' + plain(p.savedPath))))
          if (p.edited || p.fileChanged) lines.push(...wrap(dim(p.fileChanged ? '方案文件已由你修改' : '批的是改过的方案')))
          if (p.status === 'proposed') lines.push(...wrap(dim(`/plan approve ${plain(p.planId)}  照这个做`)), ...wrap(dim(`/plan discard ${plain(p.planId)}  不做了`)), ...wrap(dim('需要调整时直接说明；也可返回会话修改方案。')))
          lines.push(''); break
        }
        case 'tool': {
          const end = node.end, status = !end ? '◌' : end.isError ? '× 失败' : '✓'
          const name = ({ bash: '运行命令', read: '读取文件', write: '写入文件', edit: '编辑文件', grep: '搜索内容', find: '查找文件', ls: '查看目录', run_code: '运行代码' } as Record<string, string>)[node.start.toolName] ?? plain(node.start.toolName)
          const detail = toolDetail(node.start.input)
          const summary = (end?.isError ? paint('31', status) : dim(status)) + ' ' + name + (detail ? dim(' · ' + detail.split('\n')[0]!.slice(0, 140)) : '')
          if (!this.expanded && !end?.isError) lines.push('  ' + truncateToWidth(summary, Math.max(1, width - 2), '…'))
          else lines.push(...wrap(summary))
          if (detail && (this.expanded || end?.isError)) lines.push(...wrap(dim(detail), '    '))
          if (end && (this.expanded || end.isError)) {
            const output = plain(end.text).trim().split('\n'), take = this.expanded ? 120 : end.isError ? 6 : 2
            if (end.text.trim()) lines.push(...wrap(output.slice(0, take).join('\n'), '    '))
            if (output.length > take) lines.push(...wrap(dim(`其余 ${output.length - take} 行已省略 · Tab ${this.expanded ? '收起' : '展开'}工具详情`), '    '))
          }
          if (end?.truncated) lines.push(...wrap(dim('工具输出已截断' + (end.fullOutputPath ? ' · 完整输出：' + plain(end.fullOutputPath) : ' · 返回会话查看过程')), '    '))
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
