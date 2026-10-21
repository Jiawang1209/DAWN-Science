import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../src/kernel/channel.js', () => ({ launchKernelChannel: vi.fn(), attachKernelChannel: vi.fn() }))
import { launchKernelChannel } from '../../src/kernel/channel.js'
import { KernelRuntime } from '../../src/runtime/kernel.js'
import type { SessionId, SessionSpec } from '../../src/runtime/types.js'

const id = 'qa::R' as SessionId
const spec = { sessionId: id, workspace: '/qa', sessionDir: '/qa/session', kernel: { language: 'R', interpreterPath: '/qa/R' } } as SessionSpec
function channel(instance: string) {
  let exit = () => {}
  let output = (_m: unknown) => {}
  return { kernelInstanceId: instance, kernelRevision: 0,
    on: (_type: string, cb: (m: unknown) => void) => { output = cb; return () => {} },
    onExit: (cb: () => void) => { exit = cb; return () => {} },
    close: vi.fn(async () => {}), probe: async () => Buffer.from('R version 4\u001d/qa/R\u001dqa\u001d/qa/lib\u001dpkg\u001f1\u001d1').toString('hex'),
    execute: () => 'x', fireExit: () => exit(), fireOutput: () => output({ message: { header: { msg_type: 'stream' }, parent_header: {}, content: { name: 'stdout', text: 'old' } }, provenance: { kernelInstanceId: instance, kernelRevision: 0 } }),
  }
}
afterEach(() => vi.resetAllMocks())
describe('意外退出的本地通道生命周期', () => {
  it('退出后关闭原通道，避免丢失 session 引用后遗留 native socket', async () => {
    const c = channel('r1'); vi.mocked(launchKernelChannel).mockResolvedValue(c as never)
    const runtime = new KernelRuntime(); await runtime.start(spec)
    c.fireExit(); await Promise.resolve()
    expect(c.close).toHaveBeenCalledTimes(1)
    expect(runtime.kernelInstanceId(id)).toBeUndefined()
  })
  it('同名会话重建后，旧通道迟到的输出和退出不能触及新实例', async () => {
    const first = channel('r1'), next = channel('r2')
    vi.mocked(launchKernelChannel).mockResolvedValueOnce(first as never).mockResolvedValueOnce(next as never)
    const runtime = new KernelRuntime(); await runtime.start(spec); first.fireExit()
    await runtime.start(spec)
    const output = vi.fn(); runtime.attach(id, output)
    first.fireOutput(); first.fireExit()
    expect(output).not.toHaveBeenCalled()
    expect(runtime.kernelInstanceId(id)).toBe('r2')
    expect(next.close).not.toHaveBeenCalled()
    await runtime.stop(id)
  })
})
