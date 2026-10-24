import { expect, it, vi } from 'vitest'
import { DesktopCliHost } from '../../src/cli/desktop-host.js'
import { connectDesktopCli } from '../../src/cli/desktop-client.js'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentEvent } from '../../src/runtime/types.js'

it('reads and changes only the bound session permission with strict values and no global/config escape', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-permission-wire-'))
  const call = vi.fn(async () => ({ current: 'ask-risky', effective: 'ask-risky' }))
  const host = new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'desktop.json'), launch: async () => {},
    open: async () => ({ sessionId: 'owned', model: 'desktop/model', directory: root, call, attach: () => () => {}, waitForIdle: async () => {}, close: async () => {} }) })
  try {
    const env = await host.environment('t'), client = await connectDesktopCli(JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8')), root, 't')
    expect(await client.call('$permissions')).toEqual({ current: 'ask-risky', effective: 'ask-risky' })
    expect(call).toHaveBeenLastCalledWith('getSessionPermission', { sessionId: 'owned' })
    await client.call('$permissions', { value: 'deny-risky' })
    expect(call).toHaveBeenCalledWith('setSessionConfigOption', { sessionId: 'owned', configId: 'dawn.permission', value: 'deny-risky' })
    call.mockClear()
    for (const input of [{ value: 'allow-all', sessionId: 'other' }, { value: 'bad' }, { configId: 'dawn.plan', value: 'allow-all' }, { value: 'allow-all', global: true }, null]) {
      await expect(client.call('$permissions', input)).rejects.toThrow()
    }
    await expect(client.call('setSessionConfigOption', { sessionId: 'owned', configId: 'dawn.permission', value: 'allow-all' })).rejects.toThrow()
    await expect(client.call('setPermissionMode', { mode: 'allow-all' })).rejects.toThrow()
    expect(call).not.toHaveBeenCalled()
    await client.close()
  } finally { await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})

it('loads suggestions only for the authenticated bound session without exposing generic desktop operations', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-suggest-wire-'))
  const suggest = vi.fn(async () => ({ text: '检查缺失值' })), call = vi.fn(async () => ({}))
  const host = new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'desktop.json'), launch: async () => {},
    open: async () => ({ sessionId: 'owned', model: 'desktop/model', directory: root, suggest, call, attach: () => () => {}, waitForIdle: async () => {}, close: async () => {} }) })
  try {
    const env = await host.environment('t'), client = await connectDesktopCli(JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8')), root, 't')
    expect(await client.suggest()).toEqual({ text: '检查缺失值' })
    expect(await client.call('$suggest', { sessionId: 'another' })).toEqual({ text: '检查缺失值' })
    expect(suggest).toHaveBeenCalledTimes(2); expect(call).not.toHaveBeenCalled()
    await expect(client.call('suggestNextPrompt', { sessionId: 'another', turnId: 'a' })).rejects.toThrow()
    await client.close()
  } finally { await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})

it('keeps large kernel images out of the bounded CLI socket and sends only a scoped image ID', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-image-wire-'))
  let publish!: (event: AgentEvent) => void
  const host = new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'desktop.json'), launch: async () => {},
    open: async () => ({ sessionId: 'owned', model: 'desktop/model', directory: root, call: async () => ({}), attach: sink => { publish = sink; return () => {} }, waitForIdle: async () => {}, close: async () => {} }) })
  try {
    const env = await host.environment('t'), client = await connectDesktopCli(JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8')), root, 't')
    const images: string[] = []
    client.attach(event => { if (event.kind === 'desktop_image') images.push(event.id) })
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGO4o6YGRAwQCgAjRgSh7v9IEwAAAABJRU5ErkJggg==', 'base64')
    const data = Buffer.concat([png, Buffer.alloc(4 * 1024 * 1024)]).toString('base64')
    publish({ kind: 'kernel_output', sessionId: 'owned', entry: { kind: 'display', mediaType: 'image/png', data, bytes: data.length, alsoAvailable: [], provenance: {} as never } })
    await vi.waitFor(() => expect(images).toHaveLength(1))
    await expect(client.call('acquireLease', { sessionId: 'owned', holder: 'user' })).resolves.toEqual({})
    expect(host.image('t', images[0]!).thumbnail).toMatch(/^data:image\/png;base64,/)
    await client.close()
  } finally { await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})

it('binds staged pictures to the authenticated CLI and sends them only with its next successful message', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-image-host-'))
  const call = vi.fn(async () => ({})), host = new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'desktop.json'), launch: async () => {},
    open: async () => ({ sessionId: 'owned', model: 'desktop/model', directory: root, call, attach: () => () => {}, waitForIdle: async () => {}, close: async () => {} }) })
  try {
    const env = await host.environment('t'), client = await connectDesktopCli(JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8')), root, 't')
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGO4o6YGRAwQCgAjRgSh7v9IEwAAAABJRU5ErkJggg=='
    await expect(host.updateAttachments({ terminalId: 't', sessionId: 'another', action: 'add', images: [{ name: 'a.png', data, mimeType: 'image/png' }] })).rejects.toThrow()
    await host.updateAttachments({ terminalId: 't', sessionId: 'owned', action: 'add', images: [{ name: 'a.png', data, mimeType: 'image/png' }] })
    expect(host.attachments('t').pending).toHaveLength(1)
    await client.call('writeToSession', { sessionId: 'owned', data: '分析原图', as: 'user' })
    expect(call.mock.calls.at(-1)).toEqual(['writeToSession', { sessionId: 'owned', data: '分析原图', as: 'user', images: [{ from: 'bytes', data, mimeType: 'image/png' }] }])
    expect(host.attachments('t').pending).toHaveLength(0)
    await client.close()
  } finally { await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})

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
    expect(host.state('terminal')).toEqual({ mode: 'dawn', sessionId: 'owned' })
    await expect(client.call('setCredential', { secret: 'must-not-arrive' })).rejects.toThrow()
    await expect(client.call('writeToSession', { sessionId: 'another', data: 'bad', as: 'user' })).rejects.toThrow()
    await client.call('writeToSession', { sessionId: 'owned', data: 'hello', as: 'user' })
    expect(call).toHaveBeenCalledWith('writeToSession', { sessionId: 'owned', data: 'hello', as: 'user' })
    await client.close()
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(host.state('terminal')).toEqual({ mode: 'normal', sessionId: 'owned' })
    host.forgetTerminal('terminal')
    expect(host.state('terminal')).toEqual({ mode: 'normal' })
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
    expect(await host.setMode('t', 'dawn')).toEqual({ mode: 'dawn', sessionId: 'cli' })
    expect(launch).not.toHaveBeenCalled()
    expect(await host.setMode('t', 'normal')).toEqual({ mode: 'normal', sessionId: 'cli' })
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

it('returns only the current terminal context and replaces it only after a new authenticated CLI connects', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-context-return-'))
  let next = 0
  const host = new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'desktop.json'), launch: async () => {},
    open: async () => ({ sessionId: `cli-${++next}`, model: 'desktop/model', directory: root, call: async () => ({}), attach: () => () => {}, waitForIdle: async () => {}, close: async () => {} }) })
  try {
    const env = await host.environment('a'), descriptor = JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8'))
    expect(host.state('a')).toEqual({ mode: 'normal' })
    const a = await connectDesktopCli(descriptor, root, 'a'), b = await connectDesktopCli(descriptor, root, 'b')
    expect(host.state('a').sessionId).toBe('cli-1'); expect(host.state('b').sessionId).toBe('cli-2')
    await a.close(); await vi.waitFor(() => expect(host.state('a').mode).toBe('normal'))
    const replacement = await connectDesktopCli(descriptor, root, 'a')
    expect(host.state('a').sessionId).toBe('cli-3'); expect(host.state('b').sessionId).toBe('cli-2')
    await replacement.close(); await b.close()
  } finally { await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})

it('preserves the authoritative project and last model after the CLI disconnects', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-target-selection-'))
  let selection = { provider: 'existing', model: 'first' }
  const host = new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'desktop.json'), launch: async () => {},
    open: async () => ({ sessionId: 'cli', projectId: 'project', model: 'existing/first', get selection() { return selection }, directory: root,
      call: async () => ({}), attach: () => () => {}, waitForIdle: async () => {}, close: async () => {} }) })
  try {
    const env = await host.environment('t')
    const client = await connectDesktopCli(JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8')), root, 't')
    expect(host.state('t')).toEqual({ mode: 'dawn', sessionId: 'cli', projectId: 'project', selection })
    selection = { provider: 'another-configured', model: 'current' }
    await client.close(); await vi.waitFor(() => expect(host.state('t').mode).toBe('normal'))
    expect(host.state('t')).toEqual({ mode: 'normal', sessionId: 'cli', projectId: 'project', selection })
  } finally { await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})
