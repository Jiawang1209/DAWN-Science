import { expect, it } from 'vitest'
import { dawnEditorKey } from '../../src/ui/terminal-keys.js'
it('distinguishes DAWN multiline Enter from send and leaves Normal and IME untouched', () => {
  const event = (extra: Partial<KeyboardEvent> = {}) => ({ type: 'keydown', key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, keyCode: 13, ...extra })
  expect(dawnEditorKey(event({ shiftKey: true }), true)).toBe('\x1b[13;2u')
  expect(dawnEditorKey(event({ altKey: true }), true)).toBe('\x1b[13;2u')
  for (const value of [event(), event({ shiftKey: true, isComposing: true }), event({ shiftKey: true, keyCode: 229 }), event({ shiftKey: true, ctrlKey: true }), event({ shiftKey: true, type: 'keyup' })]) expect(dawnEditorKey(value, true)).toBeUndefined()
  expect(dawnEditorKey(event({ key: 'c', metaKey: true }), true)).toBe('\x1b[99;6u')
  expect(dawnEditorKey(event({ key: 'c', metaKey: true }), false)).toBeUndefined()
  expect(dawnEditorKey(event({ shiftKey: true }), false)).toBeUndefined()
})
