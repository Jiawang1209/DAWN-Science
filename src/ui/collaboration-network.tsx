import {collaborationMemberPresentation} from './collaboration-member.js'
import {useEffect,useRef,useState} from 'react'
import type {RunOverview} from '../protocol/run-overview.js'
import {Button} from './primitives.js'
import {t,tf} from './i18n/index.js'
import {runStatus,settledDuration} from './collaboration-model.js'
import {色号} from './team-dag.js'
import {AgentObservation} from './agent-observation-view.js'
export {usageLabel} from './agent-observation.js'
export function CollaborationNetwork({snapshot,selected,onSelect}:{snapshot:RunOverview;selected?:string|undefined;onSelect:(key:string,trigger:HTMLButtonElement)=>void}){
 const viewport=useRef<HTMLDivElement>(null),[width,setWidth]=useState(760)
 useEffect(()=>{const el=viewport.current;if(!el)return;const observer=new ResizeObserver(()=>setWidth(el.clientWidth));observer.observe(el);setWidth(el.clientWidth);return()=>observer.disconnect()},[])
 const w=Math.max(360,width),columns=Math.min(4,Math.max(1,snapshot.runs.length),Math.max(1,Math.floor(w/230))),rows=Math.ceil(snapshot.runs.length/columns),h=190+rows*252
 const columnWidth=w/columns
 const nodes=snapshot.runs.map((run,i)=>({run,display:collaborationMemberPresentation(snapshot,run),x:columnWidth*(i%columns)+(columnWidth-210)/2,y:190+Math.floor(i/columns)*252}))
 return <div ref={viewport} className="collaboration-network-scroll" tabIndex={0} aria-label={t("Agent 网络，可滚动查看")}>
  <div className="collaboration-network" style={{width:w,height:h}}>
   <svg width={w} height={h} aria-hidden="true">{nodes.map(({run,x,y})=><path key={run.id} data-lineage-edge={run.id} data-hue={色号(run.id)} data-running={snapshot.source==='live'&&(run.phase==='running'||run.phase==='stopping')} d={`M${w/2} 146 C${w/2} 186,${x+105} ${y-50},${x+105} ${y}`}/>)}</svg>
   <div className="collaboration-root-node" style={{left:w/2-110,top:24}}><span className="collaboration-eyebrow">{t("当前会话")}</span><strong>{t("主助手")}</strong><span className="hint">{tf("直接编排 {0} 项执行",snapshot.runs.length)}</span><span>{t("拆解 · 派发 · 汇总")}</span></div>
   {nodes.map(({run,x,y,display})=><Button key={run.id} variant="outline" size="card-compact" className="collaboration-network-node" style={{left:x,top:y}} data-hue={色号(run.id)} aria-label={tf("网络节点：{0}",run.label)} aria-pressed={selected===`run:${run.id}`} onClick={event=>onSelect(`run:${run.id}`,event.currentTarget)}><span className="collaboration-node-name"><span className="collaboration-status-dot" data-phase={snapshot.source==='live'?run.phase:'unknown'}/><strong data-authored="1">{display.title}</strong></span>{display.identity?<small data-authored="1">{display.identity}</small>:null}<AgentObservation snapshot={snapshot} run={run}/><small>{runStatus(run,snapshot.source==='live')}</small><small>{settledDuration(run)}</small></Button>)}
  </div>
 </div>
}
