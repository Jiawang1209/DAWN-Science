import { InputHistorySearch } from './input-history.js'
import { Editor, ProcessTerminal, TuiAltScreen, VStack, ScrollView, CombinedAutocompleteProvider, getNativeClipboard, matchesKey, isKeyRelease, truncateToWidth, visibleWidth, type Terminal, type Component, type TuiMouseEvent } from '@earendil-works/pi-tui'
import { CliTranscript, type Picture, type ToolStart, type ToolEnd } from './tui-transcript.js'
import { plain } from './presentation.js'
import type { CliHistory } from './desktop-wire.js'
import { usageLines, type CliUsage } from './usage.js'
import type { SessionPermission } from '../protocol/permissions.js'
import { permissionLabel } from './permissions.js'

type State = { busy: boolean; permission?: boolean; question?: boolean }
type Options = { model: string; workspace: string; color: boolean; terminal?: Terminal; contextButton?: boolean;
  onDraftChange?: () => void; onSubmit: (text: string) => void; onInterrupt: () => void; onExit: () => void }
const localCommand = (text: string) => /^\/(?:exit|quit|help|status)$|^\/permissions(?:\s|$)/.test(text.trim())
const INPUT_HELP = 'Enter 发送 · Shift/Alt+Enter 换行 · Tab 补全建议/展开工具 · /exit 返回 Shell'
class SearchAwareTui extends TuiAltScreen {
  get overlayFocused() { return this.isOverlayFocused() }
}
class PromptEditor extends Editor {
  ghost = ''
  placeholder?: () => string
  ghostStyle = (text: string) => text
  private gutter(width: number) { return Math.min(7, Math.max(0, width - 2)) }
  private bottom = ''
  protected override renderBottomBorder(width: number, hidden: number) {
    return this.bottom = super.renderBottomBorder(width, hidden)
  }
  override render(width: number) {
    this.ghost = this.placeholder?.() ?? this.ghost
    const gutter = this.gutter(width), prefix = '> DAWN '.slice(0, gutter)
    return super.render(width - gutter).map((line, index) => {
      const lead = index === 1 ? this.borderColor(prefix)
        : index === 0 || line === this.bottom ? this.borderColor('─'.repeat(gutter)) : ' '.repeat(gutter)
      if (index === 1 && !this.getText() && this.ghost) {
        line = line.trimEnd() + this.ghostStyle(truncateToWidth(this.ghost, Math.max(0, width - gutter - 1), ''))
      }
      return lead + line
    })
  }
  override handleMouse(event: TuiMouseEvent) {
    const gutter = this.gutter(event.width)
    return super.handleMouse({ ...event, x: Math.max(0, event.x - gutter), width: event.width - gutter })
  }
}
/** Interactive UI owns input only while DAWN is active; Shell and pipe mode remain separate. */
export class CliTui {
  private readonly tui: SearchAwareTui
  private readonly editor: PromptEditor
  private readonly transcript: CliTranscript
  private readonly scroll: ScrollView
  private readonly terminal: Terminal
  private state: State = { busy: false }
  private usage: CliUsage = {}
  private permissions: SessionPermission | undefined
  private usageRevision = 0
  private contextPlacement: { row: number; col: number; width: number } | undefined
  private stopped = true
  private firstPrompt = true
  private suggestion = ''
  private headerRows = 0
  private readonly inputs: string[] = []
  constructor(private readonly options: Options) {
    const native = options.terminal ?? new ProcessTerminal()
    this.transcript = new CliTranscript(options.color)
    // Image coordinates are emitted after the viewport render, never inserted into model text.
    this.terminal = new Proxy(native, { get: (target, key) => {
      if (key === 'write') return (data: string) => { target.write(data); if (!this.stopped && data.includes('\x1b[?2026l')) this.imageFrame(target) }
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value
    } })
    const { accent, dim, bold } = this.transcript.style
    this.tui = new SearchAwareTui(this.terminal, true, undefined, {
      scrollToEndIndicator: () => accent('↓ 回到底部'), copyOnSelect: false,
      copySelection: async text => {
        const clipboard = getNativeClipboard()
        if (!clipboard?.setText) return '当前终端无法自动复制，请使用系统选择复制。'
        try { await clipboard.setText(text); return true } catch { return '复制失败，请重试。' }
      },
    })
    this.editor = new PromptEditor(this.tui, { borderColor: accent, selectList: {
      selectedPrefix: accent, selectedText: bold, description: dim, scrollInfo: dim, noMatch: dim,
    } }, { paddingX: 0, autocompleteMaxVisible: 3 })
    this.editor.setAutocompleteProvider(new CombinedAutocompleteProvider([
      { name: 'help', description: '帮助与快捷键' }, { name: 'status', description: '模型、目录和记录位置' }, { name: 'exit', description: '返回原 Shell' },
      { name: 'permissions', description: '查看或切换当前会话的工具权限' },
    ], options.workspace))
    this.editor.onSubmit = text => {
      if (!text.trim()) return
      this.firstPrompt = false; this.suggestion = ''
      if (!localCommand(text) && !this.state.permission && !this.state.question) {
        this.rememberInput(text); this.transcript.user(text)
      }
      this.scroll.scrollToEnd(); options.onSubmit(text); this.tui.requestRender()
    }
    this.editor.ghostStyle = dim
    this.editor.onChange = () => { options.onDraftChange?.(); this.tui.requestRender() }
    const header: Component = { invalidate() {}, render: width => {
      const border = dim('#'.repeat(width))
      const lines = [
        border,
        truncateToWidth(accent(bold('DAWN Science')) + dim(' · ' + plain(this.usage.context?.model ?? options.model)), width, ''),
        truncateToWidth(dim(plain(options.workspace)), width, ''),
        truncateToWidth(dim(INPUT_HELP), width, ''),
        truncateToWidth(dim('⌘/Ctrl+F 搜索历史 · Tab/→ 采纳建议 · /help 帮助'), width, ''),
        border, '',
      ]
      this.headerRows = lines.length
      return lines
    } }
    const hint: Component = { invalidate() {}, render: width => {
      const text = this.state.permission ? '需要确认 · 输入编号或 y/n · Enter 确认'
        : this.state.question ? '等待回答 · Enter 提交 · Shift/Alt+Enter 换行'
        : this.state.busy ? '生成中 · Ctrl-C 停止 · 输入可保留草稿' : ''
      return text ? [truncateToWidth(dim(text), width, '')] : []
    } }
    this.editor.placeholder = () => this.state.busy || this.state.permission || this.state.question ? ''
      : this.suggestion || (this.firstPrompt ? INPUT_HELP : '继续提问…')
    const footer: Component = { invalidate() {}, render: width => {
      const slot = options.contextButton && width >= 10 ? ' '.repeat(10) : undefined
      const lines = usageLines(this.usage, width, options.model, slot, this.permissions ? permissionLabel(this.permissions) : '权限未读取')
      this.contextPlacement = slot ? { row: this.terminal.rows - 1, col: visibleWidth(lines.at(-1)!) - slot.length, width: slot.length } : undefined
      return [...(this.terminal.rows <= 12 ? [] : ['']), ...lines.map(dim)]
    } }
    const content: Component = { invalidate: () => this.transcript.invalidate(), render: width => [...header.render(width), ...this.transcript.render(width)] }
    this.scroll = new ScrollView(content, { follow: 'end', primary: true, scrollbar: 'hidden' })
    this.tui.setLayoutRoot(new VStack([{ component: this.scroll, grow: 1, minSize: 1 }, { component: hint, shrink: 0 }, { component: this.editor, shrink: 0 }, { component: footer, shrink: 0 }]))
    this.tui.setFocus(this.editor)
    this.tui.addInputListener(data => {
      if (isKeyRelease(data)) return { consume: true }
      if (matchesKey(data, 'ctrl+shift+c') || matchesKey(data, 'super+c') || matchesKey(data, 'ctrl+c') && this.tui.hasActiveSelection()) {
        void this.tui.copyActiveSelectionToClipboard(); return { consume: true }
      }
      if (matchesKey(data, 'ctrl+l')) {
        const buttonMotion = Boolean(process.env.TMUX || process.env.ZELLIJ || process.env.STY || /^(tmux|screen)/.test(process.env.TERM ?? ''))
        this.terminal.write('\x1b[?1049h\x1b[?7l\x1b[?2004h\x1b[?1000h' + (buttonMotion ? '\x1b[?1002h' : '\x1b[?1003h') + '\x1b[?1006h\x1b[?1004h')
        if (this.terminal.kittyProtocolActive) this.terminal.write('\x1b[=7u')
        else if ((this.terminal as Terminal & { modifyOtherKeysActive?: boolean }).modifyOtherKeysActive) this.terminal.write('\x1b[>4;2m')
        this.tui.renderNow(true); return { consume: true }
      }
      if (this.tui.overlayFocused) return undefined
      if (matchesKey(data, 'ctrl+r')) { this.searchInputs(); return { consume: true } }
      if (matchesKey(data, 'ctrl+c')) {
        if (!this.state.busy && this.editor.getExpandedText()) { this.editor.setText(''); this.tui.requestRender() }
        else options.onInterrupt()
        return { consume: true }
      }
      if (matchesKey(data, 'ctrl+d') && !this.editor.getExpandedText() && !this.state.busy) { options.onExit(); return { consume: true } }
      if (matchesKey(data, 'ctrl+end')) { this.scroll.scrollToEnd(); this.tui.requestRender(); return { consume: true } }
      if ((matchesKey(data, 'right') || matchesKey(data, 'tab')) && this.suggestion && !this.editor.getText() && !this.state.busy && !this.state.permission && !this.state.question) {
        const text = this.suggestion; this.suggestion = ''; this.editor.setText(text); this.tui.requestRender(); return { consume: true }
      }
      if (matchesKey(data, 'tab') && !this.editor.getText().startsWith('/')) { this.transcript.toggleTools(); this.tui.requestRender(); return { consume: true } }
      if (matchesKey(data, 'enter') && localCommand(this.editor.getExpandedText())) {
        // setText cancels pending async completion; Enter must submit the command
        // the user actually typed, never an earlier selected slash candidate.
        this.editor.setText(this.editor.getExpandedText())
      }
      if (matchesKey(data, 'enter') && this.state.busy && !this.state.permission && !this.state.question && !localCommand(this.editor.getExpandedText())) {
        this.tui.flash('本轮仍在运行；草稿已保留，Ctrl-C 可停止。'); return { consume: true }
      }
      return undefined
    })
  }
  private rememberInput(text: string) {
    this.editor.addToHistory(text)
    const prior = this.inputs.indexOf(text)
    if (prior >= 0) this.inputs.splice(prior, 1)
    this.inputs.unshift(text)
    this.inputs.splice(100)
  }
  private searchInputs() {
    let overlay: import('@earendil-works/pi-tui').OverlayHandle | undefined
    const close = () => { overlay?.hide(); this.tui.requestRender() }
    const search = new InputHistorySearch([...this.inputs], text => { close(); this.editor.setText(text); this.tui.requestRender() }, close, () => this.tui.requestRender())
    overlay = this.tui.showOverlay(search, { anchor: 'center', width: '75%', minWidth: 24, maxHeight: '80%' })
  }
  private imageFrame(target: Terminal) {
    if (!this.scroll) return
    const start = this.scroll.scrollTop, height = this.scroll.viewportHeight
    const images = (this.tui.overlayFocused ? [] : this.transcript.placements).map(x => ({ ...x, row: this.headerRows + x.row }))
      .filter(x => x.row >= start && x.row + x.height <= start + height).slice(-24).map(x => ({ ...x, row: x.row - start }))
    target.write(`\x1b]777;dawn-viewport;${JSON.stringify({ images })}\x07`)
    if (this.options.contextButton) target.write(`\x1b]777;dawn-context;${JSON.stringify(this.contextPlacement ? { ...this.contextPlacement, revision: this.usageRevision } : null)}\x07`)
  }
  start() {
    if (!this.stopped) return
    this.stopped = false
    try { this.tui.start() } catch (error) { this.stop(); throw error }
  }
  stop() {
    if (this.stopped) return
    this.stopped = true
    this.terminal.write('\x1b]777;dawn-viewport;{"images":[]}\x07')
    if (this.options.contextButton) this.terminal.write('\x1b]777;dawn-context;null\x07')
    this.tui.stop({ preserveScreen: true })
  }
  renderNow() { if (!this.stopped) this.tui.renderNow() }
  setPermissions(value?: SessionPermission) {
    if (this.permissions?.current === value?.current && this.permissions?.effective === value?.effective) return
    this.permissions = value; this.usageRevision++; this.tui.requestRender()
  }
  setSuggestion(text: string) { this.suggestion = plain(text).replace(/[\r\n]/g, ' ').slice(0, 120); this.tui.requestRender() }
  setUsage(usage: CliUsage) { this.usage = usage; this.usageRevision++; this.tui.requestRender() }
  setState(state: State) {
    const waiting = state.permission && !this.state.permission || state.question && !this.state.question
    this.state = state
    if (waiting) this.scroll.scrollToEnd()
    this.tui.requestRender()
  }
  draft() { return this.editor.getExpandedText() }
  following() { return this.scroll.isFollowingEnd }
  reply(data: string) { this.transcript.reply(data); this.tui.requestRender() }
  finish() { this.transcript.finish(); this.tui.requestRender() }
  notice(text: string, urgent = false) { this.transcript.notice(text); if (urgent) this.scroll.scrollToEnd(); this.tui.requestRender() }
  toolStart(event: ToolStart) { this.transcript.toolStart(event); this.tui.requestRender() }
  toolEnd(event: ToolEnd) { this.transcript.toolEnd(event); if (event.isError) this.scroll.scrollToEnd(); this.tui.requestRender() }
  image(event: Picture) { this.transcript.image(event); this.tui.requestRender() }
  restore(history: CliHistory) {
    this.firstPrompt = false
    this.transcript.notice('已恢复原会话，继续之前的对话。')
    if (history.truncated) this.transcript.notice('较早记录已收起，返回会话可查看完整过程；模型仍使用原会话上下文。')
    for (const item of history.items) {
      if (item.kind === 'text') {
        if (item.who === 'user') { this.transcript.user(item.text); this.rememberInput(item.text) }
        else { this.transcript.reply(item.text); this.transcript.finish() }
      } else if (item.kind === 'tool') {
        this.transcript.toolStart({ toolCallId: item.id, toolName: item.name, input: item.input })
        this.transcript.toolEnd({ toolCallId: item.id, toolName: item.name, text: item.result ?? '', isError: item.isError ?? false, truncated: item.truncated ?? Boolean(item.fullOutputPath), ...(item.fullOutputPath ? { fullOutputPath: item.fullOutputPath } : {}) })
      } else if (item.kind === 'compaction') this.transcript.notice('历史上下文已压缩：' + item.summary)
    }
    for (const picture of history.pictures) this.transcript.image(picture)
    for (const warning of history.warnings ?? []) this.transcript.notice(warning)
    this.scroll.scrollToEnd(); this.tui.requestRender()
  }
}
