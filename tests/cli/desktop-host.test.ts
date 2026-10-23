import { expect, it, vi } from 'vitest'
import { DesktopCliHost } from '../../src/cli/desktop-host.js'
import { connectDesktopCli } from '../../src/cli/desktop-client.js'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

it('authenticates local clients, exposes only a scoped session, never sends credentials, and cleans up on disconnect', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-host-test-'))
  const close = vi.fn(async () => {}), call = vi.fn(async () => ({}))
  const host = new DesktopCliHost({ entry: '/unused/cli.js', executable: process.execPath, descriptor: join(root, 'desktop.json'),
    launch: async () => {}, open: async () => ({ sessionId: 'owned', model: 'existing/model', directory: root,
      call, attach: () => () => {}, waitForIdle: async () => {}, close }) })
  try {
    const env = await host.environment('terminal')
    const descriptor = JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8'))
    await expect(connectDesktopCli({ ...descriptor, token: 'wrong' }, root, 'terminal')).rejects.toThrow()
    const client = await connectDesktopCli(descriptor, root, 'terminal')
    expect(client.model).toBe('existing/model')
    expect(host.state('terminal').mode).toBe('dawn')
    await expect(client.call('setCredential', { secret: 'must-not-arrive' })).rejects.toThrow()
    await expect(client.call('writeToSession', { sessionId: 'another', data: 'bad', as: 'user' })).rejects.toThrow()
    await client.call('writeToSession', { sessionId: 'owned', data: 'hello', as: 'user' })
    expect(call).toHaveBeenCalledWith('writeToSession', { sessionId: 'owned', data: 'hello', as: 'user' })
    await client.close()
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(host.state('terminal').mode).toBe('normal')
  } finally { await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})

it('switches through authenticated exit without sending keys to the shell, and removes its private discovery file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-mode-test-'))
  const launch = vi.fn(async () => {})
  const descriptorFile = join(root, 'desktop.json')
  const host = new DesktopCliHost({ entry: '/unused/cli.js', executable: process.execPath, descriptor: descriptorFile, launch,
    open: async () => ({ sessionId: 'cli', model: 'desktop/selected', directory: root,
      call: vi.fn(async () => ({})), attach: () => () => {}, waitForIdle: async () => {}, close: async () => {} }) })
  try {
    await host.environment('t')
    const descriptor = JSON.parse(readFileSync(descriptorFile, 'utf8'))
    const client = await connectDesktopCli(descriptor, root, 't')
    client.onExit(() => { void client.close() })
    expect(await host.setMode('t', 'dawn')).toEqual({ mode: 'dawn' })
    expect(launch).not.toHaveBeenCalled()
    expect(await host.setMode('t', 'normal')).toEqual({ mode: 'normal' })
    await host.dispose()
    expect(() => readFileSync(descriptorFile)).toThrow()
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('keeps each terminal bound to its own desktop even when another host updates discovery', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-two-hosts-'))
  const make = (id: string) => new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'discovery.json'), launch: async () => {},
    open: async () => ({ sessionId: id, model: id, directory: root, call: async () => ({}), attach: () => () => {}, waitForIdle: async () => {}, close: async () => {} }) })
  const first = make('first'), second = make('second')
  try {
    const a = await first.environment('a'), b = await second.environment('b')
    expect(a.DAWN_CLI_DESCRIPTOR).not.toBe(b.DAWN_CLI_DESCRIPTOR)
    const ca = await connectDesktopCli(JSON.parse(readFileSync(a.DAWN_CLI_DESCRIPTOR!, 'utf8')), root, 'a')
    const cb = await connectDesktopCli(JSON.parse(readFileSync(b.DAWN_CLI_DESCRIPTOR!, 'utf8')), root, 'b')
    expect(ca.model).toBe('first'); expect(cb.model).toBe('second')
    await ca.close(); await cb.close()
  } finally { await first.dispose(); await second.dispose(); rmSync(root, { recursive: true, force: true }) }
})
