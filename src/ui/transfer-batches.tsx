import { useCallback, useEffect, useRef, useState } from "react"
import { 上传图标, 下载图标, 下拉图标 } from "./icons.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import type { TransferBatch, TransferEntry } from "../remote/transfer-types.js"
interface Props { client: { get<T>(operation: string, request?: unknown): Promise<T> }; onCompleted: () => void }
const active = (s: string) => s === "scanning" || s === "running"
function stateName(state: string) {
  switch (state) {
    case "scanning": return t("正在扫描")
    case "running": return t("传输中")
    case "queued": return t("等待传输")
    case "completed": return t("已完成")
    case "partial": return t("部分完成")
    case "conflict": return t("同名待处理")
    case "failed": return t("失败")
    case "cancelled": return t("已取消")
    case "interrupted": return t("已中断")
    case "skipped": return t("已跳过")
    default: return state
  }
}
function bytes(n: number) { return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1024 / 1024).toFixed(1)} MiB` }
function progressOf(batch: TransferBatch): number | undefined {
  if (batch.state === "scanning") return undefined
  if (batch.total > 0) return Math.min(100, Math.floor(batch.transferred / batch.total * 100))
  if (batch.state === "completed") return 100
  return batch.counts.files ? Math.floor((batch.counts.completedFiles ?? 0) / batch.counts.files * 100) : undefined
}
function BatchProgress({ batch, label }: { batch: TransferBatch; label: string }) {
  const value = progressOf(batch)
  return <div className={`xfer-bar transfer-progress${value === undefined && active(batch.state) ? " indeterminate" : ""}${batch.state === "completed" ? " transfer-progress-complete" : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={value === undefined ? t("正在计算") : `${value}%`}>
    <div className="xfer-fill" style={{ width: `${value ?? (active(batch.state) ? 40 : 0)}%` }} />
  </div>
}
export function TransferBatchesPanel({ client, onCompleted }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [batches, setBatches] = useState<TransferBatch[]>([])
  const [selected, setSelected] = useState<string>()
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState<"all" | "attention">("all")
  const [detail, setDetail] = useState<{ batch: TransferBatch; entries: TransferEntry[]; entryCount: number }>()
  const [error, setError] = useState<string>()
  const [confirmEntry, setConfirmEntry] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [shown, setShown] = useState(5)
  const previous = useRef(new Map<string, string>())
  useEffect(() => {
    let alive = true; let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const result = await client.get<TransferBatch[]>("listTransferBatches", {})
        if (!alive) return
        let changed = false
        for (const batch of result) {
          const before = previous.current.get(batch.id)
          if ((!before || active(before)) && !active(batch.state)) changed = true
          previous.current.set(batch.id, batch.state)
        }
        setBatches(result)
        if (changed) onCompleted()
        if (selected) {
          const d = await client.get<NonNullable<typeof detail>>("getTransferBatch", { batchId: selected, offset: page * 50, limit: 50, filter })
          if (alive) setDetail(d)
        }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)) }
      finally { if (alive) timer = setTimeout(() => void poll(), 500) }
    }
    void poll()
    return () => { alive = false; clearTimeout(timer) }
  }, [client, selected, page, filter, revision, onCompleted])
  const action = useCallback(async (op: string, request: unknown) => {
    setBusy(true); setError(undefined)
    try { await client.get(op, request); setConfirmEntry(undefined); setRevision(n => n + 1); onCompleted() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }, [client, onCompleted])
  if (!batches.length && !error) return null
  const live = batches.filter(batch => active(batch.state))
  const attention = batches.reduce((n, batch) => n + batch.counts.failed + batch.counts.conflict + (batch.error && batch.counts.failed === 0 ? 1 : 0), 0)
  const latest = live[0] ?? batches[0]
  const nameOf = (batch: TransferBatch) => batch.sources && batch.sources.length > 1 ? tf("{0} 等 {1} 个文件", batch.sources[0]!.split(/[\\/]/).pop() ?? batch.sources[0]!, batch.sources.length) : batch.source.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? batch.source
  const finished = (batch: TransferBatch) => batch.counts.completedFiles ?? Math.min(batch.counts.completed, batch.counts.files)
  const percent = (batch: TransferBatch) => progressOf(batch) === undefined ? t("正在计算") : `${progressOf(batch)}%`
  return <section className="transfer-batches xfer" aria-label={t("文件传输")}>
    <div className="transfer-summary">
      <span className="xfer-icon" aria-hidden="true">{latest?.direction === "upload" ? <上传图标 /> : <下载图标 />}</span>
      <Button variant="ghost" size="sm" aria-label={t("传输任务")} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        <span className="transfer-summary-full">{t("传输任务")}</span><span className="transfer-summary-short">{t("传输")}</span><下拉图标 />
      </Button>
      {latest ? <span className="transfer-summary-name">{nameOf(latest)}</span> : null}
      <span className={`transfer-summary-state${attention ? " has-errors" : ""}`} role="status">{live.length && latest ? latest.state === "scanning" ? t("正在扫描") : `${finished(latest)}/${latest.counts.files} · ${percent(latest)}` : attention ? tf("{0} 项待处理", attention) : latest ? `${finished(latest)}/${latest.counts.files} · ${percent(latest)}` : ""}</span>
    </div>
    {latest ? <BatchProgress batch={latest} label={t("总体传输进度")} /> : null}
    {error ? <p role="alert" className="transfer-error">{error}</p> : null}
    {expanded ? <div className="transfer-scroll">
    {batches.slice(0, shown).map(batch => <article key={batch.id} className="transfer-job" data-batch-id={batch.id} data-direction={batch.direction}>
      <div className="transfer-job-line">
        <Button variant="ghost" size="sm" aria-label={tf("查看传输：{0}", nameOf(batch))} aria-expanded={selected === batch.id} onClick={() => { setSelected(selected === batch.id ? undefined : batch.id); setPage(0); setFilter("all"); setDetail(undefined); setConfirmEntry(undefined) }}>
          <span className="transfer-direction" aria-hidden="true">{batch.direction === "upload" ? <上传图标 /> : <下载图标 />}</span>
          <span className="transfer-job-name">{nameOf(batch)}</span>
          <span className={`transfer-state transfer-state-${batch.state}`}>{stateName(batch.state)}</span>
        </Button>
      </div>
      <div className="transfer-job-meta"><span>{batch.direction === "upload" ? t("上传") : t("下载")} · {batch.server}</span><span>{tf("{0}/{1} 个文件", finished(batch), batch.counts.files)}</span><span>{bytes(batch.transferred)} / {batch.state === "scanning" ? t("扫描后确定总量") : bytes(batch.total)}</span></div>
      <BatchProgress batch={batch} label={tf("任务进度：{0}", nameOf(batch))} />
      {batch.error ? <p className="transfer-error">{batch.error}</p> : null}
      <div className="transfer-actions">
        {active(batch.state) ? <Button variant="text" size="inline" disabled={busy} onClick={() => void action("cancelTransferBatch", { batchId: batch.id })}>{t("取消")}</Button> : batch.counts.failed > 0 || batch.state === "interrupted" || batch.state === "cancelled" || (batch.state === "failed" && batch.error) ? <Button variant="text" size="inline" disabled={busy} onClick={() => void action("retryTransferBatch", { batchId: batch.id })}>{t("重传未完成项")}</Button> : null}
      </div>
      {selected === batch.id && detail?.batch.id === batch.id ? <div className="transfer-entries">
        <div className="transfer-filters" role="group" aria-label={t("传输明细筛选")}>
          <Button variant="ghost" size="sm" aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setPage(0); setDetail(undefined) }}>{t("完整列表")}</Button>
          <Button variant="ghost" size="sm" aria-pressed={filter === "attention"} onClick={() => { setFilter("attention"); setPage(0); setDetail(undefined) }}>{t("仅异常")}</Button>
        </div>
        <details className="transfer-location"><summary>{t("传输位置")}</summary><div className="transfer-path">{batch.source}</div><div className="transfer-path">→ {batch.target || batch.targetParent}</div></details>
        {detail.entries.map(entry => <div className="transfer-entry" key={entry.id}>
          <div className="transfer-entry-line"><details className="transfer-entry-name"><summary><code>{entry.path}</code></summary>{entry.source ? <div className="transfer-path">{entry.source}</div> : null}{batch.direction === "download" && entry.target ? <div className="transfer-path">→ {entry.target}</div> : null}</details>
            {entry.kind === "file" ? <span className="transfer-file-meter"><progress max={100} value={entry.size > 0 ? Math.min(100, Math.floor(entry.transferred / entry.size * 100)) : entry.state === "completed" ? 100 : 0} aria-label={tf("文件进度：{0}", entry.path)} /><span>{entry.size > 0 ? Math.min(100, Math.floor(entry.transferred / entry.size * 100)) : entry.state === "completed" ? 100 : 0}%</span></span> : null}
            {entry.kind === "file" ? <span className="transfer-entry-bytes">{bytes(entry.transferred)} / {bytes(entry.size)}</span> : null}
            <span className={`transfer-state transfer-state-${entry.state}`}>{stateName(entry.state)}</span>
          </div>
          {entry.error ? <details className="transfer-entry-error"><summary>{t("查看原因")}</summary><p className="transfer-error">{entry.error}</p></details> : null}
          {entry.state === "conflict" && !active(batch.state) ? <div className="transfer-actions">
            {confirmEntry === entry.id ? <><p>{t("确认覆盖该目标文件？旧内容将被替换。")}</p><Button variant="secondary" size="sm" disabled={busy} onClick={() => void action("resolveTransferConflict", { batchId: batch.id, entryId: entry.id, action: "overwrite" })}>{t("确认替换")}</Button><Button variant="ghost" size="sm" onClick={() => setConfirmEntry(undefined)}>{t("取消")}</Button></> : <><Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmEntry(entry.id)}>{t("覆盖")}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void action("resolveTransferConflict", { batchId: batch.id, entryId: entry.id, action: "keepBoth" })}>{t("另存一份")}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void action("resolveTransferConflict", { batchId: batch.id, entryId: entry.id, action: "skip" })}>{t("跳过")}</Button></>}
          </div> : null}
        </div>)}
        {filter === "attention" && detail.entryCount === 0 ? <p className="transfer-empty">{t("没有需要处理的文件")}</p> : null}
        {detail.entryCount > 50 ? <div className="transfer-actions"><Button variant="ghost" size="sm" disabled={page === 0} onClick={() => { setPage(n => n - 1); setDetail(undefined) }}>{t("上一页")}</Button><span>{page + 1} / {Math.ceil(detail.entryCount / 50)}</span><Button variant="ghost" size="sm" disabled={(page + 1) * 50 >= detail.entryCount} onClick={() => { setPage(n => n + 1); setDetail(undefined) }}>{t("下一页")}</Button></div> : null}
      </div> : null}
    </article>)}
    {batches.length > shown ? <Button variant="ghost" size="sm" onClick={() => setShown(n => n + 5)}>{t("显示更多批次")}</Button> : null}
    </div> : null}
  </section>
}
