/** Offline renderer: consumes guarded readFile bytes, never a document URL. */
import { getDocument, PDFWorker } from 'pdfjs-dist'
import Worker from 'pdfjs-dist/build/pdf.worker.mjs?worker'

export function loadPdf(base64: string) {
  const port = new Worker()
  const worker = PDFWorker.create({ port })
  const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const assets = new URL('./pdf-assets/', document.baseURI).href
  const task = getDocument({ data, worker, useWasm: false,
    cMapUrl: `${assets}cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/`,
    useWorkerFetch: false })
  return { task, destroy: async () => { try { await task.destroy() } finally { worker.destroy(); port.terminate() } } }
}
