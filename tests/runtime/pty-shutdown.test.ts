import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), collect: vi.fn() }))
vi.mock('node-pty', () => ({ spawn: mocks.spawn }))
vi.mock('../../src/runtime/process-tree.js', () => ({ collectTree: mocks.collect }))
import { PtyRuntime } from '../../src/runtime/pty.js'

let alive: boolean
let exits: Array<() => void>
let writes: Array<ReturnType<typeof vi.fn>>
beforeEach(() => {
  vi.useFakeTimers(); alive = true; exits = []; writes = []
  mocks.collect.mockReset().mockReturnValue({ pids: [43210], pgids: [43210] })
  mocks.spawn.mockReset().mockImplementation(() => {
    const write = vi.fn(); writes.push(write)
    return { pid: 43210, write, onData: vi.fn(), onExit: (fn: (e: { exitCode: number }) => void) => exits.push(() => fn({ exitCode: 0 })) }
  })
  vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
    if (signal === 0 && !alive) throw new Error('ESRCH')
    return true
  })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
async function start(onExit?: () => void) {
  const runtime = new PtyRuntime({ command: 'fixture', ...(onExit ? { onExit } : {}) })
  await runtime.start({ sessionId: 't', workspace: '/fixture', sessionDir: '/fixture' })
  return runtime
}
it('waits for native onExit even after the OS process has disappeared', async () => {
  const runtime = await start(); alive = false
  let settled = false
  const stopped = runtime.stop('t').then(() => { settled = true })
  await vi.advanceTimersByTimeAsync(200)
  expect(settled).toBe(false)
  exits[0]!(); await vi.advanceTimersByTimeAsync(1); await stopped
  expect(settled).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
it('waits after SIGKILL and shares the entire stop across concurrent callers', async () => {
  const runtime = await start(); let settled = false
  const first = runtime.stop('t').then(() => { settled = true }), second = runtime.stop('t')
  await vi.advanceTimersByTimeAsync(200)
  expect(process.kill).toHaveBeenCalledWith(-43210, 'SIGKILL')
  expect(mocks.collect).toHaveBeenCalledTimes(1)
  expect(settled).toBe(false)
  exits[0]!(); await vi.advanceTimersByTimeAsync(1); await Promise.all([first, second])
})
it('reports a bounded drain timeout without pretending the callback arrived', async () => {
  const runtime = await start()
  const stopped = runtime.stop('t').then(() => ({ error: undefined }), error => ({ error }))
  await vi.advanceTimersByTimeAsync(1200)
  expect((await stopped).error).toBeInstanceOf(Error)
  expect(String((await stopped).error)).toMatch(/退出/)
  expect(vi.getTimerCount()).toBe(0)
  exits[0]!()
})
it('does not let an old native exit clear a replacement process with the same session ID', async () => {
  const runtime = await start()
  await runtime.start({ sessionId: 't', workspace: '/fixture', sessionDir: '/fixture' })
  exits[0]!()
  runtime.write('t', 'new generation')
  expect(writes[1]).toHaveBeenCalledWith('new generation')
  exits[1]!()
})
it('does not signal a naturally exited process', async () => {
  const runtime = await start(); exits[0]!()
  await runtime.stop('t')
  expect(mocks.collect).not.toHaveBeenCalled()
  expect(process.kill).not.toHaveBeenCalled()
})
it('settles native completion even when an exit observer throws', async () => {
  const runtime = await start(() => { throw new Error('observer') }); alive = false
  const stopped = runtime.stop('t')
  await vi.advanceTimersByTimeAsync(200)
  expect(() => exits[0]!()).toThrow('observer')
  await vi.advanceTimersByTimeAsync(1); await stopped
  expect(() => runtime.write('t', 'stale')).toThrow(/无活动/)
  expect(vi.getTimerCount()).toBe(0)
})
