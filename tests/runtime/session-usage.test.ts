import { expect, it } from 'vitest'
import { sessionUsage } from '../../src/runtime/session-usage.js'

const message = (usage?: object, extra = {}) => ({ type: 'message', message: { role: 'assistant', usage, ...extra } })
it('counts the complete branch including tool-only replies before compaction, without counting tool usage', () => {
  const branch = [message({ input: 10, output: 2, cacheRead: 30 }),
    { type: 'message', message: { role: 'toolResult', usage: { input: 999 } } },
    { type: 'compaction', summary: 'earlier context' }, message({ input: 20, output: 4, cacheRead: 40 })]
  expect(sessionUsage(branch)).toEqual({ input: 30, output: 6, cacheRead: 70 })
  expect(sessionUsage(branch)).toEqual(sessionUsage(branch)) // Re-reading replaces a snapshot; never adds history again.
})
it('keeps unavailable fields unknown, distinguishes actual zero and marks incomplete historical totals', () => {
  expect(sessionUsage([])).toEqual({})
  expect(sessionUsage([message({ input: 10, output: 2 })])).toEqual({ input: 10, output: 2 })
  expect(sessionUsage([message({ input: 10, output: 2, cacheRead: 0 })])).toEqual({ input: 10, output: 2, cacheRead: 0 })
  expect(sessionUsage([message(), message({ input: 10, output: 2, cacheRead: 0 })])).toEqual({ input: 10, output: 2, cacheRead: 0, partial: ['input', 'output', 'cacheRead'] })
  expect(sessionUsage([message({ input: -1, output: NaN, cacheRead: Infinity })])).toEqual({})
})
it('does not turn failed or aborted placeholder messages into zero usage', () => {
  expect(sessionUsage([message({ input: 0, output: 0, cacheRead: 0 }, { stopReason: 'error' }), message(undefined, { stopReason: 'aborted' })])).toEqual({})
})
it('includes actual usage of interrupted or failed requests, but treats SDK all-zero defaults as unavailable', () => {
  expect(sessionUsage([message({ input: 0, output: 0, cacheRead: 0 })])).toEqual({})
  expect(sessionUsage([message({ input: 30, output: 2, cacheRead: 0 }, { stopReason: 'aborted' }),
    message({ input: 10, output: 0, cacheRead: 20 }, { stopReason: 'error' })])).toEqual({ input: 40, output: 2, cacheRead: 20 })
  expect(sessionUsage([message({ input: 30, output: 2, cacheRead: 0 }), message({ input: 0, output: 0, cacheRead: 0 })]))
    .toEqual({ input: 30, output: 2, cacheRead: 0, partial: ['input', 'output', 'cacheRead'] })
})
it('does not claim a zero cache hit rate when the SDK may have filled a missing field with zero', () => {
  expect(sessionUsage([message({ input: 100, output: 8, cacheRead: 0 })], true))
    .toEqual({ input: 100, output: 8, cacheRead: 0, partial: ['cacheRead'] })
})
