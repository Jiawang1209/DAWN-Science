import { useState } from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
export function BotTaskCard(p: {
  name: string; role: string; subject: string; status: string; attention?: "question" | "permission" | undefined
  artifacts?: readonly string[] | undefined; onOpenFile?: ((path: string) => void) | undefined
  onView: () => void; onStop: () => Promise<unknown>; onMessage: (instruction: string) => Promise<unknown>
}) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const terminal = ["completed", "failed", "cancelled"].includes(p.status)
  const status = p.attention === "question" ? t("待回答") : p.attention === "permission" ? t("待批准") : p.status === "completed" ? t("已交付") : p.status === "failed" ? t("未交付") : p.status === "cancelled" ? t("已取消") : p.status === "waiting_peer" ? t("等待队友") : p.status === "in_progress" || p.status === "claimed" ? t("进行中") : t("等待依赖")
  async function run(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true); setError(undefined)
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return <section className="bot-task-card" data-status={p.status}>
    <div className="bot-task-line"><strong title={p.name}>{p.name}</strong><span className="hint">{status}</span></div>
    {p.role ? <span className="hint">{p.role}</span> : null}
    <p title={p.subject}>{p.subject}</p>
    {p.onOpenFile && p.artifacts?.length ? <div className="bot-task-artifacts">
      {p.artifacts.map(path => {
        const filename = path.split(/[\\/]/).pop() || path
        return <Button key={path} variant="text" size="xs" aria-description={path} aria-label={tf("查看产物：{0}", filename)} onClick={() => p.onOpenFile!(path)}>{filename}</Button>
      })}
    </div> : null}
    <div className="bot-task-actions">
      <Button variant="ghost" size="sm" aria-label={tf("打开任务：{0}", p.subject)} onClick={p.onView}>{t("任务详情")}</Button>
      {!terminal ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(p.onStop)}>{t("停止")}</Button> : null}
      <Button variant="ghost" size="sm" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>{t("补充要求")}</Button>
    </div>
    {expanded ? <form onSubmit={e => { e.preventDefault(); void run(async () => { await p.onMessage(draft); setDraft(""); setExpanded(false) }) }}>
      <textarea className="control" aria-label={t("补充要求")} value={draft} onChange={e => setDraft(e.target.value)} />
      <Button variant="outline" size="sm" type="submit" disabled={busy || !draft.trim()}>{t("提交补充")}</Button>
    </form> : null}
    {error ? <p role="alert" className="bot-error">{error}</p> : null}
  </section>
}

import type { TeamSnapshot } from "../protocol/index.js"
export function BotTeamCards(p: {
  team: TeamSnapshot | undefined
  names: ReadonlyMap<string, string>
  onOpenFile: (path: string) => void
  onView: (taskId: string) => void
  onStop: (taskId: string) => Promise<unknown>
  onMessage: (taskId: string, instruction: string) => Promise<unknown>
}) {
  const tasks = p.team?.tasks.filter(task => p.team!.members.some(m => m.botId && m.name === task.assignee)) ?? []
  if (!p.team || tasks.length === 0) return null
  return <details className="bot-team-cards" open><summary>{p.team.name} · Bot Team</summary><div>
    {tasks.map(task => {
      const member = p.team!.members.find(m => m.name === task.assignee)!
      return <BotTaskCard key={`${p.team!.id}:${task.id}`} name={p.names.get(member.botId!) ?? member.name} role={member.role ?? ""} attention={member.attention} artifacts={task.artifacts} onOpenFile={p.onOpenFile} subject={task.subject} status={p.team!.collaboration?.some(x => x.taskId === task.id && x.attemptId === task.attemptId && !x.resumedAt && ["queued", "working", "replied", "failed"].includes(x.status)) ? "waiting_peer" : task.status} onView={() => p.onView(task.id)} onStop={() => p.onStop(task.id)} onMessage={instruction => p.onMessage(task.id, instruction)} />
    })}
  </div></details>
}
