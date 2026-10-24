import headless from '@xterm/headless'
import { Unicode11Addon } from '@xterm/addon-unicode11'

/** A process-side terminal model. Hidden renderer panes are never the source of truth. */
export class TerminalScreen {
  private readonly terminal: InstanceType<typeof headless.Terminal>
  private pending: Promise<void> = Promise.resolve()
  private disposed = false
  private revision = 0

  constructor(cols = 100, rows = 30, complete?: (token: string, exitCode: number) => void, directory?: (token: string, cwd: string) => void) {
    this.terminal = new headless.Terminal({ cols, rows, scrollback: 2000, allowProposedApi: true, convertEol: true })
    this.terminal.loadAddon(new Unicode11Addon() as unknown as Parameters<typeof this.terminal.loadAddon>[0])
    this.terminal.unicode.activeVersion = '11'
    this.terminal.parser.registerOscHandler(7777, data => {
      const cwd = /^dawn-cwd;([a-zA-Z0-9-]+);([^\x00-\x1f\x7f]{1,16384})$/.exec(data)
      if (cwd) { directory?.(cwd[1]!, cwd[2]!); return true }
      const match = /^dawn;([a-zA-Z0-9-]+);(\d{1,3})$/.exec(data)
      if (match) complete?.(match[1]!, Number(match[2]))
      return true
    })
  }

  write(data: string): void {
    if (this.disposed) return
    this.revision++
    this.pending = new Promise(resolve => this.terminal.write(data, resolve))
  }

  resize(cols: number, rows: number): void {
    if (this.disposed) return
    this.terminal.resize(cols, rows)
    this.revision++
  }

  async snapshot(maxLines = 120) {
    await this.pending
    const buffer = this.terminal.buffer.active
    // Cursor movement must not hide visible cells below it.
    const end = Math.min(buffer.length, buffer.baseY + this.terminal.rows)
    const start = Math.max(0, end - Math.min(500, Math.max(1, maxLines)))
    const lines: string[] = []
    for (let i = start; i < end; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
    const full = lines.join('\n').trimEnd()
    return {
      text: full.slice(-24_000), truncated: start > 0 || full.length > 24_000,
      cursorLine: buffer.getLine(buffer.baseY + buffer.cursorY)?.translateToString(true) ?? '',
      cursorPrefix: buffer.getLine(buffer.baseY + buffer.cursorY)?.translateToString(true, 0, buffer.cursorX) ?? '',
      cols: this.terminal.cols, rows: this.terminal.rows, revision: this.revision,
      cursorX: buffer.cursorX,
      alternate: buffer.type === 'alternate',
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    // Pending parser callbacks must drain before disposal, or readers can hang.
    void this.pending.then(() => this.terminal.dispose())
  }
}
