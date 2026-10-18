import {useLayoutEffect,useRef,useState} from "react"
import {useStore} from "@nanostores/react"
import {BotArtifactPreview,type ReadBotArtifact} from "./bot-artifact-preview.js"
import {AgentMarkdown} from "./markdown.js"
import {$botRooms,botRoomKey,readBotRoom,updateBotRoom,type BotRoomInput} from "./state/bot-room.js"
import type {TeamSnapshot} from "../protocol/index.js"
import {summarizeBotTeam} from "./bot-team-summary.js"
import {BotTeamOverview,type BotTaskActions} from "./bot-team-overview.js"
import {BotAvatar} from "./bot-avatar.js"
import {Button} from "./primitives.js"
import {t,tf} from "./i18n/index.js"

type RoomMessage=NonNullable<TeamSnapshot["conversation"]>[number]
export type BotTeamInput = BotRoomInput
interface Props extends BotTaskActions {
  team:TeamSnapshot|undefined;ownerSessionId:string|undefined;scopeKey?:string|undefined
  bots:readonly {id:string;name:string;role?:string}[];onView:(botId:string)=>Promise<void>
  onSend?:((input:BotTeamInput)=>Promise<void>)|undefined
  readArtifact?: ReadBotArtifact | undefined
}

/** Old exchange histories remain readable; authoritative public messages are not duplicated. */
function roomMessages(team:TeamSnapshot):RoomMessage[] {
  const current=team.conversation??[]
  const rows:RoomMessage[]=[]
  for(const x of team.collaboration??[]) {
    if(!current.some(m=>m.exchangeId===x.id&&(m.kind==="request"||m.kind==="handoff"))) rows.push({id:`legacy:${x.id}:request`,role:"bot",from:x.from,botId:x.fromBotId,toBotId:x.toBotId,exchangeId:x.id,kind:x.kind,content:x.message,createdAt:x.createdAt})
    if(x.reply!==undefined&&!current.some(m=>m.exchangeId===x.id&&(m.kind==="reply"||m.kind==="status"))) rows.push({id:`legacy:${x.id}:reply`,role:x.status==="replied"?"bot":"system",from:x.to,botId:x.status==="replied"?x.toBotId:undefined,toBotId:x.fromBotId,exchangeId:x.id,kind:x.status==="replied"?"reply":"status",content:x.reply,createdAt:x.updatedAt})
  }
  // Only historical projections lack an append log. Never reorder the authoritative conversation by wall clock.
  return [...rows.sort((a,b)=>a.createdAt-b.createdAt),...current]
}

/** Component lifetime is independent of the scoped draft/receipt lifetime. */
export function BotCollaboration(p:Props) {
  return <TeamConversation key={botRoomKey(p.ownerSessionId,p.scopeKey,p.team?.id)} {...p}/>
}
function TeamConversation(p:Props) {
  const key=botRoomKey(p.ownerSessionId,p.scopeKey,p.team?.id)
  const rooms=useStore($botRooms),room=rooms[key]??readBotRoom(key)
  const {draft,busy,error}=room
  const [newMessages,setNewMessages]=useState(false)
  const log=useRef<HTMLOListElement>(null),firstLayout=useRef(true)
  const team=p.team?.captainSessionId===p.ownerSessionId?p.team:undefined
  const messages=team?roomMessages(team):[]
  const members=team?.members.filter(m=>m.botId&&m.status!=="removed")??[]
  const target=room.target
  const targetAvailable=!target||members.some(m=>m.botId===target)
  useLayoutEffect(()=>{
    if(!log.current||room.page!=="discussion")return
    const saved=readBotRoom(key)
    if(saved.pinned){log.current.scrollTop=log.current.scrollHeight;setNewMessages(false)}
    else if(firstLayout.current) {log.current.scrollTop=saved.scrollTop;if(messages.length>saved.messageCount)setNewMessages(true)}
    else if(messages.length>saved.messageCount)setNewMessages(true)
    firstLayout.current=false
  },[key,messages.length,room.pinned,room.page])
  const name=(id:string|undefined,fallback:string)=>p.bots.find(b=>b.id===id)?.name??fallback
  async function view(id:string){updateBotRoom(key,{error:undefined});try{await p.onView(id)}catch(e){updateBotRoom(key,{error:e instanceof Error?e.message:String(e)})}}
  function choose(to:string){updateBotRoom(key,{target:to,receipt:undefined})}
  async function send(){
    const current=readBotRoom(key)
    if(current.busy||!current.draft.trim()||!team||team.finishedAt||!p.onSend||!targetAvailable)return
    const message=current.draft.trim(),toBotId=target||undefined
    const input=current.receipt?.message===message&&current.receipt.toBotId===toBotId?current.receipt:{requestId:crypto.randomUUID(),message,...(toBotId?{toBotId}:{})}
    updateBotRoom(key,{receipt:input,busy:true,error:undefined})
    try {
      await p.onSend(input)
      if(readBotRoom(key).receipt?.requestId===input.requestId)updateBotRoom(key,{draft:"",receipt:undefined,pinned:true})
      setNewMessages(false)
    }catch(e){updateBotRoom(key,{error:e instanceof Error?e.message:String(e)})}
    finally{updateBotRoom(key,{busy:false})}
  }
  if(!team)return <p className="hint bot-collaboration-empty">{t("当前对话还没有 Bot 协作记录")}</p>
  const working=summarizeBotTeam(team).members.filter(m=>m.state==="working").map(m=>name(m.member.botId,m.member.name))
  return <section className="bot-collaboration" aria-label={t("团队对话")}>
    <header className="bot-room-head">
      {(room.page??"overview")!=="overview"?<Button variant="ghost" size="sm" onClick={()=>updateBotRoom(key,room.file&&summarizeBotTeam(team).files.some(f=>f.path===room.file)?{file:undefined}:{page:room.page==="files"&&room.memberId?"member":"overview",file:undefined})}>{t("返回")}</Button>:<strong>{t("团队协作")}</strong>}
      <Button variant="ghost" size="sm" aria-pressed={room.page==="discussion"} onClick={()=>updateBotRoom(key,{page:room.page==="discussion"?"overview":"discussion",file:undefined})}>{room.page==="discussion"?t("团队总览"):tf("完整讨论 · {0}",String(messages.length))}</Button>
    </header>
    {room.page!=="discussion"?<BotTeamOverview {...p} team={team} room={room} roomKey={key} name={name} onView={id=>void view(id)} onChoose={choose} canSend={!busy&&!team.finishedAt&&!!p.onSend}/>:null}
    <ol hidden={room.page!=="discussion"} ref={log} role="log" aria-label={t("团队消息")} aria-live="polite" onScroll={()=>{if(log.current){const pinned=log.current.scrollHeight-log.current.scrollTop-log.current.clientHeight<64;updateBotRoom(key,{pinned,scrollTop:log.current.scrollTop,messageCount:messages.length});if(pinned)setNewMessages(false)}}}>
      {!messages.length?<li className="hint bot-room-empty">{t("团队发言会连续显示在这里")}</li>:messages.map(m=>{
        const exchange=team.collaboration?.find(x=>x.id===m.exchangeId)
        const pending=(m.kind==="request"||m.kind==="handoff")&&exchange&&["queued","working"].includes(exchange.status)
        const failed=exchange&&["failed","cancelled","interrupted"].includes(exchange.status)
        const deliveries=m.role==="user"?team.conversationTurns?.filter(d=>d.messageId===m.id)??[]:[]
        const artifacts=resultArtifacts(team,m)
        const preview=room.previews?.[m.id]
        const shownPreview=preview&&artifacts.includes(preview)?preview:undefined
        const speaker=m.role==="user"?t("你"):m.role==="captain"?t("主对话"):m.role==="system"?t("系统"):name(m.botId,m.from)
        return <li key={m.id} className={`bot-room-message bot-room-${m.role}`} data-message-id={m.id} data-status={exchange?.status}>
          <BotAvatar id={m.botId??m.role} name={speaker} kind={m.role}/>
          <div className="bot-room-message-body">
          <div className="bot-room-message-head">
            <div className="bot-room-identity">
            {m.role==="bot"&&m.botId?<Button variant="ghost" size="sm" aria-label={tf("查看{0}的协作对话",speaker)} onClick={()=>void view(m.botId!)}>{speaker}</Button>:<strong>{speaker}</strong>}
            {m.role==="bot"?<span className="bot-room-role" title={p.bots.find(b=>b.id===m.botId)?.role??team.members.find(x=>x.botId===m.botId)?.role}>{p.bots.find(b=>b.id===m.botId)?.role??team.members.find(x=>x.botId===m.botId)?.role}</span>:null}
            </div>
            <time dateTime={new Date(m.createdAt).toISOString()} title={new Date(m.createdAt).toLocaleString()}>{new Date(m.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</time>
          </div>
          <div className="bot-room-bubble">
          {m.toBotId?<span className="bot-room-recipient">{tf("发给 {0}",name(m.toBotId,team.members.find(x=>x.botId===m.toBotId)?.name??"Bot"))}</span>:null}
          {m.role==="bot"?<AgentMarkdown text={m.content} streaming={false} className="bot-room-content"/>:<p className="bot-room-content">{m.content}</p>}
          {p.readArtifact&&artifacts.length?<div className="bot-room-artifacts">{artifacts.map(path=><Button key={path} variant="outline" size="xs" data-artifact-path={path} aria-description={path} aria-expanded={shownPreview===path} aria-label={tf("查看产物：{0}",path.split(/[\\/]/).pop()||path)} onClick={()=>updateBotRoom(key,{previews:{...readBotRoom(key).previews,[m.id]:path},pinned:false})}>{path.split(/[\\/]/).pop()||path}</Button>)}</div>:null}
          {p.readArtifact&&shownPreview?<BotArtifactPreview key={shownPreview} path={shownPreview} readArtifact={p.readArtifact} onClose={()=>{
            const row=Array.from(log.current?.querySelectorAll<HTMLElement>(".bot-room-message")??[]).find(row=>row.dataset.messageId===m.id)
            const trigger=Array.from(row?.querySelectorAll<HTMLButtonElement>("[data-artifact-path]")??[]).find(button=>button.dataset.artifactPath===shownPreview)
            updateBotRoom(key,{previews:{...readBotRoom(key).previews,[m.id]:undefined},pinned:false})
            trigger?.focus({preventScroll:true})
          }}/>:null}
          {deliveries.length?<div className="bot-room-deliveries" role="group" aria-label={t("消息处理状态")}>{deliveries.map(d=><span key={d.botId} data-status={d.status} title={["failed","interrupted","cancelled"].includes(d.status)?d.reply:undefined}>{tf("{0} · {1}",name(d.botId,d.member),deliveryLabel(d.status))}</span>)}</div>:null}
          {pending?<span className="hint bot-room-state">{exchange.status==="working"?t("正在处理"):t("等待回应")}</span>:failed?<span className="bot-error bot-room-state">{exchange.status==="interrupted"?t("已中断"):exchange.status==="cancelled"?t("已取消"):t("回应失败")}</span>:null}
          </div>
          </div>
        </li>
      })}
    </ol>
    {newMessages&&room.page==="discussion"?<Button variant="ghost" size="sm" onClick={()=>{updateBotRoom(key,{pinned:true});setNewMessages(false);if(log.current)log.current.scrollTop=log.current.scrollHeight}}>{t("有新消息，回到底部")}</Button>:null}
    {error?<p role="alert" className="bot-error">{error}</p>:null}
    {team.finishedAt?<p className="hint">{t("团队已结束")}</p>:p.onSend?<form className="bot-room-composer" onSubmit={e=>{e.preventDefault();void send()}}>
      {working.length?<p className="hint bot-room-working" role="status">{tf("正在交流：{0}",working.join("、"))}</p>:null}
      <textarea className="control" aria-label={t("给团队发消息")} placeholder={t("补充要求，或向队友提问…")} value={draft} disabled={busy} rows={2} maxLength={16000} onChange={e=>{updateBotRoom(key,{draft:e.target.value,receipt:undefined})}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/>
      {!targetAvailable?<p className="bot-error">{t("所选成员已离队，请重新选择发言对象")}</p>:null}
      <div className="bot-room-compose-actions">
        <select className="control" aria-label={t("发言对象")} value={target} disabled={busy} onChange={e=>{choose(e.target.value)}}><option value="">{t("整个团队")}</option>{!targetAvailable?<option value={target} disabled>{t("成员已离队")}</option>:null}{members.map(m=><option key={m.botId} value={m.botId}>{name(m.botId,m.name)}</option>)}</select>
        <Button variant="outline" size="sm" type="submit" aria-label={t("发表到团队")} disabled={busy||!draft.trim()||!targetAvailable}>{busy?t("正在发送…"):t("发表消息")}</Button>
      </div>
      <p className="hint bot-room-queue-note">{t("忙碌的队友会在下一轮收到消息")}</p>
    </form>:null}
  </section>
}

function deliveryLabel(state:NonNullable<TeamSnapshot["conversationTurns"]>[number]["status"]):string {
  switch(state){case "queued":return t("等待处理");case "working":return t("处理中");case "replied":return t("已回应");case "failed":return t("处理失败");case "cancelled":return t("已取消");case "interrupted":return t("已中断")}
}
/** Only the engine-authored result of the exact current attempt can expose verified artifacts. */
function resultArtifacts(team:TeamSnapshot,message:RoomMessage):readonly string[] {
  if(message.kind!=="result"||message.role!=="bot"||!message.botId)return []
  const member=team.members.find(m=>m.botId===message.botId)
  const task=team.tasks.find(task=>{
    const id=`result:${task.id}:${task.attemptId}`
    return task.assignee===member?.name&&task.status==="completed"&&!!task.attemptId&&(message.id===id||message.id.startsWith(id+":"))
  })
  return task?.artifacts??[]
}
