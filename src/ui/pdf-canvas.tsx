import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { Button, Loader } from './primitives.js'
import { t, tf } from './i18n/index.js'

/** Only the selected page is rendered; file changes release document, worker and pending draw. */
export function PdfCanvas({ base64, path, expanded = false, fitContainer = false }: { base64: string; path: string; expanded?: boolean; fitContainer?: boolean }) {
  const [doc, setDoc] = useState<PDFDocumentProxy>()
  const [page, setPage] = useState(1)
  const [error, setError] = useState(false)
  const [drawn, setDrawn] = useState<{ doc: PDFDocumentProxy; page: number; width: number; height: number }>()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const painted = drawn?.doc === doc && drawn?.page === page && drawn?.width === size.width && drawn?.height === size.height
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let alive = true
    let cleanup: (() => Promise<void>) | undefined
    setDoc(undefined); setPage(1); setError(false); setDrawn(undefined)
    void import('./pdf-engine.js').then(({ loadPdf }) => {
      if (!alive) return
      const loaded = loadPdf(base64)
      cleanup = loaded.destroy
      return loaded.task.promise.then(pdf => { if (alive) setDoc(pdf) })
    }).catch(() => { if (alive) setError(true) })
    return () => { alive = false; void cleanup?.().catch(() => {}) }
  }, [base64])
  useEffect(() => {
    const measure = () => {
      const next = { width: stage.current?.clientWidth ?? 0, height: fitContainer ? stage.current?.clientHeight ?? 0 : window.innerHeight * (expanded ? .76 : .58) }
      setSize(prev => prev.width === next.width && prev.height === next.height ? prev : next)
    }
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure)
    if (stage.current) observer?.observe(stage.current)
    window.addEventListener('resize', measure)
    measure()
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [expanded, fitContainer])
  useEffect(() => {
    if (!doc || !canvas.current || !size.width || !size.height) return
    let alive = true
    let draw: RenderTask | undefined
    setDrawn(undefined)
    void doc.getPage(page).then(async pdfPage => {
      if (!alive || !canvas.current) return
      const original = pdfPage.getViewport({ scale: 1 })
      const scale = Math.min(size.width / original.width, size.height / original.height)
      const viewport = pdfPage.getViewport({ scale })
      // Bound large-page/HiDPI memory while keeping normal Retina figures sharp.
      const ratio = Math.min(window.devicePixelRatio || 1, 3, Math.sqrt(16_000_000 / (viewport.width * viewport.height)))
      const el = canvas.current
      el.width = Math.ceil(viewport.width * ratio); el.height = Math.ceil(viewport.height * ratio)
      el.style.width = `${viewport.width}px`; el.style.height = `${viewport.height}px`
      draw = pdfPage.render({ canvas: el, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      await draw.promise
      if (alive) setDrawn({ doc, page, width: size.width, height: size.height })
    }).catch(err => { if (alive && err?.name !== 'RenderingCancelledException') setError(true) })
    return () => { alive = false; draw?.cancel() }
  }, [doc, page, size])
  return <div className="pdf-figure">
    <div className="visual-preview-stage" ref={stage}>
      {error ? <p className="caveat" role="alert">{t("无法预览 PDF，请用系统程序打开。")}</p> : <>
        {!painted ? <Loader label={tf("预览：{0}", path)} /> : null}
        <canvas ref={canvas} role="img" aria-label={tf("预览：{0}", path)} data-page={page} data-rendered={painted} hidden={!painted} />
      </>}
    </div>
    {doc && doc.numPages > 1 ? <div className="pdf-page-controls" aria-label={t("PDF 翻页")}>
      <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t("上一页")}</Button>
      <span aria-live="polite">{page} / {doc.numPages}</span>
      <Button variant="ghost" size="sm" disabled={page === doc.numPages} onClick={() => setPage(p => p + 1)}>{t("下一页")}</Button>
    </div> : null}
  </div>
}
