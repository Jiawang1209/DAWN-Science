import { useEffect, useState } from 'react'
import type { ResponseOf } from '../protocol/index.js'
import { DeliveryPathSchema } from '../protocol/delivery.js'
import type { WorkbenchClient } from './client.js'
import { Button } from './primitives.js'
import { t, tf } from './i18n/index.js'

type Item = { path: string; kind: 'file' | 'dir' }
export function ProjectFilePicker(p: {
  sessionId: string; client: WorkbenchClient; selected: readonly string[]
  onAdd: (paths: string[]) => void; onClose: () => void
}) {
  const [directory, setDirectory] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [retry, setRetry] = useState(0)
  const [checked, setChecked] = useState<string[]>([])
  const [result, setResult] = useState<{ items: Item[]; note: string | undefined }>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let live = true
    setResult(undefined); setError(undefined)
    const load = async () => {
      if (search) {
        const r = await p.client.get<ResponseOf<'searchFiles'>>('searchFiles', { sessionId: p.sessionId, path: '', query: search })
        return { items: r.matches, note: r.truncated || r.unreadable ? t("搜索未覆盖全部文件，可进入目录继续查找。") : undefined }
      }
      const r = await p.client.get<ResponseOf<'listDirectory'>>('listDirectory', { sessionId: p.sessionId, path: directory })
      return { items: r.entries.map(entry => ({ path: [directory, entry.name].filter(Boolean).join('/'), kind: entry.kind })), note: r.omitted ? tf("本目录还有 {0} 项未列出，可按文件名搜索。", r.omitted) : undefined }
    }
    void load().then(r => { if (live) setResult(r) }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)) })
    return () => { live = false }
  }, [p.client, p.sessionId, directory, search, retry])
  const valid = result?.items.filter(item => DeliveryPathSchema.safeParse(item.path).success) ?? []
  const selected = new Set([...p.selected, ...checked])
  const atLimit = selected.size >= 60
  const enter = (path: string) => { setDirectory(path); setQuery(''); setSearch('') }
  return <section className="project-file-picker" aria-label={t("项目文件选择")}>
    <header className="project-file-picker-toolbar"><strong>{t("项目文件")}</strong><Button variant="ghost" size="sm" onClick={p.onClose}>{t("取消")}</Button></header>
    <form className="project-file-picker-toolbar" onSubmit={e => { e.preventDefault(); setSearch(query.trim()) }}>
      <input className="control" aria-label={t("按文件名搜索项目")} placeholder={t("按文件名搜索项目")} value={query} onChange={e => setQuery(e.target.value)} />
      <Button variant="outline" size="sm" type="submit">{t("搜索")}</Button>
    </form>
    <nav className="project-file-picker-toolbar" aria-label={t("项目目录导航")}>
      <Button variant="ghost" size="sm" onClick={() => enter('')}>{t("项目根目录")}</Button>
      {directory && !search ? <Button variant="ghost" size="sm" onClick={() => enter(directory.split('/').slice(0, -1).join('/'))}>{t("上一级")}</Button> : null}
      <span className="hint">{search ? tf("搜索：{0}", search) : directory || '/'}</span>
    </nav>
    {error ? <div role="alert"><p className="field-error">{error}</p><Button variant="outline" size="sm" onClick={() => setRetry(n => n + 1)}>{t("重试")}</Button></div> : !result ? <p role="status">{t("正在读取项目文件")}</p> : <>
      <div className="project-file-picker-list">
        {valid.map(item => item.kind === 'dir' ? <Button key={item.path} variant="ghost" size="sm" onClick={() => enter(item.path)}>{search ? item.path : item.path.split('/').pop()}</Button> : <label key={item.path} className="delivery-choice-row">
          <input type="checkbox" aria-label={item.path} checked={checked.includes(item.path) || p.selected.includes(item.path)} disabled={p.selected.includes(item.path) || (atLimit && !checked.includes(item.path))} onChange={e => setChecked(paths => e.target.checked ? [...paths, item.path] : paths.filter(path => path !== item.path))} />
          <span>{search ? item.path : item.path.split('/').pop()}</span>
        </label>)}
        {!valid.length ? <p className="hint">{t("没有可添加的文件")}</p> : null}
      </div>
      {result.note ? <p className="hint" role="status">{result.note}</p> : null}
    </>}
    <footer className="project-file-picker-toolbar">
      <span className="hint">{tf("已选 {0} 个文件", selected.size)} · {t("每份交付最多选择 60 个文件")}</span>
      <Button size="sm" variant="primary" disabled={!checked.length || selected.size > 60} onClick={() => p.onAdd(checked)}>{t("添加所选文件")}</Button>
    </footer>
  </section>
}
