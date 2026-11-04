/** Host acceptance reuses analysis-route evidence and file checks. */
import {Type} from 'typebox'
import type {AnalysisRoute} from '../protocol/analysis-route.js'
import {TaskResultSchema,type TaskContract,type TaskReceipt} from '../protocol/task-contract.js'
export * from '../protocol/task-contract.js'
import {validateRouteEvidence,type RouteToolEvidence} from '../runtime/analysis-route-evidence.js'
import {routeDeliverableEvidence} from '../runtime/analysis-route-files.js'
export function taskPrompt(task:string,contract?:TaskContract):string {
  if(!contract)return task
  return `${task}\n\n任务契约（范围已冻结）：${JSON.stringify(contract)}\n最终答复必须仅为 JSON 对象：{summary:string,blockers:string[],deliverables:[{path:string,note?:string}],execution:{state:"not_run"|"partial"|"completed"|"failed",note:string,toolCallIds?:string[]},verification:{state:"unreviewed"|"reviewed"|"issues",note:string,toolCallIds?:string[]}}。执行/审阅声明须引用实际本轮工具 callId。文件只存在不等于由本轮生成；不得把完成或格式通过当科学正确。遇到范围限制用 blockers 交还主 agent，不得扩大权限。`
}
/** Declared inputs must be existing in-workspace files; this is readiness, not a read snapshot. */
export function taskInputReceipt(contract:TaskContract,workspace:string):TaskReceipt|undefined {
  const route:AnalysisRoute={routeId:'inputs',revision:1,updatedAt:Date.now(),title:'inputs',goal:'inputs',dataContext:[],steps:[{
    id:'task',title:'inputs',purpose:'input readiness',inputs:contract.inputs,outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],
    deliverables:contract.inputs.map(path=>({path})),execution:{state:'not_run',note:'preflight'},verification:{state:'unreviewed',note:'preflight'},needsReview:true,notes:[],
  }]}
  const files=routeDeliverableEvidence(route,[],workspace,false)
  const missing=files.filter(f=>f.state!=='exists')
  return missing.length?{version:1,state:'blocked',summary:'任务输入尚未就绪',reason:`声明输入不存在、越界或无法核验：${missing.map(f=>f.path).join('、')}`,deliverables:[]}:undefined
}
export function acceptTaskResult(contract:TaskContract,text:string,evidence:readonly RouteToolEvidence[],workspace:string,remote=false):TaskReceipt {
  const invalid=(reason:string):TaskReceipt=>({version:1,state:'invalid',summary:'子任务未通过契约验收',reason,deliverables:[]})
  try {
    if(remote)throw new Error('远端任务尚不支持本地契约验收，未检查本机同名路径')
    const inputProblem=taskInputReceipt(contract,workspace)
    if(inputProblem)return inputProblem
    const result=TaskResultSchema.parse(JSON.parse(text.trim()))
    if(new Set(result.deliverables.map(d=>d.path)).size!==result.deliverables.length)throw new Error('Duplicate deliverables')
    if(result.deliverables.some(d=>!contract.outputs.includes(d.path)))throw new Error('产物未在契约 outputs 声明')
    const step={id:'task',title:'子任务',purpose:'契约验收',inputs:contract.inputs,outputs:contract.outputs,dependencies:[],status:'pending' as const,blockers:result.blockers,cases:[],deliverables:result.deliverables,execution:result.execution,verification:result.verification,needsReview:true,notes:[]}
    const route:AnalysisRoute={routeId:'task',revision:1,updatedAt:Date.now(),title:'task',goal:'task',dataContext:[],steps:[step]}
    const scoped=evidence.map(e=>({...e,stepId:'task'}))
    validateRouteEvidence(route,undefined,scoped,'')
    const physical=routeDeliverableEvidence(route,[],workspace,false)
    const deliverables=routeDeliverableEvidence(route,scoped,workspace,false)
    if(result.blockers.length||result.execution.state==='failed'||result.verification.state==='issues'||contract.requireExecution&&result.execution.state!=='completed'||contract.requireReview&&result.verification.state!=='reviewed')return{version:1,state:'blocked',summary:result.summary,reason:'存在阻塞、执行/审阅问题或缺少契约要求的证据，未放行下游',result,deliverables}
    if(contract.outputs.some(p=>!result.deliverables.some(d=>d.path===p)))throw new Error('缺少声明的产物回执')
    if(physical.some(d=>d.state==='missing'||d.state==='unknown'))throw new Error('声明产物不存在、不是文件或无法安全核验')
    return{version:1,state:'accepted',summary:result.summary,result,deliverables}
  }catch(error){return invalid(error instanceof Error?error.message:String(error))}
}

export const TaskContractParameters=Type.Object({requireExecution:Type.Optional(Type.Boolean()),requireReview:Type.Optional(Type.Boolean()),version:Type.Optional(Type.Literal(1)),inputs:Type.Optional(Type.Array(Type.String())),outputs:Type.Optional(Type.Array(Type.String())),access:Type.Optional(Type.Union([Type.Literal("read-only"),Type.Literal("workspace-write"),Type.Literal("workspace-exec")]))})
