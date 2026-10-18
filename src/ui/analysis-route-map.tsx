import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisRoute } from '../protocol/analysis-route.js'
import { routeFocus, routeLayers, routeMapState, type RouteMapState } from './route-map-model.js'
import { Button } from './primitives.js'
import { 勾图标, 时钟描边图标, 三角图标 } from './icons.js'
import { t, tf } from './i18n/index.js'

export const mapStateLabel=(state:RouteMapState):string=>({active:t("处理中"),awaiting:t("待确认"),delivered:t("已交付"),skipped:t("已跳过"),review:t("需要复核"),blocked:t("有阻塞"),waiting:t("等待前置"),recorded:t("记录进行中"),pending:t("待开始")})[state]
export function AnalysisRouteMap({route,selectedId,workingStepId,awaitingInput,onSelect}:{
  route:AnalysisRoute;selectedId:string|undefined;workingStepId:string|undefined;awaitingInput:boolean;onSelect:(id:string)=>void
}) {
  const layers=useMemo(()=>routeLayers(route),[route])
  const focus=routeFocus(route,workingStepId)
  const allDelivered=route.steps.every(step=>step.status==='delivered')
  const finished=route.steps.every(step=>step.status==='delivered'||step.status==='skipped')
  const active=route.steps.find(step=>step.id===workingStepId)
  const heading=active ? awaitingInput?tf("等待你确认：{0}",active.title):tf("正在处理：{0}",active.title) :
    allDelivered?t("本轮路线已交付"):finished?t("本轮步骤已处理"):focus?.status==='in_progress'?tf("待核对进度：{0}",focus.title):
    focus && routeMapState(route,focus,undefined)!=='pending'?tf("等待处理：{0}",focus.title):tf("下一步：{0}",focus?.title??'')
  const stage=useRef<HTMLDivElement>(null)
  const [paths,setPaths]=useState<{from:string;to:string;d:string;passed:boolean}[]>([])
  const marker=useId().replace(/:/g,'')
  const [narrow,setNarrow]=useState(false)
  const vertical=layers.length>3 || (narrow&&layers.length>1)
  useLayoutEffect(()=>{
    const measure=()=>{
      if(!stage.current)return
      const base=stage.current.getBoundingClientRect()
      setNarrow(base.width>0&&base.width<320)
      const nodes=new Map([...stage.current.querySelectorAll<HTMLElement>('[data-route-step]')].map(el=>[el.dataset.routeStep!,el.getBoundingClientRect()]))
      setPaths(route.steps.flatMap(step=>step.dependencies.flatMap(id=>{
        const from=nodes.get(id),to=nodes.get(step.id)
        if(!from||!to)return []
        const a=vertical?{x:from.left+from.width/2-base.left,y:from.bottom-base.top+2}:{x:from.right-base.left+2,y:from.top+from.height/2-base.top}
        const b=vertical?{x:to.left+to.width/2-base.left,y:to.top-base.top-5}:{x:to.left-base.left-5,y:to.top+to.height/2-base.top}
        const d=vertical?`M${a.x} ${a.y} C${a.x} ${(a.y+b.y)/2},${b.x} ${(a.y+b.y)/2},${b.x} ${b.y}`:`M${a.x} ${a.y} C${(a.x+b.x)/2} ${a.y},${(a.x+b.x)/2} ${b.y},${b.x} ${b.y}`
        return [{from:id,to:step.id,d,passed:route.steps.find(s=>s.id===id)?.status==='delivered'}]
      })))
    }
    const observer=new ResizeObserver(measure)
    if(stage.current)observer.observe(stage.current)
    measure()
    return ()=>observer.disconnect()
  },[route,vertical])
  // Semantic edges exist before measurement too (e.g. DOM tests); coordinates
  // are only a rendering detail. The protocol already validates the DAG.
  const edges=route.steps.flatMap(step=>step.dependencies.map(id=>({from:id,to:step.id})))
  return <section className="route-map-shell" aria-label={t("分析路线图")}>
    <p className="route-map-count">{tf("{0} 个步骤 · 已交付 {1} 个",route.steps.length,route.steps.filter(step=>step.status==='delivered').length)}</p>
    <p className="route-current-position" role="status" data-state={active?(awaitingInput?'awaiting':'active'):'idle'}>{heading}</p>
    <div className="route-map-scroll"><div className="route-map" ref={stage} data-direction={vertical?'vertical':'horizontal'} style={{gridTemplateColumns:vertical?undefined:`repeat(${Math.max(1,layers.length)},minmax(0,1fr))`}}>
      <svg className="route-map-edges" aria-hidden="true"><defs><marker id={marker} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5Z" fill="currentColor"/></marker></defs>{edges.map(edge=>{
        const path=paths.find(p=>p.from===edge.from&&p.to===edge.to)
        return <path key={JSON.stringify([edge.from,edge.to])} data-route-edge data-from={edge.from} data-to={edge.to} data-passed={path?.passed} d={path?.d} markerEnd={`url(#${marker})`}/>
      })}</svg>
      {layers.map((layer,index)=><div className="route-map-layer" key={index} data-parallel={layer.length>1} style={vertical?{gridTemplateColumns:`repeat(${layer.length},minmax(0,1fr))`}:undefined}>{layer.map(step=>{
        const state=routeMapState(route,step,workingStepId,awaitingInput)
        return <Button key={step.id} variant="ghost" className="route-map-node" data-route-step={step.id} data-state={state} aria-pressed={selectedId===step.id} aria-label={tf("查看步骤 {0} {1}",step.id,step.title)} onClick={()=>onSelect(step.id)}>
          <span className="route-node-number">{tf("第 {0} 步",route.steps.indexOf(step)+1)}</span><strong>{step.title}</strong>
          <span className="route-node-status">{state==='delivered'?<勾图标/>:state==='active'?<三角图标/>:<时钟描边图标/>}{mapStateLabel(state)}</span>
        </Button>
      })}</div>)}
    </div></div>
    <div className="route-map-legend"><span><勾图标/>{t("已交付")}</span><span className="route-legend-active"><三角图标/>{t("处理中")}</span><span>○ {t("待开始")}</span><span className="route-legend-selected">□ {t("正在查看")}</span></div>
  </section>
}
