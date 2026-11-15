import { useState } from 'react'
import { useStore } from '@nanostores/react'
import type { CodeEditorStore, EditorScope } from './state/code-editor.js'
import { Button } from './primitives.js'
import { t, tf } from './i18n/index.js'

/** Entering an editor is the intent signal; no extra association click is required. */
export function followEditorScript(store: CodeEditorStore, scopeKey: string) {
  const doc = store.current(scopeKey)
  if (!doc || doc.scope.kind !== 'native' || !doc.scope.sessionId) return
  store.linkScript(doc.id, doc.path ?? (doc.language === 'R' ? 'analysis.R' : doc.language === 'python' ? 'analysis.py' : 'script.txt'))
}

/** A late file read must not undo an explicit end of script mode. */
export async function openEditorFile(store: CodeEditorStore, scope: EditorScope, path: string, isCurrent: () => boolean): Promise<boolean> {
  const previousLink = store.$linkedScripts.get()[scope.key]
  const id = await store.openFile(scope, path)
  if (!isCurrent() || store.current(scope.key)?.id !== id || store.$linkedScripts.get()[scope.key] !== previousLink) return false
  followEditorScript(store, scope.key)
  return true
}

/** Association survives closing the editor; entering another script editor replaces its target. */
export function LinkedScript({ store, scopeKey, onOpen, onEnd, placement = 'editor' }: { store: CodeEditorStore; scopeKey: string; onOpen: () => void; onEnd?: (() => void) | undefined; placement?: 'editor' | 'header' | undefined }) {
  const links = useStore(store.$linkedScripts)
  const docs = useStore(store.$documents)
  const [error, setError] = useState<string>()
  const link = links[scopeKey]
  if (!link) return null
  const doc = docs[link.documentId]
  const label = doc?.path ?? link.label
  return <div className={`linked-script linked-script--${placement}`} aria-label={t("会话关联脚本")} aria-description={t("发送时附上最新草稿 · 修改先审阅")}>
    {placement === 'editor' ? <span>{t("正在修改")}</span> : null}
    <Button className="linked-script-file" variant="ghost" size="inline" aria-label={tf("打开关联脚本：{0}", label)} onClick={() => {
      try { store.openLinkedScript(scopeKey); setError(undefined); onOpen() }
      catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    }}>{label.split(/[\\/]/).pop() || t("未保存脚本")}</Button>
    {placement === 'editor' ? <Button variant="ghost" size="inline" onClick={() => { store.unlinkScript(scopeKey); setError(undefined); onEnd?.() }}>{t("结束脚本联动")}</Button> : null}
    {error ? <p className="field-error" role="alert">{error}</p> : null}
  </div>
}
