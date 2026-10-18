import { parseRouteActionMessage, routeContinueBlockers, type AnalysisRoute, type RouteStep } from '../protocol/analysis-route.js'
import { 任务深度 } from './team-dag.js'

/** Reuse the team's dependency-depth model; IDs and array positions never imply edges. */
export function routeLayers(route: AnalysisRoute): RouteStep[][] {
  const depths=任务深度(route.steps)
  const layers=new Map<number,RouteStep[]>()
  for(const step of route.steps){const depth=depths.get(step.id)??0;layers.set(depth,[...(layers.get(depth)??[]),step])}
  return [...layers].sort(([a],[b])=>a-b).map(([,steps])=>steps)
}
export function activeRouteStep(route: AnalysisRoute|undefined, text: string|undefined, busy: boolean): string|undefined {
  if(!route || !text || !busy)return undefined
  const intent=parseRouteActionMessage(text)
  return intent?.action==='continue' && intent.routeId===route.routeId && intent.revision<=route.revision && route.steps.some(step=>step.id===intent.stepId) ? intent.stepId : undefined
}
export function routeFocus(route: AnalysisRoute, workingStepId?: string): RouteStep|undefined {
  const steps=routeLayers(route).flat()
  return steps.find(step=>step.id===workingStepId) ?? steps.find(step=>step.status==='in_progress') ??
    steps.find(step=>step.needsReview || step.blockers.length || step.status==='blocked') ??
    steps.find(step=>routeContinueBlockers(route,step.id).length===0) ??
    steps.find(step=>step.status!=='delivered'&&step.status!=='skipped') ?? steps.at(-1)
}
export type RouteMapState='active'|'awaiting'|'delivered'|'skipped'|'review'|'blocked'|'waiting'|'recorded'|'pending'
export function routeMapState(route:AnalysisRoute, step:RouteStep, workingStepId:string|undefined, awaitingInput=false):RouteMapState {
  if(step.id===workingStepId)return awaitingInput?'awaiting':'active'
  if(step.needsReview)return 'review'
  if(step.status==='blocked'||step.blockers.length)return 'blocked'
  if(step.status==='delivered'||step.status==='skipped')return step.status
  if(step.status==='in_progress')return 'recorded'
  if(step.dependencies.some(id=>{const parent=route.steps.find(s=>s.id===id);return !parent || parent.status!=='delivered'||parent.needsReview||parent.blockers.length}))return 'waiting'
  return 'pending'
}
