import {useState} from 'react'
import type {TeamSnapshot} from '../protocol/events.js'
import {Button} from './primitives.js'
import {t,tf} from './i18n/index.js'
/** Plan task -> real Team task; never infer execution from a proposed role or display name. */
export function ApprovedPlanProgress({team,owner,onSelect,onStop,onFinish}:{onFinish?:((planId:string)=>Promise<void>)|undefined;onStop?:((planId:string)=>Promise<void>)|undefined;team:TeamSnapshot;owner:string;onSelect?:((taskId:string,trigger:HTMLButtonElement)=>void)|undefined}){
 const [finishing,setFinishing]=useState(false)
 const [stopping,setStopping]=useState(false),[stopError,setStopError]=useState('')
 const binding=team.approvedPlan
 if(!binding||binding.owner!==owner||team.captainSessionId!==owner||binding.teamId!==team.id)return null
 const rows=binding.tasks.map(m=>({...m,task:team.tasks.find(t=>t.id===m.taskId&&t.assignee===m.memberName)}))
 const started=rows.filter(r=>r.task&&r.task.attempt>0).length
 return <section className="approved-plan-progress" aria-label={t("批准方案执行进度")}>
  <header><strong>{t("批准方案执行进度")}</strong><span>{tf("第 {0} 版",binding.planVersion)}</span></header>
  <p className="hint">{tf("计划 {0} 项 · 已启动 {1} 项",rows.length,started)}</p>
  {team.finishedAt?<p role="status">{t("安排已结束，任务记录保留。")}</p>:null}
  {team.approvedPlanPaused&&!team.finishedAt?<p role="status">{t("执行已暂停；核对产物后，只能显式继续未执行任务。")}</p>:null}
  {team.approvedPlanPaused&&team.approvedPlanPauseReason?<p className="hint" data-authored="1">{team.approvedPlanPauseReason}</p>:null}
  {onStop&&!team.approvedPlanPaused&&team.tasks.some(t=>['pending','claimed','in_progress'].includes(t.status))?<Button variant="outline" size="sm" disabled={stopping} onClick={()=>{setStopping(true);setStopError('');void onStop(binding.planId).catch(e=>setStopError(e instanceof Error?e.message:String(e))).finally(()=>setStopping(false))}}>{stopping?t("正在请求停止"):t("停止本方案执行")}</Button>:null}
  {onFinish&&team.approvedPlanPaused&&!team.finishedAt?<Button variant="outline" size="sm" disabled={finishing} onClick={()=>{setFinishing(true);setStopError('');void onFinish(binding.planId).catch(e=>setStopError(e instanceof Error?e.message:String(e))).finally(()=>setFinishing(false))}}>{finishing?t("正在结束"):t("结束此安排")}</Button>:null}
  {stopError?<p role="alert" data-authored="1">{stopError}</p>:null}
  <ol>{rows.map(row=>{
   const task=row.task,deps=task?.dependencies.map(id=>team.tasks.find(t=>t.id===id)),blocked=deps?.filter(d=>!d||d.status!=='completed'||d.receipt?.state!=='accepted')??[]
   const status=!task?t("任务映射缺失"):task.status==='completed'?(task.receipt?.state==='accepted'?t("宿主验收通过"):t("执行完成，验收待核对")):task.status==='failed'?t("执行失败"):task.status==='cancelled'?t("已取消"):task.status==='in_progress'?t("执行中"):task.status==='claimed'?t("已领取"):blocked.length?tf("前置任务未通过：{0}",blocked.map(d=>d?.subject??t("记录缺失")).join('、')):t("尚未执行")
   return <li key={row.planTaskId} data-plan-task={row.planTaskId}><Button variant="ghost" size="menu-row" disabled={!task||!onSelect} onClick={event=>onSelect?.(row.taskId,event.currentTarget)}><span><strong data-authored="1">{task?.subject??row.planTaskId}</strong><small data-authored="1">{row.memberName} · {row.planTaskId}</small></span><span>{status}</span></Button>
    {task?.status==='failed'?<p className="hint" data-authored="1">{task.receipt?.reason??task.output??t("查看记录确认失败原因")}</p>:null}
   </li>
  })}</ol>
 </section>
}
