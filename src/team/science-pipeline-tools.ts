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
interface Options extends 团队工具选项 {route:()=>AnalysisRoute|undefined;remote?:boolean;defaultModel?:{provider:string;model:string};freeze?:(member:成员,contract:TaskContract)=>TaskSettings}
export function createSciencePipelineTools(opts:Options){
 const scheduler=opts.调度器
 const owned=(requested?:string)=>{const id=requested??opts.当前.get();if(!id||!teamId.safeParse(id).success)throw new 团队错误('请先启动科研流程，或提供有效 teamId');const t=scheduler.读(id);if(t.captainSessionId!==opts.sessionId||!t.pipeline)throw new 团队错误('流程不属于当前主会话');return t}
 const make=<S extends z.ZodType>(name:string,description:string,schema:S,action:(args:z.output<S>,callId:string,signal?:AbortSignal)=>unknown)=>({
  name,label:name,description,parameters:z.toJSONSchema(schema,{io:'input',unrepresentable:'any'}),
  async execute(callId:string,raw:unknown,signal?:AbortSignal){
   try{
    if(signal?.aborted)throw new Error('调用已停止')
    return{content:[{type:'text' as const,text:JSON.stringify(await action(schema.parse(raw),callId,signal))}],details:undefined}
   }catch(error){return{content:[{type:'text' as const,text:error instanceof Error?error.message:String(error)}],isError:true,details:undefined}}
  },
 })
 return[
  make('start_science_pipeline','按当前已确认分析路线启动固定科研流程：只读核查→分析→独立只读审阅→有界修正/交付。须给出 routeId/revision/stepId、文件输入输出和执行者；未知失败不自动重试。',PipelineStartRequestSchema,async(args,callId,signal)=>{
   if(opts.remote)throw new Error('远端严格科研流程尚不支持')
   const id='pipeline-'+createHash('sha256').update(JSON.stringify([opts.sessionId,callId])).digest('hex').slice(0,24)
   const fingerprint=createHash('sha256').update(JSON.stringify(args)).digest('hex')
   const admission=()=>{
    if(signal?.aborted)throw new Error('调用已停止')
    const existing=读团队(scheduler.dir(id)),active=opts.当前.get()
    if(existing){
     if(existing.captainSessionId!==opts.sessionId||existing.pipeline?.requestFingerprint!==fingerprint)throw new Error('请求身份冲突，未覆盖既有流程')
     if(active!==id){
      if(active&&!scheduler.读(active).finishedAt)throw new Error('当前已有团队，不能覆盖当前指针')
      // A persisted record without its owner pointer is a crash window, never a replay request.
      recoverTeamExecution(existing);写团队(scheduler.dir(id),existing);opts.当前.set(id);scheduler.改(id,()=>{})
     }
     return{teamId:id,...pipelineStatus(scheduler.读(id))}
    }
    if(active&&!scheduler.读(active).finishedAt)throw new Error('当前已有团队，请先结束后再启动独立科研流程')
   }
   const prior=admission();if(prior)return prior
   const team=建团队({id,name:'科研流程',goal:args.instructions,captainSessionId:opts.sessionId}),members={} as Record<'check'|'analyze'|'review',string>,seen=new Map<string,string>()
   const catalog=await opts.已知模型()
   for(const stage of ['check','analyze','review'] as const){
    const choice=args.executors[stage],key=choice.botId?'bot:'+choice.botId:'agent:'+choice.agent
    const duplicate=seen.get(key);if(duplicate){members[stage]=duplicate;continue}
    if(choice.botId){const bot=opts.resolveBot?.(choice.botId);if(!bot||!bot.enabled||bot.archivedAt)throw new Error('Bot 不存在或未启用');const model=bot.model??opts.defaultModel;if(model&&!catalog.some(m=>m.provider===model.provider&&m.model===model.model))throw new Error('Bot 模型不在已知目录');加成员(team,{name:stage,agent:'bot-'+bot.id,botId:bot.id,botInstructions:botInstructions(bot),...(bot.scopeKey?{botScopeKey:bot.scopeKey}:{}),...(model?{provider:model.provider,model:model.model}:{})})}
    else{const def=opts.定义().find(d=>d.name===choice.agent&&!d.disabled);if(!def)throw new Error(`没有启用的子 agent：${choice.agent}`);const model=opts.defaultModel?{provider:opts.defaultModel.provider,model:def.model??opts.defaultModel.model}:undefined;if(model&&!catalog.some(m=>m.provider===model.provider&&m.model===model.model))throw new Error('子 agent 模型不在已知目录');加成员(team,{name:stage,agent:def.name,...(model?{provider:model.provider,model:model.model}:{})})}
    seen.set(key,stage);members[stage]=stage
   }
   // Discovery was asynchronous: repeat dedup, ownership and cancellation checks before any write.
   const admitted=admission();if(admitted)return admitted
   const route=opts.route();if(!route||route.routeId!==args.routeId||route.revision!==args.revision)throw new Error('分析路线版本已变化，请重新核对后启动')
   startPipeline(team,callId,{route,stepId:args.stepId,inputs:args.inputs,outputs:args.outputs,members,instructions:args.instructions,requireExecution:args.requireExecution,maxRevisions:args.maxRevisions},opts.freeze)
   team.pipeline!.requestFingerprint=fingerprint
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
   return{teamId:id,...pipelineStatus(scheduler.读(id))}
  }),
  make('science_pipeline_status','读取科研流程检查点、阶段宿主回执、修正次数和轻量观测；不启动执行。',statusSchema,args=>{const t=owned(args.teamId);return{teamId:t.id,...pipelineStatus(t)}}),
  make('resume_science_pipeline','显式恢复 interrupted 流程，已验收阶段不重跑；未知副作用必须核对后 acknowledgeInterrupted。blocked 不自动重试。',resumeSchema,async args=>{
   const team=owned(args.teamId),p=team.pipeline!,route=opts.route()
   if(p.stateRevision!==args.stateRevision)throw new Error('流程版本已变化，请先读取状态')
   if(!route||route.routeId!==p.definition.route.routeId||route.revision!==p.definition.route.revision)throw new Error('分析路线已变化，不能沿用旧流程；请取消并按新路线建立流程')
   let transitioned=false
   try{
    scheduler.改(team.id,t=>{resumePipeline(t,args.acknowledgeInterrupted);transitioned=true});scheduler.resumeTeam(team.id);await scheduler.踢一下(team.id)
   }catch(error){
    if(!transitioned)throw error // Rejected preconditions must not interrupt valid live work.
    // Pause live work first, even if a snapshot notification or disk write failed.
    try{scheduler.中止全部(team.id)}catch(pauseError){console.error('[science-pipeline] 恢复收口通知失败',pauseError)}
    // A claimed attempt with no backend must not remain permanently "waiting for cleanup".
    const saved=scheduler.读(team.id)
    if(!scheduler.hasActiveTeam(team.id)&&recoverTeamExecution(saved))写团队(scheduler.dir(team.id),saved)
    throw error
   }
   return{teamId:team.id,...pipelineStatus(scheduler.读(team.id))}
  }),
  make('cancel_science_pipeline','取消科研流程并停止当前尝试；保留检查点和产物，不采用迟到结果。停止请求不等于清理已完成。',cancelSchema,args=>{
   const team=owned(args.teamId),p=team.pipeline!
   if(['completed','cancelled'].includes(p.status))return{teamId:team.id,...pipelineStatus(team)}
   if(p.stateRevision!==args.stateRevision)throw new Error('流程版本已变化，请先读取状态')
   scheduler.中止全部(team.id)
   scheduler.改(team.id,t=>{cancelPipeline(t);for(const task of t.tasks)if(!['completed','failed','cancelled'].includes(task.status))取消任务(t,task.id)})
   return{teamId:team.id,...pipelineStatus(scheduler.读(team.id))}
  }),
 ]
}
