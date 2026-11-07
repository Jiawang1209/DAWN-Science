import {CollaborationEvidence} from './collaboration-evidence.js'
import {useId,useRef,useState} from 'react'
import type {RunOverview as Snapshot} from '../protocol/run-overview.js'
import type {WorkbenchClient} from './client.js'
import {t,tf} from './i18n/index.js'
import {Button} from './primitives.js'
import {子转录id} from '../protocol/subagent-id.js'
import {RunActivity,RunHistory} from './run-explanation.js'
import {RunBudgetPanel} from './run-budget.js'
import {CollaborationHandoff} from './collaboration-handoff.js'
import {useRunOverview} from './use-run-overview.js'
import {acceptance,runStatus,settledDuration,collaborationCounts,collaborationTaskKey,hasCurrentSettlement} from './collaboration-model.js'
import type {TeamSnapshot} from '../protocol/index.js'
import {CollaborationExpanded} from './collaboration-expanded.js'
import {CollaborationWorkflow} from './collaboration-workflow.js'
import {CollaborationTaskDetail} from './collaboration-task-detail.js'
import {useCollaborationView} from './state/collaboration-view.js'
export function RunOverview({client,sessionId,onView,team}:{team?:TeamSnapshot|undefined;client:WorkbenchClient;sessionId?:string|undefined;onView?:((id:string)=>void)|undefined}){
 const tabId=useId(),expandTrigger=useRef<HTMLButtonElement>(null)
 const[detailOpen,setDetailOpen]=useState(false)
 const{snapshot:current,error,refresh}=useRunOverview(client,sessionId)
 const{selection,tab,expanded,update}=useCollaborationView(sessionId)
 const setTab=(tab:import('./state/collaboration-view.js').CollaborationTab)=>update({tab})
 const runs=current?.runs??[],run=runs.find(r=>selection===`run:${r.id}`)??runs.find(r=>r.phase==='running'||r.phase==='stopping')??runs[0]
 const ownedTeam=team?.captainSessionId===sessionId?team:undefined
 const task=ownedTeam?.tasks.find(task=>selection===collaborationTaskKey(ownedTeam!.id,task.id))
 const selected=task?collaborationTaskKey(ownedTeam!.id,task.id):run?`run:${run.id}`:undefined
 const live=current?.source==='live'
 const count=current?collaborationCounts(current):undefined
 const content=<section className="run-overview collaboration-panel" data-expanded={expanded} aria-label={t("运行总览")}>
  <header className="collaboration-heading"><div><span className="collaboration-eyebrow">{t("对话协作台")}</span><h3>{expanded?t("流程工作台"):t("协作")}</h3></div><div className="collaboration-heading-actions"><Button variant="ghost" size="sm" onClick={refresh}>{t("刷新运行记录")}</Button><Button ref={expandTrigger} variant="outline" size="sm" aria-expanded={expanded} onClick={()=>{setDetailOpen(false);update({expanded:!expanded})}}>{expanded?t("返回对话协作台"):t("展开流程工作台")}</Button></div></header>
  {!sessionId?<p className="hint">{t("开始任务后查看运行记录")}</p>:error?<p role="alert">{error}</p>:!current?<p className="hint">{t("正在读取运行记录")}</p>:<>
   <p className="hint collaboration-source">{live?t("来自当前会话的统一编排；每两秒刷新"):t("磁盘记录只读；查看不会启动或恢复任务")}</p>
   {current.observationIssue?<p role="alert" data-authored="1">{current.observationIssue}</p>:null}
   {count&&count.total?<div className="collaboration-counts"><strong>{tf("{0} 项任务",count.total)}</strong><span>{tf("{0} 项验收通过",count.accepted)}</span><span>{tf("{0} 项活跃",count.active)}</span>{expanded?<><span>{tf("{0} 项执行完成",runs.filter(r=>r.state==='completed').length)}</span>{current.budget?<span>{tf("可核验 token {0} · 未知用量 {1} 轮",current.budget.knownTokens,current.budget.unknownRuns)}</span>:null}<span>{t("费用未记录")}</span><label className="collaboration-progress">{t("执行进度")}<progress aria-label={t("已执行完成比例")} max={count.total} value={runs.filter(r=>r.state==='completed').length}/><span>{runs.filter(r=>r.state==='completed').length}/{count.total}</span></label></>:null}</div>:null}
   {expanded?<CollaborationWorkflow snapshot={current} team={ownedTeam} selected={selected} onSelect={selection=>{update({selection});setDetailOpen(true)}}/>:null}
   {ownedTeam?.tasks.length&&!expanded?<div className="collaboration-task-board"><h4>{t("任务板")}</h4>{ownedTeam.tasks.map(task=><Button key={task.id} variant="ghost" size="menu-row" aria-pressed={selected===collaborationTaskKey(ownedTeam.id,task.id)} onClick={()=>update({selection:collaborationTaskKey(ownedTeam.id,task.id)})}>{task.subject}</Button>)}</div>:null}
   {runs.length===0&&!ownedTeam?.tasks.length?<><p className="hint">{t("这段会话暂无子任务运行记录")}</p>{!ownedTeam?<p className="hint team-empty">{t("这段会话没有团队。对模型说「用团队分工做…」，或在输入框打 /team。")}</p>:null}</>:<>
    <div hidden={expanded} className="collaboration-roster" aria-label={t("协作任务")}>
     {runs.map(r=><div className="run-overview-row collaboration-row" key={r.id} data-run={r.id} data-phase={live?r.phase:'unknown'} data-selected={selected===`run:${r.id}`}>
      <Button variant="ghost" size="menu-row" className="collaboration-task" aria-label={r.label} aria-pressed={selected===`run:${r.id}`} onClick={()=>update({selection:`run:${r.id}`})}>
       <span className="collaboration-avatar" aria-hidden="true">{[...r.label][0]?.toUpperCase()??'?'}</span>
       <span className="collaboration-task-copy"><strong data-authored="1">{r.label}</strong><small>{runStatus(r,live)}</small></span>
       <span className="collaboration-task-meta"><span className="collaboration-state" data-phase={live?r.phase:'unknown'}>{r.kind==='bot'?'Bot':r.kind==='team'?t("团队成员"):t("子任务")}</span><small>{settledDuration(r)}</small></span>
      </Button>
     </div>)}
    </div>
    {run||task?<div className="collaboration-detail" hidden={expanded&&!detailOpen} data-selected-run={task?undefined:run?.id}>
     {expanded?<Button variant="ghost" size="sm" onClick={event=>{
      const dialog=event.currentTarget.closest('dialog')
      const target=dialog?.querySelector<HTMLButtonElement>('[data-member-card][aria-pressed="true"]')??dialog?.querySelector<HTMLButtonElement>('[data-task-id][aria-pressed="true"]')??dialog?.querySelector<HTMLButtonElement>('.collaboration-network-node[aria-pressed="true"]')??expandTrigger.current
      target?.focus({preventScroll:true});setDetailOpen(false)
     }}>{t("收起检查面板")}</Button>:null}
     <header><strong data-authored="1">{task?.subject??run?.label}</strong>{run&&!task?<span className="hint">{tf("类型 {0} · 执行代次 {1}",run.kind,run.epoch)}</span>:null}</header>
     <nav className="collaboration-tabs" role="tablist" aria-label={t("任务详情")} onKeyDown={event=>{const tabs=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];const at=tabs.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==='ArrowRight'?(at+1)%tabs.length:event.key==='ArrowLeft'?(at+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;if(next>=0){event.preventDefault();tabs[next]?.focus();tabs[next]?.click()}}}>
      <Button variant="ghost" size="sm" role="tab" id={`${tabId}-process`} aria-controls={`${tabId}-panel`} aria-selected={tab==='process'} tabIndex={tab==='process'?0:-1} onClick={()=>setTab('process')}>{t("过程")}</Button>
      <Button variant="ghost" size="sm" role="tab" id={`${tabId}-handoff`} aria-controls={`${tabId}-panel`} aria-selected={tab==='handoff'} tabIndex={tab==='handoff'?0:-1} onClick={()=>setTab('handoff')}>{t("交接")}</Button>
      <Button variant="ghost" size="sm" role="tab" id={`${tabId}-artifacts`} aria-controls={`${tabId}-panel`} aria-selected={tab==='artifacts'} tabIndex={tab==='artifacts'?0:-1} onClick={()=>setTab('artifacts')}>{t("产物")}</Button>
      <Button variant="ghost" size="sm" role="tab" id={`${tabId}-records`} aria-controls={`${tabId}-panel`} aria-selected={tab==='records'} tabIndex={tab==='records'?0:-1} onClick={()=>setTab('records')}>{t("记录")}</Button>
     </nav>
     <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`}>
     {task?<CollaborationTaskDetail key={`${task.id}:${task.attemptId}`} task={task} tab={tab} client={client} sessionId={sessionId!}/>:run?<>
     {tab==='process'?<>
      <p className="collaboration-current">{runStatus(run,live)}</p>{run.reason?<p data-authored="1">{run.reason}</p>:null}
      <RunActivity run={run} live={live&&run.phase!=='unknown'} compact/>
      <p>{run.contract?t("已冻结任务契约"):t("普通委派任务")}</p><p className="hint">{acceptance(run)}</p>
      {current.history?<RunHistory snapshot={{...current,history:{...current.history,events:current.history.events.filter(e=>e.childId===run.id&&e.epoch===run.epoch)}}}/>:null}
     </>:null}
     {tab==='handoff'?<CollaborationHandoff key={`${run.id}:${run.epoch}`} run={run}/>:null}
     {tab==='artifacts'?<><p>{acceptance(run)}</p>{hasCurrentSettlement(run)?<p>{tf("输入版本 {0} · 产物版本 {1}",run.inputVersions,run.outputVersions)}</p>:<p className="hint">{t("本轮产物尚未结算；保留的上次结果不作为本轮验收")}</p>}<p className="hint">{t("版本数量来自宿主回执；不代表文件当前内容已重新核验。")}</p></>:null}
     {tab==='records'?<><p>{tf("类型 {0} · 执行代次 {1}",run.kind,run.epoch)}</p><p className="hint">{live?t("实时编排记录"):t("历史记录")}</p><p>{tf("保留版本信息：输入 {0} · 产物 {1}",run.inputVersions,run.outputVersions)}</p><code data-authored="1">{run.id}</code><RunHistory snapshot={{...current,history:{events:current.history?.events.filter(e=>e.childId===run.id&&e.epoch===run.epoch)??[],truncated:current.history?.truncated??false}}}/></>:null}
     {(hasCurrentSettlement(run)||tab==='records'&&!!run.trace)&&sessionId&&(tab==='artifacts'||tab==='records')?<CollaborationEvidence key={`${sessionId}:${run.id}:${run.epoch}`} client={client} sessionId={sessionId} receipt={run.taskReceipt} trace={run.trace} observation={run.observation} tab={tab}/>:null}
     </>:null}
     </div>
     {!task&&run&&run.kind==='subagent'&&run.address.length===2&&/^\d+$/.test(run.address[1]!)&&onView?<Button variant="text" size="sm" onClick={()=>onView(子转录id(sessionId!,run.address[0]!,Number(run.address[1])))}>{t("查看子任务过程")}</Button>:null}
    </div>:null}
   </>}
   <footer className="collaboration-footer">
    {current.budget&&sessionId?<details><summary>{t("查看额度")}</summary><RunBudgetPanel key={sessionId} client={client} sessionId={sessionId} budget={current.budget} live={live} onSaved={refresh}/></details>:null}
    <details><summary>{t("会话完整执行记录")}</summary><RunHistory snapshot={current}/></details>
   </footer>
  </>}
 </section>
 return expanded?<CollaborationExpanded key={sessionId} onClose={()=>update({expanded:false})} onRestoreFocus={()=>expandTrigger.current?.focus({preventScroll:true})}>{content}</CollaborationExpanded>:content
}
