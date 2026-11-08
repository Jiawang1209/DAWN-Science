import type {RunOverview} from '../protocol/run-overview.js'
import {子转录id} from '../protocol/subagent-id.js'
type Run=RunOverview['runs'][number]
/** Readable responsibility plus exact identity; two uses of the same agent stay distinct. */
export function collaborationMemberPresentation(snapshot:RunOverview,run:Run){
 const member=collaborationMember(snapshot,run,snapshot.ownerSessionId)
 return{title:member?.role?.trim()||run.label,identity:member?.member?`${member.label} · ${run.label}`:'',task:member?.task?.subject}
}
/** Identity projection only. Never infer member identity from a display label. */
export function collaborationMember(snapshot:RunOverview,run:Run,owner:string){
 if(snapshot.ownerSessionId!==owner||!snapshot.runs.includes(run))return undefined
 const base={label:run.label,epoch:run.epoch,kind:run.kind,live:snapshot.source==='live'}
 if(run.kind==='subagent'){
  const index=Number(run.address[1])
  const transcriptId=run.address.length===2&&!!run.address[0]&&/^\d+$/.test(run.address[1]!)&&Number.isSafeInteger(index)?子转录id(owner,run.address[0]!,index):undefined
  return{...base,transcriptId,member:undefined,role:undefined,messages:undefined,botId:undefined,teamId:undefined,task:undefined}
 }
 const team=snapshot.team
 const member=team&&team.captainSessionId===owner&&run.address.length===3&&run.address[0]===team.id?team.members.find(m=>m.name===run.address[1]&&(m.orchestrationId??String(m.joinedAt))===run.address[2]&&m.status!=='removed'&&(run.kind==='bot'?!!m.botId:!m.botId)):undefined
 const binding=run.taskAttempt
 const task=member&&binding&&team?.id===binding.teamId?team.tasks.find(t=>t.id===binding.taskId&&t.attemptId===binding.attemptId&&t.attempt===binding.attempt&&t.assignee===member.name):undefined
 return{...base,label:member?.name??base.label,member,role:member?.role,messages:member?team!.messages.filter(m=>m.ts>=member.joinedAt&&(m.from===member.name||m.to===member.name)):undefined,botId:member?.botId,teamId:member?team!.id:undefined,task,transcriptId:undefined}
}
