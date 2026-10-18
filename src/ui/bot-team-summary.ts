import type {TeamSnapshot} from "../protocol/index.js"
import {t} from "./i18n/index.js"

export type BotMemberState="question"|"permission"|"working"|"waiting_peer"|"resuming"|"queued"|"dependency"|"completed"|"replied"|"failed"|"cancelled"|"interrupted"|"idle"
type Member=TeamSnapshot["members"][number]
export type BotFileKind="script"|"table"|"image"|"report"|"other"
export function botFileKind(path:string):BotFileKind {
 const ext=path.split(".").pop()?.toLowerCase()
 if(ext&&["r","py","js","ts","sh","ipynb"].includes(ext))return "script"
 if(ext&&["csv","tsv","xlsx","xls","json"].includes(ext))return "table"
 if(ext&&["png","jpg","jpeg","svg","webp","gif","tif","tiff"].includes(ext))return "image"
 if(ext&&["md","txt","html","pdf","docx"].includes(ext))return "report"
 return "other"
}
export function botFileKindLabel(kind:BotFileKind):string {
 switch(kind){case "script":return t("脚本");case "table":return t("表格与数据");case "image":return t("图片");case "report":return t("报告");default:return t("其他文件")}
}
export function botMemberLabel(state:BotMemberState):string {
 switch(state){case "question":return t("待回答");case "permission":return t("待批准");case "working":return t("处理中");case "waiting_peer":return t("等待队友");case "resuming":return t("队友已回应，待继续");case "queued":return t("等待执行");case "dependency":return t("等待依赖");case "completed":return t("任务已返回");case "replied":return t("协作已回应");case "failed":return t("处理失败");case "cancelled":return t("已取消");case "interrupted":return t("已中断");default:return t("尚未分配任务")}
}
function projectMember(team:TeamSnapshot,member:Member) {
 const tasks=team.tasks.filter(task=>task.assignee===member.name)
 const task=[...tasks].sort((a,b)=>b.updatedAt-a.updatedAt)[0]
 const active=tasks.find(task=>["claimed","in_progress"].includes(task.status))??tasks.find(task=>task.status==="pending")
 // An old attempt may reply late. Only a live, matching attempt can hold this task.
 const exchange=team.collaboration?.find(x=>x.fromBotId===member.botId&&x.resumedAt===undefined&&["queued","working","replied","failed","interrupted"].includes(x.status)&&(!x.taskId||tasks.some(task=>task.id===x.taskId&&task.attemptId===x.attemptId&&["claimed","in_progress"].includes(task.status))))
 const turn=[...(team.conversationTurns??[])].filter(d=>d.botId===member.botId).sort((a,b)=>b.updatedAt-a.updatedAt)[0]
 const incoming=[...(team.collaboration??[])].filter(x=>x.toBotId===member.botId&&(!x.taskId||team.tasks.some(t=>t.id===x.taskId&&t.attemptId===x.attemptId))).sort((a,b)=>b.updatedAt-a.updatedAt)[0]
 const replied=team.conversation?.some(m=>m.role==="bot"&&m.botId===member.botId&&m.kind==="reply")||incoming?.status==="replied"
 let state:BotMemberState="idle"
 if(!team.finishedAt&&member.attention)state=member.attention
 else if(!team.finishedAt&&exchange)state=exchange.status==="replied"?"resuming":exchange.status==="failed"?"failed":exchange.status==="interrupted"?"interrupted":"waiting_peer"
 else if(!team.finishedAt&&(member.status==="working"||turn?.status==="working"||incoming?.status==="working"||active?.status==="in_progress"||active?.status==="claimed"))state="working"
 else if(!team.finishedAt&&(turn?.status==="queued"||incoming?.status==="queued"||active))state=active?.dependencies.some(id=>team.tasks.find(t=>t.id===id)?.status!=="completed")?"dependency":"queued"
 else if(turn&&turn.updatedAt>(task?.updatedAt??0)&&["failed","cancelled","interrupted"].includes(turn.status))state=turn.status as BotMemberState
 else if(incoming&&incoming.updatedAt>(task?.updatedAt??0)&&["failed","cancelled","interrupted"].includes(incoming.status))state=incoming.status as BotMemberState
 else if(task)state=task.status==="completed"?"completed":task.status==="failed"?"failed":task.status==="cancelled"?"cancelled":"interrupted"
 else if(replied||turn?.status==="replied")state="replied"
 return {member,task:active??task,state,available:!team.finishedAt&&member.status==="idle"&&!member.attention&&!active&&!exchange&&!["working","waiting_peer","resuming","queued","dependency"].includes(state)}
}
export function summarizeBotTeam(team:TeamSnapshot) {
 const members=team.members.filter(m=>m.botId&&m.status!=="removed").map(m=>projectMember(team,m))
 const tasks=team.tasks.filter(task=>members.some(m=>m.member.name===task.assignee))
 const files:Array<{path:string;kind:BotFileKind;sources:Array<{botId:string;member:string;taskId:string;attemptId:string}>}>=[]
 for(const task of tasks) {
  if(task.status!=="completed"||!task.attemptId)continue
  const member=members.find(m=>m.member.name===task.assignee)!.member
  for(const path of new Set(task.artifacts??[])) {
   let file=files.find(f=>f.path===path)
   if(!file){file={path,kind:botFileKind(path),sources:[]};files.push(file)}
   file.sources.push({botId:member.botId!,member:member.name,taskId:task.id,attemptId:task.attemptId})
  }
 }
 return {members,files,total:tasks.length,returned:tasks.filter(t=>t.status==="completed").length,
  working:members.filter(m=>m.state==="working").length,
  waiting:members.filter(m=>["waiting_peer","resuming","queued","dependency"].includes(m.state)).length,
  attention:members.filter(m=>["question","permission","failed","cancelled","interrupted"].includes(m.state))}
}
