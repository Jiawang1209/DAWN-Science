import { useState } from "react"
import {useStore} from "@nanostores/react"
import {$botRooms,readBotRoom,updateBotRoom,type BotTaskForm} from "./state/bot-room.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import {botMemberLabel,summarizeBotTeam,type BotMemberState} from "./bot-team-summary.js"
export function BotTaskCard(p: {
  name: string; role: string; subject: string; status: string; displayState?:BotMemberState|undefined; controlsOnly?:boolean; attention?: "question" | "permission" | undefined
  formScope?:{roomKey:string;taskId:string}|undefined
  artifacts?: readonly string[] | undefined; onOpenFile?: ((path: string) => void) | undefined
  onView: () => void; onStop: () => Promise<unknown>; onMessage: (instruction: string) => Promise<unknown>
}) {
  const rooms=useStore($botRooms)
  const [local,setLocal]=useState<BotTaskForm>({expanded:false,draft:"",busy:false})
  const {expanded,draft,busy,error}=(p.formScope?rooms[p.formScope.roomKey]?.taskForms?.[p.formScope.taskId]:local)??{expanded:false,draft:"",busy:false}
  function patch(change:Partial<BotTaskForm>){
    if(!p.formScope){setLocal(previous=>({...previous,...change}));return}
    const {roomKey,taskId}=p.formScope,forms=readBotRoom(roomKey).taskForms??{}
    updateBotRoom(roomKey,{taskForms:{...forms,[taskId]:{expanded:false,draft:"",busy:false,...forms[taskId],...change}}})
  }
  const terminal = ["completed", "failed", "cancelled"].includes(p.status)
  const state:BotMemberState=p.displayState??p.attention??(p.status==="in_progress"||p.status==="claimed"?"working":p.status==="pending"?"dependency":p.status as BotMemberState)
  const status=botMemberLabel(state)
  async function run(action: () => Promise<unknown>) {
    if (busy) return
    patch({busy:true,error:undefined})
    try { await action() } catch (e) { patch({error:e instanceof Error ? e.message : String(e)}) } finally { patch({busy:false}) }
  }
  return <section className="bot-task-card" data-status={p.status}>
    {!p.controlsOnly?<><div className="bot-task-line"><strong title={p.name}>{p.name}</strong><span className="hint">{status}</span></div>
    {p.role ? <span className="hint">{p.role}</span> : null}
    <p title={p.subject}>{p.subject}</p></>:null}
    {p.onOpenFile && p.artifacts?.length ? <div className="bot-task-artifacts">
      {p.artifacts.map(path => {
        const filename = path.split(/[\\/]/).pop() || path
        return <Button key={path} variant="text" size="xs" aria-description={path} aria-label={tf("查看产物：{0}", filename)} onClick={() => p.onOpenFile!(path)}>{filename}</Button>
      })}
    </div> : null}
    <div className="bot-task-actions">
      <Button variant="ghost" size="sm" aria-label={tf("打开任务：{0}", p.subject)} onClick={p.onView}>{t("任务详情")}</Button>
      {!terminal ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(p.onStop)}>{t("停止")}</Button> : null}
      <Button variant="ghost" size="sm" onClick={() => patch({expanded:!expanded})} aria-expanded={expanded}>{t("补充要求")}</Button>
    </div>
    {expanded ? <form onSubmit={e => { e.preventDefault(); void run(async () => { await p.onMessage(draft); patch({draft:"",expanded:false}) }) }}>
      <textarea className="control" aria-label={t("补充要求")} value={draft} disabled={busy} onChange={e => patch({draft:e.target.value})} />
      <Button variant="outline" size="sm" type="submit" disabled={busy || !draft.trim()}>{t("提交补充")}</Button>
    </form> : null}
    {error ? <p role="alert" className="bot-error">{error}</p> : null}
  </section>
}

import type { TeamSnapshot } from "../protocol/index.js"
export function BotTeamCards(p: {
  team: TeamSnapshot | undefined
  names: ReadonlyMap<string, string>
  onOpenTeam: (page:"overview"|"files") => void
}) {
  if (!p.team) return null
  const s=summarizeBotTeam(p.team)
  if(!s.members.length)return null
  return <section className="bot-team-summary" aria-label={t("Bot 团队进展")} data-returned={s.returned}>
    <div><strong>{p.team.name}</strong><span className="hint">{tf("任务已返回 {0}/{1}",String(s.returned),String(s.total))} · {tf("处理中 {0}",String(s.working))} · {tf("等待 {0}",String(s.waiting))}</span></div>
    {s.attention.length?<p>{s.attention.map(m=>`${p.names.get(m.member.botId!)??m.member.name} · ${botMemberLabel(m.state)}`).join("；")}</p>:null}
    <div className="bot-overview-actions"><Button variant="ghost" size="sm" onClick={()=>p.onOpenTeam("overview")}>{t("查看团队")}</Button><Button variant="text" size="sm" onClick={()=>p.onOpenTeam("files")}>{tf("查看交付 · {0} 个文件",String(s.files.length))}</Button></div>
  </section>
}
