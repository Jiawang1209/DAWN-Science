/** Give the DAWN editor a distinct newline while preserving Shell and IME keys. */
export function dawnEditorKey(event: Pick<KeyboardEvent, 'type' | 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'isComposing' | 'keyCode'>, editing: boolean): string | undefined {
  if (editing && event.type === 'keydown' && event.key.toLowerCase() === 'c' && event.metaKey && !event.ctrlKey && !event.isComposing) return '\x1b[99;6u'
  if (editing && event.type === 'keydown' && event.key === 'Enter' && (event.shiftKey || event.altKey)
    && !event.ctrlKey && !event.metaKey && !event.isComposing && event.keyCode !== 229) return '\x1b[13;2u'
  return undefined
}
