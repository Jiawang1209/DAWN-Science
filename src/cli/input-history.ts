import { Input, matchesKey, truncateToWidth, visibleWidth, type Component, type Focusable } from '@earendil-works/pi-tui'
import { plain } from './presentation.js'

/** Search a snapshot of user input; choosing a row edits the draft, never submits it. */
export class InputHistorySearch implements Component, Focusable {
  private readonly input = new Input({ prompt: '搜索：', placeholder: '输入关键词', placeholderStyle: text => `\x1b[2m${text}\x1b[22m` })
  private selected = 0
  private query = ''
  private matches: readonly string[]
  constructor(private readonly entries: readonly string[], private readonly choose: (text: string) => void, private readonly close: () => void, private readonly renderAgain: () => void) {
    this.matches = entries
  }
  get focused() { return this.input.focused }
  set focused(value: boolean) { this.input.focused = value }
  invalidate() { this.input.invalidate() }
  handleInput(data: string) {
    if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) { this.close(); return }
    if (matchesKey(data, 'enter')) { const text = this.matches[this.selected]; if (text !== undefined) this.choose(text); return }
    if (matchesKey(data, 'up') || matchesKey(data, 'down') || matchesKey(data, 'ctrl+r')) {
      const n = this.matches.length
      if (n) this.selected = (this.selected + (matchesKey(data, 'up') ? -1 : 1) + n) % n
    } else {
      this.input.handleInput(data)
      const query = this.input.getValue().toLocaleLowerCase()
      if (query !== this.query) { this.query = query; this.selected = 0; this.matches = this.entries.filter(text => text.toLocaleLowerCase().includes(query)) }
    }
    this.renderAgain()
  }
  render(width: number) {
    const inner = Math.max(1, width - 4), start = Math.max(0, this.selected - 4)
    const fit = (text: string) => truncateToWidth(plain(text), inner, '…')
    const lines = [fit('搜索输入历史 · ' + (this.matches.length ? `${this.selected + 1}/${this.matches.length}` : '0/0')),
      ...this.input.render(inner),
      ...(this.matches.length ? this.matches.slice(start, start + 5).map((text, i) => fit((start + i === this.selected ? '› ' : '  ') + text.replaceAll('\n', ' ↵ '))) : [fit(this.entries.length ? '没有匹配的输入' : '还没有输入历史')]),
      fit('↑↓ 选择 · Enter 填入草稿 · Esc 取消')]
    return ['┌' + '─'.repeat(inner + 2) + '┐',
      ...lines.map(line => '│ ' + line + ' '.repeat(Math.max(0, inner - visibleWidth(line))) + ' │'),
      '└' + '─'.repeat(inner + 2) + '┘']
  }
}
