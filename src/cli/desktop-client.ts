import { createConnection } from 'node:net'
import type { DesktopCliEvent, CliHistory, CliHistoryEntry } from './desktop-wire.js'
import { frames, send, type DesktopDescriptor } from './desktop-wire.js'
import type { SessionUsage } from '../runtime/session-usage.js'

export async function connectDesktopCli(descriptor: DesktopDescriptor, workspace: string, terminalId?: string, agentId?: string, resumeSessionId?: string) {
  if (!descriptor || descriptor.version !== 1 || typeof descriptor.socket !== 'string' || typeof descriptor.token !== 'string') throw new Error('无效的 DAWN 连接文件')
  const socket = createConnection(descriptor.socket)
  const sinks = new Set<(event: DesktopCliEvent) => void>(), exits = new Set<() => void>()
  const pending = new Map<number, { resolve: (v: any) => void; reject: (error: Error) => void }>()
  let sequence = 0, expectedClose = false
  let ready!: (v: { sessionId: string; model: string; directory: string; resumed?: boolean }) => void, rejectReady!: (e: Error) => void
  const connected = new Promise<{ sessionId: string; model: string; directory: string; resumed?: boolean }>((resolve, reject) => { ready = resolve; rejectReady = reject })
  const timer = setTimeout(() => socket.destroy(new Error('连接 DAWN 超时')), 15_000)
  socket.once('connect', () => send(socket, { ...descriptor, workspace, terminalId, agentId, resumeSessionId }))
  socket.on('error', error => rejectReady(error))
  socket.once('close', () => {
    clearTimeout(timer); const error = new Error('DAWN 桌面连接已断开')
    rejectReady(error); for (const p of pending.values()) p.reject(error); pending.clear()
    if (!expectedClose) for (const exit of exits) exit()
  })
  frames(socket, frame => {
    if (frame.ready) { clearTimeout(timer); ready(frame.ready) }
    else if (frame.event) for (const sink of sinks) sink(frame.event)
    else if (frame.exit) for (const exit of exits) exit()
    else if (frame.id) {
      const p = pending.get(frame.id); pending.delete(frame.id)
      if (frame.error) p?.reject(new Error(frame.error)); else p?.resolve(frame.result)
    } else if (frame.error) { rejectReady(new Error(frame.error)); socket.destroy() }
  })
  const call = <T = unknown>(operation: string, input?: unknown): Promise<T> => {
    if (socket.destroyed) return Promise.reject(new Error('DAWN 桌面连接已断开'))
    return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); send(socket, { id, operation, input }) })
  }
  let metadata
  try { metadata = await connected } catch (error) { socket.destroy(); throw error }
  return { ...metadata, call,
    history: () => call<CliHistory>('$history'),
    usage: () => call<SessionUsage>('$usage'),
    attach: (sink: (event: DesktopCliEvent) => void) => { sinks.add(sink); return () => { sinks.delete(sink) } },
    waitForIdle: async () => { await call('$wait') },
    onExit: (callback: () => void) => { exits.add(callback); return () => { exits.delete(callback) } },
    close: async () => { expectedClose = true; try { await call('$close') } finally { socket.end(); socket.destroy() } },
  }
}

export async function listDesktopHistory(descriptor: DesktopDescriptor, workspace: string): Promise<CliHistoryEntry[]> {
  if (!descriptor || descriptor.version !== 1 || typeof descriptor.socket !== 'string' || typeof descriptor.token !== 'string') throw new Error('无效的 DAWN 连接文件')
  const socket = createConnection(descriptor.socket)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => socket.destroy(new Error('读取历史会话超时')), 15_000)
    socket.once('connect', () => send(socket, { ...descriptor, workspace, history: true }))
    socket.on('error', reject)
    socket.once('close', () => { clearTimeout(timer); reject(new Error('读取历史会话连接已断开')) })
    frames(socket, frame => {
      if (Array.isArray(frame.history)) { resolve(frame.history); socket.end() }
      else if (frame.error) { reject(new Error(frame.error)); socket.destroy() }
    })
  })
}
