import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './primitives.js'
import { PreviewCloseButton } from './preview-close-button.js'
import { PdfCanvas } from './pdf-canvas.js'
import { PDF文件图标, 图片文件图标, 返回图标, 下载图标, 关闭图标, 放大预览图标, 外部打开图标 } from './icons.js'
import { t, tf } from './i18n/index.js'
import type { FileContent } from './files.js'

type VisualContent = Extract<FileContent, { kind: 'image' | 'pdf' }>
export type PreviewNavigation = { onBack: () => void; onLocate: () => void }
export function VisualFilePreview({ path, content, onOpenExternally, onDownload, onDelete, 进废纸篓, navigation, fitContainer = false, onClosePreview }: {
  path: string; content: VisualContent; onOpenExternally?: ((path: string) => void) | undefined
  onDownload?: ((path: string) => void) | undefined
  onDelete?: ((path: string) => void) | undefined
  进废纸篓?: boolean | undefined
  navigation?: PreviewNavigation | undefined
  fitContainer?: boolean
  onClosePreview?: (() => void) | undefined
}) {
  const [expanded, setExpanded] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRoot = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const name = path.split('/').pop() ?? path
  useEffect(() => { if (expanded) dialog.current?.showModal() }, [expanded])
  useEffect(() => { setExpanded(false); setMenu(false) }, [path])
  useEffect(() => {
    if (!menu) return
    menuRoot.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const outside = (e: PointerEvent) => { if (!menuRoot.current?.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [menu])
  const close = () => { dialog.current?.close(); setExpanded(false); trigger.current?.focus() }
  const image = (large = false) => content.kind === 'pdf'
    ? <PdfCanvas base64={content.base64} path={path} expanded={large} fitContainer={fitContainer && !large} />
    : <div className="visual-preview-stage"><img className="preview-img" src={`data:${content.mediaType};base64,${content.base64}`} alt={tf("预览：{0}", path)} /></div>
  return <div className="preview visual-preview">
    <header className="preview-head visual-preview-head">
      {navigation ? <Button variant="ghost" size="icon" aria-label={t("回到清单")} onClick={navigation.onBack}><返回图标 /></Button> : null}
      <span className="visual-file-icon">{content.kind === 'pdf' ? <PDF文件图标 /> : <图片文件图标 />}</span>
      <span className="name">{name}</span>
      <div className="visual-preview-actions">
        <Button ref={trigger} variant="ghost" size="icon" aria-label={t("放大预览")} onClick={() => setExpanded(true)}><放大预览图标 /></Button>
        {onOpenExternally ? <Button variant="ghost" size="icon" aria-label={t("用系统程序打开")} onClick={() => onOpenExternally(path)}><外部打开图标 /></Button> : null}
        {onDownload ? <Button variant="ghost" size="icon" aria-label={t("下载")} onClick={() => onDownload(path)}><下载图标 /></Button> : null}
        {navigation || onDelete ? <div className="visual-preview-more" ref={menuRoot}>
          <Button variant="ghost" size="icon" aria-label={t("文件操作")} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(v => !v)}>⋯</Button>
          {menu ? <div className="visual-preview-menu" role="menu" onKeyDown={e => { if (e.key === 'Escape') { setMenu(false); menuRoot.current?.querySelector<HTMLButtonElement>('button')?.focus() }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]; const n = items.indexOf(document.activeElement as HTMLButtonElement); items[(n + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus() } }}>
            {navigation ? <Button variant="ghost" size="sm" role="menuitem" onClick={() => { setMenu(false); navigation.onLocate() }}>{t("在文件里定位")}</Button> : null}
            {onDelete ? <Button variant="ghost" size="sm" role="menuitem" onClick={() => { setMenu(false); onDelete(path) }}>{进废纸篓 ? t("移到废纸篓") : t("永久删除")}</Button> : null}
          </div> : null}
        </div> : null}
        {onClosePreview ? <PreviewCloseButton onClose={onClosePreview} /> : null}
      </div>
    </header>
    {image()}
    {expanded ? createPortal(<dialog ref={dialog} className="visual-preview-dialog" aria-label={name} onCancel={e => { e.preventDefault(); close() }} onClick={e => { if (e.target === e.currentTarget) close() }}>
      <header><span>{name}</span><Button variant="ghost" size="icon" aria-label={t("关闭预览")} onClick={close}><关闭图标 /></Button></header>
      {image(true)}
    </dialog>, document.body) : null}
  </div>
}
