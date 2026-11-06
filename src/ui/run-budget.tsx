import {useEffect,useId,useRef,useState} from 'react'
import {RunBudgetLimitsSchema,type RunBudget} from '../protocol/run-budget.js'
import type {WorkbenchClient} from './client.js'
import {Button} from './primitives.js'
import {t,tf} from './i18n/index.js'
export function RunBudgetPanel({client,sessionId,budget,live,onSaved}:{client:WorkbenchClient;sessionId:string;budget:RunBudget;live:boolean;onSaved:()=>void}){
 const id=useId(),alive=useRef(true)
 const [runs,setRuns]=useState(''),[minutes,setMinutes]=useState(''),[tokens,setTokens]=useState(''),[dirty,setDirty]=useState(false),[revision,setRevision]=useState(budget.revision),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{if(!dirty){setRuns(budget.limits.maxRuns?.toString()??'');setMinutes(budget.limits.maxElapsedMs===undefined?'':String(budget.limits.maxElapsedMs/60000));setTokens(budget.limits.maxTokens?.toString()??'');setRevision(budget.revision)}},[budget.revision,dirty])
 const edit=(set:(s:string)=>void,value:string)=>{if(!dirty)setRevision(budget.revision);setDirty(true);set(value);setError('')}
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();setError('');setBusy(true)
  try{
   const limits=RunBudgetLimitsSchema.parse({...(runs.trim()?{maxRuns:Number(runs)}:{}),...(minutes.trim()?{maxElapsedMs:Math.round(Number(minutes)*60000)}:{}),...(tokens.trim()?{maxTokens:Number(tokens)}:{})})
   await client.get('setRunBudget',{sessionId,expectedRevision:revision,limits})
   if(alive.current){setDirty(false);onSaved()}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{if(alive.current)setBusy(false)}
 }
 return <section className="run-budget" aria-label={t("会话委派预算")}>
  <strong>{t("会话委派预算")}</strong>
  <p>{tf("已准入 {0} 轮 · 可核验 token {1} · 未知用量 {2} 轮 · 在途 {3} 轮",budget.consumedRuns,budget.knownTokens,budget.unknownRuns,budget.inFlight)}</p>
  <p>{tf("已历时 {0} 分钟（含暂停与离线）",(budget.elapsedMs/60000).toFixed(2))}</p>
  <p>{tf("当前限制：轮次 {0} · 总历时 {1} 分钟 · token {2}",budget.limits.maxRuns??t("不限"),budget.limits.maxElapsedMs===undefined?t("不限"):budget.limits.maxElapsedMs/60000,budget.limits.maxTokens??t("不限"))}</p>
  {budget.blocked?<p role="status" data-authored="1">{budget.blocked.message}</p>:null}
  {budget.legacyRuns?<p>{tf("含 {0} 轮旧记录；其历史耗时和用量未知",budget.legacyRuns)}</p>:null}
  <p className="hint">{t("仅统计本会话统一编排的子任务、团队和 Bot；总历时包含暂停与离线。token 在结算后核验，在途请求可能超额，未知用量不计为零。")}</p>
  {live?<details><summary>{t("调整预算限制")}</summary><form onSubmit={save}>
   <label htmlFor={`${id}-runs`}>{t("累计执行轮次上限")}</label>
   <input className="control" id={`${id}-runs`} type="number" min="1" max="10000" step="1" value={runs} disabled={busy} onChange={e=>edit(setRuns,e.target.value)}/>
   <label htmlFor={`${id}-time`}>{t("总历时上限（分钟）")}</label>
   <input className="control" id={`${id}-time`} type="number" min="0.001" max="10080" step="any" value={minutes} disabled={busy} onChange={e=>edit(setMinutes,e.target.value)}/>
   <label htmlFor={`${id}-tokens`}>{t("可核验 token 上限")}</label>
   <input className="control" id={`${id}-tokens`} type="number" min="1" max="1000000000" step="1" value={tokens} disabled={busy} onChange={e=>edit(setTokens,e.target.value)}/>
   <p className="hint">{t("留空表示不设该限制；保存只改变限额，已用记录保留，不会自动重跑任务。")}</p>
   <Button type="submit" disabled={busy}>{t("委派限额生效")}</Button>
   <Button type="button" disabled={busy} onClick={()=>{setDirty(false);setError('');onSaved()}}>{t("重新读取预算")}</Button>
   {error?<p role="alert" data-authored="1">{error}</p>:null}
  </form></details>:<p className="hint">{t("离线预算只读；进入当前 API 会话后可调整")}</p>}
 </section>
}
