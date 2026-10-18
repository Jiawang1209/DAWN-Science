import {$botRooms,botRoomKey} from "./state/bot-room.js"
import type { ReadBotArtifact } from "./bot-artifact-preview.js"
import { BotAvatar } from "./bot-avatar.js"
import { BotCollaboration } from "./bot-collaboration.js"
import { useEffect, useRef, useState } from "react"
import { useStore } from "@nanostores/react"
import type { BotProfile, BotCreate, SessionSummary, TeamSnapshot } from "../protocol/index.js"
import type { WorkbenchClient } from "./client.js"
import type { 坞格对话回调, 槽现值 } from "./side-chat.js"
import { ConversationView } from "./views.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { $bots, $botSession, $selectedBot, $botOwner, $botOwnerScope, $botTask, $botMemberView, Bot槽, loadBots, clearBotSession, selectBotSession } from "./state/bots.js"

const templates = [
  { title: () => t("数据助手"), name: "数据助手", role: "检查数据质量", instructions: "检查数据类型、缺失值、重复和异常，保留可复现检查脚本与说明；不擅自删除原始数据。" },
  { title: () => t("统计助手"), name: "统计助手", role: "统计建模与诊断", instructions: "根据研究设计选择方法，核查假设与诊断，保留分析脚本、结果和方法限制；不虚构显著性。" },
  { title: () => t("绘图助手"), name: "绘图助手", role: "科学可视化", instructions: "基于已核验的数据与分析结果绘图，保留绘图脚本与可编辑产物，说明单位与图例。" },
  { title: () => t("审查助手"), name: "审查助手", role: "代码与结果审查", instructions: "核对代码、输入输出和结果解释，列出证据与可执行改进，不把未执行的检查当成已通过。" },
]
const message = (e: unknown) => e instanceof Error ? e.message : String(e)
export function BotPane(p: {
  client: WorkbenchClient; ownerSessionId: string | undefined; ownerScope?: string | undefined; projectLabel?: string | undefined
  team?: TeamSnapshot | undefined
  readArtifact?: ReadBotArtifact | undefined
  onViewMember?: ((botId: string) => Promise<void>) | undefined
  models: readonly { provider?: string | undefined; model: string }[]
  conversation: (session: SessionSummary, state: 槽现值) => 坞格对话回调 | undefined
}) {
  const bots = useStore($bots), storedSession = useStore($botSession), selected = useStore($selectedBot)
  const memberView = useStore($botMemberView)
  const rooms=useStore($botRooms),openRequest=rooms[botRoomKey(p.ownerSessionId,p.ownerScope,p.team?.id)]?.openRequest
  const [view, setBotPage] = useState<"assistants" | "collaboration">("assistants")
  const shownTeam = useRef<string | undefined>(undefined)
  const viewScope=useRef("");viewScope.current=botRoomKey(p.ownerSessionId,p.ownerScope,p.team?.id)
  const session = $botOwner.get() === p.ownerSessionId && $botOwnerScope.get() === p.ownerScope ? storedSession : undefined
  const [editing, setEditing] = useState<BotProfile | "new">()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [history, setHistory] = useState<SessionSummary[]>()
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if ($botOwner.get() !== p.ownerSessionId || $botOwnerScope.get() !== p.ownerScope) { clearBotSession(); $botOwner.set(p.ownerSessionId); $botOwnerScope.set(p.ownerScope); setHistory(undefined); setEditing(undefined) }
    void loadBots(p.client).catch(e => alive.current && setError(message(e)))
  }, [p.client, p.ownerSessionId, p.ownerScope])
  useEffect(() => {
    if (p.team?.captainSessionId !== p.ownerSessionId) { shownTeam.current = undefined; setBotPage("assistants"); return }
    if ((p.team?.collaboration?.length || p.team?.conversation?.length) && shownTeam.current !== p.team.id && !session && !editing) {shownTeam.current = p.team.id; setBotPage("collaboration")}
  }, [p.team, p.ownerSessionId, session, editing])
  useEffect(()=>{if(openRequest&&p.team?.captainSessionId===p.ownerSessionId){setBotPage("collaboration");setEditing(undefined);setHistory(undefined)}},[openRequest,p.ownerSessionId,p.team?.id])
  const bot = bots.find(b => b.id === selected)
  async function perform(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(undefined)
    try { await action() } catch (e) { if (alive.current) setError(message(e)) } finally { if (alive.current) setBusy(false) }
  }
  async function open(botId: string, newConversation = false) {
    const ownerSessionId = p.ownerSessionId
    const scope = p.ownerScope
    if (!ownerSessionId) throw Error(t("先打开主对话，再与 Bot 交流"))
    const r = await p.client.get<{ session: SessionSummary }>("openBotConversation", { botId, ownerSessionId, ...(newConversation ? { newConversation: true } : {}) })
    if ($botOwner.get() !== ownerSessionId || $botOwnerScope.get() !== scope || !alive.current) return
    $botTask.set(undefined)
    selectBotSession(r.session, botId); setHistory(undefined)
  }
  if (editing) return <BotEditor key={editing === "new" ? "new" : editing.id} bot={editing === "new" ? undefined : editing} models={p.models} busy={busy} error={error} onCancel={() => { setEditing(undefined); setError(undefined) }} onSave={input => void perform(async () => {
    if (editing === "new") await p.client.get("createBot", input)
    else await p.client.get("updateBot", { botId: editing.id, patch: { ...input, model: input.model ?? null } })
    await loadBots(p.client); setEditing(undefined)
  })} />
  return <div className={`bot-pane${session ? " bot-chat side-chat" : view === "collaboration" ? " bot-team-chat" : ""}`}>
    {error ? <p role="alert" className="bot-error">{error}</p> : null}
    {session ? <BotConversation readOnly={!!memberView || (!!bot && (!bot.enabled || !!bot.archivedAt))} session={session} botId={bot?.id ?? selected ?? session.sessionId} name={bot?.name ?? session.title ?? "Bot"} projectLabel={p.projectLabel} conversation={p.conversation}
      onBack={() => { const fromTeam=!!memberView||!!$botTask.get(); clearBotSession(); setHistory(undefined); if(fromTeam)setBotPage("collaboration") }}
      onHistory={bot && !memberView && !$botTask.get() ? () => void perform(async () => {
        const ownerSessionId = p.ownerSessionId!
        const r = await p.client.get<{ sessions: SessionSummary[] }>("listBotSessions", { botId: bot.id, ownerSessionId })
        if ($botOwner.get() === ownerSessionId && $botOwnerScope.get() === p.ownerScope) setHistory(r.sessions)
      }) : undefined}
      onNew={bot && !memberView && bot.enabled && !bot.archivedAt && !$botTask.get() ? () => void perform(() => open(bot.id, true)) : undefined} /> : <>
      <header className="bot-pane-head"><h2>Bot</h2><Button variant="outline" size="sm" onClick={() => setEditing("new")}>{t("创建 Bot")}</Button></header>
      <div className="bot-pane-tabs" role="tablist" aria-label={t("Bot 视图")}>
        <Button variant="ghost" size="sm" role="tab" aria-selected={view === "assistants"} onClick={() => setBotPage("assistants")}>{t("助手")}</Button>
        <Button variant="ghost" size="sm" role="tab" aria-selected={view === "collaboration"} onClick={() => setBotPage("collaboration")}>{t("团队对话")}</Button>
      </div>
      {view === "collaboration" ? <BotCollaboration team={p.team} ownerSessionId={p.ownerSessionId} scopeKey={p.ownerScope} bots={bots} readArtifact={p.readArtifact} onTaskView={taskId=>void perform(async()=>{
        const scope=viewScope.current
        const target={ownerSessionId:p.ownerSessionId!,teamId:p.team!.id,taskId}
        const r=await p.client.get<{session:SessionSummary}>("openBotTask",target)
        if(!alive.current||viewScope.current!==scope||$botOwner.get()!==p.ownerSessionId||$botOwnerScope.get()!==p.ownerScope)return
        $botTask.set(target)
        selectBotSession(r.session,p.team!.members.find(m=>m.name===p.team!.tasks.find(t=>t.id===taskId)?.assignee)?.botId)
      })} onTaskStop={taskId=>p.client.get("stopBotTask",{ownerSessionId:p.ownerSessionId!,teamId:p.team!.id,taskId})} onTaskMessage={(taskId,instruction)=>p.client.get("messageBotTask",{ownerSessionId:p.ownerSessionId!,teamId:p.team!.id,taskId,instruction})} onView={p.onViewMember ?? (async () => { throw Error(t("成员会话尚未启动")) })} onSend={async input => {
        if (!p.ownerSessionId || !p.team || p.team.captainSessionId !== p.ownerSessionId) throw Error(t("先打开主对话，再与 Bot 交流"))
        await p.client.get("messageBotTeam", {ownerSessionId: p.ownerSessionId, teamId: p.team.id, ...input})
      }} /> : <>
      <label className="bot-enabled">
        <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />{t("显示已封存 Bot")}</label>
      {!p.ownerSessionId ? <p className="hint">{t("先打开主对话，再与 Bot 交流")}</p> : null}
      {bots.length === 0 ? <p className="hint bot-empty">{t("配置专业助手，主对话即可自动组队分工。")}</p> : <ul className="bot-list">
        {bots.filter(b => showArchived || !b.archivedAt).map(b => <li key={b.id}>
          <div className="bot-list-line"><span className="bot-list-identity"><BotAvatar id={b.id} name={b.name}/><strong title={b.name}>{b.name}</strong></span><span className="hint">{b.archivedAt ? t("已封存") : b.enabled ? t("已启用") : t("已停用")}</span></div>
          <p className="hint" title={b.role}>{b.role}</p>
          <div className="bot-list-actions">
            <Button variant="outline" size="sm" disabled={busy || !b.enabled || !!b.archivedAt || !p.ownerSessionId} aria-label={tf("与{0}交流", b.name)} onClick={() => void perform(() => open(b.id))}>{t("交流")}</Button>
            <Button variant="ghost" size="sm" disabled={busy || !p.ownerSessionId} onClick={() => void perform(async () => {
              const ownerSessionId = p.ownerSessionId!
              const r = await p.client.get<{ sessions: SessionSummary[] }>("listBotSessions", { botId: b.id, ownerSessionId })
              if ($botOwner.get() === ownerSessionId && $botOwnerScope.get() === p.ownerScope) { $selectedBot.set(b.id); setHistory(r.sessions) }
            })}>{t("历史")}</Button>
            {!b.archivedAt ? <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>{t("编辑")}</Button> : null}
            {!b.archivedAt ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => void perform(async () => { await p.client.get("updateBot", { botId: b.id, patch: { enabled: !b.enabled } }); await loadBots(p.client) })}>{b.enabled ? t("停用") : t("启用")}</Button> : null}
            {!b.archivedAt ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => void perform(async () => { await p.client.get("archiveBot", { botId: b.id }); await loadBots(p.client) })}>{t("封存 Bot")}</Button> : null}
          </div>
        </li>)}
      </ul>}
      </>}
    </>}
    {history && $botOwner.get() === p.ownerSessionId && $botOwnerScope.get() === p.ownerScope ? <div className="bot-history"><header><strong>{t("对话历史")}</strong><Button variant="ghost" size="icon" aria-label={t("收起记录")} onClick={() => setHistory(undefined)}>×</Button></header>{history.map(s => <Button key={s.sessionId} variant="ghost" size="sm" onClick={() => { selectBotSession(s, selected); setHistory(undefined) }}>{s.title ?? t("新对话")}</Button>)}</div> : null}
  </div>
}
function BotConversation(p: {
  readOnly: boolean; session: SessionSummary; botId: string; name: string; projectLabel: string | undefined
  conversation: Parameters<typeof BotPane>[0]["conversation"]
  onBack: () => void; onHistory: (() => void) | undefined; onNew: (() => void) | undefined
}) {
  const items = useStore(Bot槽.$items), queued = useStore(Bot槽.$待发)
  const permission = useStore(Bot槽.$待答权限), config = useStore(Bot槽.$会话开关)
  const callbacks = p.conversation(p.session, { 待答权限: permission, 会话开关们: config })
  const head = { 标题: <div className="bot-chat-title"><BotAvatar id={p.botId} name={p.name}/><div className="bot-chat-identity"><h2 title={p.name}>{p.name}</h2>{p.projectLabel ? <span className="hint" title={p.projectLabel}>{p.projectLabel}</span> : null}</div></div>, 动作: <>
    {p.onNew || p.onHistory ? <details className="bot-chat-more"><summary aria-label={t("更多操作")}>…</summary><div>
      {p.onNew ? <Button variant="ghost" size="sm" onClick={p.onNew}>{t("新对话")}</Button> : null}
      {p.onHistory ? <Button variant="ghost" size="sm" onClick={p.onHistory}>{t("历史")}</Button> : null}
    </div></details> : null}
    <Button variant="ghost" size="icon" aria-label={t("Bot 清单")} onClick={p.onBack}>×</Button>
  </> }
  return callbacks ? <ConversationView key={p.session.sessionId} session={p.session} items={items} 待发={queued} 紧凑 坞头={head} {...callbacks} disabled={p.readOnly || callbacks.disabled} allowBotDispatch={false} /> : <header className="conv-head"><div className="conv-head-text">{head.标题}</div>{head.动作}</header>
}
function BotEditor(p: { bot: BotProfile | undefined; models: Parameters<typeof BotPane>[0]["models"]; busy: boolean; error: string | undefined; onSave: (input: BotCreate) => void; onCancel: () => void }) {
  const [name, setName] = useState(p.bot?.name ?? ""), [role, setRole] = useState(p.bot?.role ?? ""), [instructions, setInstructions] = useState(p.bot?.instructions ?? "")
  const [model, setModel] = useState(p.bot?.model ? JSON.stringify(p.bot.model) : "")
  const [enabled, setEnabled] = useState(p.bot?.enabled ?? true)
  return <form className="bot-editor" onSubmit={e => { e.preventDefault(); p.onSave({ name: name.trim(), role: role.trim(), instructions: instructions.trim(), enabled, ...(model ? { model: JSON.parse(model) } : {}) }) }}>
    <header className="bot-pane-head"><h2>{p.bot ? t("编辑 Bot") : t("创建 Bot")}</h2><Button variant="ghost" size="icon" aria-label={t("取消")} onClick={p.onCancel}>×</Button></header>
    {!p.bot ? <label>{t("专业角色")}
      <select className="control" defaultValue="" onChange={e => { const x = templates[Number(e.target.value)]; if (x) { setName(x.name); setRole(x.role); setInstructions(x.instructions) } }}><option value="">{t("自定义")}</option>{templates.map((x, i) => <option key={x.name} value={i}>{x.title()}</option>)}</select></label> : null}
    <label>{t("名称")}
      <input className="control" required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
    <label>{t("专业职责")}
      <input className="control" required maxLength={2000} value={role} onChange={e => setRole(e.target.value)} /></label>
    <label>{t("工作指令")}
      <textarea className="control" required value={instructions} onChange={e => setInstructions(e.target.value)} /></label>
    <label>{t("模型")}
      <select className="control" value={model} onChange={e => setModel(e.target.value)}><option value="">{t("沿用主对话模型")}</option>{p.bot?.model && !p.models.some(m => m.provider === p.bot?.model?.provider && m.model === p.bot?.model?.model) ? <option value={JSON.stringify(p.bot.model)}>{p.bot.model.model} · {t("不可用")}</option> : null}{p.models.filter(m => m.provider).map(m => <option key={`${m.provider}:${m.model}`} value={JSON.stringify({ provider: m.provider, model: m.model })}>{m.model} · {m.provider}</option>)}</select></label>
    <label className="bot-enabled">
      <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />{t("启用")}</label>
    {p.error ? <p role="alert" className="bot-error">{p.error}</p> : null}
    <div className="bot-task-actions"><Button variant="outline" type="submit" disabled={p.busy || !name.trim() || !role.trim() || !instructions.trim()}>{t("保存")}</Button><Button variant="ghost" onClick={p.onCancel}>{t("取消")}</Button></div>
  </form>
}
