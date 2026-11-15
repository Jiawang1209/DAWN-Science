import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import { ensureSyntaxTree } from '@codemirror/language'
import { describe, expect, it } from 'vitest'
import { codeLanguage } from '../../src/ui/code-editor-extensions.js'
import { rCompletions } from '../../src/ui/code-editor-completion.js'

function complete(text: string) {
  const state = EditorState.create({ doc: text, extensions: [codeLanguage('R')] })
  ensureSyntaxTree(state, state.doc.length, 100)
  return rCompletions(new CompletionContext(state, state.doc.length, true))
}

describe('local R completion', () => {
  it('does not suggest globals at an unparsed cursor inside a large raw literal', () => {
    const text = 'value <- 1\n'.repeat(2000) + 'text <- r"(first "\nmea'
    const state = EditorState.create({ doc: text, extensions: [codeLanguage('R')] })
    expect(rCompletions(new CompletionContext(state, state.doc.length, true))).toBeNull()
  })

  it('uses parsed script names without collecting words from literals or comments', () => {
    const result = complete('subject.mean <- 42\ntext <- "secret_name" # comment_name\nsub')!
    expect(result.options.some(c => c.label === 'subject.mean')).toBe(true)
    expect(result.options.some(c => c.label === 'secret_name' || c.label === 'comment_name')).toBe(false)
  })

  it.each(['frame$', 'frame$col', 'object@slot', 'stats::me', 'stats:::me'])('leaves runtime member lookup to a future source: %s', text => {
    expect(complete(text)).toBeNull()
  })

  it('does not leak identifiers from another document', () => {
    expect(complete('private_first <- 1\npri')!.options.some(c => c.label === 'private_first')).toBe(true)
    expect(complete('other_second <- 1\npri')!.options.some(c => c.label === 'private_first')).toBe(false)
  })
})
