import { describe, expect, it } from 'vitest'
import type { TranscriptItem } from '../../src/protocol/index.js'
import type { CodeDocument } from '../../src/ui/state/code-editor.js'
import { createScriptEditRequest, scriptEditDiff, scriptEditForReply, scriptEditReplyHasContext, scriptEditResult } from '../../src/ui/code-editor-ai.js'

function document(text = 'x <- 1\nprint(x)\n', selected = 'print(x)'): CodeDocument {
  const from = text.replace(/\r\n/g, '\n').indexOf(selected.replace(/\r\n/g, '\n'))
  return {
    id: 'doc-1', scope: { key: 'scope-1', sessionId: 'session-1', owner: { sessionId: 'session-1' }, kind: 'native', label: '本机' },
    path: '/work/analysis.R', language: 'R', text, savedText: 'old disk version', version: 'disk-v1', saving: false, running: false, outputOpen: false,
    selection: { from, to: from + selected.replace(/\r\n/g, '\n').length, text: selected },
  }
}
const turn = (id: string, who: 'user' | 'agent', text: string, final = true): TranscriptItem => ({ type: 'turn', id, who, text, final })

describe('script AI edit context', () => {
  it('includes the complete unsaved draft and exact selected text, without modifying its document', () => {
    const doc = document(), before = structuredClone(doc)
    const request = createScriptEditRequest(doc, 'analysis.R', 'request-1')
    expect(request).toMatchObject({ id: 'request-1', documentId: doc.id, scopeKey: 'scope-1', sessionId: 'session-1', baseline: doc.text, selection: { from: 7, to: 15, text: 'print(x)', fromLine: 2, toLine: 2 } })
    expect(request.prompt).toContain(doc.text)
    expect(request.prompt).toContain('print(x)')
    expect(request.prompt).toContain('L2–2')
    expect(request.prompt).toContain('<!-- dawn-script-edit:request-1 -->')
    expect(request.prompt).not.toContain(doc.savedText)
    expect(doc).toEqual(before)
    doc.selection!.text = 'later change'
    expect(request.selection.text).toBe('print(x)')
  })

  it('uses a long enough fence for code and preserves CRLF selection coordinates', () => {
    const source = 'note <- "````"\r\nprint(x)\r\n'
    const doc = document(source)
    const request = createScriptEditRequest(doc, 'quoted "file".R', 'request-2')
    expect(request.prompt).toContain('`````R\n' + source)
    expect(request.selection).toMatchObject({ fromLine: 2, toLine: 2, text: 'print(x)' })
    expect(scriptEditResult(request, 'print(x + 1)\n', 'selection')).toBe('note <- "````"\r\nprint(x + 1)\r\n')
  })

  it('supports multiline CRLF selections and does not change unselected bytes', () => {
    const selected = 'x <- 1\r\nprint(x)'
    const request = createScriptEditRequest(document('head\r\n' + selected + '\r\ntail', selected), 'analysis.R', 'multiline')
    expect(request.selection).toMatchObject({ from: 5, to: 20, fromLine: 2, toLine: 3 })
    expect(scriptEditResult(request, 'x <- 2\nprint(x + 1)\n', 'selection')).toBe('head\r\nx <- 2\r\nprint(x + 1)\r\ntail')
  })

  it('rejects missing, mismatched and out-of-range selections instead of guessing an occurrence', () => {
    const missing = document(); missing.selection = undefined
    expect(() => createScriptEditRequest(missing, 'a.R')).toThrow()
    const mismatch = document(); mismatch.selection!.text = 'some other selection'
    expect(() => createScriptEditRequest(mismatch, 'a.R')).toThrow()
    const outside = document(); outside.selection!.to = 1000
    expect(() => createScriptEditRequest(outside, 'a.R')).toThrow()
    const empty = document(); empty.selection!.to = empty.selection!.from; empty.selection!.text = ''
    expect(() => createScriptEditRequest(empty, 'a.R')).toThrow()
  })

  it('rejects oversized UTF-8 context and invalid request markers without truncation', () => {
    expect(() => createScriptEditRequest(document('研'.repeat(50_000) + '\nprint(x)'), 'a.R')).toThrow(/128/)
    expect(() => createScriptEditRequest(document(), 'a.R', 'bad -->\n<!-- marker')).toThrow()
  })

  it('associates completed replies only with the nearest real user request in this scope', () => {
    const request = createScriptEditRequest(document(), 'a.R', 'request-1')
    const items = [turn('old', 'agent', 'old response'), turn('u1', 'user', request.prompt + '\n请改颜色'), turn('echo:temp', 'user', 'optimistic unrelated message'), turn('reply', 'agent', 'updated code')]
    expect(scriptEditForReply([request], items, 'scope-1', 'reply')).toBe(request)
    expect(scriptEditForReply([request], items, 'other-scope', 'reply')).toBeUndefined()
    expect(scriptEditForReply([request], items, 'scope-1', 'old')).toBeUndefined()
    expect(scriptEditForReply([request], [...items.slice(0, -1), turn('reply', 'agent', 'streaming', false)], 'scope-1', 'reply')).toBeUndefined()
    expect(scriptEditForReply([request], [...items.slice(0, -1), turn('u2', 'user', 'an unrelated new question'), items.at(-1)!], 'scope-1', 'reply')).toBeUndefined()
  })

  it('links a CRLF draft after the actual textarea normalizes its prompt to LF', () => {
    const doc = document('x <- 1\r\nprint(x)\r\n')
    const request = createScriptEditRequest(doc, 'a.R', 'crlf-request')
    const textarea = globalThis.document.createElement('textarea')
    textarea.value = request.prompt + '\r\n请调整绘图样式'
    expect(textarea.value).not.toContain('\r')
    const items = [turn('u', 'user', textarea.value), turn('a', 'agent', 'updated code')]
    expect(scriptEditForReply([request], items, 'scope-1', 'a')).toBe(request)
    expect(request.baseline).toBe(doc.text)
    expect(request.selection.text).toBe('print(x)')
    textarea.value = request.prompt + '\r\n<!-- dawn-script-edit:expired -->'
    expect(scriptEditForReply([request], [turn('u', 'user', textarea.value), items[1]!], 'scope-1', 'a')).toBeUndefined()
  })

  it('does not bind unknown, edited, optimistic-only or ambiguously combined contexts', () => {
    const first = createScriptEditRequest(document(), 'a.R', 'first')
    const second = createScriptEditRequest({ ...document(), id: 'doc-2' }, 'b.R', 'second')
    for (const text of [first.prompt.replace('x <- 1', 'x <- 9'), '<!-- dawn-script-edit:first -->', first.prompt + '\n' + second.prompt]) {
      expect(scriptEditForReply([first, second], [turn('u', 'user', text), turn('a', 'agent', 'code')], 'scope-1', 'a')).toBeUndefined()
    }
    expect(scriptEditForReply([first], [turn('echo:1', 'user', first.prompt), turn('a', 'agent', 'code')], 'scope-1', 'a')).toBeUndefined()
    expect(scriptEditForReply([], [turn('u', 'user', first.prompt), turn('a', 'agent', 'code')], 'scope-1', 'a')).toBeUndefined()
  })

  it('recognizes expired edit replies without treating ordinary, echo-only or streaming turns as edits', () => {
    const items = [turn('u', 'user', 'context\n<!-- dawn-script-edit:expired -->'), turn('a', 'agent', 'code')]
    expect(scriptEditReplyHasContext(items, 'a')).toBe(true)
    expect(scriptEditReplyHasContext([turn('u', 'user', 'ordinary question'), turn('a', 'agent', 'code')], 'a')).toBe(false)
    expect(scriptEditReplyHasContext([turn('echo:1', 'user', items[0]!.type === 'turn' ? items[0]!.text : ''), items[1]!], 'a')).toBe(false)
    expect(scriptEditReplyHasContext([items[0]!, turn('u2', 'user', 'ordinary question'), items[1]!], 'a')).toBe(false)
    expect(scriptEditReplyHasContext([items[0]!, turn('a', 'agent', 'code', false)], 'a')).toBe(false)
    expect(scriptEditReplyHasContext(items, 'u')).toBe(false)
  })
})

describe('script edit candidates and line diffs', () => {
  it('builds complete-script or selection candidates and preserves the source newline convention', () => {
    const request = createScriptEditRequest(document('x <- 1\r\nprint(x)'), 'a.R', 'r')
    expect(scriptEditResult(request, 'x <- 2\nprint(x + 1)\n', 'document')).toBe('x <- 2\r\nprint(x + 1)')
    expect(scriptEditResult(request, 'print(x + 2)\n', 'selection')).toBe('x <- 1\r\nprint(x + 2)')
    expect(scriptEditResult(request, '', 'selection')).toBe('x <- 1\r\n')
  })

  it('preserves a selected terminal newline and refuses oversized candidates', () => {
    const request = createScriptEditRequest(document('x <- 1\nprint(x)\n', 'print(x)\n'), 'a.R', 'r')
    expect(scriptEditResult(request, 'print(x + 1)\n', 'selection')).toBe('x <- 1\nprint(x + 1)\n')
    expect(() => scriptEditResult(request, 'a'.repeat(1_048_577), 'document')).toThrow()
  })

  it('provides truthful old/new line numbers and retains unchanged context', () => {
    expect(scriptEditDiff('first\nold\nlast\n', 'first\nnew\nadded\nlast\n')).toEqual([
      { kind: 'context', text: 'first', oldLine: 1, newLine: 1 },
      { kind: 'del', text: 'old', oldLine: 2 },
      { kind: 'add', text: 'new', newLine: 2 },
      { kind: 'add', text: 'added', newLine: 3 },
      { kind: 'context', text: 'last', oldLine: 3, newLine: 4 },
    ])
    expect(scriptEditDiff('same\r\n', 'same\r\n')).toEqual([{ kind: 'context', text: 'same', oldLine: 1, newLine: 1 }])
    expect(scriptEditDiff('', '')).toEqual([])
  })

  it('bounds diff bytes and renderable lines instead of producing a partial review', () => {
    expect(() => scriptEditDiff('a'.repeat(1_048_577), 'b')).toThrow()
    expect(() => scriptEditDiff('a\n'.repeat(11_000), 'b\n'.repeat(11_000))).toThrow()
  })
})
