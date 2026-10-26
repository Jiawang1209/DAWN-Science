import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as pty from 'node-pty'
import { RemoteTerminalRuntime } from '../../src/runtime/remote-terminal.js'
import { TerminalControl } from '../../src/terminal/control.js'
import type { RemoteShell } from '../../src/remote/ssh.js'
import type { AgentEvent, RemoteCwd, SessionSpec } from '../../src/runtime/types.js'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f() })
async function setup(options: {
  id?: string; control?: TerminalControl; runtime?: RemoteTerminalRuntime; canonical?: RemoteCwd
  environment?: (spec: SessionSpec) => Promise<Record<string, string>>; zsh?: boolean; lang?: string; noUtf8?: boolean
} = {}) {
  const id = options.id ?? 't', dir = mkdtempSync(join(tmpdir(), 'dawn-remote-pty-'))
  const control = options.control ?? new TerminalControl()
  const runtime = options.runtime ?? new RemoteTerminalRuntime({ terminalControl: control, ...(options.environment ? { environment: options.environment } : {}) })
  let cwd = dir, exited = false
  const canonical = options.canonical ?? { get: () => cwd, set: (value: string) => { cwd = value } }
  let path = '/usr/bin:/bin'
  if (options.noUtf8) {
    const bin = join(dir, 'bin'); mkdirSync(bin)
    writeFileSync(join(bin, 'locale'), '#!/bin/bash\nif [ "$1" = -a ]; then printf "C\\n"; else printf "ANSI_X3.4-1968\\n"; fi\n', { mode: 0o755 })
    path = `${bin}:${path}`
  }
  const shell = pty.spawn(options.zsh ? '/bin/zsh' : '/bin/bash', options.zsh ? ['-f'] : ['--noprofile', '--norc', '-i'], {
    cwd: dir, cols: 100, rows: 30,
    env: { PATH: path, HOME: dir, LANG: options.lang ?? 'en_US.UTF-8', PS1: 'remote$ ', BASH_SILENCE_DEPRECATION_WARNING: '1' },
  })
  shell.onExit(() => { exited = true })
  const close = () => { if (!exited) { try { process.kill(shell.pid, 'SIGHUP') } catch {} } }
  cleanup.push(async () => { await runtime.stop(id); close(); if (!options.control) control.dispose(); rmSync(dir, { force: true, recursive: true }) })
  const writes: string[] = []
  const openShell = vi.fn(async () => ({
    write: (data: string) => { writes.push(data); shell.write(data) }, resize: (cols: number, rows: number) => shell.resize(cols, rows), close,
    onData: (listener: (data: string) => void) => { const subscription = shell.onData(listener); return () => subscription.dispose() },
    onExit: (listener: (event: { code?: number }) => void) => { const subscription = shell.onExit(event => listener({ code: event.exitCode })); return () => subscription.dispose() },
  } satisfies RemoteShell))
  const spec: SessionSpec = { sessionId: id, workspace: canonical.get(), sessionDir: dir,
    remote: { connectionId: 'server-a', label: 'server-a', cwd: canonical, executor: { exec: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), openShell } } }
  await runtime.start(spec)
  control.bind('chat', id); runtime.bindOwner(id, 'chat')
  return { id, dir, control, runtime, openShell, canonical, spec, writes, cwd: () => canonical.get(),
    write: (data: string) => { control.humanInput(id, data); runtime.write(id, data) } }
}
const ready = async (runtime: RemoteTerminalRuntime, id = 't') => { await vi.waitFor(() => expect(runtime.isReady(id)).toBe(true), { timeout: 3000 }) }

describe('persistent remote terminal runtime', () => {
  it('uses the same remote shell for human and Agent commands and synchronizes cwd', async () => {
    const x = await setup()
    x.write("mkdir '中文目录'; cd '中文目录'; export SHARED_VALUE=41\r")
    expect(x.runtime.isReady('t')).toBe(false)
    await vi.waitFor(() => expect(x.cwd()).toBe(join(x.dir, '中文目录')))
    expect(x.control.state('t').cwd).toBe(join(x.dir, '中文目录'))
    const result = await x.runtime.executeForOwner('chat', "printf '%s:%s' \"$SHARED_VALUE\" \"$PWD\"", {})
    expect(result).toMatchObject({ code: 0, cwd: join(x.dir, '中文目录') })
    expect(result?.stdout).toContain('41:' + join(x.dir, '中文目录'))
    expect(x.openShell).toHaveBeenCalledExactlyOnceWith({ cols: 100, rows: 30 })
    expect(x.control.state('t')).toMatchObject({ pid: 0, connectionId: 'server-a' })
  })

  it('does not treat an edited input as an idle shell or insert an Agent command into it', async () => {
    const x = await setup(); x.write('echo pending')
    await expect(x.runtime.executeForOwner('chat', 'echo must-not-run', {})).rejects.toThrow(/输入|空闲|就绪/)
    x.write('\x03'); await ready(x.runtime)
    expect((await x.runtime.executeForOwner('chat', 'printf ok', {}))?.stdout).toBe('ok')
  })

  it('rejects concurrent execution and keeps the remote process usable after interruption', async () => {
    const x = await setup(); const abort = new AbortController()
    const running = x.runtime.executeForOwner('chat', 'sleep 60', { signal: abort.signal })!
    const cancelled = expect(running).rejects.toThrow(/中断|取消/)
    await expect(x.runtime.executeForOwner('chat', 'echo competing', {})).rejects.toThrow(/运行|空闲|就绪/)
    abort.abort(); await cancelled; await ready(x.runtime)
    expect((await x.runtime.executeForOwner('chat', 'printf alive', {}))?.stdout).toBe('alive')
  })

  it('remembers a lost selected terminal and fails rather than falling back to another executor', async () => {
    const x = await setup(); await x.runtime.stop('t')
    await expect(x.runtime.executeForOwner('chat', 'echo lost', {})).rejects.toThrow(/结束|断开/)
    expect(x.runtime.executeForOwner('unrelated', 'echo local', {})).toBeUndefined()
  })

  it('rejects human edits and selection while an Agent command owns the shell', async () => {
    const x = await setup(); const abort = new AbortController()
    const running = x.runtime.executeForOwner('chat', 'sleep 60', { signal: abort.signal })!
    const cancelled = expect(running).rejects.toThrow(/取消/)
    expect(() => x.runtime.write('t', 'echo competing\r')).toThrow(/运行|占用/)
    expect(() => x.runtime.select('t')).toThrow(/运行/)
    abort.abort(); await cancelled
  })

  it('preserves exported variables and cwd across Agent commands, returning the real status and merged PTY output', async () => {
    const x = await setup()
    const result = await x.runtime.executeForOwner('chat', "export FROM_AGENT='中文'; mkdir child; cd child; printf stdout; printf stderr >&2; false", {})
    expect(result).toEqual({ code: 1, stdout: 'stdoutstderr', stderr: '', cwd: join(x.dir, 'child') })
    expect(x.cwd()).toBe(join(x.dir, 'child'))
    expect((await x.runtime.executeForOwner('chat', 'printf %s "$FROM_AGENT"', {}))?.stdout).toBe('中文')
    const root = await x.runtime.executeForOwner('chat', 'pwd', { cwd: x.dir })
    expect(root?.stdout.trim()).toBe(x.dir)
    expect(x.cwd()).toBe(x.dir)
  })

  it('only updates canonical cwd from the selected terminal and copies cwd when switching', async () => {
    const a = await setup()
    const b = await setup({ id: 'second', runtime: a.runtime, control: a.control, canonical: a.canonical })
    b.write(`cd '${b.dir}'\r`)
    await vi.waitFor(() => expect(a.runtime.currentDirectory('second')).toBe(b.dir))
    expect(a.cwd()).toBe(a.dir)
    a.runtime.select('second')
    expect(a.cwd()).toBe(b.dir)
    expect((await a.runtime.executeForOwner('chat', 'pwd', {}))?.stdout.trim()).toBe(b.dir)
    a.runtime.select('t'); expect(a.cwd()).toBe(a.dir)
  })

  it('replays the remote prompt on attach and reports shell exit only once', async () => {
    const x = await setup(), events: AgentEvent[] = []
    x.runtime.attach('t', event => events.push(event))
    await vi.waitFor(() => expect(events.some(event => event.kind === 'output' && event.data.includes('remote$'))).toBe(true))
    await x.runtime.stop('t'); await x.runtime.stop('t')
    expect(events.filter(event => event.kind === 'exited')).toHaveLength(1)
    const late: AgentEvent[] = []
    x.runtime.attach('t', event => late.push(event))
    expect(late).toEqual([])
    expect(x.runtime.has('t')).toBe(true)
    expect(x.runtime.connectionId('t')).toBe('server-a')
    expect(x.runtime.ownerOf('t')).toBe('chat')
  })

  it('bounds closed history while preserving a selected dead terminal as a rejected target', async () => {
    const x = await setup(); await x.runtime.stop('t')
    for (let i = 0; i < 33; i++) {
      const other = await setup({ id: `closed-${i}`, runtime: x.runtime, control: x.control, canonical: x.canonical })
      await other.runtime.stop(other.id)
    }
    expect(x.runtime.has('closed-0')).toBe(false)
    expect(x.runtime.has('closed-32')).toBe(true)
    expect(x.runtime.has('t')).toBe(true)
    await expect(x.runtime.executeForOwner('chat', 'printf forbidden', {})).rejects.toThrow(/结束|断开/)
  })

  it('supports a clean zsh shell without changing its startup files', async () => {
    const x = await setup({ zsh: true })
    x.write('export ZSH_SHARED=中文\r'); await ready(x.runtime)
    expect((await x.runtime.executeForOwner('chat', 'printf %s "$ZSH_SHARED"', {}))?.stdout).toBe('中文')
  })

  it('rejects an explicit timeout and waits for a fresh ready hook before accepting more work', async () => {
    const x = await setup()
    await expect(x.runtime.executeForOwner('chat', 'sleep 60', { timeoutSec: 0.05 })).rejects.toThrow(/超时/)
    await ready(x.runtime)
    expect((await x.runtime.executeForOwner('chat', 'printf recovered', {}))?.stdout).toBe('recovered')
  })

  it('selects an installed UTF-8 locale when the login shell has no locale', async () => {
    const x = await setup({ lang: '' })
    const result = await x.runtime.executeForOwner('chat', 'locale charmap; printf 中文', {})
    expect(result?.stdout).toMatch(/UTF-?8\n中文/i)
  })

  it('reports an unavailable UTF-8 locale instead of accepting a broken terminal', async () => {
    await expect(setup({ lang: '', noUtf8: true })).rejects.toThrow(/UTF-8|locale/)
  })

  it('installs integration in a bounded number of ASCII lines below the canonical PTY limit', async () => {
    const x = await setup()
    expect(x.writes.length).toBeLessThan(30)
    for (const input of x.writes) {
      expect(Buffer.byteLength(input)).toBeLessThan(1024)
      expect(input).toMatch(/^[\x00-\x7f]*$/)
    }
  })

  it('caps captured output while still consuming completion and keeping the shell usable', async () => {
    const x = await setup()
    const result = await x.runtime.executeForOwner('chat', "printf '%1100000s' ''", {})
    expect(result?.code).toBe(0)
    expect(result?.stdout.length).toBeLessThan(1_049_000)
    expect(result?.stdout).toContain('输出已截断')
    expect((await x.runtime.executeForOwner('chat', 'printf alive', {}))?.stdout).toBe('alive')
  })
})

it('runs DAWN presentation locally in sessionDir, keeps model observations remote, and restores the remote cursor without ending the terminal', async () => {
  const local = mkdtempSync(join(tmpdir(), 'dawn-local-presentation-')), bin = join(local, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'dawn'), '#!/bin/bash\nprintf "%s|%s" "$PWD" "$DAWN_TERMINAL_ID" > "$PRESENTATION_RESULT"\nprintf LOCAL_PRESENTATION_READY\nread -r input\nprintf "LOCAL_INPUT_%s" "$input"\n', { mode: 0o755 })
  cleanup.push(async () => { rmSync(local, { recursive: true, force: true }) })
  const x = await setup({ environment: async () => ({ PATH: `${bin}:/usr/bin:/bin`, HOME: local, BASH_ENV: '/dev/null', ENV: '/dev/null', DAWN_TERMINAL_ID: 't', PRESENTATION_RESULT: join(local, 'result') }) })
  const events: AgentEvent[] = []
  x.runtime.attach('t', event => events.push(event))
  await x.runtime.launchCli('t')
  await vi.waitFor(() => expect(events.some(event => event.kind === 'output' && event.data.includes('LOCAL_PRESENTATION_READY'))).toBe(true))
  expect(readFileSync(join(local, 'result'), 'utf8')).toBe(`${x.dir}|t`)
  expect(x.runtime.isPresenting('t')).toBe(true)
  x.control.grant('chat', 't', 'shell')
  const observation = await x.control.snapshot('chat', 't')
  expect(observation.text).not.toContain('LOCAL_PRESENTATION_READY')
  const result = await x.runtime.executeForOwner('chat', 'printf REAL_REMOTE_RESULT', {})
  expect(result?.stdout).toBe('REAL_REMOTE_RESULT')
  const beforeReturn = events.length
  x.runtime.write('t', 'quit\r')
  await vi.waitFor(() => expect(x.runtime.isPresenting('t')).toBe(false))
  await vi.waitFor(() => expect(events.slice(beforeReturn).some(event => event.kind === 'output' && /\x1b\[\d+;\d+H$/.test(event.data))).toBe(true))
  expect(events.filter(event => event.kind === 'exited')).toHaveLength(0)
  expect((await x.runtime.executeForOwner('chat', 'printf STILL_REMOTE', {}))?.stdout).toBe('STILL_REMOTE')
  x.write('dawn\r')
  await vi.waitFor(() => expect(x.runtime.isPresenting('t')).toBe(true))
  x.runtime.write('t', 'quit\r')
  await vi.waitFor(() => expect(x.runtime.isPresenting('t')).toBe(false))
  expect(events.filter(event => event.kind === 'exited')).toHaveLength(0)
})
