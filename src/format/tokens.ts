/** Shared token units for the conversation and terminal views. */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const sign = n < 0 ? '-' : '', value = Math.abs(n)
  if (value < 1000) return `${sign}${value}`
  if (value < 1_000_000) return `${sign}${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `${sign}${(value / 1_000_000).toFixed(2)}M`
}
