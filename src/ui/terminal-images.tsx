import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WorkbenchClient } from './client.js'
import type { TerminalAgentState } from '../protocol/terminal.js'
import type { ResponseOf } from '../protocol/index.js'
import { TerminalPane } from './terminal.js'
import { Button } from './primitives.js'
import type { TerminalPicture } from './terminal-image-decorations.js'
import { t, tf } from './i18n/index.js'

type Attachments = ResponseOf<'getTerminalAgentAttachments'>
function pictureFiles(data: DataTransfer | null): File[] {
  if (!data) return []
  const files = [...Array.from(data.files ?? []), ...Array.from(data.items ?? []).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter((f): f is File => !!f)]
  return [...new Map(files.filter(f => f.type.startsWith('image/')).map(f => [`${f.name}|${f.size}|${f.type}`, f])).values()]
}
async function encode(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error(t("图片超过 10 MB，请先缩小"))
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(t("读不了这张图片"))); reader.readAsDataURL(file)
  })
  return { name: (file.name || t("粘贴的图片")).slice(0, 120), mimeType: file.type, data: url.slice(url.indexOf(',') + 1) }
}

export function TerminalImageShell({ client, terminalId, state, chunks, onInput, onResize }: {
  client: Pick<WorkbenchClient, 'get'>; terminalId: string; state: TerminalAgentState; chunks: readonly string[]
  onInput: (data: string) => void; onResize?: ((cols: number, rows: number) => void) | undefined
}) {
  const [pending, setPending] = useState<NonNullable<Attachments['pending']>>([])
  const [working, setWorking] = useState(false), [error, setError] = useState('')
  const [preview, setPreview] = useState<TerminalPicture>()
  const active = useRef(true), busy = useRef(false), revision = useRef<number | undefined>(undefined), generation = useRef(0)
  const root = useRef<HTMLDivElement>(null)
  const update = (result: Attachments) => { revision.current = result.revision; if (result.pending) setPending(result.pending) }
  useEffect(() => {
    active.current = true; revision.current = undefined; generation.current++; setPending([]); setError(''); setPreview(undefined)
    let live = true, reading = false
    const read = async () => {
      if (reading || busy.current || state.mode !== 'dawn' || !state.sessionId) return
      reading = true
      try {
        const result = await client.get<Attachments>('getTerminalAgentAttachments', { terminalId, ...(revision.current === undefined ? {} : { afterRevision: revision.current }) })
        if (live && !busy.current && result.sessionId === state.sessionId) update(result)
      } catch (e) { if (live) setError(e instanceof Error ? e.message : String(e)) }
      finally { reading = false }
    }
    void read(); const timer = setInterval(() => { void read() }, 500)
    return () => { live = false; active.current = false; generation.current++; clearInterval(timer) }
  }, [client, terminalId, state.mode, state.sessionId])
  const readImage = useCallback((imageId: string) => client.get<TerminalPicture>('getTerminalAgentImage', { terminalId, imageId }), [client, terminalId])
  const add = async (files: File[]) => {
    if (busy.current || state.mode !== 'dawn' || !state.sessionId) return
    const gen = generation.current, sessionId = state.sessionId
    busy.current = true; setWorking(true); setError('')
    try {
      const images = await Promise.all(files.map(encode))
      if (!active.current || gen !== generation.current) return
      const result = await client.get<Attachments>('updateTerminalAgentAttachments', { terminalId, sessionId, action: 'add', images })
      if (active.current && gen === generation.current) update(result)
    } catch (e) { if (active.current && gen === generation.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { busy.current = false; if (active.current) { setWorking(false); root.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus() } }
  }
  const remove = async (imageId: string) => {
    const gen = generation.current
    try {
      const result = await client.get<Attachments>('updateTerminalAgentAttachments', { terminalId, sessionId: state.sessionId!, action: 'remove', imageId })
      if (active.current && gen === generation.current) update(result)
    } catch (e) { if (active.current && gen === generation.current) setError(e instanceof Error ? e.message : String(e)) }
  }
  const openPending = async (imageId: string) => {
    const gen = generation.current
    try { const image = await readImage(imageId); if (active.current && gen === generation.current) setPreview(image) }
    catch (e) { if (active.current && gen === generation.current) setError(e instanceof Error ? e.message : String(e)) }
  }
  return <div className="terminal-image-shell" ref={root}
    onPasteCapture={event => {
      const files = pictureFiles(event.clipboardData)
      if (!files.length) return
      event.stopPropagation()
      if (state.mode === 'dawn') { event.preventDefault(); void add(files) }
    }}
    onDragOverCapture={event => { if (Array.from(event.dataTransfer.items ?? []).some(i => i.kind === 'file')) event.preventDefault() }}
    onDropCapture={event => {
      const files = pictureFiles(event.dataTransfer)
      if (!files.length) return
      event.preventDefault(); event.stopPropagation()
      if (state.mode === 'dawn') void add(files)
    }}
    onKeyDownCapture={event => { if (busy.current && event.key === 'Enter') { event.preventDefault(); event.stopPropagation() } }}>
    <div className="terminal-image-screen"><TerminalPane agentEditing={state.mode === 'dawn'} chunks={chunks} onResize={onResize} readImage={readImage} onOpenImage={setPreview}
      onInput={data => { if (!(busy.current && /[\r\n]/.test(data))) onInput(data) }} /></div>
    {pending.length || working || error ? <div className="terminal-attachment-tray" aria-label={t("终端待发图片")}>
      {pending.map(image => <div key={image.id} className="terminal-attachment">
        <Button variant="ghost" size="inline" aria-label={tf("放大 {0}", image.name)} onClick={() => void openPending(image.id)}><img src={image.thumbnail} alt={image.name} /></Button>
        <span>{image.name}</span>
        <Button variant="ghost" size="icon" disabled={working} aria-label={tf("移除 {0}", image.name)} onClick={() => void remove(image.id)}>×</Button>
      </div>)}
      {working ? <span role="status">{t("正在准备图片，稍后按回车发送")}</span> : pending.length ? <span className="hint">{t("随下一句话发送")}</span> : null}
      {error ? <span role="alert" className="terminal-image-error">{error}</span> : null}
    </div> : null}
    {preview ? <TerminalImagePreview image={preview} onClose={() => setPreview(undefined)} /> : null}
  </div>
}

function TerminalImagePreview({ image, onClose }: { image: TerminalPicture; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => { const before = document.activeElement as HTMLElement | null; close.current?.focus(); return () => before?.focus() }, [])
  return createPortal(<div className="terminal-image-backdrop" role="dialog" aria-modal="true" aria-label={t("图片预览")}
    onClick={e => { if (e.target === e.currentTarget) onClose() }}
    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } if (e.key === 'Tab') { e.preventDefault(); close.current?.focus() } }}>
    <div className="terminal-image-preview">
      <header><strong>{image.name}</strong><Button variant="ghost" size="icon" ref={close} aria-label={t("关闭图片预览")} onClick={onClose}>×</Button></header>
      <img src={image.dataUrl} alt={image.name} />
    </div>
  </div>, document.body)
}
