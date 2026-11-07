import {useState} from 'react'
import type {RunOverview} from '../protocol/run-overview.js'
import type {RunEvent,TaskAttemptBinding} from '../protocol/run-explanation.js'
import {Button} from './primitives.js'
import {eventLabel,RunActivity} from './run-explanation.js'
import {t,tf} from './i18n/index.js'

type Run=RunOverview['runs'][number]
export type TimelineDestination='records'|'artifacts'
export type TimelineRun={events:RunEvent[];current?:Run|undefined;truncated?:boolean|undefined;historical?:boolean|undefined}

/** A member can handle several tasks and several Bot turns inside one attempt. */
type AttemptQuery=Omit<TaskAttemptBinding,'attemptId'>&{attemptId?:string|undefined}
export function teamTaskTimeline(snapshot:RunOverview,owner:string,query:AttemptQuery):TimelineRun{
 if(snapshot.ownerSessionId!==owner)return {events:[]}
 const history=snapshot.history
 const members=new Map(snapshot.runs.filter(r=>(r.kind==='team'||r.kind==='bot')&&r.address.length===3&&r.address[0]===query.teamId).map(r=>[r.id,r]))
 const matches=(e:RunEvent)=>{
  const b=e.taskAttempt
  return e.type==='started'&&!!e.childId&&!!e.epoch&&members.has(e.childId)&&b?.teamId===query.teamId&&b.taskId===query.taskId&&b.attempt===query.attempt&&(!query.attemptId||b.attemptId===query.attemptId)
 }
 const starts=(history?.events??[]).filter(matches)
 // Cancel/recovery revokes the token. A recorded attempt ordinal is exact only if it names one token.
 if(!query.attemptId&&new Set(starts.map(e=>e.taskAttempt!.attemptId)).size!==1)return {events:[],truncated:history?.truncated}
 const wanted=new Set(starts.map(e=>e.seq)),open=new Map<string,number>(),events:RunEvent[]=[]
 for(const event of history?.events??[]){
  if(!event.childId||event.epoch===undefined)continue
  if(event.type==='started'){
   if(wanted.has(event.seq)){open.set(event.childId,event.epoch);events.push(event)}
   else open.delete(event.childId)
  }else if(open.get(event.childId)===event.epoch&&['stage','cancel-requested','settled','recovered'].includes(event.type)){
   events.push(event)
   if(event.type==='settled'||event.type==='recovered')open.delete(event.childId)
  }
 }
 // A queued continuation has not received a new epoch yet; it cannot describe this attempt.
 const last=starts.at(-1),run=last?.childId?members.get(last.childId):undefined
 return {events,...(query.attemptId&&run&&run.epoch===last?.epoch&&run.phase!=='queued'?{current:run}:{}),truncated:history?.truncated,historical:!query.attemptId&&events.length>0}
}

export function directTaskTimeline(history:RunOverview['history'],run:Run):RunEvent[]{
 const events=(history?.events??[]).filter(e=>e.childId===run.id&&e.epoch===run.epoch)
 const from=events.findLastIndex(e=>e.type==='started'||e.type==='queued')
 const window=from===-1?events:events.slice(from)
 const terminal=window.findIndex(e=>e.type==='settled'||e.type==='recovered')
 return terminal===-1?window:window.slice(0,terminal+1)
}

const page=10
export function TaskTimeline({events,current,live,status,reason,toolCount,versionCount,onInspect,truncated,historical}:TimelineRun&{
 live:boolean;status:string;reason?:string|undefined;toolCount:number;versionCount:number;onInspect:(destination:TimelineDestination)=>void
}){
 const [limit,setLimit]=useState(page)
 // The service first publishes a generic execution activity; prefer the concrete lock/preflight stages
 // when the backend subsequently reports them. Keep all actual backend execution/acceptance events.
 const trail=events.filter((event,i)=>!(
  event.type==='stage'&&event.stage==='execution'&&events[i-1]?.type==='started'&&
  events[i-1]?.epoch===event.epoch&&events[i-1]?.childId===event.childId&&
  events[i+1]?.childId===event.childId&&events[i+1]?.epoch===event.epoch&&
  (events[i+1]?.stage==='lock-wait'||events[i+1]?.stage==='preflight')
 ))
 return <section className="task-timeline" aria-label={t("任务轨迹")}>
  <header><strong>{t("任务轨迹")}</strong><span>{status}</span></header>
  {historical?<p className="hint">{t("上次执行记录；当前尝试未沿用")}</p>:null}
  {reason?<p className="task-timeline-reason" data-authored="1">{reason}</p>:null}
  {current?.activity?<RunActivity run={current} live={live&&current.phase==='running'} compact/>:null}
  {trail.length?<ol>{trail.slice(-limit).map(event=><li key={event.seq}>
   <time dateTime={Math.abs(event.at)<=8.64e15?new Date(event.at).toISOString():undefined}>{new Date(event.at).toLocaleTimeString()}</time><span>{eventLabel(event)}</span>
   {event.receipt?<small>{event.receipt==='accepted'?t("宿主验收通过"):event.receipt==='blocked'?t("宿主验收阻塞"):t("宿主验收未通过")}</small>:null}
  </li>)}</ol>:<p className="hint">{t("本次执行没有可关联的阶段记录")}</p>}
  {trail.length>limit?<Button size="sm" variant="outline" onClick={()=>setLimit(n=>n+page)}>{t("加载更早的阶段")}</Button>:null}
  {truncated?<p className="hint">{t("会话较早阶段已省略")}</p>:null}
  {toolCount||versionCount?<footer>
   {toolCount?<Button size="sm" variant="outline" onClick={()=>onInspect('records')}>{tf("查看 {0} 条工具记录",toolCount)}</Button>:null}
   {versionCount?<Button size="sm" variant="outline" onClick={()=>onInspect('artifacts')}>{tf("查看 {0} 个产物版本",versionCount)}</Button>:null}
  </footer>:null}
 </section>
}
