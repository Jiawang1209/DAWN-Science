import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'
import type { SessionUsage, UsageField } from '../runtime/session-usage.js'

export function usageLines(usage: SessionUsage, width: number): string[] {
  const number = (field: UsageField) => usage[field] === undefined ? '未提供'
    : usage.partial?.includes(field) && usage[field] === 0 ? '未确认'
    : (usage.partial?.includes(field) ? '≥' : '') + usage[field].toLocaleString('en-US')
  const hit = usage.input !== undefined && usage.cacheRead !== undefined
    && !usage.partial?.includes('input') && !usage.partial?.includes('cacheRead') && usage.input + usage.cacheRead > 0
    ? Math.round(100 * usage.cacheRead / (usage.input + usage.cacheRead)) + '%' : '未提供'
  const lines: string[] = []
  for (const part of ['累计 token', '输入 ' + number('input'), '输出 ' + number('output'), '缓存读取 ' + number('cacheRead'), '命中 ' + hit]) {
    const last = lines.at(-1)
    if (last && visibleWidth(last + ' · ' + part) <= width) lines[lines.length - 1] = last + ' · ' + part
    else lines.push(truncateToWidth(part, width, ''))
  }
  return lines
}
