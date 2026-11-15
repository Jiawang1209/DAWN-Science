import { useMemo, useState } from 'react'
import { Button } from './primitives.js'
import { KernelPlotImage } from './kernel-plot-image.js'
import { collectKernelPlots } from './kernel-plot-model.js'
import { t, tf } from './i18n/index.js'
import type { Cell } from '../protocol/notebook-cells.js'

/** Mount with key={scopeKey} to isolate selection and open dialogs between conversations. */
export function KernelPlotGallery({ cells }: { cells: readonly Cell[] }) {
  const plots = useMemo(() => collectKernelPlots(cells), [cells])
  // null follows the live tail. An explicitly selected older identity stays pinned as output streams in.
  const [selected, setSelected] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const pinned = selected === null ? -1 : plots.findIndex(plot => plot.id === selected)
  const index = pinned < 0 ? plots.length - 1 : pinned
  const plot = plots[index]
  if (!plot) return null
  const select = (index: number) => setSelected(index === plots.length - 1 ? null : plots[index]!.id)
  const caption = tf("会话图形 · 执行 {0} · {1}", plot.n, plot.language ?? t("语言未记录"))
  const navigation = <>
    <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => select(index - 1)}>{t("上一张图")}</Button>
    <span className="kernel-plot-count">{index + 1} / {plots.length}</span>
    <Button size="sm" variant="ghost" disabled={index === plots.length - 1} onClick={() => select(index + 1)}>{t("下一张图")}</Button>
  </>
  return <section className="kernel-plot-gallery" aria-label={t("会话图形历史")}>
    <header><span>{caption}</span><Button size="sm" variant="ghost" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}>{t("图形列表")}</Button></header>
    <KernelPlotImage mediaType={plot.mediaType} data={plot.data} imageId={plot.id} caption={caption} navigation={navigation} />
    {historyOpen ? <select className="control" aria-label={t("选择历史图形")} value={plot.id} onChange={event => select(plots.findIndex(plot => plot.id === event.target.value))}>
      {plots.map((plot, index) => <option key={plot.id} value={plot.id}>{tf("图形 {0} · 执行 {1} · {2}", index + 1, plot.n, plot.language ?? t("语言未记录"))}</option>)}
    </select> : null}
    {plot.code ? <details className="kernel-plot-code"><summary>{t("查看绘图代码")}</summary><pre>{plot.code}</pre></details> : null}
  </section>
}
