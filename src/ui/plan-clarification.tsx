import {useCollaborationView} from './state/collaboration-view.js'
/** Answers request a new read-only proposal; they never approve or resume an execution. */
import {useEffect,useRef,useState} from 'react'
import type {TranscriptItem} from '../protocol/index.js'
import {parseTaskArrangement} from '../protocol/task-arrangement.js'
import {Button} from './primitives.js'
import {t,tf} from './i18n/index.js'
type Plan=Extract<TranscriptItem,{type:'plan'}>
export function PlanClarification({plan,goal,disabled,onGenerate,cancelVersion,busy,replyVersion,ownerSessionId}:{ownerSessionId?:string|undefined;plan:Plan;goal:string;disabled:boolean;onGenerate:(goal:string,answers:string,signal:AbortSignal)=>Promise<void>;cancelVersion:number;busy:boolean;replyVersion?:string|undefined}){
 const read=parseTaskArrangement(plan.markdown),questions=read.state==='valid'?read.arrangement.questions:[]
 const {clarification,update}=useCollaborationView(ownerSessionId)
 const draftKey=JSON.stringify([plan.planId,plan.version,plan.markdown])
 const[answers,setAnswers]=useState<string[]>(clarification?.key===draftKey?[...clarification.answers]:[]),[state,setState]=useState<'idle'|'sending'|'sent'>('idle'),[error,setError]=useState('')
 const request=useRef<AbortController|undefined>(undefined),generation=useRef<AbortController|undefined>(undefined),mounted=useRef(true)
 const reply=useRef(replyVersion),cancel=useRef(cancelVersion)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current?.abort()}},[])
 useEffect(()=>{if(cancel.current!==cancelVersion){cancel.current=cancelVersion;generation.current?.abort();request.current=undefined;setState('idle');setError('')}},[cancelVersion])
 useEffect(()=>{if(state==='sent'&&!busy&&reply.current!==replyVersion){setState('idle');setError(t("本轮没有提交新的有效任务安排，请查看对话中的原因后重试。"))}},[state,busy,replyVersion])
 const send=async()=>{
  if(request.current||disabled||state==='sent'||questions.some((_,i)=>!answers[i]?.trim()))return
  const adjustment=`[plan_clarification] ${JSON.stringify({planId:plan.planId,version:plan.version,answers:questions.map((_,i)=>({questionIndex:i+1,answer:answers[i]!.trim()}))})}\nquestionIndex 是该版方案待确认事项的题号（从 1 开始）。补充信息仅用于重新规划；请提出新方案，等待用户采纳，不自动继续旧执行。`
  if(adjustment.length>4000){setError(t("补充内容过长，请精简后重新规划。"));return}
  const controller=new AbortController();request.current=controller;generation.current=controller;reply.current=replyVersion;setState('sending');setError('')
  try{await onGenerate(goal,adjustment,controller.signal);if(mounted.current&&!controller.signal.aborted)setState('sent')}
  catch(error){if(mounted.current&&!controller.signal.aborted){setState('idle');setError(error instanceof Error?error.message:String(error))}}
  finally{if(request.current===controller)request.current=undefined}
 }
 return <section className="plan-clarification" aria-label={t("补充待确认信息")}>
  <header><strong>{t("等待补充信息")}</strong><span>{tf("方案第 {0} 版",plan.version)}</span></header>
  <p className="hint">{t("补齐后先生成新方案，原方案不会直接执行。")}</p>
  {questions.map((question,i)=><label key={i}><span data-authored="1">{question}</span>
   <textarea className="control" rows={2} maxLength={1000} aria-label={tf("问题 {0} 的回答",i+1)} value={answers[i]??''} disabled={state!=='idle'||disabled} onChange={event=>{const next=questions.map((_,n)=>n===i?event.target.value:answers[n]??'');setAnswers(next);if(ownerSessionId)update({clarification:{key:draftKey,answers:next}})}}/></label>)}
  <Button variant="primary" size="sm" disabled={disabled||state!=='idle'||!goal.trim()||questions.some((_,i)=>!answers[i]?.trim())} onClick={()=>{void send()}}>{t("补充后重新规划")}</Button>
  {state==='sent'?<p role="status">{t("等待新方案，采纳后才执行。")}</p>:null}
  {error?<p role="alert">{error}</p>:null}
 </section>
}
