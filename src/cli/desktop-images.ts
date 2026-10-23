import { randomUUID, createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, relative, isAbsolute } from 'node:path'
import { resizeImage } from '@earendil-works/pi-coding-agent'
import { resolveInWorkspace } from '../files/access.js'
import type { AgentEvent } from '../runtime/types.js'

export interface TerminalImageInput { name: string; data: string; mimeType: string }
export interface TerminalImage { id: string; name: string; thumbnail: string; dataUrl: string }
export interface TerminalImageEvent { kind: 'desktop_image'; sessionId: string; id: string; name: string }
type Emit = (image: TerminalImageEvent) => void
type Staged = TerminalImage & { source: { from: 'bytes'; data: string; mimeType: string } }
const maxBytes = 10 * 1024 * 1024
const imagePath = /\.(png|jpe?g|webp|gif)$/i

/** Images stay out of the CLI byte transport. IDs only resolve in the originating terminal. */
export class DesktopImages {
  private pending: Staged[] = []
  private images = new Map<string, TerminalImage>()
  private hashes = new Map<string, string>()
  private revision = 0
  private processing = false
  private sending = false
  private closed = false
  private answer = ''
  constructor(readonly sessionId: string, private workspace: string) {}

  read(afterRevision?: number) {
    return { sessionId: this.sessionId, revision: this.revision,
      ...(afterRevision === this.revision ? {} : { pending: this.pending.map(({ id, name, thumbnail }) => ({ id, name, thumbnail })) }) }
  }
  private editable() {
    if (this.closed) throw new Error('终端 Agent 已退出，请重新进入 DAWN 模式')
    if (this.processing || this.sending) throw new Error('图片正在处理，请稍后再试')
  }
  async add(input: readonly TerminalImageInput[]) {
    this.editable()
    if (!input.length || this.pending.length + input.length > 4) throw new Error('一次最多附 4 张图片')
    this.processing = true
    try {
      const batch = await Promise.all(input.map(async one => {
        const image = await this.prepare(one)
        return { ...image, source: { from: 'bytes' as const, data: image.dataUrl.split(',')[1]!, mimeType: image.dataUrl.slice(5, image.dataUrl.indexOf(';')) } }
      }))
      if (this.closed) throw new Error('终端 Agent 已退出，图片没有发送')
      this.pending.push(...batch); this.revision++
      return this.read()
    } finally { this.processing = false }
  }
  remove(id: string) { this.editable(); this.pending = this.pending.filter(i => i.id !== id); this.revision++; return this.read() }
  close() { this.closed = true; this.pending = []; this.revision++ }
  image(id: string): TerminalImage {
    const image = this.images.get(id) ?? this.pending.find(x => x.id === id)
    if (!image) throw new Error('这张终端图片已不在缓存中，请返回会话或打开原文件')
    return { id: image.id, name: image.name, thumbnail: image.thumbnail, dataUrl: image.dataUrl }
  }
  async send(input: Record<string, unknown>, deliver: (input: Record<string, unknown>) => Promise<unknown>, emit: Emit) {
    this.editable()
    if (input.as !== 'user') return deliver(input)
    this.sending = true
    const batch = [...this.pending]
    try {
      const existing = Array.isArray(input.images) ? input.images : []
      const result = await deliver({ ...input, ...(batch.length ? { images: [...existing, ...batch.map(x => x.source)] } : {}) })
      this.pending = this.pending.filter(x => !batch.some(b => b.id === x.id)); this.revision++
      if (!this.closed) for (const image of batch) this.publish(image, emit, false)
      return result
    } finally { this.sending = false }
  }
  private async prepare(input: TerminalImageInput): Promise<TerminalImage> {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(input.mimeType)) throw new Error('支持 PNG、JPEG、WebP 和 GIF 图片')
    if (!input.data || input.data.length > Math.ceil(maxBytes * 4 / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)) throw new Error('图片数据无效或超过 10 MB')
    let bytes = Buffer.from(input.data, 'base64'), mime = input.mimeType
    const thumbnail = await resizeImage(bytes, mime, { maxWidth: 240, maxHeight: 96 })
    if (!thumbnail) throw new Error('无法解码这张图片，请换用 PNG 或 JPEG')
    if (thumbnail.originalWidth * thumbnail.originalHeight > 40_000_000) throw new Error('图片像素过大，请先缩小')
    if (bytes.length > 3.5 * 1024 * 1024) {
      const resized = await resizeImage(bytes, mime, { maxBytes: 3.5 * 1024 * 1024 })
      if (!resized) throw new Error('这张图片太大，无法缩小到可发送大小')
      bytes = Buffer.from(resized.data, 'base64'); mime = resized.mimeType
    }
    return { id: randomUUID(), name: input.name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 120) || '图片',
      thumbnail: `data:${thumbnail.mimeType};base64,${thumbnail.data}`, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` }
  }
  private publish(image: TerminalImage, emit: Emit, deduplicate = true) {
    const hash = createHash('sha256').update(image.dataUrl).digest('hex')
    if (deduplicate && this.hashes.has(hash)) return
    this.images.set(image.id, image); if (deduplicate) this.hashes.set(hash, image.id)
    // Bound decoded-image ownership as well as count; the terminal retains only the opaque marker.
    while (this.images.size > 24 || [...this.images.values()].reduce((n, i) => n + i.dataUrl.length + i.thumbnail.length, 0) > 64 * 1024 * 1024) {
      const id = this.images.keys().next().value!
      this.images.delete(id)
      for (const [key, value] of this.hashes) if (value === id) this.hashes.delete(key)
    }
    emit({ kind: 'desktop_image', sessionId: this.sessionId, id: image.id, name: image.name })
  }
  private async file(path: string, emit: Emit) {
    if (!imagePath.test(path) || /^\w+:/.test(path) || path.startsWith('//')) return
    const local = isAbsolute(path) ? relative(this.workspace, path) : path
    const full = resolveInWorkspace(this.workspace, local)
    if ((await stat(full)).size > maxBytes) throw new Error('输出图片超过 10 MB，请打开原文件查看')
    const mime = /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : /\.gif$/i.test(path) ? 'image/gif' : 'image/jpeg'
    this.publish(await this.prepare({ name: basename(path), data: (await readFile(full)).toString('base64'), mimeType: mime }), emit)
  }
  async observe(event: AgentEvent, emit: Emit, warn: (message: string) => void = () => {}) {
    if (this.closed || event.sessionId !== this.sessionId) return
    const attempt = async (path: string) => { try { await this.file(path, emit) } catch (e) { warn(e instanceof Error ? e.message : String(e)) } }
    if (event.kind === 'idle') this.hashes.clear()
    if (event.kind === 'output') this.answer = (this.answer + event.data).slice(-256 * 1024)
    if (event.kind === 'turn_end') {
      const answer = this.answer; this.answer = ''
      for (const match of answer.matchAll(/!\[[^\]]*\]\(<?([^\n]+?)>?(?:\s+"[^"]*")?\)/g)) {
        try { await attempt(decodeURIComponent(match[1]!.trim())) } catch { warn('图片路径编码无效') }
      }
    }
    if (event.kind === 'tool_files') for (const path of new Set([...event.filesCreated, ...event.filesWritten])) await attempt(path)
    if (event.kind === 'kernel_output' && (event.entry.kind === 'display' || event.entry.kind === 'result') && /^image\/(png|jpeg|gif|webp)$/.test(event.entry.mediaType)) {
      try {
        if (event.entry.tooLarge) throw new Error('内核输出图片过大，请打开原文件查看')
        this.publish(await this.prepare({ name: '图表', data: event.entry.data, mimeType: event.entry.mediaType }), emit)
      } catch (e) { warn(e instanceof Error ? e.message : String(e)) }
    }
  }
}
