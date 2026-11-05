import {probeScienceEnvironment} from './science-environment.js'
import {reuseContext,reuseEligibility,revalidateReusableItem,scienceReuseBuild} from './science-reuse.js'
import {assertFileVersions} from '../artifacts/task-versions.js'
import type {任务} from './types.js'
import {ScienceBatchRequestSchema,ScienceBatchSchema,type ScienceBatchRequest} from '../protocol/science-batch.js'
import {assertBatchOutputPaths} from './science-batch-paths.js'
import {scienceTemplate} from './science-templates.js'
import {startScienceBatch,activateDerivedBatch,resumeScienceBatch,cancelScienceBatch,publicScienceBatch} from './science-batch.js'
import {taskToolDenial} from '../subagent/task-tools.js'
import {captureFileVersions} from '../artifacts/task-versions.js'
import {taskOutputReservation} from '../bot/output-locks.js'
import {resolveTaskSettings} from '../subagent/task-tools.js'
import {TaskContractSchema} from '../protocol/task-contract.js'
import {assertPipelineVersions} from './science-pipeline-versions.js'
import type {FileVersion} from '../protocol/file-versions.js'
/** Model-facing bounded workflows over the existing Team coordinator. */
import {recoverTeamExecution} from './recovery.js'
import {botInstructions} from '../bot/runtime.js'
import {createHash} from 'node:crypto'
import {z} from 'zod'
import {WorkspaceRelativePathSchema,type AnalysisRoute} from '../protocol/analysis-route.js'
import type {TaskContract,TaskSettings} from '../protocol/task-contract.js'
import {startPipeline,pipelineStatus,resumePipeline,cancelPipeline} from './science-pipeline.js'
import {建团队,加成员,读团队,写团队,取消任务,团队错误} from './state.js'
import type {成员} from './types.js'
import type {团队工具选项} from './tools.js'
const text=z.string().trim().min(1).max(8000)
const executor=z.object({agent:text.optional(),botId:text.optional()}).strict().refine(v=>Boolean(v.agent)!==Boolean(v.botId),'agent 与 botId 必须二选一')
export const PipelineStartRequestSchema=z.object({routeId:text,revision:z.number().int().positive(),stepId:text,inputs:z.array(WorkspaceRelativePathSchema).min(1).max(64),outputs:z.array(WorkspaceRelativePathSchema).min(1).max(64),executors:z.object({check:executor,analyze:executor,review:executor}).strict(),instructions:text,requireExecution:z.boolean().default(true),maxRevisions:z.number().int().min(0).max(2).default(1)}).strict()
const teamId=z.string().regex(/^pipeline-[a-f0-9]{24}$/)
const statusSchema=z.object({teamId:teamId.optional()}).strict()
const resumeSchema=statusSchema.extend({stateRevision:z.number().int().positive(),acknowledgeInterrupted:z.boolean().default(false)})
const cancelSchema=statusSchema.extend({stateRevision:z.number().int().positive()})
interface Options extends 团队工具选项 {route:()=>AnalysisRoute|undefined;remote?:boolean;defaultModel?:{provider:string;model:string};freeze?:(member:成员,contract:TaskContract)=>TaskSettings;executorBuild?:()=>string;recordInputs?:(inputs:FileVersion[])=>FileVersion[]}
export function createSciencePipelineTools(opts:Options){
 const scheduler=opts.调度器
 const owned=(requested?:string)=>{const id=requested??opts.当前.get();if(!id||!teamId.safeParse(id).success)throw new 团队错误('请先启动科研流程，或提供有效 teamId');const t=scheduler.读(id);if(t.captainSessionId!==opts.sessionId||!t.pipeline)throw new 团队错误('流程不属于当前主会话');return t}
 const status=(t:ReturnType<typeof owned>)=>({teamId:t.id,...pipelineStatus(t),...(t.scienceBatch?{batch:publicScienceBatch(t.scienceBatch)}:{})})
 const make=<S extends z.ZodType>(name:string,description:string,schema:S,action:(args:z.output<S>,callId:string,signal?:AbortSignal)=>unknown)=>({
  name,label:name,description,parameters:z.toJSONSchema(schema,{io:'input',unrepresentable:'any'}),
  async execute(callId:string,raw:unknown,signal?:AbortSignal){
   try{
    if(signal?.aborted)throw new Error('调用已停止')
    return{content:[{type:'text' as const,text:JSON.stringify(await action(schema.parse(raw),callId,signal))}],details:undefined}
   }catch(error){return{content:[{type:'text' as const,text:error instanceof Error?error.message:String(error)}],isError:true,details:undefined}}
  },
 })
 const start=async(args:z.output<typeof PipelineStartRequestSchema>,callId:string,signal?:AbortSignal,batch?:ScienceBatchRequest)=>{
   if(opts.remote)throw new Error('远端严格科研流程尚不支持')
   const id='pipeline-'+createHash('sha256').update(JSON.stringify([opts.sessionId,callId])).digest('hex').slice(0,24)
   const fingerprint=createHash('sha256').update(JSON.stringify([args,batch])).digest('hex')
   let source:ReturnType<typeof scheduler.读>|undefined,sourceSnapshot:string|undefined
   const assertSource=()=>{if(!batch?.reuseFrom)return;const saved=scheduler.读(batch.reuseFrom.teamId),b=saved.scienceBatch;if(b)ScienceBatchSchema.parse(b);if(saved.captainSessionId!==opts.sessionId||!b||b.stateRevision!==batch.reuseFrom.stateRevision||!['completed','blocked'].includes(b.status)||scheduler.hasActiveTeam(saved.id)||saved.tasks.some(t=>['pending','claimed','in_progress'].includes(t.status)))throw new Error('来源批次身份、版本或排空状态不满足派生条件');if(batch.items.map(i=>i.id).join('|')!==b.items.map(i=>i.id).join('|'))throw new Error('派生须保持原批次项 ID 与顺序');if(batch.reuseFrom.forceRerunItems.some(id=>!b.items.some(i=>i.id===id)))throw new Error('指定重跑项不存在');if(saved.tasks.some(t=>t.contract?.requireExecution&&t.status!=='completed'&&t.receipt?.result?.execution.state!=='completed')&&!batch.reuseFrom.acknowledgeInterrupted)throw new Error('历史失败尝试可能存在未知文件副作用；核对后须 acknowledgeInterrupted');const snapshot=JSON.stringify(saved);if(sourceSnapshot&&sourceSnapshot!==snapshot)throw new Error('来源批次在核验期间变化，未创建派生批次');source=saved;sourceSnapshot=snapshot}
   const admission=()=>{
    if(signal?.aborted)throw new Error('调用已停止')
    const existing=读团队(scheduler.dir(id)),active=opts.当前.get()
    if(existing){
     if(existing.captainSessionId!==opts.sessionId||(existing.scienceBatch?.requestFingerprint??existing.pipeline?.requestFingerprint)!==fingerprint)throw new Error('请求身份冲突，未覆盖既有流程')
     if(active!==id){
      if(active&&!scheduler.读(active).finishedAt)throw new Error('当前已有团队，不能覆盖当前指针')
      // A persisted record without its owner pointer is a crash window, never a replay request.
      recoverTeamExecution(existing);写团队(scheduler.dir(id),existing);opts.当前.set(id);scheduler.改(id,()=>{})
     }
     return status(scheduler.读(id))
    }
    assertSource()
    if(active&&active!==source?.id&&!scheduler.读(active).finishedAt)throw new Error('当前已有团队，请先结束后再启动独立科研流程')
   }
   const prior=admission();if(prior)return prior
   let release:()=>void=()=>{}
   try{
   const team=建团队({id,name:'科研流程',goal:args.instructions,captainSessionId:opts.sessionId}),members={} as Record<'check'|'analyze'|'review',string>,seen=new Map<string,string>()
   const catalog=await opts.已知模型()
   for(const stage of ['check','analyze','review'] as const){
    const choice=args.executors[stage],key=choice.botId?'bot:'+choice.botId:'agent:'+choice.agent
    const duplicate=seen.get(key);if(duplicate){members[stage]=duplicate;continue}
    if(choice.botId){const bot=opts.resolveBot?.(choice.botId);if(!bot||!bot.enabled||bot.archivedAt)throw new Error('Bot 不存在或未启用');const model=bot.model??opts.defaultModel;if(model&&!catalog.some(m=>m.provider===model.provider&&m.model===model.model))throw new Error('Bot 模型不在已知目录');加成员(team,{name:stage,agent:'bot-'+bot.id,botId:bot.id,botInstructions:botInstructions(bot),...(bot.scopeKey?{botScopeKey:bot.scopeKey}:{}),...(model?{provider:model.provider,model:model.model}:{})})}
    else{const def=opts.定义().find(d=>d.name===choice.agent&&!d.disabled);if(!def)throw new Error(`没有启用的子 agent：${choice.agent}`);const model=opts.defaultModel?{provider:opts.defaultModel.provider,model:def.model??opts.defaultModel.model}:undefined;if(model&&!catalog.some(m=>m.provider===model.provider&&m.model===model.model))throw new Error('子 agent 模型不在已知目录');加成员(team,{name:stage,agent:def.name,...(model?{provider:model.provider,model:model.model}:{})}).frozenAgentDefinition=structuredClone(def)}
    seen.set(key,stage);members[stage]=stage
   }
   const requestedInputs=batch?[...new Set(batch.items.flatMap(i=>i.inputs))]:args.inputs
   const sourcePaths=source?.scienceBatch?.items.flatMap(i=>i.completed?[...i.completed.definition.inputs,...i.completed.definition.outputs]:[])??[]
   release=await taskOutputReservation(scheduler.workspace,resolveTaskSettings(TaskContractSchema.parse({inputs:[...new Set([...requestedInputs,...sourcePaths])],resultType:'data-summary'}),'deny-risky'),signal??new AbortController().signal)
   let initialVersions:FileVersion[]=await captureFileVersions(scheduler.workspace,requestedInputs,signal)
   const environment=batch?await probeScienceEnvironment(batch.template.language,scheduler.workspace,signal):undefined
   // Discovery was asynchronous: repeat dedup, ownership and cancellation checks before any write.
   const admitted=admission();if(admitted)return admitted
   const route=opts.route();if(!route||route.routeId!==args.routeId||route.revision!==args.revision)throw new Error('分析路线版本已变化，请重新核对后启动')
   initialVersions=opts.recordInputs?.(initialVersions)??initialVersions
   const definition={route,initialVersions,stepId:args.stepId,inputs:args.inputs,outputs:args.outputs,members,instructions:args.instructions,requireExecution:args.requireExecution,maxRevisions:args.maxRevisions}
   if(batch){
    const root=`${batch.outputRoot}/${id}`,items=batch.items.map(item=>{const recipe=scienceTemplate(batch.template,`${root}/${item.id}`,item.inputs,item.dataPath);return{id:item.id,label:item.label,definition:{...definition,inputs:item.inputs,initialVersions:initialVersions.filter(v=>item.inputs.includes(v.path)),outputs:recipe.outputs,acceptance:{...recipe.acceptance,environment},instructions:`${args.instructions}\n${recipe.instructions}`}}})
    const outputs=[...items.flatMap(i=>i.definition.outputs),`${root}/summary.json`,`${root}/summary.md`],contract=TaskContractSchema.parse({inputs:initialVersions.map(v=>v.path),outputs,access:'workspace-write'})
    assertBatchOutputPaths(scheduler.workspace,initialVersions.map(v=>v.path),outputs)
    for(const path of outputs){const denial=taskToolDenial(resolveTaskSettings(contract,'allow-all').scope,scheduler.workspace,'write',{path});if(denial)throw new Error(denial)}
    startScienceBatch(team,callId,batch.template,items,outputs.slice(-2),opts.freeze,Date.now(),batch.concurrency??1)
    const history:任务[]=[],actors=Object.fromEntries((['check','analyze','review'] as const).map(stage=>{const member=team.members.find(m=>m.name===members[stage])!;return[stage,{agent:member.agent,botId:member.botId,botScopeKey:member.botScopeKey,botInstructions:member.botInstructions,provider:member.provider,model:member.model,definition:member.botId?undefined:member.frozenAgentDefinition??opts.定义().find(d=>d.name===member.agent)}]})),build=createHash('sha256').update(JSON.stringify([scienceReuseBuild(),opts.executorBuild?.()??'standalone-adapter'])).digest('hex')
    for(const item of team.scienceBatch!.items){
     item.context=reuseContext({workspace:scheduler.workspace,template:batch.template,instructions:args.instructions,definition:item.definition,settings:item.settingsByStage,actors,environment:environment!,build})
     if(!source?.scienceBatch)continue
     const previous=source.scienceBatch.items.find(i=>i.id===item.id)!
     const decision=reuseEligibility(previous.context,item.context,batch.reuseFrom!.forceRerunItems.includes(item.id));item.reuse=decision
     if(decision.mode!=='reused')continue
     try{if(!previous.completed)throw new Error('历史项未完成完整验收；重新执行');const facts=await revalidateReusableItem(source,previous.completed,scheduler.workspace,signal);const provenance={teamId:source.id,stateRevision:source.scienceBatch.stateRevision,itemId:item.id};item.reuse={mode:'reused',reason:'内容、规则、环境与独立审阅均复核通过；沿用历史产物，未重新执行',source:provenance};item.definition={...item.definition,outputs:structuredClone(previous.definition.outputs),acceptance:structuredClone(previous.definition.acceptance)};item.settingsByStage=structuredClone(previous.settingsByStage);item.completed=structuredClone(previous.completed);history.push(...facts.tasks.map(t=>({...structuredClone(t),reusedFrom:provenance})))}catch(error){if(signal?.aborted)throw error;item.reuse={mode:'rerun',reason:(error instanceof Error?error.message:String(error)).slice(0,2000)}}
    }
    if(source)activateDerivedBatch(team,history)
   }else startPipeline(team,callId,definition,opts.freeze)
   await assertFileVersions(scheduler.workspace,initialVersions,signal)
   const finalAdmission=admission();if(finalAdmission)return finalAdmission
   const finalRoute=opts.route();if(!finalRoute||finalRoute.routeId!==args.routeId||finalRoute.revision!==args.revision)throw new Error('分析路线在核验期间变化，未启动')
   team.pipeline!.requestFingerprint=fingerprint
   if(team.scienceBatch)team.scienceBatch.requestFingerprint=fingerprint
   const interruptAdmission=()=>{
    const saved=读团队(scheduler.dir(id))
    if(saved?.pipeline?.requestFingerprint===fingerprint&&recoverTeamExecution(saved))写团队(scheduler.dir(id),saved)
   }
   try{
    写团队(scheduler.dir(id),team);opts.当前.set(id);scheduler.改(id,()=>{})
    if(signal?.aborted)throw new Error('调用已停止；已保存检查点，须显式恢复')
    void scheduler.踢一下(id).catch(error=>{
     try{scheduler.中止全部(id)}catch(cleanup){console.error('[science-pipeline] 停止保存失败',cleanup)}
     console.error('[science-pipeline]',error)
    })
   }catch(error){interruptAdmission();throw error}
   return status(scheduler.读(id))
   }finally{release()}
  }
 const batchStart=PipelineStartRequestSchema.omit({inputs:true,outputs:true}).extend(ScienceBatchRequestSchema.shape)
 const tools=[
  make('start_science_pipeline','按已确认路线启动版本绑定的核查→分析→独立审阅流程；未知失败不自动重试。',PipelineStartRequestSchema,start),
  make('start_science_batch','用 tabular-ecology@1 或 figure-reproduction@1 模板逐项执行 1–8 项；默认串行，concurrency:2 可让两项独立推进；共享成员和工作区执行锁仍串行，失败即停、固定宿主汇总已验收事实；reuseFrom 显式派生新批次，仅复用完整且内容/规则/权限/环境一致的已验收项。',batchStart,(args,callId,signal)=>start({...args,inputs:args.items[0]!.inputs,outputs:scienceTemplate(args.template,`${args.outputRoot}/placeholder`,args.items[0]!.inputs,args.items[0]!.dataPath).outputs},callId,signal,ScienceBatchRequestSchema.parse({template:args.template,items:args.items,outputRoot:args.outputRoot,...(args.reuseFrom?{reuseFrom:args.reuseFrom}:{}),...(args.concurrency?{concurrency:args.concurrency}:{})}))),
  make('science_pipeline_status','读取科研流程检查点、阶段宿主回执、修正次数和轻量观测；不启动执行。',statusSchema,args=>{const t=owned(args.teamId);return status(t)}),
  make('resume_science_pipeline','显式恢复 interrupted 流程，已验收阶段不重跑；未知副作用必须核对后 acknowledgeInterrupted。blocked 不自动重试。',resumeSchema,async(args,_callId,signal)=>{
   const team=owned(args.teamId),p=team.pipeline!,route=opts.route()
   if(team.finishedAt)throw new Error('团队已归档，不能恢复')
   if((team.scienceBatch?.stateRevision??p.stateRevision)!==args.stateRevision)throw new Error('流程版本已变化，请先读取状态')
   if(!route||route.routeId!==p.definition.route.routeId||route.revision!==p.definition.route.revision)throw new Error('分析路线已变化，不能沿用旧流程；请取消并按新路线建立流程')
   await assertPipelineVersions(team,scheduler.workspace,signal)
   if(signal?.aborted)throw new Error('调用已停止')
   const verifiedRoute=opts.route()
   if(!verifiedRoute||verifiedRoute.routeId!==p.definition.route.routeId||verifiedRoute.revision!==p.definition.route.revision)throw new Error('分析路线已变化，不能沿用旧流程；请取消并按新路线建立流程')
   if((scheduler.读(team.id).scienceBatch?.stateRevision??scheduler.读(team.id).pipeline?.stateRevision)!==args.stateRevision)throw new Error('流程版本已变化，请先读取状态')
   let transitioned=false
   try{
    scheduler.改(team.id,t=>{if(t.scienceBatch)resumeScienceBatch(t,args.acknowledgeInterrupted);else resumePipeline(t,args.acknowledgeInterrupted);transitioned=true});scheduler.resumeTeam(team.id);await scheduler.踢一下(team.id)
   }catch(error){
    if(!transitioned)throw error // Rejected preconditions must not interrupt valid live work.
    // Pause live work first, even if a snapshot notification or disk write failed.
    try{scheduler.中止全部(team.id)}catch(pauseError){console.error('[science-pipeline] 恢复收口通知失败',pauseError)}
    // A claimed attempt with no backend must not remain permanently "waiting for cleanup".
    const saved=scheduler.读(team.id)
    if(!scheduler.hasActiveTeam(team.id)&&recoverTeamExecution(saved))写团队(scheduler.dir(team.id),saved)
    throw error
   }
   return status(scheduler.读(team.id))
  }),
  make('cancel_science_pipeline','取消科研流程并停止当前尝试；保留检查点和产物，不采用迟到结果。停止请求不等于清理已完成。',cancelSchema,args=>{
   const team=owned(args.teamId),p=team.pipeline!
   if(['completed','cancelled'].includes(team.scienceBatch?.status??p.status))return status(team)
   if((team.scienceBatch?.stateRevision??p.stateRevision)!==args.stateRevision)throw new Error('流程版本已变化，请先读取状态')
   scheduler.中止全部(team.id)
   scheduler.改(team.id,t=>{if(t.scienceBatch)cancelScienceBatch(t);else cancelPipeline(t);for(const task of t.tasks)if(!['completed','failed','cancelled'].includes(task.status))取消任务(t,task.id)})
   return status(scheduler.读(team.id))
  }),
 ]
 const controls=tools.filter(t=>['science_pipeline_status','resume_science_pipeline','cancel_science_pipeline'].includes(t.name))
 const guarded=(tool:typeof tools[number],batch:boolean)=>({...tool,name:batch?tool.name.replace('science_pipeline','science_batch'):tool.name,async execute(callId:string,raw:unknown,signal?:AbortSignal){
  try{const args=statusSchema.passthrough().parse(raw),team=owned(args.teamId);if(!!team.scienceBatch!==batch)throw new Error(batch?'当前不是批量任务':'批量任务请使用 science_batch 专用状态、恢复或取消入口')}catch(error){return{content:[{type:'text' as const,text:String(error)}],isError:true,details:undefined}}
  return tool.execute(callId,raw,signal)
 }})
 return [...tools.filter(t=>!controls.includes(t)),...controls.map(t=>guarded(t,false)),...controls.map(t=>guarded(t,true))]
}
