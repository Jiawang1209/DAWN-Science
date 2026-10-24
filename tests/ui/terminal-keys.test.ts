import { expect, it } from 'vitest'
import { terminalSearchKey, dawnEditorKey } from '../../src/ui/terminal-keys.js'
it('distinguishes DAWN multiline Enter from send and leaves Normal and IME untouched', () => {
  const event = (extra: Partial<KeyboardEvent> = {}) => ({ type: 'keydown', key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, keyCode: 13, ...extra })
  expect(dawnEditorKey(event({ shiftKey: true }), true)).toBe('\x1b[13;2u')
  expect(dawnEditorKey(event({ altKey: true }), true)).toBe('\x1b[13;2u')
  for (const value of [event(), event({ shiftKey: true, isComposing: true }), event({ shiftKey: true, keyCode: 229 }), event({ shiftKey: true, ctrlKey: true }), event({ shiftKey: true, type: 'keyup' })]) expect(dawnEditorKey(value, true)).toBeUndefined()
  expect(dawnEditorKey(event({ key: 'c', metaKey: true }), true)).toBe('\x1b[99;6u')
  expect(dawnEditorKey(event({ key: 'c', metaKey: true }), false)).toBeUndefined()
  expect(dawnEditorKey(event({ shiftKey: true }), false)).toBeUndefined()
})

it('reserves content search and input history without swallowing Shell editing or IME', () => {
  const event = (extra: Partial<KeyboardEvent> = {}) => ({ type: 'keydown', key: 'f', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, keyCode: 70, ...extra })
  expect(terminalSearchKey(event({ metaKey: true }))).toBe('content')
  expect(terminalSearchKey(event({ ctrlKey: true }))).toBe('content')
  expect(terminalSearchKey(event({ key: 'r', ctrlKey: true }))).toBe('input')
  expect(terminalSearchKey(event({ ctrlKey: true, shiftKey: true }))).toBe('content')
  for (const e of [event(), event({ ctrlKey: true, isComposing: true }), event({ ctrlKey: true, keyCode: 229 }), event({ metaKey: true, type: 'keyup' }), event({ altKey: true, ctrlKey: true })]) expect(terminalSearchKey(e)).toBeUndefined()
})
