import { describe, expect, it } from 'vitest'
import { collectKernelPlots, isKernelPlotOutput, kernelPlotSource, kernelPlotFilename } from '../../src/ui/kernel-plot-model.js'
import type { Cell } from '../../src/protocol/notebook-cells.js'

function output(id: string, mediaType: string, data: string, extra = {}): Cell['outputs'][number] {
  return { type: 'kernelOutput', id, kernelInstanceId: 'k', kernelRevision: 1, output: { kind: 'display', mediaType, data, bytes: data.length, alsoAvailable: [], ...extra } }
}
function cell(id: string, n: number, outputs: Cell['outputs']): Cell {
  return { id, n, who: 'agent', language: 'R', languageKnown: true, code: `plot(${n})`, status: 'ok', outputs }
}
describe('plot history derived from transcript cells', () => {
  it('collects multiple supported plots per execution in transcript order with stable cell and output provenance', () => {
    const first = cell('one', 1, [output('same', 'image/png', 'YWJj'), output('svg', 'image/svg+xml', '<svg/>')])
    const second = cell('two', 2, [output('same', 'image/jpeg', '/9j/AA==')])
    const plots = collectKernelPlots([first, second])
    expect(plots).toHaveLength(3)
    expect(plots.map(p => [p.cellId, p.outputId, p.n, p.language, p.code])).toEqual([
      ['one', 'same', 1, 'R', 'plot(1)'], ['one', 'svg', 1, 'R', 'plot(1)'], ['two', 'same', 2, 'R', 'plot(2)'],
    ])
    expect(new Set(plots.map(p => p.id)).size).toBe(3)
    expect(collectKernelPlots([first, second]).map(p => p.id)).toEqual(plots.map(p => p.id))
    expect(plots[0]?.data).toBe(first.outputs[0]!.output.kind === 'display' ? first.outputs[0]!.output.data : '')
  })

  it('excludes text, errors, unsupported images, empty payloads and oversized plots', () => {
    const outputs: Cell['outputs'] = [
      output('text', 'text/plain', 'hello'), output('gif', 'image/gif', 'YWJj'),
      output('empty', 'image/png', ''), output('oversize', 'image/png', 'YWJj', { tooLarge: true }),
      { type: 'kernelOutput', id: 'stream', kernelInstanceId: 'k', kernelRevision: 1, output: { kind: 'stream', stream: 'stdout', text: 'hello' } },
      { type: 'kernelOutput', id: 'err', kernelInstanceId: 'k', kernelRevision: 1, output: { kind: 'error', ename: 'Error', evalue: 'bad', traceback: [] } },
      output('result', 'image/png', 'YWJj', { kind: 'result' }),
    ]
    expect(outputs.map(isKernelPlotOutput)).toEqual([false, false, false, false, false, false, true])
    expect(collectKernelPlots([cell('one', 1, outputs)]).map(p => p.outputId)).toEqual(['result'])
  })

  it('does not claim an inferred cell language is recorded', () => {
    const item = cell('unknown', 1, [output('image', 'image/png', 'YWJj')])
    item.languageKnown = false
    expect(collectKernelPlots([item])[0]?.language).toBeUndefined()
  })

  it('uses unmodified raster base64 and UTF-8 SVG text with safe generated filenames', () => {
    expect(kernelPlotSource('image/png', 'YWJj\n')).toBe('data:image/png;base64,YWJj\n')
    const svg = '<svg><text>中文 Δ &amp;</text></svg>'
    expect(decodeURIComponent(kernelPlotSource('image/svg+xml', svg).split(',')[1]!)).toBe(svg)
    expect(kernelPlotFilename('image/svg+xml', '../../恶意 name')).toMatch(/^dawn-plot-[a-zA-Z0-9_-]+\.svg$/)
    expect(kernelPlotFilename('image/jpeg', 'x')).toBe('dawn-plot-x.jpg')
  })
})
