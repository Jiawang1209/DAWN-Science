import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'
import type { SessionUsage, UsageField } from '../runtime/session-usage.js'
import { formatTokens } from '../format/tokens.js'

export function usageLines(usage: SessionUsage, width: number): string[] {
  const number = (field: UsageField) => usage[field] === undefined ? '未提供'
    : usage.partial?.includes(field) && usage[field] === 0 ? '未确认'
    : (usage.partial?.includes(field) ? '≥' : '') + formatTokens(usage[field])
  const hit = usage.input !== undefined && usage.cacheRead !== undefined
    && !usage.partial?.includes('input') && !usage.partial?.includes('cacheRead') && usage.input + usage.cacheRead > 0
    ? Math.round(100 * usage.cacheRead / (usage.input + usage.cacheRead)) + '%' : '未提供'
  const lines: string[] = []
  const duration = (ms: number) => ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} m ${Math.round(ms % 60000 / 1000)} s`
  const tools = usage.tools ? `工具 ${usage.tools} 次 ${usage.toolMs === undefined ? '耗时未提供' : (usage.toolMsPartial ? '≥' : '') + duration(usage.toolMs)}` : undefined
  for (const part of [usage.turns === undefined ? '会话累计' : `${usage.turns} 轮`, tools, '输入 ' + number('input'), '输出 ' + number('output'), '缓存 ' + number('cacheRead'), '命中 ' + hit]) {
    if (!part) continue
    const last = lines.at(-1)
    if (last && visibleWidth(last + ' · ' + part) <= width) lines[lines.length - 1] = last + ' · ' + part
    else lines.push(truncateToWidth(part, width, ''))
  }
  return lines.map(line => ' '.repeat(Math.max(0, Math.floor((width - visibleWidth(line)) / 2))) + line)
}
