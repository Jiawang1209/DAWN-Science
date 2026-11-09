/** Pure host adapter: confirmed template inputs become the existing exact scientific contracts. */
import {createHash} from 'node:crypto'
import type {AnalysisRoute} from '../protocol/analysis-route.js'
import {ConfirmedPlanningSourceSchema,type ConfirmedPlanningSource} from '../protocol/planning-contract-source.js'
import {scienceTemplate} from '../team/science-templates.js'
import {pipelineStageContract} from '../team/science-pipeline.js'
import {planContractCatalog} from '../tools/plan-contract-bindings.js'
import {TaskArrangementSchema,type TaskArrangement} from '../protocol/task-arrangement.js'

export function buildPlanningContractContext(value:ConfirmedPlanningSource){
 const source=ConfirmedPlanningSourceSchema.parse(value)
 const recipe=scienceTemplate(source.template,source.outputRoot,source.inputs,source.dataPath)
 const definition={inputs:source.inputs,outputs:recipe.outputs,acceptance:recipe.acceptance,requireExecution:source.requireExecution}
 const contracts={check:pipelineStageContract(definition,'check'),analyze:pipelineStageContract(definition,'analyze'),review:pipelineStageContract(definition,'review')}
 return{ownerSessionId:source.ownerSessionId,revision:source.revision,source,instructions:recipe.instructions,contracts,catalog:planContractCatalog(contracts),
  fingerprint:createHash('sha256').update(JSON.stringify(source)).digest('hex')}
}
export type PlanningContractContext=ReturnType<typeof buildPlanningContractContext>

/** Missing source keeps legacy planning; an invalid or foreign source never silently weakens it. */
export function resolvePlanningContractContext(ownerSessionId:string,value:unknown,currentRoute?:AnalysisRoute):PlanningContractContext|undefined{
 if(value===undefined)return
 const source=ConfirmedPlanningSourceSchema.parse(value)
 if(source.ownerSessionId!==ownerSessionId)throw Error('科研约束来源不属于当前会话')
 if(source.route){
  if(!currentRoute||currentRoute.routeId!==source.route.routeId||currentRoute.revision!==source.route.revision)throw Error('科研约束引用的路线已变化，请重新确认')
  const step=currentRoute.steps.find(step=>step.id===source.route!.stepId&&step.status!=='skipped')
  if(!step)throw Error('科研约束引用的路线步骤不可用，请重新确认')
  if(source.inputs.some(input=>!step.inputs.includes(input)))throw Error('科研约束输入不属于当前路线步骤')
 }
 return buildPlanningContractContext(source)
}

/** Both structured tool input and a user's edited Markdown must retain confirmed requirements. */
export function assertPlanningArrangement(context:PlanningContractContext,value:TaskArrangement|undefined):void{
 if(!value)throw Error('科研约束已确认，请提交绑定目录的任务安排')
 const plan=TaskArrangementSchema.parse(value)
 for(const task of plan.tasks){
  if(!task.execution){if(plan.questions.length)continue;throw Error('科研任务需要完整执行契约')}
  const contract=task.execution.contract,stage=contract.resultType==='data-summary'?'check':contract.resultType==='model-metrics'?'analyze':contract.resultType==='review'?'review':undefined
  if(!stage||JSON.stringify(contract)!==JSON.stringify(context.contracts[stage])||task.review!==(stage==='review'))throw Error('任务合同与已确认科研约束不一致，不能降低验收或扩大权限')
  if(JSON.stringify(task.inputs)!==JSON.stringify(contract.inputs)||JSON.stringify(task.outputs)!==JSON.stringify(contract.outputs))throw Error('任务输入产物与已确认合同不一致')
 }
 // Questions cannot pass the existing approval gate; they are a read-only request
 // for another proposal, not an exception that authorizes partial execution.
 if(plan.questions.length)return
 if(plan.dispatch!=='team-v1')throw Error('科研约束需要有效执行绑定，不能省略后直接执行')
 const writers=plan.tasks.filter(task=>task.execution?.contract.resultType==='model-metrics')
 if(writers.length!==1)throw Error('此科研模板需要且只允许一个产物分析任务')
 if(context.source.independentReview&&!plan.independentReview)throw Error('不能删除已确认的独立审阅要求')
 if(plan.independentReview){
  const ancestors=(id:string):Set<string>=>new Set(plan.tasks.find(task=>task.id===id)!.dependencies.flatMap(dep=>[dep,...ancestors(dep)]))
  const reviews=plan.tasks.filter(task=>task.review)
  if(!reviews.length||reviews.some(task=>!ancestors(task.id).has(writers[0]!.id)))throw Error('独立审阅必须依赖本次分析产物')
 }
}
