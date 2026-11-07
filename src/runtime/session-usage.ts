export type UsageField = 'input' | 'output' | 'cacheRead'
export type SessionUsage = Partial<Record<UsageField, number>> & { partial?: UsageField[] } & Partial<import('../shared/session-activity.js').SessionActivity>
const fields: UsageField[] = ['input', 'output', 'cacheRead']
/** Read the full current branch, including messages preceding compaction. Never add snapshots together. */
export function sessionUsage(branch: readonly unknown[], zeroesUnverified = false): SessionUsage {
  const totals: SessionUsage = {}, missing = new Set<UsageField>()
  for (const entry of branch as { type?: string; message?: { role?: string; stopReason?: string; usage?: Record<string, unknown> } }[]) {
    const message = entry.message
    if (entry.type !== 'message' || message?.role !== 'assistant') continue
    // All-zero SDK placeholders have no receipt, including error/aborted replies.
    // They add no numbers but must mark missing coverage alongside any known replies.
    const provided = fields.some(field => typeof message.usage?.[field] === 'number' && Number.isFinite(message.usage[field]) && message.usage[field]! > 0)
    for (const field of fields) {
      const value = message.usage?.[field]
      if (provided && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && Number.isSafeInteger((totals[field] ?? 0) + value)) {
        totals[field] = (totals[field] ?? 0) + value
        // SDK records cannot distinguish an explicit zero from a missing field filled with zero.
        if (zeroesUnverified && value === 0) missing.add(field)
      }
      else missing.add(field)
    }
  }
  const partial = fields.filter(field => missing.has(field) && totals[field] !== undefined)
  return { ...totals, ...(partial.length ? { partial } : {}) }
}
