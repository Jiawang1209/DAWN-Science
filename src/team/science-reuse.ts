import {scienceRouteContext} from '../protocol/science-route-context.js'
/** Explicit historical adoption, not a cache and never a new scientific execution. */
import {createHash} from 'node:crypto'
import {readFileSync,realpathSync} from 'node:fs'
import {SciencePipelineSchema,stageContract,type PipelineDefinition,type SciencePipeline} from '../protocol/science-pipeline.js'
import type {ScienceTemplate} from '../protocol/science-template.js'
import type {ScienceReuseContext,ScienceReuseDecision,ScienceEnvironment} from '../protocol/science-reuse.js'
import type {团队,任务} from './types.js'
import {validateAcceptanceReceipt,validateScienceAcceptance} from './science-acceptance.js'
import {assertFileVersions,validateVersionReceipt} from '../artifacts/task-versions.js'
import {sameFileVersions} from '../protocol/file-versions.js'
function stable(value:unknown):unknown {if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));return value}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
/** In bundled builds import.meta.url hashes the owning bundle; dev includes each gate module. */
export function scienceReuseBuild():string {
 const files=['./science-reuse.js','./science-python-bootstrap.js','../protocol/science-route-context.js','./science-pipeline-tools.js','./scheduler.js','../runtime/native.js','../subagent/task-tools.js','../orchestration/task-submission.js','../protocol/science-acceptance.js','../protocol/science-reuse.js','../protocol/science-template.js','../protocol/science-pipeline.js','../protocol/task-contract.js','./science-acceptance.js','./science-environment.js','./science-execution.js','../runtime/process-tree.js','./science-templates.js','./science-pipeline.js','./science-batch.js','../artifacts/task-versions.js','../orchestration/task-contract.js','../files/table.js','../kernel/environment.js']
 let fallback:string|undefined
 return hash(files.map(path=>{for(const url of [new URL(path,import.meta.url),new URL(path.replace(/\.js$/,'.ts'),import.meta.url)])try{return[path,createHash('sha256').update(readFileSync(url)).digest('hex')]}catch{};return[path,fallback??=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex')]}))
}
export function reuseContext(args:{workspace:string;template:ScienceTemplate;instructions:string;definition:PipelineDefinition;settings:SciencePipeline['settingsByStage'];actors:unknown;environment:ScienceEnvironment;build:string}):ScienceReuseContext {
 const {definition:d}=args
 const outputs=new Map(d.outputs.map((p,i)=>[p,`$output-${i}`]))
 const normalize=(v:unknown):unknown=>{if(typeof v==='string')return outputs.get(v)??v;if(Array.isArray(v))return v.map(normalize);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)]));return v}
 const route=scienceRouteContext(d.route)
 const settings=Object.fromEntries(Object.entries(args.settings).map(([stage,s])=>[stage,{contract:s.contract,scope:s.scope}]))
 return{version:1,environment:args.environment,signature:hash({version:1,ruleVersion:1,workspace:realpathSync(args.workspace),build:args.build,template:args.template,instructions:args.instructions,route,stepId:d.stepId,inputs:d.initialVersions?.map(({path,sha256,bytes})=>({path,sha256,bytes})),settings:normalize(settings),actors:args.actors,requireExecution:d.requireExecution,maxRevisions:d.maxRevisions,environment:args.environment})}
}
export function reuseEligibility(source:ScienceReuseContext|undefined,current:ScienceReuseContext,force:boolean):ScienceReuseDecision {
 if(force)return{mode:'rerun',reason:'用户明确要求重跑此项'}
 if(!source)return{mode:'rerun',reason:'历史项缺少新版复用证明'}
 if(source.environment.state!=='known'||current.environment.state!=='known')return{mode:'rerun',reason:'运行环境未知或清单不完整'}
 if(source.signature!==current.signature)return{mode:'rerun',reason:'输入、方法、规则、执行者、权限或环境已变化'}
 return{mode:'reused',reason:'上下文一致；待复核历史文件与完整验收链'}
}
export function completedItemFacts(team:团队,p:SciencePipeline){
 SciencePipelineSchema.parse(p)
 if(p.status!=='completed')throw new Error('历史项尚未完整验收')
 const tasks=p.taskIds.map(id=>team.tasks.find(t=>t.id===id));if(tasks.some(t=>!t||!['completed','failed','cancelled'].includes(t.status)))throw new Error('历史项包含未闭合任务')
 const check=[...tasks].reverse().find(t=>t?.contract?.resultType==='data-summary'&&t.receipt?.state==='accepted')
 const analysis=[...tasks].reverse().find(t=>t?.contract?.resultType==='model-metrics'&&t.receipt?.state==='accepted'),review=tasks.find(t=>t?.id===p.currentTaskId)
 if(!check?.settings||!check.receipt?.versions||validateVersionReceipt(check.settings,check.receipt).state!=='accepted'||!sameFileVersions(check.receipt.versions.inputs,p.definition.initialVersions??[])||!analysis?.settings?.contract?.acceptance||!analysis.receipt?.versions||validateVersionReceipt(analysis.settings,analysis.receipt).state!=='accepted'||!review?.settings||!review.receipt?.versions||validateVersionReceipt(review.settings,review.receipt).state!=='accepted'||review.receipt.result?.data?.kind!=='review'||review.receipt.result.data.verdict!=='pass'||!sameFileVersions(analysis.receipt.versions.outputs,review.receipt.versions.inputs))throw new Error('历史项缺少完整的宿主验收、版本绑定和独立审阅')
 if(!sameFileVersions(analysis.receipt.versions.inputs,p.definition.initialVersions??[]))throw new Error('历史分析与冻结输入不匹配')
 for(const [stage,task] of [['check',check],['analyze',analysis],['review',review]] as const)if(JSON.stringify(task.settings?.contract)!==JSON.stringify(stageContract(p.definition,stage)))throw new Error('历史阶段契约与冻结定义不匹配')
 if(analysis.receipt.acceptance?.environment?.state!=='known'||!analysis.receipt.acceptance.environment.executionBound)throw new Error('历史执行未绑定已知解释器环境')
 return{analysis,review,tasks:tasks as 任务[]}
}
/** Caller holds the existing shared read reservation for every source input/output. */
export async function revalidateReusableItem(team:团队,p:SciencePipeline,workspace:string,signal?:AbortSignal){
 const facts=completedItemFacts(team,p),receipt=facts.analysis.receipt!
 await assertFileVersions(workspace,[...receipt.versions!.inputs,...receipt.versions!.outputs],signal)
 const checked=await validateScienceAcceptance(facts.analysis.contract,receipt,workspace,signal)
 if(validateAcceptanceReceipt(facts.analysis.contract,checked).state!=='accepted')throw new Error(checked.reason??'历史内容不再通过当前规则')
 return facts
}
