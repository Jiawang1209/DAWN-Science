import { describe, expect, it } from 'vitest'
import { projectMcpResult } from '../../src/mcp/results.js'
import { randomBytes } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGO4o6YGRAwQCgAjRgSh7v9IEwAAAABJRU5ErkJggg=='
const text = (result: Awaited<ReturnType<typeof projectMcpResult>>) => result.content.flatMap(c => c.type === 'text' ? [c.text] : []).join('\n')

describe('MCP model projection', () => {
  it('retains structured-only facts and the error flag without App metadata', async () => {
    const raw = { content: [], structuredContent: { count: 7, receipt: 'r-1' }, isError: true, _meta: { secret: 'APP_ONLY' } }
    const result = await projectMcpResult(raw)
    expect(text(result)).toContain('"count":7')
    expect(text(result)).toContain('r-1')
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).not.toContain('APP_ONLY')
    expect(raw._meta.secret).toBe('APP_ONLY')
  })

  it('keeps mixed text, validated images and facts even on failure', async () => {
    const result = await projectMcpResult({ content: [{ type: 'text', text: 'partial output' }, { type: 'image', data: png, mimeType: 'image/png' }], structuredContent: { status: 'failed' }, isError: true })
    expect(result.content).toContainEqual({ type: 'image', data: png, mimeType: 'image/png' })
    expect(text(result)).toContain('partial output')
    expect(text(result)).toContain('failed')
    expect(result.isError).toBe(true)
  })

  it('does not project user-only content or App metadata into model context', async () => {
    const result = await projectMcpResult({ content: [
      { type: 'text', text: 'USER_ONLY', annotations: { audience: ['user'] } },
      { type: 'image', data: png, mimeType: 'image/png', annotations: { audience: ['user'] } },
      { type: 'text', text: 'model fact', annotations: { audience: ['assistant'] }, _meta: { hidden: 'APP_ONLY' } },
    ] })
    expect(text(result)).toBe('model fact')
    expect(result.content).toHaveLength(1)
    expect(JSON.stringify(result)).not.toMatch(/USER_ONLY|APP_ONLY/)
  })

  it('preserves links and embedded text without fetching or exposing binary resources', async () => {
    const result = await projectMcpResult({ content: [
      { type: 'resource_link', uri: 'https://example.invalid/receipt', name: 'Receipt', mimeType: 'application/json' },
      { type: 'resource', resource: { uri: 'file:///data/method.txt', mimeType: 'text/plain', text: 'observed method', _meta: { secret: 'APP_ONLY' } } },
      { type: 'resource', resource: { uri: 'file:///data/binary', blob: 'BINARY_SECRET', mimeType: 'application/octet-stream' } },
    ] })
    expect(text(result)).toContain('https://example.invalid/receipt')
    expect(text(result)).toContain('observed method')
    expect(text(result)).toContain('binary')
    expect(JSON.stringify(result)).not.toMatch(/BINARY_SECRET|APP_ONLY/)
  })

  it('reports invalid and unsupported image data instead of claiming inspection', async () => {
    for (const image of [
      { type: 'image', data: 'not base64!', mimeType: 'image/png' },
      { type: 'image', data: Buffer.from('not an image').toString('base64'), mimeType: 'image/png' },
      { type: 'image', data: Buffer.from('<svg/>').toString('base64'), mimeType: 'image/svg+xml' },
      { type: 'image', data: 'A'.repeat(7 * 1024 * 1024), mimeType: 'image/png' },
    ]) {
      const result = await projectMcpResult({ content: [image] })
      expect(result.content.some(c => c.type === 'image')).toBe(false)
      expect(text(result)).toContain('未进行视觉检查')
    }
  })

  it('uses the actual image MIME and bounds the number of images', async () => {
    const result = await projectMcpResult({ content: Array.from({ length: 9 }, () => ({ type: 'image', data: png, mimeType: 'image/jpeg' })) })
    expect(result.content.filter(c => c.type === 'image')).toHaveLength(8)
    expect(result.content.find(c => c.type === 'image')).toMatchObject({ mimeType: 'image/png' })
    expect(text(result)).toContain('未进行视觉检查')
  })

  it('does not duplicate identical structured facts already encoded in text', async () => {
    const result = await projectMcpResult({ content: [{ type: 'text', text: '{"count":7}' }], structuredContent: { count: 7 } })
    expect(text(result)).toBe('{"count":7}')
  })

  it('rejects excessive decoded dimensions before attempting image decoding', async () => {
    const bytes = Buffer.from(png, 'base64')
    bytes.writeUInt32BE(100_000, 16)
    bytes.writeUInt32BE(100_000, 20)
    const result = await projectMcpResult({ content: [{ type: 'image', data: bytes.toString('base64'), mimeType: 'image/png' }] })
    expect(text(result)).toContain('4000 万像素')
    expect(result.content.some(c => c.type === 'image')).toBe(false)
  })

  it('accepts a valid image near the 5 MiB limit without overflowing base64 validation', async () => {
    const width = 1536, height = 1024, stride = width * 3 + 1
    const pixels = randomBytes(stride * height)
    for (let row = 0; row < height; row++) pixels[row * stride] = 0
    const header = Buffer.alloc(13)
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
    const chunk = (name: string, data: Buffer) => {
      const body = Buffer.concat([Buffer.from(name), data]), size = Buffer.alloc(4), crc = Buffer.alloc(4)
      size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body))
      return Buffer.concat([size, body, crc])
    }
    const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
    expect(bytes.length).toBeLessThan(5 * 1024 * 1024)
    const result = await projectMcpResult({ content: [{ type: 'image', data: bytes.toString('base64'), mimeType: 'image/png' }] })
    expect(result.content.some(c => c.type === 'image')).toBe(true)
  })
})
