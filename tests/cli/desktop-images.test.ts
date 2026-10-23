import { expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DesktopImages } from '../../src/cli/desktop-images.js'

const data = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGO4o6YGRAwQCgAjRgSh7v9IEwAAAABJRU5ErkJggg=='
const image = { name: '截图.png', mimeType: 'image/png', data }

it('holds images until the next successful user message and preserves them on failure', async () => {
  const media = new DesktopImages('s', '/tmp'), emit = vi.fn()
  const state = await media.add([image])
  expect(state.pending).toHaveLength(1)
  expect(state.pending![0]!.thumbnail).toMatch(/^data:image\/png;base64,/)
  await expect(media.send({ data: '看图', as: 'user' }, async () => { throw Error('offline') }, emit)).rejects.toThrow('offline')
  expect(media.read().pending).toHaveLength(1)
  let sent: any
  await media.send({ data: '看图', as: 'user' }, async input => { sent = input; return {} }, emit)
  expect(sent.images).toEqual([{ from: 'bytes', data, mimeType: 'image/png' }])
  expect(media.read().pending).toHaveLength(0)
  expect(emit).toHaveBeenCalledOnce()
  expect(media.image(emit.mock.calls[0]![0].id).dataUrl).toBe('data:image/png;base64,' + data)
})

it('keeps drafts and image IDs within their own terminal scope; close discards unsent images', async () => {
  const a = new DesktopImages('a', '/tmp'), b = new DesktopImages('b', '/tmp')
  const item = (await a.add([image])).pending![0]!
  expect(b.read().pending).toHaveLength(0)
  expect(() => b.image(item.id)).toThrow()
  a.remove(item.id)
  expect(a.read().pending).toHaveLength(0)
  await a.add([image]); a.close()
  expect(a.read().pending).toHaveLength(0)
  await expect(a.add([image])).rejects.toThrow()
})

it('does not consume new pictures or allow mutation while a message is being accepted', async () => {
  const m = new DesktopImages('s', '/tmp')
  const first = (await m.add([image])).pending![0]!
  let finish!: () => void
  const pending = m.send({ data: 'go', as: 'user' }, () => new Promise<void>(r => { finish = r }), () => {})
  await expect(m.add([image])).rejects.toThrow()
  expect(() => m.remove(first.id)).toThrow()
  finish(); await pending
  expect(m.read().pending).toHaveLength(0)
})

it('validates image content and count and does not expose an arbitrary file reader', async () => {
  const m = new DesktopImages('s', '/tmp')
  await expect(m.add([{ ...image, data: Buffer.from('not a PNG').toString('base64') }])).rejects.toThrow()
  await expect(m.add(Array(5).fill(image))).rejects.toThrow()
  expect(m.read().pending).toHaveLength(0)
  expect(() => m.image('../credentials.json')).toThrow()
})

it('rejects a text-only send while image preparation is still in flight', async () => {
  const m = new DesktopImages('s', '/tmp'), deliver = vi.fn(async () => ({}))
  const staging = m.add([image])
  await expect(m.send({ data: 'go', as: 'user' }, deliver, () => {})).rejects.toThrow('图片正在处理')
  expect(deliver).not.toHaveBeenCalled()
  await staging
  expect(m.read().pending).toHaveLength(1)
})

it('bounds the output cache and reports evicted image IDs explicitly', async () => {
  const m = new DesktopImages('s', '/tmp'), emitted: string[] = []
  for (let i = 0; i < 25; i++) {
    const bytes = Buffer.concat([Buffer.from(data, 'base64'), Buffer.from(String(i))]).toString('base64')
    await m.observe({ kind: 'kernel_output', sessionId: 's', entry: { kind: 'display', mediaType: 'image/png', data: bytes, bytes: 80, alsoAvailable: [], provenance: {} as never } }, e => emitted.push(e.id))
  }
  expect(emitted).toHaveLength(25)
  expect(() => m.image(emitted[0]!)).toThrow('不在缓存')
  expect(m.image(emitted.at(-1)!).id).toBe(emitted.at(-1))
})

it('keeps repeated input attachments at their corresponding turns and can show the same picture as an output', async () => {
  const m = new DesktopImages('s', '/tmp'), emit = vi.fn(), deliver = async () => ({})
  await m.add([image]); await m.send({ as: 'user', data: 'first' }, deliver, emit)
  await m.add([image]); await m.send({ as: 'user', data: 'second' }, deliver, emit)
  expect(emit).toHaveBeenCalledTimes(2)
  await m.observe({ kind: 'kernel_output', sessionId: 's', entry: { kind: 'display', mediaType: 'image/png', data, bytes: 76, alsoAvailable: [], provenance: {} as never } }, emit)
  expect(emit).toHaveBeenCalledTimes(3)
})

it('renders verified local Markdown images and kernel output, deduplicates, and refuses symlink escape', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dawn-image-test-')), outside = await mkdtemp(join(tmpdir(), 'dawn-image-outside-'))
  try {
    await writeFile(join(dir, 'plot.png'), Buffer.from(data, 'base64'))
    await writeFile(join(outside, 'secret.png'), Buffer.from(data, 'base64'))
    await symlink(outside, join(dir, 'escape'))
    const m = new DesktopImages('s', dir), emit = vi.fn()
    await m.observe({ kind: 'output', sessionId: 's', data: '图：![结果](plot.png) ![bad](escape/secret.png)' }, emit)
    await m.observe({ kind: 'turn_end', sessionId: 's' }, emit)
    expect(emit).toHaveBeenCalledOnce()
    expect(m.image(emit.mock.calls[0]![0].id).name).toBe('plot.png')
    await m.observe({ kind: 'kernel_output', sessionId: 's', entry: { kind: 'display', mediaType: 'image/png', data, bytes: 76, alsoAvailable: [], provenance: {} as never } }, emit)
    expect(emit).toHaveBeenCalledOnce()
  } finally { await rm(dir, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }) }
})
