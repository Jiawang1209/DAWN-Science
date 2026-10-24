import { afterEach, expect, it, vi } from 'vitest'
import { CliNextPrompt, suggestLatestPrompt } from '../../src/cli/next-prompt.js'
afterEach(() => vi.useRealTimers())
it('requests only the final assistant turn using the same backend contract', async () => {
  const ask = vi.fn(async () => ({ text: '检查缺失值' }))
  expect(await suggestLatestPrompt([{ type: 'turn', who: 'user', id: 'u', final: true }], ask)).toEqual({ text: '' })
  expect(ask).not.toHaveBeenCalled()
  expect(await suggestLatestPrompt([{ type: 'turn', who: 'agent', id: 'a', final: true }], ask)).toEqual({ text: '检查缺失值' })
  expect(ask).toHaveBeenCalledWith('a')
})
it('debounces idle suggestions, keeps one request per turn, and hides while typing', async () => {
  vi.useFakeTimers(); const load = vi.fn(async () => ({ text: '检查缺失值' })), show = vi.fn()
  const next = new CliNextPrompt(load, show)
  next.update(true); await vi.advanceTimersByTimeAsync(399); expect(load).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1); expect(show).toHaveBeenLastCalledWith('检查缺失值')
  next.update(false); expect(show).toHaveBeenLastCalledWith('')
  next.update(true); await vi.advanceTimersByTimeAsync(400)
  expect(load).toHaveBeenCalledOnce(); expect(show).toHaveBeenLastCalledWith('检查缺失值'); next.close()
})
it('discards old replies after a new turn and after exit, and tolerates failure', async () => {
  vi.useFakeTimers(); let finish!: (x: { text: string }) => void
  const load = vi.fn(() => new Promise<{ text: string }>(resolve => { finish = resolve })), show = vi.fn()
  const next = new CliNextPrompt(load, show); next.update(true); await vi.advanceTimersByTimeAsync(400)
  next.reset(); finish({ text: 'STALE' }); await Promise.resolve(); expect(show).not.toHaveBeenCalledWith('STALE')
  load.mockRejectedValueOnce(Error('offline')); next.update(true); await vi.advanceTimersByTimeAsync(400)
  expect(show).toHaveBeenLastCalledWith('')
  next.reset(); next.update(true); await vi.advanceTimersByTimeAsync(400); next.close(); finish({ text: 'CLOSED' }); await Promise.resolve()
  expect(show).not.toHaveBeenCalledWith('CLOSED')
})
