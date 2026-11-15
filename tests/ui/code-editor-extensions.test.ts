import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree, foldable } from '@codemirror/language'
import { describe, expect, it } from 'vitest'
import { codeLanguage } from '../../src/ui/code-editor-extensions.js'

function rState(text: string) {
  const state = EditorState.create({ doc: text, extensions: [codeLanguage('R')] })
  ensureSyntaxTree(state, state.doc.length, 100)
  return state
}

describe('R syntax folding', () => {
  it.each(['x <- "{\n}"', '# {\nx <- 1\n# }'])('does not fold braces inside literals or comments: %s', text => {
    const state = rState(text)
    expect(foldable(state, 0, state.doc.line(1).to)).toBeNull()
  })

  it('folds nested blocks past literal and commented braces', () => {
    const text = 'if (TRUE) { # }\n  x <- "}"\n  if (TRUE) {\n    print(x)\n  }\n}'
    const state = rState(text)
    expect(foldable(state, 0, state.doc.line(1).to)).toEqual({ from: text.indexOf('{') + 1, to: text.lastIndexOf('}') })
    expect(foldable(state, state.doc.line(3).from, state.doc.line(3).to)).toEqual({ from: state.doc.line(3).to, to: state.doc.line(5).to - 1 })
  })
})
