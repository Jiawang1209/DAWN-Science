import {collaborationMemberPresentation} from './collaboration-member.js'
import {三角图标} from './icons.js'
import {useState} from 'react'
import {CollaborationNetwork} from './collaboration-network.js'
import {AgentObservation} from './agent-observation-view.js'
import {settledDuration} from './collaboration-model.js'
import {色号} from './team-dag.js'
import type {TeamSnapshot} from '../protocol/index.js'
import type {RunOverview} from '../protocol/run-overview.js'
import {分列布局,节点宽,节点高,任务的态} from './team-dag.js'
import {Button} from './primitives.js'
import {t,tf} from './i18n/index.js'
import {runStatus,collaborationTaskKey,hasCurrentAcceptance} from './collaboration-model.js'
export function CollaborationWorkflow({snapshot,team,selected,onSelect}:{snapshot:RunOverview;team?:TeamSnapshot|undefined;selected?:string|undefined;onSelect:(key:string,trigger:HTMLButtonElement)=>void}){
 const[query,setQuery]=useState(''),[filter,setFilter]=useState('all')
 const active=(run:RunOverview['runs'][number])=>snapshot.source==='live'&&(run.phase==='running'||run.phase==='queued'||run.phase==='stopping')
 const presentations=new Map(snapshot.runs.map(run=>[run.id,collaborationMemberPresentation(snapshot,run)]))
 const visible=snapshot.runs.filter(run=>[run.label,presentations.get(run.id)?.title,presentations.get(run.id)?.identity,presentations.get(run.id)?.task].filter(Boolean).join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(filter==='all'||(filter==='active'?active(run):run.phase!=='unknown'&&snapshot.source==='live'&&!active(run)&&['completed','failed','cancelled','interrupted'].includes(run.state))))
 const owned=team?.captainSessionId===snapshot.ownerSessionId?team:undefined
 const layout=分列布局(owned?.tasks??[])
 const scale=1.25
 return <section className="collaboration-workflow" aria-label={t("流程工作台")}>
  <div className="collaboration-workflow-columns">
   <section className="collaboration-network-panel"><header><h4>{t("Agent 网络")}</h4><span className="hint">{t("宿主与直接委派关系 · 点击节点联动")}</span></header>
    <p className="hint">{owned?.tasks.length?t("连线表示直接委派；任务依赖另列于下方"):t("未声明任务依赖；这些执行记录按并列展示")}</p>
    <CollaborationNetwork snapshot={snapshot} selected={selected} onSelect={onSelect}/>
   </section>
   <section className="collaboration-members"><header><h4>{t("编队成员")}</h4><span>{tf("{0} 项任务",snapshot.runs.length)}</span></header>
    <div className="collaboration-member-tools">
     <input className="control" type="search" aria-label={t("搜索协作成员")} placeholder={t("按名称搜索")} value={query} onChange={event=>setQuery(event.target.value)}/>
     <div className="collaboration-filter" role="group" aria-label={t("成员状态筛选")}>
      <Button variant="ghost" size="sm" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>{t("显示全部成员")}</Button>
      <Button variant="ghost" size="sm" aria-pressed={filter==='active'} onClick={()=>setFilter('active')}>{t("只看活跃成员")}</Button>
      <Button variant="ghost" size="sm" aria-pressed={filter==='settled'} onClick={()=>setFilter('settled')}>{t("只看已结束")}</Button>
     </div>
    </div>
    <div className="collaboration-member-grid">
     {visible.map(run=>{const display=presentations.get(run.id)!;return <Button key={run.id} variant="outline" size="card-compact" className="collaboration-member-card" data-member-card={run.id} data-compact="true" data-hue={色号(run.id)} aria-label={run.label} aria-pressed={selected===`run:${run.id}`} onClick={event=>onSelect(`run:${run.id}`,event.currentTarget)}>
      <span className="collaboration-node-name"><span className="collaboration-avatar" aria-hidden="true">{[...run.label][0]?.toUpperCase()??'?'}</span><strong data-authored="1">{display.title}</strong><span className="collaboration-status-dot" data-phase={snapshot.source==='live'?run.phase:'unknown'}/></span>
      <small className="collaboration-member-identity" title={display.identity||run.label} data-authored="1">{display.identity||run.label}</small>
      {display.task?<small className="collaboration-member-task" title={display.task} data-authored="1">{display.task}</small>:null}
      <span className="collaboration-member-status"><small>{runStatus(run,snapshot.source==='live')}</small>{snapshot.source==='live'&&hasCurrentAcceptance(run)?<small className="collaboration-accepted">{t("宿主验收通过")}</small>:null}</span>
      {run.reason?<small className="collaboration-member-task" title={run.reason} data-authored="1">{run.reason}</small>:null}
      <AgentObservation snapshot={snapshot} run={run} compact/><span className="collaboration-card-foot"><small>{settledDuration(run)}</small><三角图标/></span>
     </Button>})}
    </div>
    {!visible.length?<p className="hint">{t("暂无匹配成员")}</p>:null}
   </section>
  </div>
  {owned?.tasks.length?<><h4>{t("任务依赖")}</h4><p className="hint">{t("连线仅表示任务声明的前置关系；成员执行记录不与任务代次混用。")}</p>
   <div className="collaboration-graph-scroll" tabIndex={0} aria-label={t("横向滚动查看任务依赖")}>
    <div className="collaboration-graph" style={{width:layout.width*scale,height:layout.height*scale}}>
     <svg width={layout.width*scale} height={layout.height*scale} aria-hidden="true"><g transform={`scale(${scale})`}>
      {layout.edges.map(edge=><path key={`${edge.from}:${edge.to}`} data-workflow-edge={`${edge.from}:${edge.to}`} d={edge.path}/>)}
     </g></svg>
     {layout.nodes.map(({task,x,y})=><Button key={task.id} variant="outline" size="card-compact" className="collaboration-graph-node" style={{left:x*scale,top:y*scale,width:节点宽*scale,height:节点高*scale}} data-task-id={task.id} data-state={任务的态(task,owned.tasks)} aria-label={task.subject} aria-pressed={selected===collaborationTaskKey(owned.id,task.id)} onClick={event=>onSelect(collaborationTaskKey(owned.id,task.id),event.currentTarget)}><strong data-authored="1">{task.subject}</strong><small>{tf("第 {0} 次",task.attempt)}</small></Button>)}
    </div>
   </div>
  </>:null}
 </section>
}
