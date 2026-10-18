import {useLayoutEffect,useRef} from "react"
import type {TeamSnapshot} from "../protocol/index.js"
import {BotAvatar} from "./bot-avatar.js"
import {BotArtifactPreview,type ReadBotArtifact} from "./bot-artifact-preview.js"
import {BotTaskCard} from "./bot-task-card.js"
import {AgentMarkdown} from "./markdown.js"
import {Button} from "./primitives.js"
import {t,tf} from "./i18n/index.js"
import {botFileKindLabel,botMemberLabel,summarizeBotTeam,type BotFileKind} from "./bot-team-summary.js"
import {updateBotRoom,type BotRoomState} from "./state/bot-room.js"

export interface BotTaskActions {
 onTaskView?:(taskId:string)=>void
 onTaskStop?:(taskId:string)=>Promise<unknown>
 onTaskMessage?:(taskId:string,instruction:string)=>Promise<unknown>
}
export function BotTeamOverview(p:{team:TeamSnapshot;room:BotRoomState;roomKey:string;name:(id:string|undefined,fallback:string)=>string;onView:(id:string)=>void;onChoose:(id:string)=>void;canSend:boolean;readArtifact?:ReadBotArtifact|undefined}&BotTaskActions) {
 const root=useRef<HTMLDivElement>(null)
 const summary=summarizeBotTeam(p.team),page=p.room.page??"overview"
 const navigate=(patch:Partial<BotRoomState>)=>updateBotRoom(p.roomKey,patch)
 const selected=summary.members.find(m=>m.member.botId===p.room.memberId)
 const selectedFiles=selected?summary.files.filter(f=>f.sources.some(s=>s.botId===selected.member.botId)):summary.files
 const files=selected?selectedFiles:summary.files
 const result=selected?[...(p.team.conversation??[])].reverse().find(m=>m.botId===selected.member.botId&&m.role==="bot"&&m.kind==="result"&&selected.task?.attemptId&&(m.id===`result:${selected.task.id}:${selected.task.attemptId}`||m.id.startsWith(`result:${selected.task.id}:${selected.task.attemptId}:`))):undefined
 const reply=selected?[...(p.team.conversation??[])].reverse().find(m=>m.botId===selected.member.botId&&m.role==="bot"&&m.kind==="reply"):undefined
 const output=result?.content??selected?.task?.output??reply?.content??[...(p.team.collaboration??[])].reverse().find(x=>x.toBotId===selected?.member.botId&&x.reply)?.reply
 const preview=p.room.file&&files.some(f=>f.path===p.room.file)?p.room.file:undefined
 const previewKey=preview?JSON.stringify([preview,files.find(f=>f.path===preview)?.sources]):undefined
 const previousPreview=useRef<string|undefined>(undefined)
 useLayoutEffect(()=>{
  if(previewKey){
   if(root.current)root.current.scrollTop=0
   root.current?.querySelector<HTMLElement>(".bot-artifact-preview .name")?.focus({preventScroll:true})
  } else if(previousPreview.current){
   Array.from(root.current?.querySelectorAll<HTMLButtonElement>(".bot-overview-file")??[]).find(b=>b.dataset.path===previousPreview.current)?.focus({preventScroll:true})
  }
  previousPreview.current=preview
 },[previewKey])
 const closePreview=()=>navigate({file:undefined})
 function fileList(list:typeof files) {
  return <div className="bot-overview-files" aria-label={t("交付文件")}>
   {!list.length?<p className="hint">{t("尚无文件交付；文本结果可在成员详情查看。")}</p>:(["image","table","report","script","other"] as BotFileKind[]).map(kind=>{
    const group=list.filter(f=>f.kind===kind)
    return group.length?<section key={kind}><h4>{botFileKindLabel(kind)} <span className="hint">{group.length}</span></h4>{group.map(file=><Button key={file.path} variant="ghost" size="sm" className="bot-overview-file" data-path={file.path} aria-label={tf("查看产物：{0}",file.path.split(/[\\/]/).pop()||file.path)} disabled={!p.readArtifact} aria-expanded={preview===file.path} onClick={()=>navigate({file:file.path})}><strong title={file.path}>{file.path.split(/[\\/]/).pop()}</strong><span className="hint">{[...new Set(file.sources.map(s=>tf("{0} · 任务 {1}",p.name(s.botId,s.member),s.taskId)))].join("、")}</span></Button>)}</section>:null
   })}
  </div>
 }
 return <div ref={root} className="bot-overview-scroll">
  <div className="bot-overview-pages" hidden={!!preview}>{page==="overview"?<>
   <section className="bot-overview-summary" aria-label={t("团队进展摘要")}>
    <div className="bot-overview-title"><strong>{p.team.name}</strong><span className="hint">{tf("{0} 位成员",String(summary.members.length))}</span></div>
    <p>{p.team.goal}</p>
    <div className="bot-overview-summary-footer"><div className="bot-overview-metrics"><span>{tf("任务已返回 {0}/{1}",String(summary.returned),String(summary.total))}</span><span>{tf("处理中 {0}",String(summary.working))}</span><span>{tf("等待 {0}",String(summary.waiting))}</span></div>
    <Button variant="outline" size="sm" onClick={()=>navigate({page:"files",memberId:undefined,file:undefined})}>{tf("查看交付 · {0} 个文件",String(summary.files.length))}</Button></div>
   </section>
   {summary.attention.length?<section className="bot-overview-attention" aria-label={t("需要关注")}><strong>{t("需要关注")}</strong>{summary.attention.map(m=><Button key={m.member.botId} variant="ghost" size="sm" onClick={()=>navigate({page:"member",memberId:m.member.botId,file:undefined})}>{p.name(m.member.botId,m.member.name)} · {botMemberLabel(m.state)}</Button>)}</section>:null}
   <div className="bot-overview-members" role="group" aria-label={t("团队成员")}>
    {summary.members.map(m=>{const id=m.member.botId!,name=p.name(id,m.member.name),count=summary.files.filter(f=>f.sources.some(s=>s.botId===id)).length
     return <section key={id} className="bot-overview-member" data-state={m.state}>
      <BotAvatar id={id} name={name}/><div className="bot-overview-member-body"><div className="bot-overview-title"><strong title={name}>{name}</strong><span className="bot-overview-status">{botMemberLabel(m.state)}</span></div>
       <p>{m.task?.subject??m.member.role??t("参与团队协作")}</p><div className="bot-overview-member-footer"><span className="hint">{tf("{0} 个文件",String(count))} · {p.team.finishedAt?t("团队已结束"):m.available?t("可接新任务"):m.state==="question"?t("需要你的回答"):m.state==="permission"?t("需要你的批准"):t("任务尚未返回")}</span>
       <div className="bot-overview-actions"><Button variant="text" size="xs" aria-label={tf("查看{0}的结果",name)} onClick={()=>navigate({page:"member",memberId:id,file:undefined})}>{m.state==="completed"||m.state==="replied"?t("查看结果"):t("查看任务")}</Button><Button variant="ghost" size="xs" aria-label={tf("向{0}发言",name)} disabled={!p.canSend} aria-pressed={p.room.target===id} onClick={()=>p.onChoose(id)}>{t("发言")}</Button></div></div>
      </div>
     </section>
    })}
   </div>
  </>:page==="member"&&selected?<section className="bot-overview-detail" aria-label={t("成员结果")}>
   <div className="bot-overview-title"><strong>{p.name(selected.member.botId,selected.member.name)}</strong><span>{botMemberLabel(selected.state)}</span></div>
   <p className="hint">{selected.task?.subject??selected.member.role}</p>
   {selected.task&&p.onTaskView&&p.onTaskStop&&p.onTaskMessage?<BotTaskCard key={`${p.team.id}:${selected.task.id}:${selected.task.attemptId}`} name={p.name(selected.member.botId,selected.member.name)} role={selected.member.role??""} subject={selected.task.subject} controlsOnly formScope={{roomKey:p.roomKey,taskId:selected.task.id}} status={selected.task.status} displayState={selected.state} attention={selected.member.attention} onView={()=>p.onTaskView!(selected.task!.id)} onStop={()=>p.onTaskStop!(selected.task!.id)} onMessage={instruction=>p.onTaskMessage!(selected.task!.id,instruction)}/>:null}
   {output?<div className="bot-overview-result"><span className="hint">{result||selected.task?.output?t("任务返回内容"):t("协作回应")}</span><AgentMarkdown text={output} streaming={false}/></div>:null}
   <div className="bot-overview-actions"><Button variant="outline" size="sm" onClick={()=>navigate({page:"files",file:undefined})}>{t("查看交付文件")}</Button><Button variant="ghost" size="sm" onClick={()=>p.onView(selected.member.botId!)}>{selected.state==="question"?t("查看问题"):selected.state==="permission"?t("查看权限请求"):t("查看执行对话")}</Button></div>
   {!selectedFiles.length?<p className="hint">{t("本成员尚无文件交付；回应内容与任务完成状态分别记录。")}</p>:null}
  </section>:page==="files"?<section className="bot-overview-detail"><h3>{selected?tf("{0} 的交付",p.name(selected.member.botId,selected.member.name)):t("团队交付")}</h3><p className="hint">{tf("{0} 个已核验文件",String(files.length))}</p>{fileList(files)}</section>:<p className="hint">{t("成员已离队，请返回团队总览。")}</p>}
  </div>
  {preview&&p.readArtifact?<BotArtifactPreview key={previewKey} path={preview} readArtifact={p.readArtifact} onClose={closePreview}/>:null}
 </div>
}
