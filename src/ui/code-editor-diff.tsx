import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { scriptEditDiff, scriptEditResult, type ScriptEditRequest } from './code-editor-ai.js'
import { Button } from './primitives.js'
import { 关闭图标 } from './icons.js'
import { t, tf } from './i18n/index.js'

/** Review changes to an existing draft; this surface never saves or executes code. */
export function CodeEditorDiff({ request, code, onApply, onClose, problem }: {
  request: ScriptEditRequest
  code: string
  onApply: (mode: 'document' | 'selection') => void
  onClose: () => void
  problem?: string | undefined
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<'document' | 'selection'>('document')
  useEffect(() => { setMode('document') }, [request.id, code])
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const node = dialog.current
    node?.showModal()
    return () => { node?.close(); if (opener?.isConnected) opener.focus() }
  }, [])
  const review = useMemo(() => {
    try {
      const candidate = scriptEditResult(request, code, mode)
      const lines = scriptEditDiff(request.baseline, candidate)
      return {
        lines,
        added: lines.filter(line => line.kind === 'add').length,
        deleted: lines.filter(line => line.kind === 'del').length,
        changed: candidate !== request.baseline,
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }, [request, code, mode])
  const failure = problem ?? review.error
  const unavailable = Boolean(failure || !review.changed || !((review.added ?? 0) + (review.deleted ?? 0)))
  const fromLine = request.selection.fromLine ?? request.baseline.slice(0, request.selection.from).split('\n').length
  const toLine = request.selection.toLine ?? fromLine + request.selection.text.split('\n').length - 1
  return createPortal(<dialog ref={dialog} className="code-editor-diff" aria-label={t("审阅脚本修改")}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <header>
      <strong>{t("审阅脚本修改")}</strong>
      <Button variant="ghost" size="icon" aria-label={t("收起差异预览")} onClick={onClose}><关闭图标 /></Button>
    </header>
    <div className="code-editor-diff-meta">
      <span>{tf("修改目标：{0}", request.label)}</span>
      <span>{tf("原选区：L{0}–{1}", fromLine, toLine)}</span>
    </div>
    <fieldset className="code-editor-diff-modes">
      <legend>{t("应用范围")}</legend>
      <label>
        <input type="radio" name={`script-edit-mode-${request.id}`} checked={mode === 'document'} onChange={() => setMode('document')} />
        {t("更新完整脚本")}
      </label>
      <label>
        <input type="radio" name={`script-edit-mode-${request.id}`} checked={mode === 'selection'} onChange={() => setMode('selection')} />
        {t("仅替换所选代码")}
      </label>
    </fieldset>
    {failure ? <p className="field-error" role="alert">{failure}</p> : null}
    {!failure && !review.changed ? <p role="status">{t("AI 回复与原脚本相同，没有可应用的修改")}</p> : null}
    {review.changed && review.lines ? <>
      <p className="code-editor-diff-meta">{tf("新增 {0} 行，删除 {1} 行", review.added!, review.deleted!)}</p>
      <div className="code-editor-diff-lines" tabIndex={0}>
        {review.lines.map((line, index) => <div key={index} className="code-editor-diff-line" data-kind={line.kind}>
          <span className="code-editor-diff-number">{line.oldLine ?? ''}</span>
          <span className="code-editor-diff-number">{line.newLine ?? ''}</span>
          <span className="code-editor-diff-sign">{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}</span>
          <code className="code-editor-diff-text">{line.text || ' '}</code>
        </div>)}
      </div>
    </> : null}
    <p className="hint">{t("确认差异后，修改将进入原脚本草稿；保存和运行仍由你操作。")}</p>
    <footer>
      <Button variant="ghost" size="sm" onClick={onClose}>{t("暂不应用")}</Button>
      <Button variant="primary" size="sm" disabled={unavailable} onClick={() => { if (!unavailable) onApply(mode) }}>{t("应用到原脚本")}</Button>
    </footer>
  </dialog>, document.body)
}
