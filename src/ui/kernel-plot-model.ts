import type { Cell } from '../protocol/notebook-cells.js'

type KernelOutput = Cell['outputs'][number]
export type KernelPlotMediaType = 'image/png' | 'image/jpeg' | 'image/svg+xml'
export interface KernelPlot {
  id: string
  cellId: string
  outputId: string
  n: number
  language: 'python' | 'R' | undefined
  code: string
  mediaType: KernelPlotMediaType
  data: string
}
export function isKernelPlotMediaType(mediaType: string): mediaType is KernelPlotMediaType {
  return mediaType === 'image/png' || mediaType === 'image/jpeg' || mediaType === 'image/svg+xml'
}

/** Only intercept images the gallery can actually display; other console output stays visible. */
export function isKernelPlotOutput(item: KernelOutput): item is KernelOutput & {
  output: { kind: 'result' | 'display'; mediaType: KernelPlotMediaType; data: string }
} {
  const output = item.output
  return (output.kind === 'result' || output.kind === 'display') && !output.tooLarge && Boolean(output.data) && isKernelPlotMediaType(output.mediaType)
}

/** Derived references to the existing transcript, never a second image cache. */
export function collectKernelPlots(cells: readonly Cell[]): KernelPlot[] {
  return cells.flatMap(cell => cell.outputs.filter(isKernelPlotOutput).map(item => ({
    id: JSON.stringify([cell.id, item.id]), cellId: cell.id, outputId: item.id,
    n: cell.n, language: item.language ?? (cell.languageKnown ? cell.language : undefined), code: cell.code,
    mediaType: item.output.mediaType, data: item.output.data,
  })))
}

/** Jupyter encodes PNG/JPEG as base64, but supplies SVG as XML text. */
export function kernelPlotSource(mediaType: KernelPlotMediaType, data: string): string {
  return mediaType === 'image/svg+xml'
    ? `data:${mediaType};charset=utf-8,${encodeURIComponent(data)}`
    : `data:${mediaType};base64,${data}`
}

export function kernelPlotFilename(mediaType: KernelPlotMediaType, id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'image'
  const extension = mediaType === 'image/svg+xml' ? 'svg' : mediaType === 'image/jpeg' ? 'jpg' : 'png'
  return `dawn-plot-${safe}.${extension}`
}
