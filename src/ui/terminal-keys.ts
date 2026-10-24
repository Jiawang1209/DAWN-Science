/** Give the DAWN editor a distinct newline while preserving Shell and IME keys. */
export function dawnEditorKey(event: Pick<KeyboardEvent, 'type' | 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'isComposing' | 'keyCode'>, editing: boolean): string | undefined {
  if (editing && event.type === 'keydown' && event.key.toLowerCase() === 'c' && event.metaKey && !event.ctrlKey && !event.isComposing) return '\x1b[99;6u'
  if (editing && event.type === 'keydown' && event.key === 'Enter' && (event.shiftKey || event.altKey)
    && !event.ctrlKey && !event.metaKey && !event.isComposing && event.keyCode !== 229) return '\x1b[13;2u'
  return undefined
}

export type TerminalSearchRequest = { sequence: number; kind: 'content' | 'input' }
/** Only terminal-local shortcuts; composition and modified Shell editing remain intact. */
export function terminalSearchKey(event: Pick<KeyboardEvent, 'type' | 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'isComposing' | 'keyCode'>): TerminalSearchRequest['kind'] | undefined {
  if (event.type !== 'keydown' || event.isComposing || event.keyCode === 229 || event.altKey) return
  const key = event.key.toLowerCase()
  if (key === 'f' && (event.metaKey || event.ctrlKey)) return 'content'
  if (key === 'r' && event.ctrlKey && !event.metaKey && !event.shiftKey) return 'input'
  return
}
