import { expect, it } from 'vitest'
import type { TranscriptItem } from '../../src/protocol/events.js'
import { sessionActivity } from '../../src/shared/session-activity.js'

const items = [
  { type: 'turn', id: 'u1', who: 'user', text: 'one', final: true },
  { type: 'turn', id: 'a1', who: 'agent', text: 'reply', final: true },
  { type: 'tool', id: 't1', name: 'bash', input: {}, status: 'ok', startedAt: 100, endedAt: 200 },
  { type: 'tool', id: 't2', name: 'read', input: {}, status: 'ok' },
  { type: 'turn', id: 'u2', who: 'user', text: 'two', final: true },
] as TranscriptItem[]
it('counts the same user turns and tools as the conversation and sums actual tool intervals', () => {
  expect(sessionActivity(items, new Map([['t2', { startedAt: 300, endedAt: 500 }]])))
    .toEqual({ turns: 2, tools: 2, toolMs: 300 })
  expect(sessionActivity([])).toEqual({ turns: 0, tools: 0 })
})
it('keeps missing timing unknown, marks a known lower bound, and prefers live timings over the ledger', () => {
  expect(sessionActivity(items)).toEqual({ turns: 2, tools: 2, toolMs: 100, toolMsPartial: true })
  expect(sessionActivity([items[3]!])).toEqual({ turns: 0, tools: 1 })
  expect(sessionActivity([items[2]!], new Map([['t1', { startedAt: 100, endedAt: 999 }]])))
    .toEqual({ turns: 0, tools: 1, toolMs: 100 })
  expect(sessionActivity([{ ...items[2], startedAt: 200, endedAt: 100 } as TranscriptItem]))
    .toEqual({ turns: 0, tools: 1 })
})
