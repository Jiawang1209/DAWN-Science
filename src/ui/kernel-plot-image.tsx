import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './primitives.js'
import { 关闭图标 } from './icons.js'
import { t } from './i18n/index.js'
import { kernelPlotFilename, kernelPlotSource, type KernelPlotMediaType } from './kernel-plot-model.js'

/** Shared by transcript output and the editor's conversation gallery. */
export function KernelPlotImage({ mediaType, data, imageId, caption, navigation }: {
  mediaType: KernelPlotMediaType
  data: string
  imageId: string
  caption?: string | undefined
  navigation?: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const [originalSize, setOriginalSize] = useState(false)
  const [exportStarted, setExportStarted] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const source = useMemo(() => kernelPlotSource(mediaType, data), [mediaType, data])
  useEffect(() => { setExportStarted(false) }, [imageId, data])
  useEffect(() => { if (expanded) dialog.current?.showModal() }, [expanded])
  const close = () => { dialog.current?.close(); setExpanded(false); trigger.current?.focus() }
  const exportImage = () => {
    const anchor = document.createElement('a')
    anchor.href = source
    anchor.download = kernelPlotFilename(mediaType, imageId)
    document.body.append(anchor)
    try { anchor.click(); setExportStarted(true) } finally { anchor.remove() }
  }
  const exportButton = () => <Button size="sm" variant="ghost" onClick={exportImage}>{t("导出图片")}</Button>
  return <div className="kernel-plot-image">
    <div className="kernel-plot-actions">{navigation}{exportButton()}</div>
    <Button ref={trigger} variant="ghost" size="inline" className="kernel-plot-trigger" aria-label={t("放大图形")} onClick={() => { setOriginalSize(false); setExpanded(true) }}>
      <img className="kout-img" src={source} alt={t("内核输出的图")} />
    </Button>
    {exportStarted ? <p className="kernel-plot-notice" role="status">{t("已发起图片导出")}</p> : null}
    {expanded ? createPortal(<dialog ref={dialog} className="kernel-plot-dialog" aria-label={t("图形预览")} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) close() }}>
      <header>
        <span>{caption ?? t("图形预览")}</span>
        <div className="kernel-plot-actions">
          <Button variant="ghost" size="sm" onClick={() => setOriginalSize(value => !value)}>{originalSize ? t("适应窗口") : t("实际尺寸")}</Button>
          {exportButton()}
          <Button variant="ghost" size="icon" aria-label={t("关闭图形预览")} onClick={close}><关闭图标 /></Button>
        </div>
      </header>
      <div className={`kernel-plot-stage${originalSize ? ' kernel-plot-original' : ''}`}><img src={source} alt={t("内核输出的图")} /></div>
      {navigation ? <div className="kernel-plot-navigation">{navigation}</div> : null}
      {exportStarted ? <p className="kernel-plot-notice" role="status">{t("已发起图片导出")}</p> : null}
    </dialog>, document.body) : null}
  </div>
}
