import { expect, it } from 'vitest'
import { visibleWidth } from '@earendil-works/pi-tui'
import { usageLines } from '../../src/cli/usage.js'

it('puts the current model first and current context last, independent of cumulative tokens', () => {
  const lines = usageLines({ input: 4600, output: 14700, cacheRead: 1090000, turns: 5,
    context: { model: 'deepseek-flash', usedTokens: 28100, contextWindow: 1000000 } } as never, 220)
  expect(lines.join('\n').trim()).toBe('deepseek-flash · 5 轮 · 输入 4.6k · 输出 14.7k · 缓存 1.09M · 命中 100% · 上下文 28.1k / 1.00M（3%）')
})
it.each([
  [{ model: 'fresh', contextWindow: 128000 }, '上下文 未采集 / 128k'],
  [{ model: 'compacted', contextWindow: 128000, afterCompaction: true }, '上下文 已压缩 / 128k'],
  [{ model: 'estimated', usedTokens: 28000, contextWindow: 128000, estimated: true }, '上下文 约28k / 128k（22%）'],
  [{ model: 'no-limit', usedTokens: 28000 }, '上下文 28k / 上限未知'],
  [{ model: 'small', usedTokens: 1, contextWindow: 128000 }, '上下文 1 / 128k（<1%）'],
])('preserves the context state from the conversation meter: %j', (context, expected) => {
  const text = usageLines({ context } as never, 220).join('\n').trim()
  expect(text.startsWith(context.model + ' ·')).toBe(true); expect(text.endsWith(expected)).toBe(true)
})
it('centers wrapped fields and replaces a changed model without retaining stale context', () => {
  const lines = usageLines({ input: 30, context: { model: 'new-model', usedTokens: 128000, contextWindow: 128000 } } as never, 38)
  expect(lines[0]!.trim().startsWith('new-model')).toBe(true)
  expect(lines.at(-1)!.trim()).toBe('上下文 128k / 128k（100%）')
  for (const line of lines) { expect(visibleWidth(line)).toBeLessThanOrEqual(38); expect(Math.abs(line.length - line.trimStart().length - (38 - visibleWidth(line.trim())) / 2)).toBeLessThanOrEqual(1) }
  expect(usageLines({} as never, 100).join('\n')).toContain('上下文 未采集')
})
