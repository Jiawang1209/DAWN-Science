import { parseRouteActionMessage } from '../protocol/analysis-route.js'

/** Enrichment must preserve the action marker as the actual first user line.
 * The runtime intentionally never searches arbitrary body text for a marker. */
export function withSessionContext(message: string, context: string | undefined): string {
  if (!context) return message
  if (!parseRouteActionMessage(message)) return `${context}\n\n${message}`
  const newline = message.indexOf('\n')
  const marker = newline < 0 ? message : message.slice(0, newline)
  const body = newline < 0 ? '' : message.slice(newline + 1)
  return `${marker}\n${context}\n\n${body}`
}
