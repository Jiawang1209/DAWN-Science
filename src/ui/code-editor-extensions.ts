import { Transaction } from '@codemirror/state'
import { type EditorView } from '@codemirror/view'
import { isolateHistory } from '@codemirror/commands'
import { HighlightStyle, StreamLanguage, ensureSyntaxTree, foldService, indentRange, matchBrackets, syntaxTree } from '@codemirror/language'
import { python } from '@codemirror/lang-python'
import { r } from '@codemirror/legacy-modes/mode/r'
import { tags } from '@lezer/highlight'

export const codeHighlighting = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.bool, tags.null, tags.atom], class: 'cm-code-keyword' },
  { tag: [tags.string, tags.special(tags.string)], class: 'cm-code-string' },
  { tag: tags.number, class: 'cm-code-number' },
  { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], class: 'cm-code-function' },
  { tag: [tags.typeName, tags.className], class: 'cm-code-type' },
  { tag: tags.comment, class: 'cm-code-comment' },
])

// The legacy R mode otherwise proposes column zero inside a multiline string.
// Keep the mode's tokenizer state so both manual and on-input indentation leave
// literal content intact, including the line with its closing quote.
const rBaseTokenizer = (r.startState!(2) as { tokenize: unknown }).tokenize
type RTokenState = { tokenize: unknown; rawStringEnd?: string; afterIdent: boolean }
const rLanguage = StreamLanguage.define({
  ...r,
  indent: (state, textAfter, context) => {
    const tokenState = state as RTokenState
    return tokenState.rawStringEnd || tokenState.tokenize !== rBaseTokenizer ? null : r.indent!(state, textAfter, context)
  },
  token: (stream, state) => {
    const tokenState = state as RTokenState
    if (!tokenState.rawStringEnd && tokenState.tokenize === rBaseTokenizer) {
      const rawStart = stream.match(/^[rR](["'])(-*)([([{])/, false)
      if (Array.isArray(rawStart)) {
        const from = stream.pos
        // Let the original mode update block/continuation context for this
        // expression's first token, then consume the complete raw delimiter.
        r.token(stream, state)
        stream.pos = from + rawStart[0].length
        const closing = rawStart[3] === '(' ? ')' : rawStart[3] === '[' ? ']' : '}'
        tokenState.rawStringEnd = `${closing}${rawStart[2]}${rawStart[1]}`
      }
    }
    if (tokenState.rawStringEnd) {
      // R raw strings allow quotes and backslashes verbatim. Only the paired
      // bracket, exact dash sequence, and opening quote terminate the literal.
      const end = stream.string.indexOf(tokenState.rawStringEnd, stream.pos)
      if (end < 0) stream.skipToEnd()
      else {
        stream.pos = end + tokenState.rawStringEnd.length
        delete tokenState.rawStringEnd
      }
      tokenState.afterIdent = false
      return 'string'
    }
    const token = r.token(stream, state)
    return (token === 'variable' || token === 'builtin') && stream.match(/^\s*\(/, false) ? 'functionName' : token
  },
  tokenTable: { functionName: tags.function(tags.variableName) },
})

const rFolding = foldService.of((state, from, to) => {
  const line = state.doc.sliceString(from, to)
  for (let offset = 0; offset < line.length; offset++) {
    if (!'{(['.includes(line[offset]!)) continue
    const position = from + offset
    const node = syntaxTree(state).resolveInner(position, 1)
    if (/string|comment/i.test(node.name)) continue
    const match = matchBrackets(state, position, 1)
    if (match?.matched && match.end && match.end.from > to) return { from: position + 1, to: match.end.from }
  }
  return null
})

export function codeLanguage(language: string) {
  return language === 'python' ? python() : language === 'R' ? [rLanguage, rFolding] : []
}

/** Use the language's indentation service; change leading whitespace only. */
export function tidyCodeIndentation(view: EditorView): boolean {
  if (view.composing || view.state.readOnly) return true
  const { state } = view
  // Parsing is bounded. Leave the draft alone rather than reindent an unparsed
  // tail (which could be part of a multiline literal in a large document).
  if (!ensureSyntaxTree(state, state.doc.length, 100)) return true
  const selection = state.selection.main
  const from = selection.empty ? 0 : state.doc.lineAt(selection.from).from
  // A selection ending at the next line's start does not include that line.
  const to = selection.empty ? state.doc.length : Math.max(selection.from, selection.to - 1)
  const changes = indentRange(state, from, to)
  if (!changes.empty) view.dispatch({
    changes,
    annotations: [Transaction.userEvent.of('input.indent'), isolateHistory.of('full')],
  })
  return true
}
