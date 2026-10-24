import { createServer, type Socket } from 'node:net'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, chmod, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { DesktopImages } from './desktop-images.js'
import type { TerminalAttachmentUpdate } from '../protocol/terminal.js'
import { frames, send, type DesktopDescriptor, type DesktopScope, type CliHistoryEntry, type CliHistory } from './desktop-wire.js'

interface Target { sessionId: string; projectId?: string; selection?: { provider: string; model: string } }
const targetOf = (scope: DesktopScope): Target => ({ sessionId: scope.sessionId, ...(scope.projectId ? { projectId: scope.projectId } : {}), ...(scope.selection ? { selection: scope.selection } : {}) })
type Mode = 'normal' | 'dawn' | 'starting' | 'stopping'
interface Connection { socket: Socket; scope: DesktopScope; media: DesktopImages; done: Promise<void>; finish: () => void }
export interface DesktopCliOptions {
  entry: string; executable: string; descriptor: string
  launch: (terminalId: string, resumeSessionId?: string) => Promise<void>
  open: (terminalId: string | undefined, workspace: string, agentId?: string, resumeSessionId?: string) => Promise<DesktopScope>
  history?: (workspace: string) => Promise<CliHistoryEntry[]>
}
const allowed = new Set(['writeToSession', 'answerPermission', 'answerQuestion', 'abortSession', 'acquireLease'])
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'"
export class DesktopCliHost {
  private server = createServer(socket => this.accept(socket))
  private sockets = new Set<Socket>()
  private connections = new Map<string, Connection>()
  private opened = new Set<Connection>()
  private transitions = new Map<string, Mode>()
  private imageScopes = new Map<string, DesktopImages[]>()
  private latestSessions = new Map<string, Target>()
  private claimedSessions = new Set<string>()
  private root?: string
  private descriptor?: DesktopDescriptor
  private ready?: Promise<void>
  private disposed = false
  constructor(private opts: DesktopCliOptions) {}
  private initialize(): Promise<void> {
    return this.ready ??= (async () => {
      this.root = await mkdtemp(join(tmpdir(), 'dawn-cli-'))
      await chmod(this.root, 0o700)
      this.descriptor = { socket: process.platform === 'win32' ? '\\\\.\\pipe\\dawn-cli-' + randomBytes(12).toString('hex') : join(this.root, 's'), token: randomBytes(32).toString('hex'), version: 1 }
      await new Promise<void>((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.descriptor!.socket, () => { this.server.removeListener('error', reject); resolve() }) })
      if (process.platform !== 'win32') await chmod(this.descriptor.socket, 0o600)
      await writeFile(join(this.root, 'desktop.json'), JSON.stringify(this.descriptor), { mode: 0o600 })
      await mkdir(dirname(this.opts.descriptor), { recursive: true, mode: 0o700 })
      await writeFile(this.opts.descriptor, JSON.stringify(this.descriptor), { mode: 0o600 })
      await chmod(this.opts.descriptor, 0o600)
      if (process.platform === 'win32') await writeFile(join(this.root, 'dawn.cmd'), `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${this.opts.executable}" "${this.opts.entry}" %*\r\n`, { mode: 0o700 })
      await writeFile(join(this.root, 'dawn'), `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quote(this.opts.executable)} ${quote(this.opts.entry)} "$@"\n`, { mode: 0o700 })
    })()
  }
  async environment(terminalId: string): Promise<Record<string, string>> {
    if (this.disposed) throw new Error('DAWN 连接已关闭')
    await this.initialize()
    return { DAWN_CLI_DESCRIPTOR: join(this.root!, 'desktop.json'), DAWN_TERMINAL_ID: terminalId, PATH: this.root + ':' + (process.env.PATH || '/usr/bin:/bin') }
  }
  state(terminalId: string) {
    const scope = this.connections.get(terminalId)?.scope
    const target = scope ? targetOf(scope) : this.latestSessions.get(terminalId)
    return { mode: this.transitions.get(terminalId) ?? (scope ? 'dawn' : 'normal'), ...target }
  }
  async history(workspace: string): Promise<CliHistoryEntry[]> {
    return (await this.opts.history?.(workspace) ?? []).map(({ sessionId, title, createdAt, lastActiveAt }) => ({ sessionId, ...(title ? { title } : {}), createdAt, ...(lastActiveAt ? { lastActiveAt } : {}) }))
  }
  attachments(terminalId: string, afterRevision?: number) {
    return this.connections.get(terminalId)?.media.read(afterRevision) ?? { revision: 0, pending: [] }
  }
  async updateAttachments(input: TerminalAttachmentUpdate) {
    const connection = this.connections.get(input.terminalId)
    if (!connection || connection.scope.sessionId !== input.sessionId || this.transitions.has(input.terminalId)) throw new Error('终端 Agent 已切换，请重新附图')
    if (input.action === 'add') {
      if (connection.scope.canReadImages && !connection.scope.canReadImages()) throw new Error('当前模型不支持图片，请切换到看图模型或启用已配置的视觉服务')
      return connection.media.add(input.images)
    }
    return connection.media.remove(input.imageId)
  }
  image(terminalId: string, imageId: string) {
    for (const media of this.imageScopes.get(terminalId) ?? []) {
      try { return media.image(imageId) } catch { /* Try the previous CLI retained in this terminal's scrollback. */ }
    }
    throw new Error('这张终端图片已不在缓存中，请返回会话或打开原文件')
  }
  forgetTerminal(terminalId: string): void {
    this.latestSessions.delete(terminalId)
    for (const media of this.imageScopes.get(terminalId) ?? []) media.close()
    this.imageScopes.delete(terminalId)
  }
  async setMode(terminalId: string, mode: 'dawn' | 'normal', resumeSessionId?: string) {
    if (this.transitions.has(terminalId)) throw new Error('正在切换模式，请稍候')
    const connection = this.connections.get(terminalId)
    if (resumeSessionId && (mode !== 'dawn' || connection)) throw new Error('请先返回 Normal 模式，再选择历史会话')
    if (mode === 'dawn' && !connection) {
      this.transitions.set(terminalId, 'starting')
      try {
        await this.environment(terminalId)
        await this.opts.launch(terminalId, resumeSessionId)
        const end = Date.now() + 10_000
        while (!this.connections.has(terminalId) && Date.now() < end && !this.disposed) await new Promise(r => setTimeout(r, 40))
        if (!this.connections.has(terminalId)) throw new Error('DAWN 命令尚未连接，请查看终端提示')
      } finally { this.transitions.delete(terminalId) }
    } else if (mode === 'normal' && connection) {
      this.transitions.set(terminalId, 'stopping')
      try {
        send(connection.socket, { exit: true })
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([connection.done, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Agent 仍在退出，请查看终端')), 8000) })]).finally(() => clearTimeout(timer))
      } finally { this.transitions.delete(terminalId) }
    }
    return this.state(terminalId)
  }
  private accept(socket: Socket) {
    this.sockets.add(socket)
    let connection: Connection | undefined, terminal: string | undefined, opening = false, authenticated = false
    let detach: (() => void) | undefined, claimed: string | undefined
    const authTimer = setTimeout(() => socket.destroy(), 5000); authTimer.unref()
    const cleanup = async () => {
      clearTimeout(authTimer); this.sockets.delete(socket); detach?.()
      if (!connection) return
      if (terminal && connection.scope.selection && this.latestSessions.get(terminal)?.sessionId === connection.scope.sessionId) {
        this.latestSessions.set(terminal, targetOf(connection.scope))
      }
      connection.media.close()
      try { await connection.scope.close() } catch { /* Workbench may already be closing. */ }
      this.opened.delete(connection)
      if (terminal && this.connections.get(terminal) === connection) this.connections.delete(terminal)
      if (claimed) this.claimedSessions.delete(claimed)
      connection.finish()
    }
    socket.once('close', () => { void cleanup() }); socket.on('error', () => {})
    frames(socket, frame => { void (async () => {
      if (!authenticated) {
        if (opening) throw new Error('连接尚未准备好')
        opening = true
        const token = typeof frame.token === 'string' ? Buffer.from(frame.token) : Buffer.alloc(0)
        const expected = Buffer.from(this.descriptor!.token)
        if (frame.version !== 1 || token.length !== expected.length || !timingSafeEqual(token, expected)) throw new Error('DAWN 本机连接认证失败')
        if (typeof frame.workspace !== 'string' || !frame.workspace || frame.terminalId !== undefined && typeof frame.terminalId !== 'string' || frame.agentId !== undefined && typeof frame.agentId !== 'string') throw new Error('无效的 CLI 连接请求')
        if (frame.history === true) {
          clearTimeout(authTimer)
          const entries = await this.history(frame.workspace)
          send(socket, { history: entries }); socket.end(); return
        }
        if (frame.resumeSessionId !== undefined && (typeof frame.resumeSessionId !== 'string' || !frame.resumeSessionId || frame.agentId)) throw new Error('无效的历史会话恢复请求')
        terminal = frame.terminalId
        if (terminal && this.connections.has(terminal)) throw new Error('这个终端已经连接 DAWN')
        if (frame.resumeSessionId) {
          if (this.claimedSessions.has(frame.resumeSessionId) || [...this.connections.values()].some(c => c.scope.sessionId === frame.resumeSessionId)) throw new Error('这段会话已在另一个终端使用，请先退出那个 Agent')
          claimed = frame.resumeSessionId
          this.claimedSessions.add(claimed!)
        }
        let scope: DesktopScope
        try { scope = await this.opts.open(terminal, frame.workspace, frame.agentId, frame.resumeSessionId) }
        catch (error) { if (claimed) this.claimedSessions.delete(claimed); throw error }
        if (!claimed) {
          if (this.claimedSessions.has(scope.sessionId)) throw new Error('这段会话已在另一个终端使用，请先退出那个 Agent')
          claimed = scope.sessionId; this.claimedSessions.add(claimed)
        }
        if (socket.destroyed || this.disposed || terminal && this.connections.has(terminal)) { await scope.close(); if (claimed) this.claimedSessions.delete(claimed); socket.destroy(); return }
        let finish!: () => void
        connection = { socket, scope, media: new DesktopImages(scope.sessionId, scope.directory), done: new Promise<void>(r => { finish = r }), finish: () => finish() }
        this.opened.add(connection)
        if (terminal) {
          this.connections.set(terminal, connection)
          this.latestSessions.set(terminal, targetOf(scope))
          const history = this.imageScopes.get(terminal) ?? []
          this.imageScopes.set(terminal, [...history.slice(-1), connection.media])
        }
        authenticated = true; clearTimeout(authTimer)
        const media = connection.media
        let events = Promise.resolve()
        detach = scope.attach(event => {
          events = events.then(async () => {
            const richImage = event.kind === 'kernel_output' && (event.entry.kind === 'display' || event.entry.kind === 'result') && event.entry.mediaType.startsWith('image/')
            if (!richImage) send(socket, { event })
            await media.observe(event, image => send(socket, { event: image }), message => send(socket, { event: { kind: 'notice', sessionId: scope.sessionId, text: message } }))
          }).catch(() => { send(socket, { event: { kind: 'notice', sessionId: scope.sessionId, text: '终端图片预览未完成，请返回会话查看' } }) })
        })
        send(socket, { ready: { sessionId: scope.sessionId, model: scope.model, directory: scope.directory, resumed: Boolean(frame.resumeSessionId) } })
        return
      }
      if (!Number.isSafeInteger(frame.id)) throw new Error('无效的请求编号')
      const scope = connection!.scope
      try {
        let result: unknown
        if (frame.operation === '$close') { send(socket, { id: frame.id, result: {} }); socket.end(); return }
        if (frame.operation === '$history') {
          const all = await scope.history?.() ?? []
          const items = all.slice(-100).map(item => {
            if (item.kind !== 'text') return item
            const { images: _images, ...text } = item
            return text
          })
          // Bound presentation independently of the unchanged native model history.
          const bounded: typeof items = []
          let bytes = 0
          for (const item of items.reverse()) { const size = Buffer.byteLength(JSON.stringify(item)); if (bytes + size > 1024 * 1024) break; bytes += size; bounded.unshift(item) }
          const originals = scope.pictures?.() ?? []
          const warnings: string[] = []
          const pictures = await connection!.media.restore(originals, message => warnings.push(message))
          for (const item of bounded) {
            if (item.kind !== 'text' || item.who !== 'agent') continue
            await connection!.media.observe({ kind: 'output', sessionId: scope.sessionId, data: item.text }, () => {})
            await connection!.media.observe({ kind: 'turn_end', sessionId: scope.sessionId }, image => pictures.push({ id: image.id, name: image.name }), message => warnings.push(message))
          }
          const readable = pictures.filter(picture => { try { connection!.media.image(picture.id); return true } catch { return false } })
          result = { items: bounded, pictures: readable, truncated: bounded.length < all.length || originals.length > 12 || readable.length < pictures.length, warnings } satisfies CliHistory
        }
        else if (frame.operation === '$usage') result = scope.usage?.() ?? {}
        else if (frame.operation === '$wait') { await scope.waitForIdle(); result = {} }
        else {
          if (!allowed.has(frame.operation)) throw new Error('CLI 不允许调用此操作')
          if (!frame.input || frame.input.sessionId !== scope.sessionId) throw new Error('CLI 只能操作自己的会话')
          if (frame.operation === 'acquireLease' && frame.input.holder !== 'user') throw new Error('CLI 仅支持用户控制权')
          if (frame.operation === 'writeToSession') {
            if (connection!.media.read().pending?.length && scope.canReadImages && !scope.canReadImages()) throw new Error('当前模型不支持图片，请切换到看图模型或启用已配置的视觉服务')
            result = await connection!.media.send(frame.input, input => scope.call(frame.operation, input), image => send(socket, { event: image }))
          } else result = await scope.call(frame.operation, frame.input)
        }
        send(socket, { id: frame.id, result })
      } catch (error) { send(socket, { id: frame.id, error: error instanceof Error ? error.message : 'CLI 操作失败' }) }
    })().catch(error => { send(socket, { error: error instanceof Error ? error.message : 'CLI 连接失败' }); socket.end() }) })
  }
  async dispose(): Promise<void> {
    this.disposed = true
    if (!this.ready) return
    await this.ready.catch(() => {})
    const connections = [...this.opened]
    for (const socket of this.sockets) socket.destroy()
    await Promise.all(connections.map(c => c.done))
    await new Promise<void>(resolve => this.server.close(() => resolve()))
    try {
      const current = JSON.parse(await readFile(this.opts.descriptor, 'utf8'))
      if (current.token === this.descriptor?.token) await rm(this.opts.descriptor, { force: true })
    } catch { /* Another host may own the discovery file now. */ }
    this.latestSessions.clear()
    this.imageScopes.clear()
    if (this.root) await rm(this.root, { recursive: true, force: true })
  }
}
