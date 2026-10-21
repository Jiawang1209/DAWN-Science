import { describe, expect, it, vi } from 'vitest'
import { createKernelChannel, type RawChannel } from '../../src/kernel/channel.js'
import type { JupyterMessage } from '../../src/kernel/types.js'

function harness() {
  let seq = 0
  const observers = new Set<(x: unknown) => void>()
  const sent: JupyterMessage[] = []
  const channel: RawChannel = { next: x => sent.push(x as JupyterMessage),
    subscribe: cb => { observers.add(cb); return { unsubscribe: () => observers.delete(cb) } }, complete: () => {} }
  const make = (type: string, parent?: string, content: Record<string, unknown> = {}): JupyterMessage => ({
    header: { msg_id: `m${++seq}`, msg_type: type }, parent_header: parent ? { msg_id: parent } : {}, metadata: {}, content,
  })
  const handshake = make('kernel_info_request')
  const ch = createKernelChannel({ channel, process: { pid: 1, kill: () => {} }, kernelInstanceId: 'r1', handshake,
    makeExecute: (code, opts) => make('execute_request', undefined, { code, ...opts }), sleep: async () => {} })
  const incoming = (type: string, parent?: string, content?: Record<string, unknown>) => {
    const m = make(type, parent, content); for (const cb of [...observers]) cb(m)
  }
  return { ch, sent, incoming, async ready() { const p = ch.ready(); incoming('kernel_info_reply', handshake.header.msg_id); incoming('iopub_welcome'); await p } }
}

describe('内部探测输出隔离', () => {
  it('超时后迟到的内部应答仍不外发', async () => {
    vi.useFakeTimers()
    const h = harness()
    try {
      await h.ready(); const seen: string[] = []
      h.ch.on('*', x => seen.push(x.message.header.msg_type))
      const p = h.ch.probe('slow', 5); const id = h.sent.at(-1)!.header.msg_id
      await vi.advanceTimersByTimeAsync(5)
      expect(await p).toBeUndefined()
      h.incoming('display_data', id, { data: { 'text/plain': 'LATE' } })
      h.incoming('execute_reply', id, {})
      expect(seen).toEqual([])
    } finally { await h.ch.close(); vi.useRealTimers() }
  })
  it('user_expressions 即使违背 silent 广播，也只私下取回结果', async () => {
    const h = harness(); await h.ready(); const seen: string[] = []
    h.ch.on('*', x => seen.push(x.message.header.msg_type))
    const p = h.ch.probe('"internal"'); const id = h.sent.at(-1)!.header.msg_id
    h.incoming('display_data', id, { data: { 'text/plain': 'INTERNAL' } })
    h.incoming('execute_reply', id, { user_expressions: { v: { status: 'ok', data: { 'text/plain': 'internal' } } } })
    expect(await p).toBe('internal')
    expect(seen).toEqual([])
    await h.ch.close()
  })
  it('R 退路结束后的迟到指纹不外发，正常用户的十六进制输出照常可见', async () => {
    const h = harness(); await h.ready(); const seen: string[] = []
    h.ch.on('*', x => seen.push(x.message.header.msg_type))
    const p = h.ch.probe('fingerprint'); const first = h.sent.at(-1)!.header.msg_id
    h.incoming('execute_reply', first, { user_expressions: {} }); await Promise.resolve(); await Promise.resolve()
    const fallback = h.sent.at(-1)!.header.msg_id
    h.incoming('display_data', fallback, { data: { 'text/plain': 'abcd1234' } })
    h.incoming('status', fallback, { execution_state: 'idle' }); expect(await p).toBe('abcd1234')
    seen.length = 0
    h.incoming('display_data', fallback, { data: { 'text/plain': 'LATE_INTERNAL' } })
    h.incoming('display_data', first, { data: { 'text/plain': 'LATE_FIRST' } })
    expect(seen).toEqual([])
    const user = h.ch.execute('"abcd1234"')
    h.incoming('display_data', user, { data: { 'text/plain': 'abcd1234' } })
    expect(seen).toEqual(['display_data'])
    await h.ch.close()
  })
})
