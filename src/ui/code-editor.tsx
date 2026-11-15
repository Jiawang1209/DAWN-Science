import { useEffect, useRef, useState, type RefObject } from 'react'
import { useStore } from '@nanostores/react'
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory } from '@codemirror/commands'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { codeHighlighting, codeLanguage, tidyCodeIndentation } from './code-editor-extensions.js'
import { codeCompletion } from './code-editor-completion.js'
import { Button, EmptyState } from './primitives.js'
import { 关闭图标 } from './icons.js'
import { KernelOutputRow } from './views.js'
import { KernelPlotGallery } from './kernel-plot-gallery.js'
import { isKernelPlotOutput } from './kernel-plot-model.js'
import { CodeEditorDiff } from './code-editor-diff.js'
import { t, tf } from './i18n/index.js'
import type { Cell } from '../protocol/notebook-cells.js'
import type { CodeDocument, CodeEditorStore } from './state/code-editor.js'

function CodeInput({ document, store, wordWrap, onSave, onRun, editor }: {
  document: CodeDocument; store: CodeEditorStore; wordWrap: boolean; onSave: () => void; onRun: () => void; editor: RefObject<EditorView | null>
}) {
  const host = useRef<HTMLDivElement>(null)
  const wrapping = useRef(new Compartment())
  const callbacks = useRef({ onSave, onRun }); callbacks.current = { onSave, onRun }
  useEffect(() => {
    if (!host.current) return
    const language = codeLanguage(document.language)
    const selection = document.selection
    const view = new EditorView({ parent: host.current, state: EditorState.create({
      doc: document.text,
      ...(selection ? { selection: EditorSelection.range(selection.from, selection.to) } : {}),
      extensions: [
        wrapping.current.of(wordWrap ? EditorView.lineWrapping : []),
        EditorState.lineSeparator.of(document.text.includes('\r\n') ? '\r\n' : '\n'),
        indentUnit.of(document.language === 'R' ? '  ' : '    '),
        EditorState.tabSize.of(document.language === 'R' ? 2 : 4),
        lineNumbers(), history(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(),
        bracketMatching(), closeBrackets(), foldGutter(), indentOnInput(), highlightSelectionMatches(),
        syntaxHighlighting(codeHighlighting), language, codeCompletion(document.language),
        EditorView.contentAttributes.of({ role: 'textbox', 'aria-label': t("脚本代码编辑器"), 'aria-multiline': 'true', spellcheck: 'false' }),
        keymap.of([
          { key: 'Mod-s', run: () => { if (!view.composing) callbacks.current.onSave(); return true } },
          { key: 'Mod-Enter', run: () => { if (!view.composing) callbacks.current.onRun(); return true } },
          { key: 'Mod-Shift-f', run: view => document.language === 'python' || document.language === 'R' ? tidyCodeIndentation(view) : false },
          indentWithTab, ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap,
        ]),
        EditorView.updateListener.of(update => {
          if (update.docChanged) store.edit(document.id, update.state.sliceDoc())
          if (update.docChanged || update.selectionSet) {
            const { from, to } = update.state.selection.main
            store.setSelection(document.id, { from, to, text: update.state.sliceDoc(from, to), fromLine: update.state.doc.lineAt(from).number, toLine: update.state.doc.lineAt(to).number })
          }
        }),
      ],
    }) })
    editor.current = view
    return () => { editor.current = null; view.destroy() }
    // The view owns its draft while mounted. Wrapping is reconfigured separately below;
    // changing a display preference must not reset undo or selection.
  }, [document.id, document.language, document.reloadRevision, store, editor])
  useEffect(() => {
    editor.current?.dispatch({ effects: wrapping.current.reconfigure(wordWrap ? EditorView.lineWrapping : []) })
  }, [wordWrap, editor])
  return <div className="code-editor-code" ref={host} />
}

export function CodeEditorPanel({ store, scopeKey, cells, onClose, onAsk, onInterrupt }: {
  store: CodeEditorStore
  scopeKey: string
  cells: readonly Cell[]
  onClose: () => void
  onAsk?: ((text: string) => void) | undefined
  onInterrupt?: ((language: 'python' | 'R') => Promise<unknown>) | undefined
}) {
  const docs = useStore(store.$documents), active = useStore(store.$active)
  const wordWrap = useStore(store.$wordWrap)
  const editPreview = useStore(store.$editPreview)
  const doc = docs[active[scopeKey] ?? '']
  const currentId = useRef(doc?.id); currentId.current = doc?.id
  const editor = useRef<EditorView | null>(null)
  const [path, setPath] = useState('analysis.py')
  const [notice, setNotice] = useState<string>()
  const [localError, setLocalError] = useState<string>()
  const [editApplyError, setEditApplyError] = useState<string>()
  useEffect(() => { setEditApplyError(undefined) }, [editPreview?.request.id, editPreview?.code])
  useEffect(() => {
    setPath(doc?.language === 'R' ? 'analysis.R' : doc?.language === 'python' ? 'analysis.py' : 'script.txt')
    setNotice(undefined); setLocalError(undefined)
  }, [doc?.id])
  useEffect(() => {
    if (editPreview && (editPreview.request.scopeKey !== scopeKey || editPreview.request.documentId !== doc?.id)) store.closeEditReview()
  }, [scopeKey, doc?.id, editPreview?.request.id, store])
  if (!doc) return <div className="code-editor-panel"><header className="code-editor-header"><span>{t("代码编辑")}</span><Button variant="ghost" size="icon" aria-label={t("收起代码编辑区")} onClick={onClose}><关闭图标 /></Button></header><EmptyState title={t("从当前对话或脚本预览打开代码")} /></div>
  const selected = Boolean(doc.selection && doc.selection.to > doc.selection.from)
  const language = doc.language === 'python' || doc.language === 'R' ? doc.language : undefined
  const runReason = doc.scope.kind !== 'native' || !doc.scope.sessionId ? t("当前会话不支持共享内核运行，可编辑和保存脚本") : !language ? t("选区运行支持 Python 和 R，其他脚本可编辑保存") : undefined
  const cell = doc.lastRun?.cellId ? cells.find(c => c.id === doc.lastRun!.cellId) : undefined
  const save = async () => {
    setLocalError(undefined); setNotice(undefined)
    try { await store.save(doc.id, path); if (currentId.current === doc.id) setNotice(t("已保存脚本")) } catch (error) { if (currentId.current === doc.id) setLocalError(error instanceof Error ? error.message : String(error)) }
  }
  const run = async () => {
    setLocalError(undefined); setNotice(undefined)
    try { await store.run(doc.id, doc.selection) } catch (error) { if (currentId.current === doc.id) setLocalError(error instanceof Error ? error.message : String(error)) }
  }
  const ask = () => {
    if (!doc.selection || !onAsk) return
    try {
      const request = store.prepareEdit(doc.id, path)
      if (doc.scope.kind === 'native' && doc.scope.sessionId) store.linkScript(doc.id, doc.path ?? path)
      onAsk(request.prompt)
      setLocalError(undefined)
      setNotice(t("完整草稿与选区已带入当前对话，填写修改要求后发送"))
    } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)) }
  }
  const applyAI = (mode: 'document' | 'selection') => {
    if (!editPreview) return
    try {
      store.applyEdit(editPreview.request.id, scopeKey, editPreview.code, mode, (before, after) => {
        const view = editor.current
        if (!view || view.composing || view.state.sliceDoc() !== before) throw new Error(t("编辑器内容已变化，请重新带入对话"))
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: after }, selection: { anchor: 0 }, annotations: isolateHistory.of('full'), userEvent: 'input.aiEdit' })
        view.focus()
      })
      setLocalError(undefined)
      setEditApplyError(undefined)
      setNotice(t("AI 修改已应用到原脚本草稿，可撤销；保存和运行仍由你操作"))
      queueMicrotask(() => editor.current?.focus())
    } catch (error) { setEditApplyError(error instanceof Error ? error.message : String(error)) }
  }
  return <section className="code-editor-panel" aria-label={t("代码编辑区")}>
    <header className="code-editor-header">
      <span className="code-editor-name">{doc.path?.split('/').pop() ?? t("未保存脚本")}{doc.text !== doc.savedText ? <span className="code-editor-dirty" aria-label={t("未保存修改")}> •</span> : null}</span>
      <div className="code-editor-actions">
        <Button size="sm" variant="ghost" className="code-editor-wrap" aria-pressed={wordWrap} onClick={() => store.$wordWrap.set(!wordWrap)}>{t("自动换行")}</Button>
        <Button size="sm" variant="ghost" disabled={!language} aria-description={t("按语法整理选中行或整个脚本的缩进（Mod+Shift+F）")} onClick={() => { if (editor.current) tidyCodeIndentation(editor.current) }}>{t("整理缩进")}</Button>
        <Button size="sm" variant="ghost" aria-label={t("保存脚本")} disabled={doc.saving} onClick={() => void save()}>{doc.saving ? t("保存中…") : t("保存")}</Button>
        <Button size="sm" variant="primary" aria-label={selected ? t("运行选区") : t("运行脚本")} disabled={doc.running || !!runReason || !doc.text.trim()} onClick={() => void run()}>{doc.running ? t("运行中…") : selected ? t("运行选区") : t("运行")}</Button>
        <Button size="icon" variant="ghost" aria-label={t("收起代码编辑区")} onClick={onClose}><关闭图标 /></Button>
      </div>
    </header>
    <div className="code-editor-location"><span>{doc.scope.label}</span><span title={doc.path}>{doc.path ?? t("来自当前对话")}</span><span>{doc.language === 'python' ? t("Python · 4 空格") : doc.language === 'R' ? t("R · 2 空格") : doc.language}</span></div>
    {!doc.path ? <label className="code-editor-save-path">
      {t("脚本保存路径")}
      <input className="control" aria-label={t("脚本保存路径")} value={path} onChange={e => setPath(e.target.value)} placeholder="analysis.py" />
    </label> : null}
    {runReason ? <p className="code-editor-note">{runReason}</p> : null}
    {(localError ?? doc.error) ? <div className="code-editor-note"><p className="field-error" role="alert">{localError ?? doc.error}</p>{doc.path ? <Button size="sm" variant="ghost" onClick={() => void store.reload(doc.id).then(() => { if (currentId.current === doc.id) { setLocalError(undefined); setNotice(undefined) } }).catch(error => { if (currentId.current === doc.id) setLocalError(String(error)) })}>{t("放弃草稿并重读")}</Button> : null}</div> : null}
    <CodeInput document={doc} store={store} wordWrap={wordWrap} editor={editor} onSave={() => void save()} onRun={() => void run()} />
    {selected && onAsk ? <div className="code-editor-selection"><span>{tf("已选 {0} 个字符", doc.selection!.text.length)}</span><Button variant="ghost" size="sm" onClick={ask}>{t("带入对话")}</Button></div> : null}
    <footer className="code-editor-footer"><span>{doc.text === doc.savedText ? t("已保存") : t("未保存修改")}</span><Button size="sm" variant="ghost" aria-expanded={doc.outputOpen} onClick={() => store.toggleOutput(doc.id)}>{t("运行结果")}</Button></footer>
    {notice ? <p className="code-editor-note" role="status">{notice}</p> : null}
    {editPreview && editPreview.request.scopeKey === scopeKey && editPreview.request.documentId === doc.id ? <CodeEditorDiff key={editPreview.request.id} request={editPreview.request} code={editPreview.code} targetLabel={doc.path ?? editPreview.request.label} onApply={applyAI} onClose={() => store.closeEditReview()} problem={store.editProblem(editPreview.request.id, scopeKey) ?? editApplyError} /> : null}
    {doc.lastRun && doc.lastRun.snapshot !== doc.text ? <p className="code-editor-note code-editor-stale" role="status">{t("代码已修改，结果待更新")}</p> : null}
    {doc.outputOpen ? <section className="code-editor-output" aria-label={t("运行结果")}>
      <header><span>{doc.lastRun?.selection ? t("选区执行") : t("脚本执行")}</span>{doc.running && doc.lastRun && onInterrupt ? <Button size="sm" onClick={() => void onInterrupt(doc.lastRun!.language).catch(error => { if (currentId.current === doc.id) setLocalError(String(error)) })}>{t("中断")}</Button> : null}</header>
      {doc.running ? <p role="status">{t("正在当前会话内核中执行…")}</p> : null}
      {!doc.lastRun ? <p className="hint">{t("运行后在这里查看输出")}</p> : null}
      <KernelPlotGallery key={scopeKey} cells={cells} />
      {cell?.outputs.filter(output => !isKernelPlotOutput(output)).map(output => <KernelOutputRow key={output.id} item={output} interrupted={cell.interrupted === true} />)}
      {cell?.status === 'error' ? <p className="field-error">{t("执行失败，请检查当前会话中的错误详情")}</p> : null}
      {cell?.interrupted ? <p>{t("（已中断）")}</p> : null}
      {cell?.status === 'ok' && !cell.outputs.length ? <p className="hint">{t("执行完成，无输出")}</p> : null}
      {!doc.running && doc.lastRun?.cellId && !cell ? <p className="hint">{t("执行已记录，正在同步输出")}</p> : null}
    </section> : null}
  </section>
}
