/** Scientific constraints shared by execution prompts and historical-adoption signatures. */
import type {AnalysisRoute} from './analysis-route.js'
const hostNote='交付事实来自子任务宿主回执；工具与格式验收不等于科学认证。'
const hostMarker=/^\[science-pipeline:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+\]$/
const hostHistory=/^(?:执行历史（(?:not_run|partial|completed|failed)）|审查历史（(?:unreviewed|reviewed|issues)）)：\[science-pipeline:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+\] /
export function scienceStepContext(s:AnalysisRoute['steps'][number]){return{id:s.id,title:s.title,purpose:s.purpose,inputs:s.inputs,outputs:s.outputs,dependencies:s.dependencies,cases:s.cases,selectedCase:s.selectedCase,blockers:s.blockers,notes:s.notes.filter(n=>n!==hostNote&&!hostMarker.test(n)&&!hostHistory.test(n))}}
export function scienceRouteContext(route:AnalysisRoute){return{routeId:route.routeId,title:route.title,goal:route.goal,dataContext:route.dataContext,steps:route.steps.map(scienceStepContext)}}
