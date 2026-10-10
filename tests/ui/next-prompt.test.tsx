import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { 草稿输入框 } from "../../src/ui/composer-field.js"
import { useNextPrompt } from "../../src/ui/next-prompt.js"
it("ghost is not a value; only unmodified Tab accepts it", () => {
  const change = vi.fn()
  render(<草稿输入框 值="" on值变={change} suggestion="检查缺失值" />)
  const input = screen.getByRole('textbox') as HTMLTextAreaElement
  expect(input.value).toBe('')
  expect(input.placeholder).toBe('检查缺失值')
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })
  expect(change).not.toHaveBeenCalled()
  fireEvent.keyDown(input, { key: 'Tab' })
  expect(input.value).toBe('检查缺失值')
  expect(change).toHaveBeenCalledWith('检查缺失值', 5)
})
it("does not override real DOM input or IME composition", () => {
  const change = vi.fn()
  render(<草稿输入框 值="" on值变={change} suggestion="建议" />)
  const input = screen.getByRole('textbox') as HTMLTextAreaElement
  fireEvent.compositionStart(input)
  fireEvent.keyDown(input, { key: 'Tab' })
  expect(change).not.toHaveBeenCalled()
  fireEvent.compositionEnd(input)
  change.mockClear()
  input.value = '自己的草稿'
  fireEvent.keyDown(input, { key: 'Tab' })
  expect(input.value).toBe('自己的草稿')
  expect(change).not.toHaveBeenCalled()
})
it("late replies stay in their session; drafts suppress suggestions and reuse requests", async () => {
  vi.useFakeTimers()
  try {
    let resolve!: (r: { text: string }) => void
    const load = vi.fn(() => new Promise<{ text: string }>((r) => { resolve = r }))
    const { result, rerender } = renderHook(({ key, enabled }) => useNextPrompt(key, enabled, load, 'turn'), { initialProps: { key: 'A', enabled: true } })
    await act(async () => { vi.advanceTimersByTime(400) })
    rerender({ key: 'B', enabled: false })
    await act(async () => { resolve({ text: 'A 的建议' }) })
    expect(result.current).toBe('')
    rerender({ key: 'A', enabled: true })
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(result.current).toBe('A 的建议')
    expect(load).toHaveBeenCalledTimes(1)
  } finally { vi.useRealTimers() }
})
