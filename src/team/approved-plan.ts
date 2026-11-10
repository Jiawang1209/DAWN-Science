/** Adapter into the existing Team DAG, scopes, locks, receipts and recovery. */
import {createHash} from 'node:crypto'
import {realpathSync} from 'node:fs'
import {relative,isAbsolute,sep} from 'node:path'
import {z} from 'zod'
import {ApprovedPlanBindingSchema} from '../protocol/approved-plan.js'
import {TaskSettingsSchema,type TaskSettings} from '../protocol/task-contract.js'
import {parseTaskArrangement,withoutTaskArrangement} from '../protocol/task-arrangement.js'
import {validateExecutableArrangement} from '../protocol/executable-arrangement.js'
import {captureFileVersions} from '../artifacts/task-versions.js'
import {canonicalOutputPaths} from '../bot/output-locks.js'
import {resolveTaskSettings} from '../subagent/task-tools.js'
import type {SubagentDefinition} from '../subagent/definitions.js'
import {建团队,加成员,加任务} from './state.js'
import type {团队,任务} from './types.js'
const definitionSchema=z.object({name:z.string().min(1),description:z.string(),systemPrompt:z.string(),filePath:z.string(),tools:z.array(z.string()).optional(),model:z.string().optional(),from:z.enum(['builtin','global','project']).optional(),title:z.string().optional(),group:z.string().optional(),disabled:z.boolean().optional()}).strict()
export const ApprovedPlanExecutionSchema=z.object({binding:ApprovedPlanBindingSchema,
 frozenTasks:z.array(z.object({planTaskId:z.string(),taskId:z.string(),memberName:z.string(),subject:z.string(),description:z.string(),dependencies:z.array(z.string()),definition:definitionSchema,settings:TaskSettingsSchema,provider:z.string(),model:z.string()}).strict()).min(1).max(8),
}).strict().superRefine(({binding,frozenTasks},ctx)=>{
 const fail=()=>ctx.addIssue({code:'custom',message:'批准的执行快照与任务映射不一致'})
 if(frozenTasks.length!==binding.tasks.length||new Set(frozenTasks.map(t=>t.taskId)).size!==frozenTasks.length||new Set(frozenTasks.map(t=>t.memberName)).size!==frozenTasks.length)fail()
 const previous=new Set<string>()
 for(const t of frozenTasks){if(!binding.tasks.some(m=>m.taskId===t.taskId&&m.planTaskId===t.planTaskId&&m.memberName===t.memberName)||t.dependencies.some(d=>!previous.has(d))||t.settings.contract?.submission!=='tool'||t.definition.disabled)fail();previous.add(t.taskId)}
})
export type ApprovedPlanExecution=z.infer<typeof ApprovedPlanExecutionSchema>
export const arrangementHash=(markdown:string)=>createHash('sha256').update(markdown.trim()).digest('hex')
export async function freezeApprovedPlan(opts:{planningInstructions?:string;workspace:string;owner:string;planId:string;planVersion:number;markdown:string;definitions:SubagentDefinition[];tier:'allow-all'|'ask-risky'|'deny-risky';model:{provider:string;model:string};modelsByAgent?:Record<string,{provider:string;model:string}>;modelsByTask?:Record<string,{provider:string;model:string}>;signal?:AbortSignal}):Promise<ApprovedPlanExecution>{
 const read=parseTaskArrangement(opts.markdown)
 if(read.state!=='valid'||!read.arrangement.dispatch)throw new Error('方案没有有效的执行绑定')
 const p=read.arrangement
 if(p.questions.length)throw new Error('请先补齐待确认项')
 const ordered=validateExecutableArrangement(p)
 const ancestors=(id:string):Set<string>=>{const task=ordered.find(t=>t.id===id)!;return new Set(task.dependencies.flatMap(d=>[d,...ancestors(d)]))}
 const root=realpathSync(opts.workspace),canonicalPath=(path:string)=>{
  const canonical=canonicalOutputPaths([path],opts.workspace)?.[0]
  if(!canonical)throw new Error('工作区文件路径无法核验')
  const rel=relative(root,canonical)
  if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw new Error('文件路径通过符号链接越出工作区')
  return canonical
 }
 const outputOwners=new Map<string,string>(),canonicalOwners=new Map<string,string>(),external=new Set<string>()
 for(const t of ordered)for(const path of t.outputs){
  const canonical=canonicalPath(path)
  if([...canonicalOwners.keys()].some(p=>p===canonical||p.startsWith(canonical+'/')||canonical.startsWith(p+'/')))throw new Error('可执行安排不能共用或嵌套写入目标')
  const normalized=relative(root,canonical).split(sep).join('/')
  if(normalized==='data/raw'||normalized.startsWith('data/raw/'))throw new Error('不允许覆盖原始数据')
  outputOwners.set(path,t.id);canonicalOwners.set(canonical,t.id)
 }
 for(const t of ordered)for(const path of t.inputs){const producer=outputOwners.get(path),canonical=canonicalPath(path);if([...canonicalOwners.keys()].some(p=>canonical.startsWith(p+sep)||p.startsWith(canonical+sep)))throw new Error('输入与产物路径不能嵌套');if(!producer&&canonicalOwners.has(canonical))throw new Error('输入与产物存在别名，请使用一致的路径');if(producer){if(!ancestors(t.id).has(producer))throw new Error('读取其他任务产物必须声明前置依赖')}else external.add(path)}
 const markdownHash=arrangementHash(opts.markdown),teamId='plan_'+createHash('sha256').update(JSON.stringify([opts.owner,opts.planId,opts.planVersion,markdownHash])).digest('hex').slice(0,24)
 const mapping=ordered.map((t,i)=>({planTaskId:t.id,taskId:`plan_${i+1}`,memberName:`member_${i+1}`,review:t.review}))
 const frozenTasks=ordered.map(t=>{
  const execution=t.execution!,definition=opts.definitions.find(d=>d.name===execution.agent&&!d.disabled)
  if(!definition)throw new Error(`执行者「${execution.agent}」当前不可用，请调整方案`)
  const contract=execution.contract
  const settings=TaskSettingsSchema.parse(resolveTaskSettings(contract,opts.tier,definition.tools)),tools=settings.scope.tools
  if(contract.access==='workspace-write'&&contract.outputs.length&&!tools.some(t=>['*','write','edit'].includes(t)))throw new Error('所选执行者没有契约需要的写入工具')
  if(contract.requireExecution&&!tools.some(t=>['*','bash','powershell','run_code'].includes(t)))throw new Error('所选执行者没有契约需要的执行工具')
  const m=mapping.find(m=>m.planTaskId===t.id)!,model=opts.modelsByTask?.[t.id]??opts.modelsByAgent?.[definition.name]??{provider:opts.model.provider,model:definition.model??opts.model.model}
  return{planTaskId:m.planTaskId,taskId:m.taskId,memberName:m.memberName,subject:t.title,description:[t.goal,`分工：${t.role}`,`验收条件：${t.acceptance}`,'整体方案用于保持方法、单位和约束；只执行当前任务的冻结契约，其他阶段由其他成员完成。',...(opts.planningInstructions?[opts.planningInstructions]:[]),withoutTaskArrangement(opts.markdown,read)].join('\n'),dependencies:t.dependencies.map(d=>mapping.find(m=>m.planTaskId===d)!.taskId),definition:structuredClone(definition),settings,provider:model.provider,model:model.model}
 })
 const externalInputs=await captureFileVersions(opts.workspace,[...external],opts.signal)
 return ApprovedPlanExecutionSchema.parse({binding:{version:1,owner:opts.owner,planId:opts.planId,planVersion:opts.planVersion,markdownHash,teamId,externalInputs,tasks:mapping},frozenTasks})
}
export function materializeApprovedTeam(input:ApprovedPlanExecution,owner:string):团队{
 const snapshot=ApprovedPlanExecutionSchema.parse(input),b=snapshot.binding
 if(b.owner!==owner)throw new Error('批准方案不属于当前会话')
 const team=建团队({id:b.teamId,name:`批准方案 · 第 ${b.planVersion} 版`,goal:'执行已批准任务安排',captainSessionId:owner})
 for(const t of snapshot.frozenTasks){
  const member=加成员(team,{name:t.memberName,agent:t.definition.name,role:t.description.split('\n')[1]?.replace('分工：','')??'',provider:t.provider,model:t.model})
  member.frozenAgentDefinition=structuredClone(t.definition) as SubagentDefinition
  const task=加任务(team,{id:t.taskId,subject:t.subject,description:t.description,assignee:t.memberName,contract:t.settings.contract!,dependencies:t.dependencies})
  task.settings=structuredClone(t.settings)
 }
 team.approvedPlan=structuredClone(b)
 return team
}
/** Only accepted predecessor output identities may fill downstream frozen inputs. */
export function approvedTaskSettings(team:团队,task:任务):TaskSettings{
 if(!team.approvedPlan||!task.settings?.contract)throw new Error('批准方案任务缺少冻结设置')
 const b=ApprovedPlanBindingSchema.parse(team.approvedPlan)
 if(b.owner!==team.captainSessionId||b.teamId!==team.id||!b.tasks.some(t=>t.taskId===task.id&&t.memberName===task.assignee))throw new Error('批准方案任务映射失效')
 const ancestors=new Set<string>(),visit=(id:string)=>{if(ancestors.has(id))return;ancestors.add(id);const t=team.tasks.find(t=>t.id===id);if(!t)throw new Error('前置任务缺失');for(const dep of t.dependencies)visit(dep)}
 for(const dep of task.dependencies)visit(dep)
 const inputs=task.settings.contract.inputs.map(path=>{
  const external=b.externalInputs.find(v=>v.path===path);if(external)return external
  const producer=team.tasks.find(t=>ancestors.has(t.id)&&t.outputs?.includes(path)),version=producer?.receipt?.versions?.outputs.find(v=>v.path===path)
  if(!producer||producer.status!=='completed'||producer.receipt?.state!=='accepted'||!version)throw new Error(`前置产物缺少已验收的内容版本：${path}`)
  return version
 })
 return TaskSettingsSchema.parse({...task.settings,versions:{version:1,inputs}})
}
