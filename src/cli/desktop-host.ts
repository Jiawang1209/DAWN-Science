import { createServer, type Socket } from 'node:net'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, chmod, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { frames, send, type DesktopDescriptor, type DesktopScope } from './desktop-wire.js'

interface Target { sessionId: string; projectId?: string; selection?: { provider: string; model: string } }
const targetOf = (scope: DesktopScope): Target => ({ sessionId: scope.sessionId, ...(scope.projectId ? { projectId: scope.projectId } : {}), ...(scope.selection ? { selection: scope.selection } : {}) })
type Mode = 'normal' | 'dawn' | 'starting' | 'stopping'
interface Connection { socket: Socket; scope: DesktopScope; done: Promise<void>; finish: () => void }
export interface DesktopCliOptions {
  entry: string; executable: string; descriptor: string
  launch: (terminalId: string) => Promise<void>
  open: (terminalId: string | undefined, workspace: string, agentId?: string) => Promise<DesktopScope>
}
const allowed = new Set(['writeToSession', 'answerPermission', 'answerQuestion', 'abortSession', 'acquireLease'])
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'"
export class DesktopCliHost {
  private server = createServer(socket => this.accept(socket))
  private sockets = new Set<Socket>()
  private connections = new Map<string, Connection>()
  private transitions = new Map<string, Mode>()
  private latestSessions = new Map<string, Target>()
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
  forgetTerminal(terminalId: string): void { this.latestSessions.delete(terminalId) }
  async setMode(terminalId: string, mode: 'dawn' | 'normal') {
    if (this.transitions.has(terminalId)) throw new Error('正在切换模式，请稍候')
    const connection = this.connections.get(terminalId)
    if (mode === 'dawn' && !connection) {
      this.transitions.set(terminalId, 'starting')
      try {
        await this.environment(terminalId)
        await this.opts.launch(terminalId)
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
    let detach: (() => void) | undefined
    const authTimer = setTimeout(() => socket.destroy(), 5000); authTimer.unref()
    const cleanup = async () => {
      clearTimeout(authTimer); this.sockets.delete(socket); detach?.()
      if (!connection) return
      if (terminal && connection.scope.selection && this.latestSessions.get(terminal)?.sessionId === connection.scope.sessionId) {
        this.latestSessions.set(terminal, targetOf(connection.scope))
      }
      try { await connection.scope.close() } catch { /* Workbench may already be closing. */ }
      if (terminal && this.connections.get(terminal) === connection) this.connections.delete(terminal)
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
        terminal = frame.terminalId
        if (terminal && this.connections.has(terminal)) throw new Error('这个终端已经连接 DAWN')
        const scope = await this.opts.open(terminal, frame.workspace, frame.agentId)
        if (socket.destroyed || this.disposed || terminal && this.connections.has(terminal)) { await scope.close(); socket.destroy(); return }
        let finish!: () => void
        connection = { socket, scope, done: new Promise<void>(r => { finish = r }), finish: () => finish() }
        if (terminal) {
          this.connections.set(terminal, connection)
          this.latestSessions.set(terminal, targetOf(scope))
        }
        authenticated = true; clearTimeout(authTimer)
        detach = scope.attach(event => send(socket, { event }))
        send(socket, { ready: { sessionId: scope.sessionId, model: scope.model, directory: scope.directory } })
        return
      }
      if (!Number.isSafeInteger(frame.id)) throw new Error('无效的请求编号')
      const scope = connection!.scope
      try {
        let result: unknown
        if (frame.operation === '$close') { send(socket, { id: frame.id, result: {} }); socket.end(); return }
        if (frame.operation === '$wait') { await scope.waitForIdle(); result = {} }
        else {
          if (!allowed.has(frame.operation)) throw new Error('CLI 不允许调用此操作')
          if (!frame.input || frame.input.sessionId !== scope.sessionId) throw new Error('CLI 只能操作自己的会话')
          if (frame.operation === 'acquireLease' && frame.input.holder !== 'user') throw new Error('CLI 仅支持用户控制权')
          result = await scope.call(frame.operation, frame.input)
        }
        send(socket, { id: frame.id, result })
      } catch (error) { send(socket, { id: frame.id, error: error instanceof Error ? error.message : 'CLI 操作失败' }) }
    })().catch(error => { send(socket, { error: error instanceof Error ? error.message : 'CLI 连接失败' }); socket.end() }) })
  }
  async dispose(): Promise<void> {
    this.disposed = true
    if (!this.ready) return
    await this.ready.catch(() => {})
    const connections = [...this.connections.values()]
    for (const socket of this.sockets) socket.destroy()
    await Promise.all(connections.map(c => c.done))
    await new Promise<void>(resolve => this.server.close(() => resolve()))
    try {
      const current = JSON.parse(await readFile(this.opts.descriptor, 'utf8'))
      if (current.token === this.descriptor?.token) await rm(this.opts.descriptor, { force: true })
    } catch { /* Another host may own the discovery file now. */ }
    this.latestSessions.clear()
    if (this.root) await rm(this.root, { recursive: true, force: true })
  }
}
