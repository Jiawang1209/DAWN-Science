import { expect, it, vi } from "vitest"
import { nextPrompt } from "../../src/suggestions/next-prompt.js"
it("bounds history and generates a user utterance without tools", async () => {
  const ask = vi.fn(async (_req: import("../../src/suggestions/next-prompt.js").SuggestRequest) => ({ text: '  检查缺失值  ', model: 'test' }))
  expect(await nextPrompt(Array.from({ length: 10 }, () => ({ who: 'user', text: 'x'.repeat(4000) })), ask)).toBe('检查缺失值')
  expect(ask.mock.calls[0]![0].user.length).toBeLessThan(13000)
  expect(ask.mock.calls[0]![0].system).toContain('用户')
})
it("rejects multiline, oversized and command suggestions; permits no next step", async () => {
  for (const text of ['', 'NONE', '/compact', 'a\nb', 'x'.repeat(121)]) {
    expect(await nextPrompt([], async () => ({ text, model: 'test' }))).toBe('')
  }
})
