import { describe, expect, it } from 'vitest'
import { 对话内核 } from '../../src/kernel/挂载.js'
import type { SessionId } from '../../src/runtime/types.js'

const conversation = 'qa' as SessionId
function harness() {
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  const forwarded: { language: string; event: unknown }[] = []
  const emit = (id: string, event: unknown) => {
    for (const cb of [...(listeners.get(id) ?? [])]) cb(event)
  }
  const runtime = {
    start: async (spec: { sessionId: string }) => ({ sessionId: spec.sessionId, pid: 0 }),
    attach: (id: string, cb: (e: unknown) => void) => {
      const set = listeners.get(id) ?? new Set(); listeners.set(id, set); set.add(cb)
      return () => { set.delete(cb) }
    },
    write: () => {},
    // 与本地 KernelRuntime 的意外退出路径一致：事件发出后订阅保留，挂载层负责注销。
    stop: async (id: string) => emit(id, { kind: 'exited', sessionId: id, exitCode: 0 }),
  }
  const kernels = new 对话内核({ runtime: runtime as never, workspaceOf: () => '/qa',
    sessionDirOf: () => '/qa/session', interpreterOf: () => '/qa/interpreter',
    转发: (_id, language, event) => forwarded.push({ language, event }) })
  const output = (language: string) => emit(`qa::${language}`, { kind: 'kernel_output', entry: { kind: 'stream', text: '42' } })
  const die = () => emit('qa::R', { kind: 'exited', sessionId: 'qa::R', exitCode: 1 })
  return { kernels, listeners, forwarded, output, die, emit }
}

describe('内核重建的输出转发所有权', () => {
  it('连续三次意外退出后，每个新 R 输出仍只转发一次，Python 不受影响', async () => {
    const h = harness()
    await h.kernels.拿(conversation, 'python')
    for (let i = 0; i < 4; i++) {
      await h.kernels.拿(conversation, 'R')
      h.forwarded.length = 0
      h.output('R'); h.output('python')
      expect(h.forwarded.map(x => x.language)).toEqual(['R', 'python'])
      expect(h.listeners.get('qa::R')?.size).toBe(2)
      if (i < 3) h.die()
    }
    await h.kernels.收(conversation)
  })
  it('收掉后清理状态和转发订阅，再起同名内核不会叠加', async () => {
    const h = harness(); await h.kernels.拿(conversation, 'R')
    await h.kernels.收(conversation)
    expect(h.listeners.get('qa::R')?.size).toBe(0)
    await h.kernels.拿(conversation, 'R')
    h.forwarded.length = 0; h.output('R')
    expect(h.forwarded).toHaveLength(1)
    await h.kernels.收(conversation)
  })
  it('分离与接回不重建订阅，用户确实打印两次的相同内容仍显示两次', async () => {
    const h = harness(); const first = await h.kernels.拿(conversation, 'R')
    h.emit('qa::R', { kind: 'detached', sessionId: 'qa::R' })
    h.emit('qa::R', { kind: 'reattached', sessionId: 'qa::R' })
    expect(await h.kernels.拿(conversation, 'R')).toBe(first)
    h.forwarded.length = 0; h.output('R'); h.output('R')
    expect(h.forwarded).toHaveLength(2)
    expect(h.listeners.get('qa::R')?.size).toBe(2)
    await h.kernels.收(conversation)
  })
})
