import {PlanClarification} from './plan-clarification.js'
import {parseTaskArrangement} from '../protocol/task-arrangement.js'
import {useEffect,useRef,useState} from 'react'
import type {TranscriptItem} from '../protocol/index.js'
import {TaskArrangementView} from './task-arrangement-view.js'
import {Button} from './primitives.js'
import {t,tf} from './i18n/index.js'
type Plan=Extract<TranscriptItem,{type:'plan'}>
export function OrchestrationAdvisor({task,plan,busy=false,planning=false,replyVersion,unsupported,onGenerate,onStop,ownerSessionId}:{ownerSessionId?:string|undefined;task:string;plan?:Plan|undefined;busy?:boolean;planning?:boolean;replyVersion?:string|undefined;unsupported?:string|undefined;onGenerate:(task:string,adjustment:string,signal:AbortSignal)=>Promise<void>;onStop?:(()=>Promise<void>)|undefined}){
 const[goal,setGoal]=useState(task),[adjustment,setAdjustment]=useState(''),[sending,setSending]=useState(false),[stopping,setStopping]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('')
 const[cancelVersion,setCancelVersion]=useState(0)
 const stopPending=useRef(false)
 const edited=useRef(false),request=useRef<AbortController|undefined>(undefined)
 const baseline=useRef<{reply:string|undefined;plan:string|undefined}|undefined>(undefined)
 useEffect(()=>{if(!edited.current)setGoal(task)},[task])
 useEffect(()=>()=>request.current?.abort(),[])
 useEffect(()=>{
  if(baseline.current&&plan?.planId!==baseline.current.plan&&parseTaskArrangement(plan?.markdown??'').state==='valid'){
   setSent(false);setError(previous=>previous===t("本轮没有提交新的有效任务安排，请查看对话中的原因后重试。")?'':previous);return
  }
  if(sent&&!busy&&baseline.current&&replyVersion!==baseline.current.reply&&(plan?.planId===baseline.current.plan||parseTaskArrangement(plan?.markdown??'').state!=='valid')){setSent(false);setError(t("本轮没有提交新的有效任务安排，请查看对话中的原因后重试。"))}
 },[sent,busy,replyVersion,plan])
 const generate=async()=>{
  if(request.current||stopPending.current||busy||unsupported||!goal.trim())return
  baseline.current={reply:replyVersion,plan:plan?.planId}
  const controller=new AbortController();request.current=controller;edited.current=true;setSending(true);setSent(false);setError('')
  try{await onGenerate(goal.trim(),adjustment.trim(),controller.signal);if(!controller.signal.aborted)setSent(true)}
  catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:String(e))}
  finally{if(request.current===controller){request.current=undefined;setSending(false)}}
 }
 const clarify=async(task:string,answers:string,signal:AbortSignal)=>{
  if(signal.aborted||request.current||stopPending.current||busy||unsupported)throw Error(t("会话已切换或规划已取消，未发送到其他会话。"))
  // Share admission and cancellation with ordinary replanning, including pre-send RPCs.
  const controller=new AbortController(),abort=()=>controller.abort()
  // Keep the origin's abort linked after acknowledgement too: a plan/owner remount
  // invalidates this generation even when the transport promise has already settled.
  signal.addEventListener('abort',abort,{once:true})
  request.current=controller;setSending(true);setError('')
  try{await onGenerate(task,answers,controller.signal)}
  finally{if(request.current===controller){request.current=undefined;setSending(false)}}
 }
 const stop=async()=>{if(stopPending.current)return;stopPending.current=true;setCancelVersion(v=>v+1);setStopping(true);baseline.current=undefined;request.current?.abort();request.current=undefined;setSending(false);setSent(false);setError('');try{await onStop?.()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{stopPending.current=false;setStopping(false)}}
 const arrangement=plan?parseTaskArrangement(plan.markdown):undefined
 const awaiting=plan?.status==='proposed'&&arrangement?.state==='valid'&&arrangement.arrangement.questions.length>0
 const form=<div className="auto-arrangement-form">
  <label>{t("任务目标")}
   <textarea className="control" aria-label={t("任务目标")} value={goal} maxLength={16000} rows={3} onChange={e=>{edited.current=true;setGoal(e.target.value);setSent(false)}} disabled={sending||stopping}/>
  </label>
  <label>{t("调整要求（可选）")}
   <textarea className="control" aria-label={t("调整要求（可选）")} value={adjustment} maxLength={4000} rows={2} placeholder={t("例如：合并前两步，保留独立审阅")} onChange={e=>{setAdjustment(e.target.value);setSent(false)}} disabled={sending||stopping}/>
  </label>
  <div className="orchestration-advisor-actions"><Button variant="outline" size="sm" disabled={sending||stopping||busy||!!unsupported||!goal.trim()} onClick={()=>{void generate()}}>{plan?t("重新安排"):t("生成安排")}</Button>

  </div>
 </div>
 return <section className="orchestration-advisor" aria-label={t("自动安排")}>
  <h4>{t("自动安排")}</h4>
   {(sending||stopping||busy&&planning)&&onStop?<Button variant="ghost" size="sm" disabled={stopping} onClick={()=>{void stop()}}>{t("中止规划")}</Button>:null}
  {!plan?<p className="hint">{t("描述具体任务，DAWN 会根据目标、数据和依赖决定怎样拆分与分工。无需预先填写任务数量。")}</p>:null}
  {plan?<>
   <p>{tf("方案第 {0} 版",plan.version)} · {plan.status==='proposed'?t("等你看"):plan.status==='approved'?t("已批准"):plan.status==='discarded'?t("没采用"):t("已被新的一版取代")}</p>
   {awaiting?<PlanClarification key={JSON.stringify([plan.planId,plan.version,plan.markdown])} plan={plan} ownerSessionId={ownerSessionId} goal={goal.trim()||plan.title} cancelVersion={cancelVersion} busy={busy} replyVersion={replyVersion} disabled={!!(sending||stopping||busy||unsupported)} onGenerate={clarify}/>:null}
   <TaskArrangementView markdown={plan.markdown} status={plan.status} hideQuestions={!!awaiting}/>
   <details><summary>{t("调整任务与分工")}</summary>{form}</details>
   <p className="hint">{plan.status==='proposed'?t("可在对话中的方案卡修改并采纳，或补充调整要求后重新安排。"):t("如需调整分工，请补充调整要求并重新安排；原有任务不会自动重跑。")}</p>
  </>:form}
  <p className="hint">{t("先出方案期间只读查看；采纳后才进入原有执行与验收流程。")}</p>
  {unsupported?<p className="hint">{unsupported}</p>:null}
  {sent&&!plan?<p className="hint" role="status">{t("规划请求已发送；结果由模型提交后显示。")}</p>:null}
  {busy?<p className="hint" role="status">{t("会话当前有任务运行，请等待完成或停止后再安排。")}</p>:null}
  {error?<p role="alert">{error}</p>:null}
 </section>
}
