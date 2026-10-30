import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TerminalControl } from '../../src/terminal/control.js'
import { PtyRuntime } from '../../src/runtime/pty.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function setup() {
  const workspace = mkdtempSync(join(tmpdir(), 'dawn-terminal-'))
  const control = new TerminalControl()
  const runtime = new PtyRuntime({ command: '/bin/bash', args: ['--noprofile', '--norc'], terminalControl: control })
  await runtime.start({ sessionId: 't', workspace, sessionDir: join(workspace, '.dawn') })
  cleanups.push(async () => { await runtime.stop('t'); control.dispose(); rmSync(workspace, { force: true, recursive: true }) })
  const prompt = async (pattern: RegExp) => {
    await vi.waitFor(async () => {
      control.grant('chat', 't', 'shell')
      const snapshot = await control.snapshot('chat', 't')
      expect(snapshot.cursorLine).toMatch(pattern)
    }, { timeout: 5000 })
  }
  await prompt(/[$#] ?$/)
  return { workspace, control, runtime, prompt }
}

describe('same real PTY process', () => {
  it('reads the live Shell directory after cd instead of reporting its startup directory', async () => {
    const x = await setup()
    x.control.reclaim('t')
    x.runtime.write('t', 'mkdir nested; cd nested\r')
    await x.prompt(/[$#] ?$/)
    // The screen may still contain the previous prompt while cd is in flight.
    // Wait for the actual idle-shell query and changed directory together.
    await vi.waitFor(async () => {
      expect(await x.control.currentDirectory('t')).toBe(realpathSync(join(x.workspace, 'nested')))
    }, { timeout: 5000 })
  })
  it('keeps the human cwd, environment and shell PID across an AI handoff', async () => {
    const x = await setup()
    const initialPid = x.control.state('t').pid
    x.control.reclaim('t')
    x.runtime.write('t', 'export DAWN_TERMINAL_SAMPLE=41; mkdir nested; cd nested; echo HUMAN_READY\r')
    await x.prompt(/[$#] ?$/)
    await x.control.execute('chat', 't', 'printf "%s|%s|%s" "$DAWN_TERMINAL_SAMPLE" "$PWD" "$$" > ../proof.txt', async () => {})
    const result = await x.control.wait('chat', 't', 3000)
    expect(result.task).toMatchObject({ state: 'completed', exitCode: 0 })
    expect(readFileSync(join(x.workspace, 'proof.txt'), 'utf8')).toBe(`41|${x.workspace}/nested|${initialPid}`)
    x.control.reclaim('t')
    expect(x.control.state('t')).toMatchObject({ alive: true, pid: initialPid, controlled: false })
    x.runtime.write('t', 'printf still-here > ../manual.txt\r')
    await vi.waitFor(() => expect(readFileSync(join(x.workspace, 'manual.txt'), 'utf8')).toBe('still-here'))
  })

  it('continues in an already-open Python and leaves its variables usable by the human', async () => {
    const x = await setup()
    x.control.reclaim('t')
    x.runtime.write('t', 'python3 -q\r')
    await x.prompt(/>>> ?$/)
    x.runtime.write('t', 'dawn_number = 40\r')
    await x.prompt(/>>> ?$/)
    x.control.grant('chat', 't', 'python')
    await x.control.execute('chat', 't', 'dawn_number += 2\nopen("python-result.txt", "w").write(str(dawn_number))', async () => {})
    expect((await x.control.wait('chat', 't', 3000)).task).toMatchObject({ state: 'completed', exitCode: 0 })
    expect(readFileSync(join(x.workspace, 'python-result.txt'), 'utf8')).toBe('42')
    x.control.reclaim('t')
    x.runtime.write('t', 'open("python-manual.txt", "w").write(str(dawn_number))\r')
    await vi.waitFor(() => expect(readFileSync(join(x.workspace, 'python-manual.txt'), 'utf8')).toBe('42'))
  })

  it.skipIf(!existsSync('/Library/Frameworks/R.framework/Resources/bin/R'))('continues in an already-open R without a Jupyter kernel', async () => {
    const x = await setup()
    x.control.reclaim('t')
    x.runtime.write('t', '/Library/Frameworks/R.framework/Resources/bin/R --vanilla --quiet\r')
    await x.prompt(/^> ?$/)
    x.runtime.write('t', 'dawn_number <- 40\r')
    await x.prompt(/^> ?$/)
    x.control.grant('chat', 't', 'R')
    await x.control.execute('chat', 't', 'dawn_number <- dawn_number + 2; writeLines(as.character(dawn_number), "r-result.txt")', async () => {})
    expect((await x.control.wait('chat', 't', 3000)).task).toMatchObject({ state: 'completed', exitCode: 0 })
    expect(readFileSync(join(x.workspace, 'r-result.txt'), 'utf8')).toBe('42\n')
    x.control.reclaim('t')
    x.runtime.write('t', 'writeLines(as.character(dawn_number), "r-manual.txt")\r')
    await vi.waitFor(() => expect(readFileSync(join(x.workspace, 'r-manual.txt'), 'utf8')).toBe('42\n'))
  })
})
