import type { TranscriptItem } from '../protocol/events.js'

export type ToolTiming = { startedAt: number; endedAt: number }
export type SessionActivity = { turns: number; tools: number; toolMs?: number; toolMsPartial?: boolean }
/** Same user turns and tool items as the conversation; only actual tool timings count. */
export function sessionActivity(items: readonly TranscriptItem[], saved: ReadonlyMap<string, ToolTiming> = new Map()): SessionActivity {
  let turns = 0, tools = 0, toolMs = 0, timed = 0
  for (const item of items) {
    if (item.type === 'turn' && item.who === 'user') turns++
    if (item.type !== 'tool') continue
    tools++
    const live = item.startedAt !== undefined && item.endedAt !== undefined ? { startedAt: item.startedAt, endedAt: item.endedAt } : undefined
    const timing = live ?? saved.get(item.id)
    if (!timing || !Number.isFinite(timing.startedAt) || !Number.isFinite(timing.endedAt) || timing.endedAt < timing.startedAt) continue
    timed++; toolMs += timing.endedAt - timing.startedAt
  }
  return { turns, tools, ...(timed ? { toolMs, ...(timed < tools ? { toolMsPartial: true } : {}) } : {}) }
}
