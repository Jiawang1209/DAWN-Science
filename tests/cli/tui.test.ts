import { afterEach, expect, it, vi } from 'vitest'
import { Terminal as Headless } from '@xterm/headless'
import type { Terminal } from '@earendil-works/pi-tui'
import { CliTui } from '../../src/cli/tui.js'

const cleanup: (() => void)[] = []
it('keeps cumulative usage below the draft, replaces snapshots, and wraps all fields in narrow terminals', async () => {
  const f = fixture(); await f.flush()
  expect(f.text()).toContain('输入 未提供')
  f.ui.setUsage({ input: 30, output: 6, cacheRead: 70 }); f.input('KEEP_DRAFT'); await f.flush()
  expect(f.text()).toContain('输入 30'); expect(f.text()).toContain('输出 6'); expect(f.text()).toContain('缓存读取 70'); expect(f.text()).toContain('命中 70%')
  f.ui.setUsage({ input: 30, output: 6, cacheRead: 70 }); await f.flush()
  expect(f.text()).not.toContain('输入 60'); expect(f.ui.draft()).toBe('KEEP_DRAFT')
  f.resize(38, 22); await f.flush()
  expect(f.text()).toContain('缓存读取 70'); expect(f.text()).toContain('命中 70%'); expect(f.text()).toContain('> DAWN KEEP_DRAFT')
  f.ui.setUsage({ input: 40, output: 8, partial: ['input'] }); await f.flush()
  expect(f.text()).toContain('输入 ≥40'); expect(f.text()).toContain('缓存读取 未提供'); expect(f.text()).toContain('命中 未提供')
  f.ui.setUsage({ input: 100, output: 8, cacheRead: 0, partial: ['cacheRead'] }); await f.flush()
  expect(f.text()).toContain('缓存读取 未确认'); expect(f.text()).toContain('命中 未提供'); expect(f.text()).not.toContain('命中 0%')
})
afterEach(() => { for (const close of cleanup.splice(0)) close() })
function fixture(cols = 80, rows = 28) {
  const screen = new Headless({ cols, rows, allowProposedApi: true }), pending: Promise<void>[] = []
  let receive = (_: string) => {}, resize = () => {}, bytes = ''
  const terminal: Terminal = {
    columns: cols, rows, kittyProtocolActive: false,
    async drainInput() {}, start(input, onResize) { receive = input; resize = onResize }, stop() {},
    write(data) { bytes += data; pending.push(new Promise(resolve => screen.write(data, resolve))) },
    moveBy(lines) { this.write(`\x1b[${Math.abs(lines)}${lines < 0 ? 'A' : 'B'}`) },
    hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {},
  }
  const submit = vi.fn(), interrupt = vi.fn(), exit = vi.fn()
  const ui = new CliTui({ model: 'deepseek-flash', workspace: '/work/中文 project', terminal, color: false,
    onSubmit: submit, onInterrupt: interrupt, onExit: exit })
  ui.start(); cleanup.push(() => { ui.stop(); screen.dispose() })
  const flush = async () => { ui.renderNow(); await Promise.all(pending.splice(0)) }
  const text = () => Array.from({ length: screen.rows }, (_, i) => screen.buffer.active.getLine(i)?.translateToString(true) ?? '').join('\n')
  return { ui, screen, terminal, submit, interrupt, exit, flush, text, input: (data: string) => receive(data), bytes: () => bytes,
    resize(cols: number, rows: number) { screen.resize(cols, rows); Object.assign(terminal, { columns: cols, rows }); resize() } }
}
it('streams Markdown before idle while the input editor stays below the transcript', async () => {
  const f = fixture(); f.ui.setState({ busy: true }); f.ui.reply('## 检查结果\n\n已经读到 **1200 行**，正在继续。'); await f.flush()
  expect(f.text()).toContain('检查结果'); expect(f.text()).toContain('1200 行'); expect(f.text()).not.toContain('**1200')
  expect(f.text()).toContain('生成中'); expect(f.text().lastIndexOf('> DAWN')).toBeGreaterThan(f.text().indexOf('检查结果'))
  expect(f.screen.buffer.active.type).toBe('alternate')
})
it('submits multiline input once, retains a busy draft, and handles idle Ctrl-C as clear then exit', async () => {
  const f = fixture(); f.input('第一行'); f.input('\x1b[13;2u'); f.input('第二行'); f.input('\r'); await f.flush()
  expect(f.submit).toHaveBeenCalledWith('第一行\n第二行')
  f.ui.setState({ busy: true }); f.input('下一问'); f.input('\r'); await f.flush()
  expect(f.submit).toHaveBeenCalledTimes(1); expect(f.ui.draft()).toBe('下一问')
  f.ui.setState({ busy: false }); f.input('\x03'); expect(f.ui.draft()).toBe(''); expect(f.interrupt).not.toHaveBeenCalled()
  f.input('\x03'); expect(f.interrupt).toHaveBeenCalledOnce()
})
it('keeps the inline prompt outside the draft and aligns cursor, mouse editing and continuation text', async () => {
  const f = fixture(40, 24); f.input('ABCDE'); await f.flush()
  expect(f.text()).toContain('> DAWN ABCDE'); expect(f.screen.buffer.active.cursorX).toBe(12)
  const row = f.screen.buffer.active.cursorY + 1
  f.input(`\x1b[<0;10;${row}M`); f.input(`\x1b[<0;10;${row}m`); f.input('X'); await f.flush()
  expect(f.ui.draft()).toBe('ABXCDE')
  f.input('\x05'); f.input('\x1b[13;2u'); f.input('中文续行'); await f.flush()
  expect(f.text()).toMatch(/> DAWN ABXCDE *\n       中文续行/)
  f.input('\r'); expect(f.submit).toHaveBeenCalledWith('ABXCDE\n中文续行')
})
it.each(['/tmp/example.csv 请分析这个文件', '/Users/example/data.csv', '/help-me 分析数据'])('records and recalls slash-leading user prompts: %s', async text => {
  const f = fixture(); f.input(`\x1b[200~${text}\x1b[201~`); f.input('\r'); await f.flush()
  expect(f.submit).toHaveBeenCalledWith(text)
  expect(f.text()).toContain(text)
  f.input('\x1b[A'); expect(f.ui.draft()).toBe(text)
})
it('keeps only recognized local commands out of the user transcript and history', async () => {
  const f = fixture(); f.input('  /help  '); f.input('\r'); await f.flush()
  expect(f.submit).toHaveBeenCalledWith('/help')
  expect(f.text()).not.toContain('› 你')
  f.input('\x1b[A'); expect(f.ui.draft()).toBe('')
})
it('keeps a pasted multiline paragraph as one turn and can recall it from history', async () => {
  const f = fixture(); f.input('\x1b[200~line one\nline two\x1b[201~'); f.input('\r')
  expect(f.submit).toHaveBeenCalledWith('line one\nline two')
  f.input('\x1b[A'); expect(f.ui.draft()).toBe('line one\nline two')
})
it('summarizes tools, expands them with Tab and keeps failures visible', async () => {
  const f = fixture(); f.ui.toolStart({ toolCallId: 't1', toolName: 'bash', input: { command: 'printf demo' } })
  f.ui.toolEnd({ toolCallId: 't1', toolName: 'bash', isError: false, text: Array.from({ length: 12 }, (_, i) => `RESULT_${i}`).join('\n'), truncated: false })
  await f.flush(); expect(f.text()).toContain('RESULT_0'); expect(f.text()).not.toContain('RESULT_11'); expect(f.text()).toContain('省略')
  f.input('\t'); await f.flush(); expect(f.text()).toContain('RESULT_11')
  f.ui.toolStart({ toolCallId: 't2', toolName: 'read', input: { path: '/missing' } })
  f.ui.toolEnd({ toolCallId: 't2', toolName: 'read', isError: true, text: 'ENOENT missing', truncated: false })
  await f.flush(); expect(f.text()).toContain('失败'); expect(f.text()).toContain('ENOENT')
})
it('scrolls without stealing the reader back on streamed output and resumes on Ctrl-End', async () => {
  const f = fixture(); f.ui.reply(Array.from({ length: 70 }, (_, i) => `line ${i}`).join('\n\n')); await f.flush()
  f.input('\x1b[5~'); await f.flush(); const before = f.ui.following()
  f.ui.reply('\n\nNEW_BOTTOM'); await f.flush(); expect(before).toBe(false); expect(f.ui.following()).toBe(false); expect(f.text()).not.toContain('NEW_BOTTOM')
  f.input('\x1b[1;5F'); await f.flush(); expect(f.text()).toContain('NEW_BOTTOM'); expect(f.ui.following()).toBe(true)
})
it('uses only current visible image positions and restores the Shell buffer on stop', async () => {
  const f = fixture(70, 30); f.ui.image({ id: '58b52380-f46a-4a64-8450-f66a696571c4', name: 'plot.png' }); await f.flush()
  const frames = [...f.bytes().matchAll(/\x1b\]777;dawn-viewport;([^\x07]+)\x07/g)]
  const frame = JSON.parse(frames.at(-1)![1]!); expect(frame.images).toHaveLength(1)
  expect(frame.images[0].row + frame.images[0].height).toBeLessThan(24)
  f.resize(40, 18); await f.flush(); expect(f.text()).toContain('DAWN'); expect(f.text()).toContain('> DAWN')
  f.ui.stop(); await Promise.all([]); await f.flush(); expect(f.screen.buffer.active.type).toBe('normal')
})
it('never lets model content execute screen, title, clipboard or image control sequences', async () => {
  const f = fixture(); f.ui.reply('\x1b[2JSAFE\x1b]0;injected-title\x07\x1b]777;dawn-image;fake\x07'); await f.flush()
  expect(f.text()).toContain('SAFE'); expect(f.bytes()).not.toContain('injected-title'); expect(f.bytes()).not.toContain('dawn-image;fake')
})
it('reconstructs the alternate viewport on Ctrl-L after a trimmed terminal snapshot lost its screen mode', async () => {
  const f = fixture(); f.ui.reply('STILL_CURRENT_CONTEXT'); await f.flush()
  f.terminal.write('\x1b[?1049l'); await f.flush(); expect(f.screen.buffer.active.type).toBe('normal')
  f.input('\x0c'); await f.flush()
  expect(f.screen.buffer.active.type).toBe('alternate'); expect(f.text()).toContain('STILL_CURRENT_CONTEXT')
})
it('restores terminal mode if starting input capture fails', async () => {
  const f = fixture(); f.ui.stop(); await f.flush()
  f.terminal.start = () => { throw Error('input capture failed') }
  expect(() => f.ui.start()).toThrow('input capture failed')
  await f.flush(); expect(f.screen.buffer.active.type).toBe('normal')
})
it('NO_COLOR also applies to the scrollbars shown while browsing history', async () => {
  const f = fixture(); f.ui.reply(Array.from({ length: 70 }, (_, i) => `paragraph ${i}`).join('\n\n')); await f.flush()
  f.input('\x1b[5~'); await f.flush()
  expect(f.bytes()).not.toMatch(/\x1b\[(?:3[0-7]|9[0-7])m/)
})
it('reveals a new permission request even when the reader is browsing old output', async () => {
  const f = fixture(); f.ui.reply(Array.from({ length: 70 }, (_, i) => `paragraph ${i}`).join('\n\n')); await f.flush()
  f.input('\x1b[5~'); await f.flush(); expect(f.ui.following()).toBe(false)
  f.ui.notice('CHOICE_VISIBLE 允许这次操作？\n1. 允许\n2. 拒绝'); f.ui.setState({ busy: true, permission: true }); await f.flush()
  expect(f.text()).toContain('CHOICE_VISIBLE'); expect(f.text()).toContain('1. 允许')
})
it('reveals an urgent failure without losing the existing editor draft', async () => {
  const f = fixture(); f.ui.reply(Array.from({ length: 70 }, (_, i) => `paragraph ${i}`).join('\n\n')); await f.flush()
  f.input('\x1b[5~'); f.input('KEEP_DRAFT'); f.ui.notice('URGENT_MODEL_FAILURE', true); await f.flush()
  expect(f.text()).toContain('URGENT_MODEL_FAILURE'); expect(f.ui.draft()).toBe('KEEP_DRAFT')
})
it('refresh restores terminal input modes as well as the alternate screen after snapshot replay', async () => {
  const f = fixture(); await f.flush()
  f.terminal.write('\x1b[?2004l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1004l\x1b[?7h\x1b[?1049l'); await f.flush()
  f.input('\x0c'); await f.flush()
  expect(f.screen.modes.bracketedPasteMode).toBe(true); expect(f.screen.modes.mouseTrackingMode).not.toBe('none')
  expect(f.screen.modes.sendFocusMode).toBe(true); expect(f.screen.modes.wraparoundMode).toBe(false)
})
it('reveals a tool failure received while reading old output', async () => {
  const f = fixture(); f.ui.reply(Array.from({ length: 70 }, (_, i) => `paragraph ${i}`).join('\n\n')); await f.flush()
  f.input('\x1b[5~'); await f.flush(); expect(f.ui.following()).toBe(false)
  f.ui.toolStart({ toolCallId: 'err', toolName: 'read', input: { path: 'missing' } })
  f.ui.toolEnd({ toolCallId: 'err', toolName: 'read', isError: true, text: 'VISIBLE_TOOL_FAILURE', truncated: false }); await f.flush()
  expect(f.text()).toContain('VISIBLE_TOOL_FAILURE'); expect(f.text()).toContain('失败')
})
