import {closeSync,constants,fstatSync,lstatSync,openSync,readSync,realpathSync} from 'node:fs'
import {join,resolve,sep} from 'node:path'
import {parseSessionEntries} from '@earendil-works/pi-coding-agent'
import {readRunOverview,type InternalRunOverview} from '../orchestration/run-overview.js'
import type {ToolRecordTarget,ToolRecordResponse} from '../protocol/tool-record.js'
import {TaskTraceSchema,type TaskTrace} from '../protocol/task-trace.js'
import {子运行目录} from '../subagent/run-dir.js'
import {selectToolRecord} from '../orchestration/tool-record.js'
import {合法成员名} from '../team/state.js'
import type {团队} from '../team/types.js'

const maxBytes=8*1024*1024
const unavailable={state:'unavailable'} as const
const segment=(value:string)=>/^[\w-]+$/.test(value)

/** Stay within the owning session, reject aliased files, and bound the single click's read. */
function readOwned(root:string,path:string):string|undefined{
 const rel=resolve(path).slice(resolve(root).length+1),base=realpathSync(root),file=join(base,rel)
 if(!resolve(path).startsWith(resolve(root)+sep)||realpathSync(file)!==file)return
 const expected=lstatSync(file)
 if(!expected.isFile()||expected.nlink!==1)return
 const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
 try{
  const info=fstatSync(fd)
  if(!info.isFile()||info.nlink!==1||info.dev!==expected.dev||info.ino!==expected.ino||info.size>maxBytes)return
  const bytes=Buffer.alloc(info.size)
  let at=0
  while(at<bytes.length){
   const n=readSync(fd,bytes,at,bytes.length-at,at)
   if(!n)return
   at+=n
  }
  const current=lstatSync(file)
  if(realpathSync(file)!==file||current.dev!==info.dev||current.ino!==info.ino||current.nlink!==1||fstatSync(fd).nlink!==1)return
  return bytes.toString('utf8')
 }finally{closeSync(fd)}
}

export function readToolRecord(sessionDir:string,sessionId:string,target:ToolRecordTarget,toolCallId:string,liveOverview:()=>InternalRunOverview|undefined):ToolRecordResponse{
 try{
  let trace:TaskTrace|undefined,dir:string
  if(target.kind==='run'){
   const snapshot=liveOverview()??readRunOverview(sessionDir,sessionId,file=>readOwned(sessionDir,file))
   if(snapshot.ownerSessionId!==sessionId)return unavailable
   const run=snapshot.runs.find(r=>r.id===target.id&&r.epoch===target.epoch&&r.kind==='subagent')
   if(!run||run.address.length!==2||!/^\d+$/.test(run.address[1]!)||!Number.isSafeInteger(Number(run.address[1])))return unavailable
   trace=run.trace
   dir=join(子运行目录(sessionDir,run.address[0]!,Number(run.address[1])),'transcript')
  }else{
   if(!segment(target.teamId))return unavailable
   const teamDir=join(sessionDir,'teams',target.teamId),raw=readOwned(sessionDir,join(teamDir,'team.json'))
   if(!raw)return unavailable
   // 读团队 can migrate legacy Bot scope on disk; inspection must never do that.
   const team=JSON.parse(raw) as 团队
   if(team.id!==target.teamId||team.captainSessionId!==sessionId)return unavailable
   const task=team.tasks.find(t=>t.id===target.id&&t.attemptId===target.attemptId&&(t.status==='completed'||t.status==='failed'))
   const member=task?.assignee?team.members.find(m=>m.name===task.assignee&&!m.botId):undefined
   if(!task||!member||member.sessionDir!==join('members',member.name)||!合法成员名.test(member.name))return unavailable
   const parsed=TaskTraceSchema.safeParse(task.trace)
   if(!parsed.success)return unavailable
   trace=parsed.data
   dir=join(teamDir,member.sessionDir)
  }
  const matches=trace?.records.filter(row=>row.toolCallId===toolCallId)??[]
  if(matches.length!==1||!matches[0]?.transcriptRef)return unavailable
  const raw=readOwned(sessionDir,join(dir,matches[0].transcriptRef.file))
  return raw?selectToolRecord(parseSessionEntries(raw),matches[0]):unavailable
 }catch{return unavailable}
}
