import { expect, it, vi } from 'vitest'
import { DesktopCliHost } from '../../src/cli/desktop-host.js'
import { connectDesktopCli } from '../../src/cli/desktop-client.js'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

it('passes the explicit historical identity to the authenticated desktop instead of silently creating a task', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-resume-wire-'))
  const open = vi.fn(async (_terminal: unknown, _workspace: unknown, _agent: unknown, resume: unknown) => ({
    sessionId: typeof resume === 'string' ? resume : 'new-session', model: 'desktop/model', directory: root,
    call: async () => ({}), attach: () => () => {}, waitForIdle: async () => {}, close: async () => {},
  }))
  const host = new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'desktop.json'), launch: async () => {}, open })
  try {
    const env = await host.environment('t')
    const descriptor = JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8'))
    const client = await connectDesktopCli(descriptor, root, 't', undefined, 'original-session')
    expect(client.sessionId).toBe('original-session')
    expect(open).toHaveBeenCalledWith('t', root, undefined, 'original-session')
    await client.close()
  } finally { await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})

it('refuses a second CLI for the same conversation even from another terminal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-resume-exclusive-'))
  const host = new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'desktop.json'), launch: async () => {},
    open: async () => ({ sessionId: 'original', model: 'desktop/model', directory: root, call: async () => ({}), attach: () => () => {}, waitForIdle: async () => {}, close: async () => {} }) })
  let first: Awaited<ReturnType<typeof connectDesktopCli>> | undefined, second: typeof first
  try {
    const env = await host.environment('t'), descriptor = JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8'))
    first = await connectDesktopCli(descriptor, root, 'a', undefined, 'original')
    let failure: unknown
    try { second = await connectDesktopCli(descriptor, root, 'b', undefined, 'original') } catch (e) { failure = e }
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toContain('会话已在另一个终端')
  } finally { await second?.close(); await first?.close(); await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})

it('also reserves ordinary external CLI sessions without a terminal identity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-external-resume-'))
  const host = new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'desktop.json'), launch: async () => {},
    open: async () => ({ sessionId: 'original', model: 'desktop/model', directory: root, call: async () => ({}), attach: () => () => {}, waitForIdle: async () => {}, close: async () => {} }) })
  let first: Awaited<ReturnType<typeof connectDesktopCli>> | undefined, second: typeof first
  try {
    const env = await host.environment('t'), descriptor = JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8'))
    first = await connectDesktopCli(descriptor, root)
    let failure: unknown
    try { second = await connectDesktopCli(descriptor, root, 'b', undefined, 'original') } catch (error) { failure = error }
    expect(failure).toBeInstanceOf(Error)
  } finally { await second?.close(); await first?.close(); await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})

it('replays bounded original history and exposes old images by terminal-scoped IDs without staging them again', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-resume-pictures-'))
  const data = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGO4o6YGRAwQCgAjRgSh7v9IEwAAAABJRU5ErkJggg=='
  const host = new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'desktop.json'), launch: async () => {},
    open: async () => ({ sessionId: 'original', model: 'desktop/model', directory: root,
      history: async () => [{ kind: 'text', who: 'user', text: 'ORIGINAL_IMAGE_QUESTION', images: ['data:image/png;base64,' + data] }, { kind: 'text', who: 'agent', text: 'ORIGINAL_ANSWER' }],
      pictures: () => [{ data, mimeType: 'image/png' }],
      call: async () => ({}), attach: () => () => {}, waitForIdle: async () => {}, close: async () => {} }) })
  let client: Awaited<ReturnType<typeof connectDesktopCli>> | undefined
  try {
    const env = await host.environment('t'), descriptor = JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8'))
    client = await connectDesktopCli(descriptor, root, 't', undefined, 'original')
    const history = await client.call<any>('$history')
    expect(history.items.map((i: any) => i.text)).toEqual(['ORIGINAL_IMAGE_QUESTION', 'ORIGINAL_ANSWER'])
    expect(history.pictures).toHaveLength(1)
    expect(host.image('t', history.pictures[0].id).dataUrl).toBe('data:image/png;base64,' + data)
    expect(() => host.image('other-terminal', history.pictures[0].id)).toThrow()
    expect(host.attachments('t').pending).toEqual([])
    expect(JSON.stringify(history)).not.toContain(data)
  } finally { await client?.close(); await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})

it('only returns picture markers that remain readable after a long illustrated history fills the cache', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-history-cache-'))
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGO4o6YGRAwQCgAjRgSh7v9IEwAAAABJRU5ErkJggg==', 'base64')
  for (let i = 0; i < 25; i++) writeFileSync(join(root, `plot-${i}.png`), Buffer.concat([png, Buffer.from([i])]))
  const host = new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'desktop.json'), launch: async () => {},
    open: async () => ({ sessionId: 'illustrated', model: 'desktop/model', directory: root,
      history: async () => [{ kind: 'text', who: 'agent', text: Array.from({ length: 25 }, (_, i) => `![图${i}](plot-${i}.png)`).join('\n') }],
      call: async () => ({}), attach: () => () => {}, waitForIdle: async () => {}, close: async () => {} }) })
  let client: Awaited<ReturnType<typeof connectDesktopCli>> | undefined
  try {
    const env = await host.environment('t'), descriptor = JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8'))
    client = await connectDesktopCli(descriptor, root, 't', undefined, 'illustrated')
    const history = await client.history()
    expect(history.truncated).toBe(true)
    expect(history.pictures).toHaveLength(24)
    for (const picture of history.pictures) expect(host.image('t', picture.id).thumbnail).toMatch(/^data:image/)
  } finally { await client?.close(); await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})

it('restores previously returned image files from assistant history without executing their tools again', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-history-generated-'))
  writeFileSync(join(root, 'plot.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGO4o6YGRAwQCgAjRgSh7v9IEwAAAABJRU5ErkJggg==', 'base64'))
  const call = vi.fn(async () => ({}))
  const host = new DesktopCliHost({ entry: '/unused', executable: process.execPath, descriptor: join(root, 'desktop.json'), launch: async () => {},
    open: async () => ({ sessionId: 'generated', model: 'desktop/model', directory: root,
      history: async () => [{ kind: 'text', who: 'agent', text: '![原图表](plot.png)' }], pictures: () => [],
      call, attach: () => () => {}, waitForIdle: async () => {}, close: async () => {} }) })
  let client: Awaited<ReturnType<typeof connectDesktopCli>> | undefined
  try {
    const env = await host.environment('t'), descriptor = JSON.parse(readFileSync(env.DAWN_CLI_DESCRIPTOR!, 'utf8'))
    client = await connectDesktopCli(descriptor, root, 't', undefined, 'generated')
    const history = await client.call<any>('$history')
    expect(history.pictures).toHaveLength(1)
    expect(host.image('t', history.pictures[0].id).thumbnail).toMatch(/^data:image\/png/)
    expect(call).not.toHaveBeenCalled()
  } finally { await client?.close(); await host.dispose(); rmSync(root, { recursive: true, force: true }) }
})
