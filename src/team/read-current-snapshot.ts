/** Read-only projection. Never call 读团队/scheduler.读 here: they migrate legacy state. */
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {TeamSnapshotSchema,type TeamSnapshot} from '../protocol/events.js'
import {SciencePipelineSchema} from '../protocol/science-pipeline.js'
import {ScienceBatchSchema} from '../protocol/science-batch.js'
import {taskTeamSnapshot} from './task-snapshot.js'
import type {团队} from './types.js'
export type CurrentTeamSnapshot={team:TeamSnapshot|null;teamIssue?:string}
const issue=():CurrentTeamSnapshot=>({team:null,teamIssue:'当前团队记录不可读取或身份不匹配'})
function missing(error:unknown){return (error as NodeJS.ErrnoException)?.code==='ENOENT'}
/** Undefined override reads the persisted pointer; {id:undefined} explicitly means no live team. */
export function readCurrentTeamSnapshot(sessionDir:string,ownerSessionId:string,current?:{id:string|undefined},project:(team:团队)=>unknown=taskTeamSnapshot):CurrentTeamSnapshot {
 let id:string
 try {id=current?(current.id??''):readFileSync(join(sessionDir,'teams','current'),'utf8').trim()}
 catch(error){return missing(error)?{team:null}:issue()}
 if(!id)return{team:null}
 if(Buffer.byteLength(id,'utf8')>255||id==='.'||id==='..'||/[\/\\\0]/.test(id))return issue()
 try{
  const raw=JSON.parse(readFileSync(join(sessionDir,'teams',id,'team.json'),'utf8')) as 团队&{botOwnerContext?:unknown}
  if(raw.id!==id||raw.captainSessionId!==ownerSessionId)return issue()
  const {botOwnerContext:_stamp,...team}=raw
  if(team.pipeline!==undefined)team.pipeline=SciencePipelineSchema.parse(team.pipeline)
  if(team.scienceBatch!==undefined)team.scienceBatch=ScienceBatchSchema.parse(team.scienceBatch)
  return{team:TeamSnapshotSchema.parse(project(team))}
 }catch{return issue()}
}
