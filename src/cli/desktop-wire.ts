import type { Socket } from 'node:net'
import type { AgentEvent } from '../runtime/types.js'
export type DesktopCliEvent = AgentEvent | import('./desktop-images.js').TerminalImageEvent
export interface DesktopDescriptor { socket: string; token: string; version: 1 }
export interface DesktopScope {
  sessionId: string; model: string; directory: string
  projectId?: string | undefined
  selection?: { provider: string; model: string } | undefined
  canReadImages?: () => boolean
  call: (operation: string, input: unknown) => Promise<unknown>
  attach: (sink: (event: AgentEvent) => void) => () => void
  waitForIdle: () => Promise<void>
  close: () => Promise<void>
}
export function send(socket: Socket, frame: unknown): void { if (!socket.destroyed) socket.write(JSON.stringify(frame) + '\n') }
/** Bounded JSON lines; no arbitrary desktop operations are exposed by this transport. */
export function frames(socket: Socket, receive: (frame: any) => void): void {
  let pending = ''
  socket.setEncoding('utf8')
  socket.on('data', data => {
    pending += data
    if (Buffer.byteLength(pending) > 4 * 1024 * 1024) { socket.destroy(); return }
    let end: number
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1)
      try { receive(JSON.parse(line)) } catch { socket.destroy(); return }
    }
  })
}
