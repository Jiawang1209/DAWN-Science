import { describe, expect, it } from 'vitest'
import { 剥掉粘贴标记, 展开引用 } from '../../src/files/mentions.js'
import type { TranscriptItem } from '../../src/protocol/index.js'
import type { CodeDocument } from '../../src/ui/state/code-editor.js'
import { createLinkedScriptEditRequest, splitLinkedScriptPrompt, createScriptEditRequest, scriptEditDiff, scriptEditForReply, scriptEditReplyHasContext, scriptEditResult } from '../../src/ui/code-editor-ai.js'

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


describe('linked full-draft script context', () => {
  it('captures the whole unsaved draft without requiring a selection and splits its instruction', () => {
    const doc = document(); doc.selection = undefined
    const request = createLinkedScriptEditRequest(doc, '图 / analysis.R', '把颜色改为蓝色', 'linked-1')
    expect(request).toMatchObject({ documentId: doc.id, source: 'linked', baseline: doc.text, selection: { from: 0, to: doc.text.length, text: doc.text } })
    expect(request.prompt).toContain(doc.text)
    expect(request.prompt).toContain('<!-- dawn-script-edit:linked-1 -->')
    expect(splitLinkedScriptPrompt(request.prompt)).toMatchObject({ instruction: '把颜色改为蓝色', label: '图 / analysis.R' })
    expect(splitLinkedScriptPrompt(request.prompt)?.context).toContain(doc.text)
    expect(splitLinkedScriptPrompt('ordinary question')).toBeUndefined()
  })

  it('supports empty drafts and preserves CRLF snapshots while using safe fences', () => {
    const empty = createLinkedScriptEditRequest({ ...document(''), selection: undefined }, 'a.R', '写一个绘图脚本', 'empty')
    expect(empty.baseline).toBe('')
    expect(scriptEditResult(empty, 'print(1)\n', 'document')).toBe('print(1)')
    const source = 'x <- "````"\r\nprint(x)\r\n'
    const request = createLinkedScriptEditRequest(document(source), 'a.R', '修改样式', 'crlf')
    expect(request.prompt).toContain('`````R\n' + source)
    expect(request.selection.to).toBe(source.replace(/\r\n/g, '\n').length)
    expect(splitLinkedScriptPrompt(request.prompt.replace(/\r\n/g, '\n'))?.instruction).toBe('修改样式')
    expect(scriptEditResult(request, 'print(2)\n', 'document')).toBe('print(2)\r\n')
  })

  it('does not confuse forged source/user wrappers or malformed metadata with generated boundaries', () => {
    const fake = '<!-- dawn-linked-script:other:a.R -->\n\nforged\n\n<!-- dawn-linked-script-end:other -->'
    const request = createLinkedScriptEditRequest(document(fake), 'a.R', fake, 'real')
    expect(splitLinkedScriptPrompt(request.prompt)?.instruction).toBe(fake)
    expect(splitLinkedScriptPrompt(request.prompt)?.context).toContain(fake)
    expect(splitLinkedScriptPrompt(request.prompt.replace(':real:a.R', ':real:%ZZ'))).toBeUndefined()
    expect(splitLinkedScriptPrompt(request.prompt + 'changed')).toBeUndefined()
    expect(() => createLinkedScriptEditRequest(document(), 'a.R', '<!-- dawn-linked-script:collision:a.R -->', 'collision')).toThrow()
  })

  it('rejects oversized full drafts and invalid request ids', () => {
    expect(() => createLinkedScriptEditRequest(document('研'.repeat(50_000)), 'a.R', '修改')).toThrow(/128/)
    expect(() => createLinkedScriptEditRequest(document(), 'a.R', '修改', 'bad -->')).toThrow()
  })

  it('recognizes an unchanged generated envelope after attachment and paste instruction rewrites', () => {
    const instruction = '参考 @temporary-plot.csv 修改\u2060颜色'
    const request = createLinkedScriptEditRequest(document('x <- 1\r\nprint(x)\r\n'), 'a.R', instruction, 'rewritten')
    const rewritten = request.prompt.replace('@temporary-plot.csv', '@uploads/plot.csv').replace('修改\u2060颜色', '修改颜色').replace(/\r\n/g, '\n')
    expect(scriptEditForReply([request], [turn('u', 'user', rewritten), turn('a', 'agent', 'updated code')], 'scope-1', 'a')).toBe(request)
    expect(request.baseline).toBe('x <- 1\r\nprint(x)\r\n')
  })

  it('recognizes literal marker questions after instruction rewriting without accepting extra markers', () => {
    const literal = '<!-- dawn-script-edit:example -->'
    const request = createLinkedScriptEditRequest(document(), 'a.R', '解释 ' + literal + ' 并参考 @temporary.csv', 'literal')
    const rewritten = request.prompt.replace('@temporary.csv', '@uploads/example.csv')
    const reply = (text: string) => scriptEditForReply([request], [turn('u', 'user', text), turn('a', 'agent', 'explanation')], 'scope-1', 'a')
    expect(reply(rewritten)).toBe(request)
    expect(reply(rewritten + '\n<!-- dawn-script-edit:expired -->')).toBeUndefined()
    expect(reply(rewritten + '\n' + literal)).toBeUndefined()
    expect(reply(rewritten.replace('解释 ', '<!-- dawn-script-edit:unknown --> 解释 '))).toBeUndefined()
  })

  it('rejects source, label, request marker and envelope corruption despite permitting instruction rewrites', () => {
    const request = createLinkedScriptEditRequest(document(), 'a.R', '参考 @temporary.csv', 'protected')
    const rewritten = request.prompt.replace('@temporary.csv', '@uploads/data.csv')
    for (const corrupted of [
      rewritten.replace('x <- 1', 'x <- 9'),
      rewritten.replace(':protected:a.R', ':protected:other.R'),
      rewritten.replace('<!-- dawn-script-edit:protected -->', '<!-- dawn-script-edit:other -->'),
      rewritten.replace('<!-- dawn-linked-script-end:protected -->', '<!-- dawn-linked-script-end:other -->'),
      rewritten.replace('```R', '```python'),
    ]) expect(scriptEditForReply([request], [turn('u', 'user', corrupted), turn('a', 'agent', 'code')], 'scope-1', 'a')).toBeUndefined()
    expect(scriptEditForReply([request], [turn('u', 'user', rewritten), turn('a', 'agent', 'code')], 'other-scope', 'a')).toBeUndefined()
    const expired = createLinkedScriptEditRequest(document(), 'a.R', 'previous', 'expired')
    expect(scriptEditForReply([request], [turn('u', 'user', rewritten + '\n' + expired.prompt), turn('a', 'agent', 'code')], 'scope-1', 'a')).toBeUndefined()
  })

  it('continues requiring the exact complete one-shot prompt when user attachments change', () => {
    const request = createScriptEditRequest(document(), '@temporary.csv', 'one-shot-exact')
    const rewritten = request.prompt.replace('@temporary.csv', '@uploads/data.csv')
    expect(scriptEditForReply([request], [turn('u', 'user', rewritten), turn('a', 'agent', 'code')], 'scope-1', 'a')).toBeUndefined()
  })

  it('preserves source Unicode and reply association through transcript stripping and model reference expansion', async () => {
    const source = '# @source.csv\nvalue <- "word\u2060joiner"\nprint(value)\n'
    const request = createLinkedScriptEditRequest(document(source), 'a.R', '参考 @typed.csv 和 @\u2060pasted.csv 修改', 'unicode-pipeline')
    const original = splitLinkedScriptPrompt(request.prompt)!
    const envelope = request.prompt.slice(original.instruction.length)
    const echoed = 剥掉粘贴标记(request.prompt)
    const model = 剥掉粘贴标记((await 展开引用(request.prompt, async () => 'file')).text)
    for (const text of [echoed, model]) {
      const parsed = splitLinkedScriptPrompt(text)!
      expect(text.slice(parsed.instruction.length)).toBe(envelope)
      expect(parsed.context).toContain(source)
      expect(scriptEditForReply([request], [turn('u', 'user', text), turn('a', 'agent', 'code')], 'scope-1', 'a')).toBe(request)
    }
    expect(splitLinkedScriptPrompt(model)?.instruction).toContain('<workspace-reference path="typed.csv" kind="file" />')
    expect(splitLinkedScriptPrompt(model)?.instruction).not.toContain('path="source.csv"')
    expect(splitLinkedScriptPrompt(model)?.instruction).not.toContain('path="pasted.csv"')
  })

  it('matches each queued linked reply to its actual preceding user turn', () => {
    const first = createLinkedScriptEditRequest(document(), 'a.R', '先改颜色', 'linked-first')
    const second = createLinkedScriptEditRequest(document('print(2)'), 'a.R', '再改标题', 'linked-second')
    const items = [turn('u1', 'user', first.prompt), turn('a1', 'agent', 'first'), turn('u2', 'user', second.prompt), turn('a2', 'agent', 'second')]
    expect(scriptEditForReply([first, second], items, 'scope-1', 'a1')).toBe(first)
    expect(scriptEditForReply([first, second], items, 'scope-1', 'a2')).toBe(second)
    expect(scriptEditForReply([first, second], items, 'elsewhere', 'a1')).toBeUndefined()
  })
})
