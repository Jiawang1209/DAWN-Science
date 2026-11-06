import {useEffect,useState} from 'react'
import type {RunOverview as Snapshot} from '../protocol/run-overview.js'
import type {WorkbenchClient} from './client.js'
import {t,tf} from './i18n/index.js'
import {Button} from './primitives.js'
import {子转录id} from '../protocol/subagent-id.js'
import {RunActivity,RunHistory} from './run-explanation.js'
import {RunBudgetPanel} from './run-budget.js'

function status(run:Snapshot['runs'][number]){
 if(run.phase==='stopping')return t("停止中，等待进程排空")
 if(run.phase==='queued')return t("等待统一编排调度")
 if(run.phase==='running')return run.activity?t("执行中"):t("执行中；内部等待原因未知")
 if(run.phase==='unknown')return t("历史快照；当前进程状态未知")
 if(run.state==='interrupted')return t("执行已中断；恢复前需核对产物")
 if(run.state==='cancelled')return t("已取消并排空")
 if(run.state==='failed')return t("执行失败")
 if(run.state==='completed')return t("执行完成")
 return t("尚未执行")
}
export function RunOverview({client,sessionId,onView}:{client:WorkbenchClient;sessionId?:string|undefined;onView?:((id:string)=>void)|undefined}){
 const [snapshot,setSnapshot]=useState<Snapshot>(),[error,setError]=useState(''),[refresh,setRefresh]=useState(0)
 useEffect(()=>{
  let disposed=false,timer:ReturnType<typeof setTimeout>|undefined
  setSnapshot(undefined);setError('')
  if(!sessionId)return
  const poll=async()=>{
   try{const next=await client.get<Snapshot>('getRunOverview',{sessionId});if(!disposed){if(next.ownerSessionId!==sessionId)throw new Error(t("运行记录的会话不匹配"));setSnapshot(next);setError('')}}
   catch(e){if(!disposed){setSnapshot(undefined);setError(e instanceof Error?e.message:String(e))}}
   finally{if(!disposed)timer=setTimeout(poll,2000)}
  }
  void poll();return()=>{disposed=true;clearTimeout(timer)}
 },[client,sessionId,refresh])
 // Key by owner in the parent as well; never paint another session's cached result.
 const current=snapshot?.ownerSessionId===sessionId?snapshot:undefined
 return <section className="run-overview panel" aria-label={t("运行总览")}>
  <header className="panel-title"><h3>{t("运行总览")}</h3><Button onClick={()=>setRefresh(n=>n+1)}>{t("刷新运行记录")}</Button></header>
  {!sessionId?<p className="hint">{t("开始任务后查看运行记录")}</p>:error?<p role="alert">{error}</p>:!current?<p className="hint">{t("正在读取运行记录")}</p>:<>
   <p className="hint">{current.source==='live'?t("来自当前会话的统一编排；每两秒刷新"):t("磁盘记录只读；查看不会启动或恢复任务")}</p>
   {current.observationIssue?<p role="alert" data-authored="1">{current.observationIssue}</p>:null}
   {current.budget&&sessionId?<RunBudgetPanel key={sessionId} client={client} sessionId={sessionId} budget={current.budget} live={current.source==='live'} onSaved={()=>setRefresh(n=>n+1)}/>:null}
   {current.runs.length===0?<p className="hint">{t("这段会话暂无子任务运行记录")}</p>:current.runs.map(run=><article className="panel-body run-overview-row" key={run.id} data-run={run.id} data-phase={run.phase}>
    <strong data-authored="1">{run.label}</strong><p>{tf("类型 {0} · 执行代次 {1}",run.kind,run.epoch)}</p>
    <p>{status(run)}</p>{run.reason?<p data-authored="1">{run.reason}</p>:null}
    <RunActivity run={run} live={current.source==='live'&&run.phase!=='unknown'}/>
    <p>{run.contract?t("已冻结任务契约"):t("普通委派任务")} · {run.receipt==='accepted'?t("宿主验收通过"):run.receipt==='blocked'?t("宿主验收阻塞"):run.receipt==='invalid'?t("宿主验收未通过"):t("暂无宿主验收回执")}</p>
    <p>{tf("输入版本 {0} · 产物版本 {1}",run.inputVersions,run.outputVersions)}</p>
    {run.handoff?<details className="run-handoff"><summary>{tf("已冻结交接：{0} 条正文 · {1} 字节",run.handoff.entries.length,run.handoff.bytes)}</summary>
      <p>{tf("来源会话：{0}",run.handoff.sourceSessionId)}</p><code>{run.handoff.sha256}</code>
      <p className="hint">{t("仅包含选中的正文；不含工具结果、思考、图片或额外权限")}</p>
      {run.handoff.entries.map(entry=><div key={entry.id}><small>{entry.role} · {entry.id}</small><pre data-authored="1">{entry.text}</pre></div>)}
    </details>:run.handoffIssue?<p role="alert" data-authored="1">{run.handoffIssue}</p>:null}
    {run.kind==='subagent'&&run.address.length===2&&/^\d+$/.test(run.address[1]!)&&onView?<Button onClick={()=>onView(子转录id(sessionId!,run.address[0]!,Number(run.address[1])))}>{t("查看子任务过程")}</Button>:null}
   </article>)}
   <RunHistory snapshot={current}/>
  </>}
 </section>
}
