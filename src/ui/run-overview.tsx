import {collaborationMember} from './collaboration-member.js'
import {CollaborationMemberPanel} from './collaboration-member-panel.js'
import {rememberCollaborationReturn} from './state/collaboration-return.js'
import {exactTaskObservationRun} from './agent-observation.js'
import {OrchestrationAdvisor} from './orchestration-advisor.js'
import {AgentObservation} from './agent-observation-view.js'
import {CollaborationOutcomePanel} from './collaboration-outcome-panel.js'
import {selectCollaborationOutcome,type OutcomeAction} from './collaboration-outcome.js'
import {CollaborationEvidence} from './collaboration-evidence.js'
import {useEffect,useId,useRef,useState} from 'react'
import type {RunOverview as Snapshot} from '../protocol/run-overview.js'
import type {WorkbenchClient} from './client.js'
import {t,tf} from './i18n/index.js'
import {Button} from './primitives.js'
import {关闭图标} from './icons.js'
import {RunHistory} from './run-explanation.js'
import {RunBudgetPanel} from './run-budget.js'
import {CollaborationHandoff} from './collaboration-handoff.js'
import {useRunOverview} from './use-run-overview.js'
import {acceptance,runStatus,settledDuration,collaborationCounts,collaborationTaskKey,hasCurrentSettlement} from './collaboration-model.js'
import type {TeamSnapshot} from '../protocol/index.js'
import {CollaborationExpanded} from './collaboration-expanded.js'
import {CollaborationWorkflow} from './collaboration-workflow.js'
import {CollaborationTaskDetail} from './collaboration-task-detail.js'
import {TaskTimeline,directTaskTimeline,teamTaskTimeline,type TimelineDestination} from './task-timeline.js'
import {useCollaborationView} from './state/collaboration-view.js'
export function RunOverview({client,sessionId,onView,team,onPrepare,onBot,autoArrangement}:{autoArrangement?:Omit<Parameters<typeof OrchestrationAdvisor>[0],'onGenerate'>&{onGenerate:Parameters<typeof OrchestrationAdvisor>[0]['onGenerate']}|undefined;onBot?:((owner:string,teamId:string,botId:string,isCurrent:()=>boolean)=>Promise<void>)|undefined;onPrepare?:((owner:string,text:string)=>boolean)|undefined;team?:TeamSnapshot|undefined;client:WorkbenchClient;sessionId?:string|undefined;onView?:((id:string)=>void)|undefined}){
 const tabId=useId(),tabsRef=useRef<HTMLElement>(null),expandTrigger=useRef<HTMLButtonElement>(null)
 const[inspection,setInspection]=useState<{owner:string|undefined;key:string;trigger:HTMLButtonElement}>()
 const detailClose=useRef<HTMLButtonElement>(null)
 const{snapshot:current,error,refresh}=useRunOverview(client,sessionId)
 const{selection,tab,expanded,reopenInspection,update}=useCollaborationView(sessionId)
 const setTab=(tab:import('./state/collaboration-view.js').CollaborationTab)=>update({tab})
 const inspect=(destination:TimelineDestination)=>{
  setTab(destination)
  const target=tabsRef.current?.querySelector<HTMLButtonElement>(`[data-collaboration-tab="${destination}"]`)
  target?.focus()
 }
 const runs=current?.runs??[],run=runs.find(r=>selection===`run:${r.id}`)??runs.find(r=>r.phase==='running'||r.phase==='stopping')??runs[0]
 const projectedTeam=current?.team!==undefined?current.team??undefined:team
 const ownedTeam=projectedTeam?.captainSessionId===sessionId?projectedTeam:undefined
 const task=ownedTeam?.tasks.find(task=>selection===collaborationTaskKey(ownedTeam!.id,task.id))
 const selected=task?collaborationTaskKey(ownedTeam!.id,task.id):run?`run:${run.id}`:undefined
 const inspecting=!!(expanded&&inspection&&inspection.owner===sessionId&&inspection.key===selected)
 useEffect(()=>{
  if(inspecting){detailClose.current?.focus();return}
  if(inspection){setInspection(undefined);if(expanded&&document.activeElement===document.body)expandTrigger.current?.focus()}
 },[expanded,inspection,inspecting])
 const attempt=task&&task.attempt>0&&sessionId&&ownedTeam&&current?teamTaskTimeline(current,sessionId,{teamId:ownedTeam.id,taskId:task.id,attemptId:task.attemptId,attempt:task.attempt}):{events:[]}
 const memberRun=task&&current&&sessionId&&ownedTeam?exactTaskObservationRun(current,sessionId,{teamId:ownedTeam.id,taskId:task.id,attemptId:task.attemptId,attempt:task.attempt},attempt.current):task?undefined:run
 const mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const navigation=useRef({key:'',version:0,snapshot:current,run:memberRun})
 const navigationKey=JSON.stringify([sessionId,selected,memberRun?.id,memberRun?.epoch,memberRun?.address])
 if(navigation.current.key!==navigationKey){navigation.current.key=navigationKey;navigation.current.version++}
 navigation.current.snapshot=current;navigation.current.run=memberRun
 const sectionRef=useRef<HTMLElement>(null)
 useEffect(()=>{
  if(!expanded||!reopenInspection||!current)return
  const trigger=sectionRef.current?.querySelector<HTMLButtonElement>('[data-member-card][aria-pressed="true"], [data-task-id][aria-pressed="true"]')
  if(trigger&&selected){setInspection({owner:sessionId,key:selected,trigger});update({reopenInspection:false})}
 },[expanded,reopenInspection,current,selected,sessionId])
 const openMember=(id:string)=>{
  if(!sessionId||!onView)return
  rememberCollaborationReturn({owner:sessionId,kind:'subagent',target:id,expanded,selection:selected,tab})
  // The dock switch unmounts the modal; retain the owner's expanded preference for every return entry.
  onView(id)
 }
 const openBot=onBot&&sessionId?async(teamId:string,botId:string)=>{
  const version=navigation.current.version
  const isCurrent=()=>{
   const latest=navigation.current
   const member=latest.snapshot&&latest.run?collaborationMember(latest.snapshot,latest.run,sessionId):undefined
   return mounted.current&&latest.version===version&&member?.teamId===teamId&&member.botId===botId
  }
  await onBot(sessionId,teamId,botId,isCurrent)
  rememberCollaborationReturn({owner:sessionId,kind:'bot',target:JSON.stringify([teamId,botId]),expanded,selection:selected,tab})
 }:undefined
 const dependencies=task&&ownedTeam?task.dependencies.filter(id=>ownedTeam.tasks.find(t=>t.id===id)?.status!=='completed').map(id=>ownedTeam.tasks.find(t=>t.id===id)?.subject??id):[]
 const outcomeSnapshot=current?{...current,...(current.team===undefined&&ownedTeam?{team:ownedTeam}:{})}:undefined
 const outcome=outcomeSnapshot?selectCollaborationOutcome(outcomeSnapshot):undefined
 const historyRef=useRef<HTMLDetailsElement>(null)
 const navigationOwner=useRef(sessionId),navigationFrame=useRef<number|undefined>(undefined)
 navigationOwner.current=sessionId
 useEffect(()=>()=>{if(navigationFrame.current!==undefined)cancelAnimationFrame(navigationFrame.current);navigationFrame.current=undefined},[sessionId])
 const navigateOutcome=(key:string|undefined,action:OutcomeAction,trigger:HTMLButtonElement)=>{
  const tab=outcome?.state==='active'&&!outcome.blocker&&(action==='inspect-feedback'||outcome.pendingReview&&action==='inspect-findings')?'process':action==='inspect-inputs'?'handoff':action==='inspect-artifacts'||action==='inspect-findings'?'artifacts':action==='inspect-feedback'?'records':'process'
  if(!key){if(historyRef.current){historyRef.current.open=true;historyRef.current.querySelector('summary')?.focus()}return}
  update({selection:key,tab})
  if(expanded)setInspection({owner:sessionId,key,trigger})
  const owner=sessionId
  const frame=requestAnimationFrame(()=>{if(navigationOwner.current!==owner||navigationFrame.current!==frame)return;navigationFrame.current=undefined;tabsRef.current?.querySelector<HTMLButtonElement>(`[data-collaboration-tab="${tab}"]`)?.focus()})
  navigationFrame.current=frame
 }
 const automatic=autoArrangement&&sessionId?<OrchestrationAdvisor key={sessionId} {...autoArrangement} busy={autoArrangement.busy||current?.source==='live'&&runs.some(r=>r.phase==='running'||r.phase==='queued'||r.phase==='stopping')}/>:null
 const emptyWork=!runs.length&&!ownedTeam?.tasks.length
 const live=current?.source==='live'
 const count=current?collaborationCounts(current):undefined
 const content=<section ref={sectionRef} className="run-overview collaboration-panel" data-expanded={expanded} data-inspecting={inspecting} aria-label={t("运行总览")}>
  <header className="collaboration-heading"><div><span className="collaboration-eyebrow">{t("对话协作台")}</span><h3>{expanded?t("流程工作台"):t("协作")}</h3></div><div className="collaboration-heading-actions"><Button variant="ghost" size="sm" onClick={refresh}>{t("刷新运行记录")}</Button></div></header>
  {!sessionId?<p className="hint">{t("开始任务后查看运行记录")}</p>:error?<p role="alert">{error}</p>:!current?<p className="hint">{t("正在读取运行记录")}</p>:<>
   {emptyWork?automatic:null}
   {outcome&&outcomeSnapshot?<CollaborationOutcomePanel snapshot={outcomeSnapshot} outcome={outcome} compact={expanded} onInspect={navigateOutcome}><Button ref={expandTrigger} variant="outline" size="sm" aria-expanded={expanded} onClick={()=>{setInspection(undefined);update({expanded:!expanded})}}>{expanded?t("返回对话协作台"):t("展开流程工作台")}</Button></CollaborationOutcomePanel>:null}
   <p className="hint collaboration-source">{live?(current.team===undefined&&ownedTeam?t("团队单独读取；并非同一快照"):t("来自当前会话的统一编排；每两秒刷新")):t("磁盘记录只读；查看不会启动或恢复任务")}</p>
   {current.teamIssue?<p role="alert" data-authored="1">{current.teamIssue}</p>:null}
   {current.observationIssue?<p role="alert" data-authored="1">{current.observationIssue}</p>:null}
   {count&&count.total?<div className="collaboration-counts"><strong>{tf("{0} 项任务",count.total)}</strong><span>{tf("{0} 项验收通过",count.accepted)}</span><span>{tf("{0} 项活跃",count.active)}</span>{expanded?<><span>{tf("{0} 项执行完成",runs.filter(r=>r.state==='completed').length)}</span>{current.budget?<span>{tf("可核验 token {0} · 未知用量 {1} 轮",current.budget.knownTokens,current.budget.unknownRuns)}</span>:null}<span>{t("费用未记录")}</span></>:null}</div>:null}
   <div className="collaboration-body">
   {expanded?<CollaborationWorkflow snapshot={current} team={ownedTeam} selected={selected} onSelect={(selection,trigger)=>{update({selection});setInspection({owner:sessionId,key:selection,trigger})}}/>:null}
   {ownedTeam?.tasks.length&&!expanded?<div className="collaboration-task-board"><h4>{t("任务板")}</h4>{ownedTeam.tasks.map(task=><Button key={task.id} variant="ghost" size="menu-row" aria-pressed={selected===collaborationTaskKey(ownedTeam.id,task.id)} onClick={()=>update({selection:collaborationTaskKey(ownedTeam.id,task.id)})}>{task.subject}</Button>)}</div>:null}
   {runs.length===0&&!ownedTeam?.tasks.length?<><p className="hint">{t("这段会话暂无子任务运行记录")}</p>{!ownedTeam?<p className="hint team-empty">{t("这段会话没有团队。对模型说「用团队分工做…」，或在输入框打 /team。")}</p>:null}</>:<>
    <div hidden={expanded} className="collaboration-roster" aria-label={t("协作任务")}>
     {runs.map(r=><div className="run-overview-row collaboration-row" key={r.id} data-run={r.id} data-phase={live?r.phase:'unknown'} data-selected={selected===`run:${r.id}`}>
      <Button variant="ghost" size="menu-row" className="collaboration-task" aria-label={r.label} aria-pressed={selected===`run:${r.id}`} onClick={()=>update({selection:`run:${r.id}`})}>
       <span className="collaboration-avatar" aria-hidden="true">{[...r.label][0]?.toUpperCase()??'?'}</span>
       <span className="collaboration-task-copy"><strong data-authored="1">{r.label}</strong><small>{runStatus(r,live)}</small><AgentObservation snapshot={current} run={r} owner={sessionId}/></span>
       <span className="collaboration-task-meta"><span className="collaboration-state" data-phase={live?r.phase:'unknown'}>{r.kind==='bot'?'Bot':r.kind==='team'?t("团队成员"):t("子任务")}</span><small>{settledDuration(r)}</small></span>
      </Button>
     </div>)}
    </div>
    {(run||task)&&(!expanded||inspecting)?<div className="collaboration-detail" data-selected-run={task?undefined:run?.id}>
     <header className="collaboration-detail-heading">
      <div><strong data-authored="1">{task?.subject??run?.label}</strong>{run&&!task?<small className="hint">{tf("类型 {0} · 执行代次 {1}",run.kind,run.epoch)}</small>:null}</div>
      {expanded?<Button ref={detailClose} variant="ghost" size="sm" aria-label={t("收起检查面板")} onClick={event=>{
       const dialog=event.currentTarget.closest('dialog'),origin=inspection?.trigger
       const target=origin?.isConnected&&dialog?.contains(origin)?origin:dialog?.querySelector<HTMLButtonElement>('[data-member-card][aria-pressed="true"], [data-task-id][aria-pressed="true"], .collaboration-network-node[aria-pressed="true"]')??expandTrigger.current
       target?.focus({preventScroll:true});setInspection(undefined)
      }}><关闭图标/></Button>:null}
     </header>
     <nav ref={tabsRef} className="collaboration-tabs" role="tablist" aria-label={t("任务详情")} onKeyDown={event=>{const tabs=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];const at=tabs.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==='ArrowRight'?(at+1)%tabs.length:event.key==='ArrowLeft'?(at+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;if(next>=0){event.preventDefault();tabs[next]?.focus();tabs[next]?.click()}}}>
      <Button variant="ghost" size="sm" role="tab" data-collaboration-tab="process" id={`${tabId}-process`} aria-controls={`${tabId}-panel`} aria-selected={tab==='process'} tabIndex={tab==='process'?0:-1} onClick={()=>setTab('process')}>{t("过程")}</Button>
      <Button variant="ghost" size="sm" role="tab" data-collaboration-tab="handoff" id={`${tabId}-handoff`} aria-controls={`${tabId}-panel`} aria-selected={tab==='handoff'} tabIndex={tab==='handoff'?0:-1} onClick={()=>setTab('handoff')}>{t("交接")}</Button>
      <Button variant="ghost" size="sm" role="tab" data-collaboration-tab="artifacts" id={`${tabId}-artifacts`} aria-controls={`${tabId}-panel`} aria-selected={tab==='artifacts'} tabIndex={tab==='artifacts'?0:-1} onClick={()=>setTab('artifacts')}>{t("产物")}</Button>
      <Button variant="ghost" size="sm" role="tab" data-collaboration-tab="records" id={`${tabId}-records`} aria-controls={`${tabId}-panel`} aria-selected={tab==='records'} tabIndex={tab==='records'?0:-1} onClick={()=>setTab('records')}>{t("记录")}</Button>
     </nav>
     <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`}>
     {task?<CollaborationTaskDetail key={`${task.id}:${task.attemptId}`} task={task} snapshot={current} timeline={attempt} pendingDependencies={dependencies} live={live} onInspect={inspect} teamId={ownedTeam?.id} inspectToolRecord={!!ownedTeam?.members.some(m=>m.name===task.assignee&&!m.botId)} tab={tab} client={client} sessionId={sessionId!}/>:run?<>
     {tab==='process'?<>
      <AgentObservation snapshot={current} run={run} owner={sessionId} details/>
      <TaskTimeline key={JSON.stringify([sessionId,run.id,run.epoch])}
       events={directTaskTimeline(current.history,run)} truncated={current.history?.truncated}
       current={run} live={live} status={runStatus(run,live)}
       reason={(hasCurrentSettlement(run)?run.taskReceipt?.reason:undefined)||(run.phase!=='queued'&&run.state!=='queued'?run.reason:undefined)}
       toolCount={run.trace?.records.length??0}
       versionCount={hasCurrentSettlement(run)?run.taskReceipt?.versions?.outputs.length??0:0} onInspect={inspect}/>
      <p>{run.contract?t("已冻结任务契约"):t("普通委派任务")}</p><p className="hint">{acceptance(run)}</p>
     </>:null}
     {tab==='handoff'?<CollaborationHandoff key={`${run.id}:${run.epoch}`} run={run}/>:null}
     {tab==='artifacts'?<><p>{acceptance(run)}</p>{hasCurrentSettlement(run)?<p>{tf("输入版本 {0} · 产物版本 {1}",run.inputVersions,run.outputVersions)}</p>:<p className="hint">{t("本轮产物尚未结算；保留的上次结果不作为本轮验收")}</p>}<p className="hint">{t("版本数量来自宿主回执；不代表文件当前内容已重新核验。")}</p></>:null}
     {tab==='records'?<><p>{tf("类型 {0} · 执行代次 {1}",run.kind,run.epoch)}</p><p className="hint">{live?t("实时编排记录"):t("历史记录")}</p><p>{tf("保留版本信息：输入 {0} · 产物 {1}",run.inputVersions,run.outputVersions)}</p><code data-authored="1">{run.id}</code><RunHistory snapshot={{...current,history:{events:current.history?.events.filter(e=>e.childId===run.id&&e.epoch===run.epoch)??[],truncated:current.history?.truncated??false}}}/></>:null}
     {(hasCurrentSettlement(run)||tab==='records'&&!!run.trace)&&sessionId&&(tab==='artifacts'||tab==='records')?<CollaborationEvidence key={`${sessionId}:${run.id}:${run.epoch}`} client={client} sessionId={sessionId} receipt={run.taskReceipt} trace={run.trace} observation={run.observation} tab={tab} target={run.kind==="subagent"&&run.address.length===2?{kind:"run",id:run.id,epoch:run.epoch}:undefined}/>:null}
     </>:null}
     </div>
     {memberRun&&current&&sessionId?<CollaborationMemberPanel key={`${sessionId}:${memberRun.id}:${memberRun.epoch}`} snapshot={current} run={memberRun} owner={sessionId} onOpen={onView?openMember:undefined} onBot={openBot} onPrepare={onPrepare}/>:null}
    </div>:null}
   </>}
   </div>
   {!emptyWork?automatic:null}
   <footer className="collaboration-footer">
    {current.budget&&sessionId?<details><summary>{t("查看额度")}</summary><RunBudgetPanel key={sessionId} client={client} sessionId={sessionId} budget={current.budget} live={live} onSaved={refresh}/></details>:null}
    <details ref={historyRef}><summary>{t("会话完整执行记录")}</summary><RunHistory snapshot={current}/></details>
   </footer>
  </>}
 </section>
 return expanded?<CollaborationExpanded key={sessionId} onClose={()=>update({expanded:false})} onRestoreFocus={()=>expandTrigger.current?.focus({preventScroll:true})}>{content}</CollaborationExpanded>:content
}
