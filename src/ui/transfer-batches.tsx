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
export function TransferBatchesPanel({ client, onCompleted }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [batches, setBatches] = useState<TransferBatch[]>([])
  const [selected, setSelected] = useState<string>()
  const [page, setPage] = useState(0)
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
          const d = await client.get<NonNullable<typeof detail>>("getTransferBatch", { batchId: selected, offset: page * 50, limit: 50 })
          if (alive) setDetail(d)
        }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)) }
      finally { if (alive) timer = setTimeout(() => void poll(), 500) }
    }
    void poll()
    return () => { alive = false; clearTimeout(timer) }
  }, [client, selected, page, revision, onCompleted])
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
  const nameOf = (batch: TransferBatch) => batch.source.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? batch.source
  return <section className="transfer-batches xfer" aria-label={t("文件夹传输")}>
    <div className="transfer-summary">
      <span className="xfer-icon" aria-hidden="true">{latest?.direction === "upload" ? <上传图标 /> : <下载图标 />}</span>
      <Button variant="ghost" size="sm" aria-label={t("传输任务")} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        {t("传输任务")}<下拉图标 />
      </Button>
      <span className={`transfer-summary-state${attention ? " has-errors" : ""}`} role="status">{live.length ? tf("{0} 项进行中", live.length) : attention ? tf("{0} 项待处理", attention) : tf("{0} 项已结束", batches.length)}</span>
    </div>
    {live.length > 0 && latest && latest.total > 0 ? <div className="xfer-bar"><div className="xfer-fill" style={{ width: `${Math.min(100, latest.transferred / latest.total * 100)}%` }} /></div> : null}
    {error ? <p role="alert" className="transfer-error">{error}</p> : null}
    {expanded ? <div className="transfer-scroll">
    {batches.slice(0, shown).map(batch => <article key={batch.id} className="transfer-job" data-batch-id={batch.id} data-direction={batch.direction}>
      <div className="transfer-job-line">
        <Button variant="ghost" size="sm" aria-label={tf("查看传输：{0}", nameOf(batch))} aria-expanded={selected === batch.id} onClick={() => { setSelected(selected === batch.id ? undefined : batch.id); setPage(0); setDetail(undefined); setConfirmEntry(undefined) }}>
          <span className="transfer-direction" aria-hidden="true">{batch.direction === "upload" ? <上传图标 /> : <下载图标 />}</span>
          <span className="transfer-job-name">{nameOf(batch)}</span>
          <span className={`transfer-state transfer-state-${batch.state}`}>{stateName(batch.state)}</span>
        </Button>
      </div>
      <div className="transfer-job-meta"><span>{batch.direction === "upload" ? t("上传") : t("下载")} · {batch.server}</span><span>{tf("{0} 个文件", batch.counts.files)}</span><span>{bytes(batch.transferred)} / {batch.state === "scanning" ? t("扫描后确定总量") : bytes(batch.total)}</span></div>
      {active(batch.state) && batch.total > 0 ? <div className="xfer-bar"><div className="xfer-fill" style={{ width: `${Math.min(100, batch.transferred / batch.total * 100)}%` }} /></div> : null}
      {batch.error ? <p className="transfer-error">{batch.error}</p> : null}
      <div className="transfer-actions">
        {active(batch.state) ? <Button variant="text" size="inline" disabled={busy} onClick={() => void action("cancelTransferBatch", { batchId: batch.id })}>{t("结束本批")}</Button> : batch.counts.failed > 0 || batch.state === "interrupted" || batch.state === "cancelled" || (batch.state === "failed" && batch.error) ? <Button variant="text" size="inline" disabled={busy} onClick={() => void action("retryTransferBatch", { batchId: batch.id })}>{t("再传未完成项")}</Button> : null}
      </div>
      {selected === batch.id && detail?.batch.id === batch.id ? <div className="transfer-entries">
        <details className="transfer-location"><summary>{t("传输位置")}</summary><div className="transfer-path">{batch.source}</div><div className="transfer-path">→ {batch.target || batch.targetParent}</div></details>
        {detail.entries.map(entry => <div className="transfer-entry" key={entry.id}>
          <div className="transfer-heading"><code>{entry.path}</code><span className={`transfer-state transfer-state-${entry.state}`}>{stateName(entry.state)}</span></div>
          {entry.kind === "file" ? <><div className="transfer-counts">{bytes(entry.transferred)} / {bytes(entry.size)}</div>{entry.state === "running" && entry.size > 0 ? <progress max={entry.size} value={entry.transferred} aria-label={tf("文件进度：{0}", entry.path)} /> : null}</> : null}
          {entry.error ? <p className="transfer-error">{entry.error}</p> : null}
          {entry.state === "conflict" && !active(batch.state) ? <div className="transfer-actions">
            {confirmEntry === entry.id ? <><p>{t("确认覆盖该目标文件？旧内容将被替换。")}</p><Button variant="secondary" size="sm" disabled={busy} onClick={() => void action("resolveTransferConflict", { batchId: batch.id, entryId: entry.id, action: "overwrite" })}>{t("确认替换")}</Button><Button variant="ghost" size="sm" onClick={() => setConfirmEntry(undefined)}>{t("取消")}</Button></> : <><Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmEntry(entry.id)}>{t("覆盖")}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void action("resolveTransferConflict", { batchId: batch.id, entryId: entry.id, action: "keepBoth" })}>{t("另存一份")}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void action("resolveTransferConflict", { batchId: batch.id, entryId: entry.id, action: "skip" })}>{t("跳过")}</Button></>}
          </div> : null}
        </div>)}
        {detail.entryCount > 50 ? <div className="transfer-actions"><Button variant="ghost" size="sm" disabled={page === 0} onClick={() => { setPage(n => n - 1); setDetail(undefined) }}>{t("上一页")}</Button><span>{page + 1} / {Math.ceil(detail.entryCount / 50)}</span><Button variant="ghost" size="sm" disabled={(page + 1) * 50 >= detail.entryCount} onClick={() => { setPage(n => n + 1); setDetail(undefined) }}>{t("下一页")}</Button></div> : null}
      </div> : null}
    </article>)}
    {batches.length > shown ? <Button variant="ghost" size="sm" onClick={() => setShown(n => n + 5)}>{t("显示更多批次")}</Button> : null}
    </div> : null}
  </section>
}
