/** Host acceptance reuses analysis-route evidence and file checks. */
import {Type} from 'typebox'
import {resolve} from 'node:path'
import type {AnalysisRoute} from '../protocol/analysis-route.js'
import {TaskResultSchema,type TaskContract,type TaskReceipt} from '../protocol/task-contract.js'
export * from '../protocol/task-contract.js'
import {validateRouteEvidence,type RouteToolEvidence} from '../runtime/analysis-route-evidence.js'
import {routeDeliverableEvidence} from '../runtime/analysis-route-files.js'
export function taskPrompt(task:string,contract?:TaskContract):string {
  if(!contract)return task
  if(contract.resultType==='data-summary')task+='\n字段语义：data.issues 和 blockers 只填阻止当前核查阶段通过的未解决问题。无阻塞时 issues=[]；已按批准方法处理的 NA、信息性发现和本阶段不承担的下游产物放 summary/columns，不要填入 issues。blocked 是正式终态，提交后冻结，不能用来表达普通说明或申请当轮重试。'
  return `${task}\n\n任务契约（范围已冻结）：${JSON.stringify(contract)}\n${contract.acceptance?'宿主将按冻结 acceptance 规则读取真实文件复核；表格JSON须含 n、unit 和顶层数值指标，与 data.metrics/sampleCount 保持一致；文字自称通过不能替代宿主检查。':''}\n${contract.submission==='tool'?'必须调用 submit_task_result 提交最终结果；纯文本/JSON 不算提交。工具报错可在本轮修正参数。提交成功（含 blocked）后不能再调用其他工具。':'可调用 submit_task_result 正式提交；未使用时最终答复须仅为 JSON。'}格式：{summary:string,blockers:string[],deliverables:[{path:string,note?:string}],execution:{state:"not_run"|"partial"|"completed"|"failed",note:string,toolCallIds?:string[]},verification:{state:"unreviewed"|"reviewed"|"issues",note:string,toolCallIds?:string[]},data?:按 resultType 要求的数据对象}。resultType=data-summary 时 data={kind:"data-summary",rows:number,columns:[{name,type?,unit?}],issues:string[]}；model-metrics 时 data={kind:"model-metrics",method:string,metrics:{名称:number},sampleCount?:number,caveats:string[]}；review 时 data={kind:"review",verdict:"pass"|"revise"|"blocked",findings:string[],reviewedPaths:string[],revisionInstructions?:string}。执行/审阅声明须引用实际本轮工具 callId。工具结果正文末尾的 [task_tool_evidence] 是宿主追加的本任务真实调用标签，含 toolCallId、工具状态、执行状态和路径；不是科学结论或文件内容。提交报错返回 fieldErrors、冻结契约要求和 evidenceCatalog（仅最近调用）；省略数量、截断字段均有标记。不得猜测 ID、借用其他任务 ID 或引用截断 ID；较早未列出的本任务完整 ID 仍可使用。审阅须真实读取 reviewedPaths 中的文件。文件存在、格式通过和工具执行不等于科学正确。阻塞用 blockers 交还主 agent，不得扩大权限。`
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
    const references=[...(result.execution.toolCallIds??[]),...(result.verification.toolCallIds??[])]
    if(references.some(id=>evidence.filter(tool=>tool.toolCallId===id).length!==1))throw new Error('执行/审阅引用须对应唯一的实际工具记录；不能引用缺失或重复的 ID')
    if(contract.resultType&&result.data?.kind!==contract.resultType)throw new Error('缺少契约指定的科学结果 data 类型')
    if(result.data?.kind==='data-summary'&&contract.requireReview){const ids=new Set(result.verification.toolCallIds??[]);if(contract.inputs.some(path=>!evidence.some(tool=>ids.has(tool.toolCallId)&&tool.name==='read'&&tool.status==='done'&&typeof tool.input==='object'&&tool.input!==null&&typeof (tool.input as {path?:unknown}).path==='string'&&resolve(workspace,(tool.input as {path:string}).path)===resolve(workspace,path))))throw new Error('数据核查缺少声明输入的真实 read 证据')}
    if(result.data?.kind==='review'){
      const ids=new Set(result.verification.toolCallIds??[])
      const reviewed=result.data.reviewedPaths
      if(contract.inputs.some(path=>!reviewed.includes(path))||reviewed.some(path=>!contract.inputs.includes(path)))throw new Error('审阅文件须与声明输入一致')
      if(reviewed.some(path=>!evidence.some(tool=>ids.has(tool.toolCallId)&&tool.name==='read'&&tool.status==='done'&&typeof tool.input==='object'&&tool.input!==null&&typeof (tool.input as {path?:unknown}).path==='string'&&resolve(workspace,(tool.input as {path:string}).path)===resolve(workspace,path))))throw new Error('审阅文件缺少本轮真实 read 证据')
      if(result.verification.state==='unreviewed')throw new Error('审阅结果需要实际审阅证据')
    }
    if(new Set(result.deliverables.map(d=>d.path)).size!==result.deliverables.length)throw new Error('Duplicate deliverables')
    if(result.deliverables.some(d=>!contract.outputs.includes(d.path)))throw new Error('产物未在契约 outputs 声明')
    const step={id:'task',title:'子任务',purpose:'契约验收',inputs:contract.inputs,outputs:contract.outputs,dependencies:[],status:'pending' as const,blockers:result.blockers,cases:[],deliverables:result.deliverables,execution:result.execution,verification:result.verification,needsReview:true,notes:[]}
    const route:AnalysisRoute={routeId:'task',revision:1,updatedAt:Date.now(),title:'task',goal:'task',dataContext:[],steps:[step]}
    const scoped=evidence.map(e=>({...e,stepId:'task'}))
    validateRouteEvidence(route,undefined,scoped,'')
    const physical=routeDeliverableEvidence(route,[],workspace,false)
    const deliverables=routeDeliverableEvidence(route,scoped,workspace,false)
    if(result.blockers.length||result.execution.state==='failed'||result.verification.state==='issues'||result.data?.kind==='review'&&result.data.verdict!=='pass'||result.data?.kind==='data-summary'&&result.data.issues.length>0||contract.requireExecution&&result.execution.state!=='completed'||contract.requireReview&&result.verification.state!=='reviewed')return{version:1,state:'blocked',summary:result.summary,reason:'存在阻塞、执行/审阅问题或缺少契约要求的证据，未放行下游',result,deliverables}
    if(contract.outputs.some(p=>!result.deliverables.some(d=>d.path===p)))throw new Error('缺少声明的产物回执')
    if(physical.some(d=>d.state==='missing'||d.state==='unknown'))throw new Error('声明产物不存在、不是文件或无法安全核验')
    return{version:1,state:'accepted',summary:result.summary,result,deliverables}
  }catch(error){return invalid(error instanceof Error?error.message:String(error))}
}

export const TaskContractParameters=Type.Object({submission:Type.Optional(Type.Literal('tool')),resultType:Type.Optional(Type.Union([Type.Literal('data-summary'),Type.Literal('model-metrics'),Type.Literal('review')])),requireExecution:Type.Optional(Type.Boolean()),requireReview:Type.Optional(Type.Boolean()),version:Type.Optional(Type.Literal(1)),inputs:Type.Optional(Type.Array(Type.String())),outputs:Type.Optional(Type.Array(Type.String())),access:Type.Optional(Type.Union([Type.Literal("read-only"),Type.Literal("workspace-write"),Type.Literal("workspace-exec")]))})
