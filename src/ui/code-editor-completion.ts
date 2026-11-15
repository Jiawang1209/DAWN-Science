import { Prec } from '@codemirror/state'
import { keymap, type EditorView } from '@codemirror/view'
import { ensureSyntaxTree } from '@codemirror/language'
import { r } from '@codemirror/legacy-modes/mode/r'
import { acceptCompletion, autocompletion, completionStatus, type Completion, type CompletionContext } from '@codemirror/autocomplete'

const rFunctions = 'c seq rep length names head tail str summary print paste paste0 mean median sum min max sd var quantile is.na na.omit data.frame read.csv write.csv read.table write.table as.numeric as.character factor table plot hist boxplot lm cor set.seed rnorm runif lapply sapply apply library require'.split(' ')
const rGlobals: readonly Completion[] = [...new Set([
  ...(r.languageData?.autocomplete as string[] ?? []), ...rFunctions,
])].map(label => ({ label, type: rFunctions.includes(label) ? 'function' : 'keyword' }))

/** Local-only R candidates. Do not interpret strings, run kernels, or read other files. */
export function rCompletions(context: CompletionContext) {
  if (context.state.readOnly) return null
  // A cursor can jump beyond the current parse frontier. Never guess whether
  // that unparsed text is code or literal content, and bound synchronous work.
  const tree = ensureSyntaxTree(context.state, context.pos, 20)
  if (!tree) return null
  const node = tree.resolveInner(context.pos, -1)
  if (/string|comment/i.test(node.name)) return null
  const word = context.matchBefore(/[\w.]+/)
  if (!word && !context.explicit) return null
  const from = word?.from ?? context.pos
  // Members need package/runtime knowledge, which this local source does not have.
  if (/(?:\$|@|::)\s*$/.test(context.state.sliceDoc(Math.max(0, from - 24), from))) return null
  const options = new Map(rGlobals.map(option => [option.label, option]))
  // Bound work for large scripts. Names outside the parsed window can be added
  // later without making typing wait for a full-document parse.
  const start = Math.max(0, context.pos - 50_000)
  tree.iterate({ from: start, to: Math.min(context.state.doc.length, start + 100_000), enter(node) {
    if (!/^variableName(?:[._]|$)/.test(node.name) || (node.from === from && node.to === context.pos)) return
    const label = context.state.sliceDoc(node.from, node.to)
    if (label.length <= 128 && !options.has(label)) options.set(label, { label, type: 'variable', boost: 1 })
  } })
  return { from, options: [...options.values()], validFor: /^[\w.]*$/ }
}

/** A visible candidate owns Tab; otherwise the existing indent/snippet maps run. */
function acceptCodeCompletion(view: EditorView): boolean {
  if (view.composing) return false
  if (completionStatus(view.state) !== 'active') return false
  acceptCompletion(view)
  return true
}

export function codeCompletion(language: string) {
  if (language !== 'python' && language !== 'R') return []
  return [
    autocompletion({ ...(language === 'R' ? { override: [rCompletions] } : {}), activateOnTypingDelay: 150, interactionDelay: 0, maxRenderedOptions: 12 }),
    // Precede snippet navigation while a suggestion is visible, preserving the
    // snippet field keymap and ordinary Tab indentation when it is dismissed.
    Prec.highest(keymap.of([{ key: 'Tab', run: acceptCodeCompletion }])),
  ]
}
