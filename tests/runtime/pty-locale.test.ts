import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { PtyRuntime } from '../../src/runtime/pty.js'
import { TerminalScreen } from '../../src/terminal/screen.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  vi.unstubAllEnvs()
})

// Finder/launchd does not provide Terminal.app's locale variables.
function finderEnvironment() {
  for (const name of ['LANG', 'LC_ALL', 'LC_CTYPE']) vi.stubEnv(name, undefined)
}

async function startShell(environment: Record<string, string> = {}) {
  const workspace = mkdtempSync(join(tmpdir(), '中文路径-'))
  const screen = new TerminalScreen(160, 20)
  const runtime = new PtyRuntime({
    command: '/bin/zsh', args: ['-f', '-i'], cols: 160, rows: 20,
    environment: async () => ({ PROMPT: '%~ %# ', ...environment }),
  })
  cleanups.push(async () => {
    await runtime.stop('locale'); screen.dispose(); rmSync(workspace, { recursive: true, force: true })
  })
  runtime.attach('locale', event => { if (event.kind === 'output') screen.write(event.data) })
  await runtime.start({ sessionId: 'locale', workspace, sessionDir: workspace })
  await vi.waitFor(async () => expect((await screen.snapshot()).cursorLine).toMatch(/[%#$] /), { timeout: 5000 })
  return { workspace, screen, write: (text: string) => runtime.write('locale', text) }
}

describe.skipIf(process.platform !== 'darwin')('PTY UTF-8 fallback with a real zsh', () => {
  it('shows a Chinese working-directory prompt when launched without a locale', async () => {
    finderEnvironment()
    const shell = await startShell()
    expect((await shell.screen.snapshot()).cursorLine).toContain(basename(shell.workspace))
  })

  it('keeps Chinese input, backspace editing and command output intact without a locale', async () => {
    finderEnvironment()
    const shell = await startShell()
    shell.write('中文输入错')
    await vi.waitFor(async () => expect((await shell.screen.snapshot()).cursorLine).toContain('中文输入错'))
    shell.write('\x7f')
    await vi.waitFor(async () => {
      const line = (await shell.screen.snapshot()).cursorLine
      expect(line).toContain('中文输入')
      expect(line).not.toContain('错')
    })
    shell.write('\x15')
    shell.write("printf '%s\\n' '中文输出验证'\r")
    await vi.waitFor(async () => expect((await shell.screen.snapshot()).text).toContain('\n中文输出验证\n'))
    expect((await shell.screen.snapshot()).text).not.toMatch(/�|\\M-|<00[0-9a-f]{2}>/i)
  })

  it('keeps the idle prompt cursor after $ with a Unicode right-side status', async () => {
    finderEnvironment()
    const shell = await startShell({ PROMPT: 'user@host ~/Desktop/test$ ', RPROMPT: '130 ↵' })
    const snapshot = await shell.screen.snapshot()
    expect(snapshot.cursorLine).toContain('130 ↵')
    expect(snapshot.cursorPrefix).toBe('user@host ~/Desktop/test$ ')
  })

  it('treats empty locale values as missing', async () => {
    finderEnvironment()
    const shell = await startShell({ LANG: '', LC_ALL: '', LC_CTYPE: '' })
    expect((await shell.screen.snapshot()).cursorLine).toContain(basename(shell.workspace))
  })
})
