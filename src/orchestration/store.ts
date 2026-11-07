import {BoundAgentContextSampleSchema,type BoundAgentContextSample} from '../protocol/agent-context-observation.js'
import {AgentUsageTotalsSchema} from '../protocol/agent-usage-totals.js'
import {initialUsageTotals,projectUsageTotals,settleUsageTotals} from './agent-usage-totals.js'
import {USAGE_FIELDS} from '../protocol/agent-usage-totals.js'
/** Durable, parent-scoped identities and execution facts. Pi remains the transcript owner. */
import type {TaskAttemptBinding} from '../protocol/run-explanation.js'
import {createHash, randomUUID} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'
import {TaskTraceSchema,type TaskTrace} from '../protocol/task-trace.js'
import {TaskSettingsSchema, TaskReceiptSchema, type TaskSettings} from './task-contract.js'
import {SteeringReceiptSchema,type SteeringReceipt} from '../protocol/subagent-control.js'
export {SteeringReceiptSchema,type SteeringReceipt} from '../protocol/subagent-control.js'
import {TaskObservationSchema} from '../protocol/task-observation.js'
import {RunActivitySchema,RunTimingSchema,RunEventSchema,TaskAttemptBindingSchema,stageTimingKey,type ExecutionStage,type LockOwner,type RunEvent} from '../protocol/run-explanation.js'
import {BudgetRecordSchema,initialBudget,budgetView,budgetBlock,heldReviewRuns,chargeObservation,setBudgetLimits,reviewReservationKey,ReviewRunAdmissionSchema,type ReviewRunAdmission} from './budget.js'
import {ReviewReservationKeySchema,type RunBudgetLimits,type ReviewRunReservation} from '../protocol/run-budget.js'
import {UserFacingError} from '../errors.js'

export const ChildKindSchema = z.enum(['subagent', 'team', 'bot'])
export type ChildKind = z.infer<typeof ChildKindSchema>
export const RunStateSchema = z.enum(['idle', 'queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'])
export type RunState = z.infer<typeof RunStateSchema>
export const OutcomeSchema = z.object({ok: z.boolean(), output: z.string(), error: z.string().optional(), receipt: TaskReceiptSchema.optional(),observation:TaskObservationSchema.optional(),trace:TaskTraceSchema.optional()}).strict()
export interface Outcome {trace?:TaskTrace;ok: boolean; output: string; error?: string; receipt?: import('./task-contract.js').TaskReceipt;observation?:import('../protocol/task-observation.js').TaskObservation}
const ChildSchema = z.object({
  id: z.string(), kind: ChildKindSchema, address: z.array(z.string().min(1)).min(1).max(8),
  label: z.string().min(1), paused: z.boolean().optional(), state: RunStateSchema, epoch: z.number().int().nonnegative(),
  resultEpoch:z.number().int().nonnegative().optional(),updatedAt: z.number().finite(), reason: z.string().optional(), result: OutcomeSchema.optional(), settings: TaskSettingsSchema.optional(),
  handoffSha256:z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  activity:RunActivitySchema.optional(),timing:RunTimingSchema.optional(),contextObservation:BoundAgentContextSampleSchema.optional(),usageTotals:AgentUsageTotalsSchema.optional(),
}).strict()
export type ChildRecord = z.infer<typeof ChildSchema>
/** Admission is distinct from persistence: a fresh reporter can re-observe an unchanged sample. */
export type ContextObservationAdmission={accepted:false;changed:false}|{accepted:true;changed:boolean}
const MessageSchema = z.object({
  id: z.string(), childId: z.string(), requestId: z.string().min(1).max(512), text: z.string().min(1).max(64 * 1024),
  mode: z.enum(['start', 'continue']), status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted']),
  notify: z.boolean(), createdAt: z.number().finite(), updatedAt: z.number().finite(),
  outcome: OutcomeSchema.optional(), deliveredAt: z.number().finite().optional(),
}).strict()
export type ChildMessage = z.infer<typeof MessageSchema>
export const OrchestrationStateSchema = z.object({
  version: z.literal(1), ownerSessionId: z.string().min(1), children: z.array(ChildSchema), messages: z.array(MessageSchema).default([]), steering:z.array(SteeringReceiptSchema).default([]),
  events:z.array(RunEventSchema).max(256).optional(),eventSequence:z.number().int().nonnegative().optional(),historyTruncated:z.boolean().optional(),
  budget:BudgetRecordSchema.optional(),
}).strict()
const StateSchema = OrchestrationStateSchema
type State = z.infer<typeof StateSchema>
function appendEvent(state:State,event:Omit<RunEvent,'seq'|'at'>):void{
 const seq=(state.eventSequence??0)+1
 state.eventSequence=seq
 const events=state.events??=[]
 events.push(RunEventSchema.parse({...event,seq,at:Date.now()}))
 if(events.length>256){events.splice(0,events.length-256);state.historyTruncated=true}
}
function finishActivity(child:ChildRecord):void{
 if(!child.activity)return
 const key=stageTimingKey(child.activity.stage),timing=child.timing??={}
 timing[key]=(timing[key]??0)+Math.max(0,Date.now()-child.activity.since)
 delete child.activity
}

/** Backend addresses are data, never filesystem paths supplied by a model. */
export function childIdentity(kind: ChildKind, address: readonly string[], ownerSessionId: string): string {
  return `child-${createHash('sha256').update(JSON.stringify([ownerSessionId, kind, address])).digest('hex').slice(0, 32)}`
}
/** Shared by live restoration and read-only inspection. No side effects. */
export function validateOrchestrationIdentity(state:State,ownerSessionId:string):void{
 if(state.ownerSessionId!==ownerSessionId)throw new Error('owner mismatch')
 const children=new Map<string,ChildRecord>()
 for(const child of state.children){if(child.id!==childIdentity(child.kind,child.address,ownerSessionId)||children.has(child.id))throw new Error('invalid or duplicate child identity');if(child.resultEpoch!==undefined&&(!child.result||child.resultEpoch>child.epoch))throw new Error('invalid result epoch binding');children.set(child.id,child)}
 for(const child of state.children){const observation=child.contextObservation;if(observation&&(observation.ownerSessionId!==ownerSessionId||observation.childId!==child.id||observation.epoch>child.epoch))throw new Error('invalid context observation identity')}
 for(const child of state.children)if(child.usageTotals?.lastSettledEpoch!==undefined&&child.usageTotals.lastSettledEpoch>child.epoch)throw new Error('invalid settled usage epoch')
 let sequence=0
 for(const event of state.events??[]){
  const child=event.childId?children.get(event.childId):undefined
  if(event.seq<=sequence||event.seq>(state.eventSequence??0)||event.childId&&!child||event.epoch!==undefined&&(!child||event.epoch>child.epoch))throw new Error('invalid event identity or order')
  if(event.taskAttempt&&(event.type!=='started'||!event.epoch||!child||!matchesAttemptOwner(child,event.taskAttempt)))throw new Error('invalid team attempt binding')
  sequence=event.seq
 }
 const activeIds=new Set<string>()
 const reservationKeys=new Set<string>()
 for(const reservation of state.budget?.reviewReservations??[]){
  if(JSON.parse(reservation.key)[0]!==ownerSessionId||reservationKeys.has(reservation.key))throw new Error('invalid review reservation identity')
  reservationKeys.add(reservation.key)
 }
 if(state.budget&&heldReviewRuns(state.budget)>0&&state.budget.limits.maxRuns===undefined)throw new Error('review reservations require maxRuns')
 const boundAttempts=new Set<string>(),boundEpochs=new Set<string>(),admittedReviews=new Map<string,number>()
 for(const binding of state.budget?.reviewBindings??[]){
  const child=children.get(binding.childId),identity=JSON.stringify([binding.childId,binding.taskAttempt.attemptId]),epochIdentity=JSON.stringify([binding.childId,binding.admittedEpoch])
  if(!child||!matchesAttemptOwner(child,binding.taskAttempt)||!reservationKeys.has(binding.admission.key)||boundAttempts.has(identity)||binding.admittedEpoch!==undefined&&(binding.admittedEpoch>child.epoch||boundEpochs.has(epochIdentity)))throw new Error('invalid frozen review attempt binding')
  boundAttempts.add(identity);if(binding.admittedEpoch!==undefined)boundEpochs.add(epochIdentity)
  if(binding.admission.stage==='review'&&binding.admittedEpoch!==undefined)admittedReviews.set(binding.admission.key,(admittedReviews.get(binding.admission.key)??0)+1)
 }
 for(const reservation of state.budget?.reviewReservations??[])if((admittedReviews.get(reservation.key)??0)!==(reservation.phase==='consumed'?1:0))throw new Error('invalid review reservation accounting')
 for(const active of state.budget?.active??[]){
  const child=children.get(active.childId);if(!child||child.epoch!==active.epoch||activeIds.has(active.childId))throw new Error('invalid budget execution identity');activeIds.add(active.childId)
  if(active.reviewAdmission){
   const own=state.budget?.reviewReservations?.find(reservation=>reservation.key===active.reviewAdmission!.key),binding=state.budget?.reviewBindings?.find(binding=>binding.childId===active.childId&&binding.admittedEpoch===active.epoch)
   if(!own||!binding||JSON.stringify(binding.admission)!==JSON.stringify(active.reviewAdmission)||(active.reviewAdmission.stage==='review'?own.phase!=='consumed':own.phase!=='held'&&own.phase!=='recovery-check'))throw new Error('invalid active review reservation binding')
  }
 }
 if(state.budget&&(state.budget.active.length>state.budget.consumedRuns||state.budget.legacyRuns>state.budget.consumedRuns||state.budget.unknownRuns>state.budget.consumedRuns||(state.budget.reviewReservations??[]).filter(reservation=>reservation.phase==='consumed').length>state.budget.consumedRuns||boundEpochs.size>state.budget.consumedRuns))throw new Error('invalid budget accounting')
}

const matchesAttemptOwner=(child:ChildRecord,binding:TaskAttemptBinding)=>(child.kind==='team'||child.kind==='bot')&&child.address.length===3&&child.address[0]===binding.teamId

export class OrchestrationStore {
  private state: State
  private readonly directory: string
  private readonly file: string

  constructor(readonly sessionDir: string, readonly ownerSessionId: string) {
    this.directory = join(sessionDir, 'orchestration')
    this.file = join(this.directory, 'state.json')
    try {
      this.state = existsSync(this.file)
        ? StateSchema.parse(JSON.parse(readFileSync(this.file, 'utf8')))
        : StateSchema.parse({version: 1, ownerSessionId, children: []})
      validateOrchestrationIdentity(this.state,ownerSessionId)
    } catch (error) {
      throw new Error(`Cannot open orchestration state: ${error instanceof Error ? error.message : String(error)}`, {cause: error})
    }
    const messageIds = new Set<string>()
    for (const message of this.state.messages) {
      const expected = this.messageIdentity(message.childId, message.requestId)
      if (!this.get(message.childId) || messageIds.has(message.id) || expected !== message.id) throw new Error('Cannot open orchestration state: invalid message identity')
      messageIds.add(message.id)
    }
    const steeringIds=new Set<string>(),steeringCounts=new Map<string,number>()
    for(const receipt of this.state.steering){
      const child=this.get(receipt.childId),expected=this.steeringIdentity(receipt.childId,receipt.requestId)
      const count=(steeringCounts.get(receipt.childId)??0)+1
      if(!child||receipt.epoch>child.epoch||steeringIds.has(receipt.id)||receipt.id!==expected||count>128)throw new Error('Cannot open orchestration state: invalid steering identity')
      steeringIds.add(receipt.id);steeringCounts.set(receipt.childId,count)
    }
    if (this.state.budget?.active.length || this.state.budget?.reviewReservations?.some(reservation=>reservation.phase==='held') || this.state.steering.some(receipt=>receipt.status==='accepted') || this.state.messages.some(message => message.status === 'running') || this.state.children.some(child => child.state === 'running' || child.state === 'queued')) {
      this.change(state => {
        if(state.budget?.active.length){
          for(const active of state.budget.active){const child=state.children.find(child=>child.id===active.childId)!;child.usageTotals=settleUsageTotals(child.usageTotals,active.epoch)}
          state.budget.unknownRuns+=state.budget.active.length;state.budget.active=[];state.budget.revision++
        }
        if(state.budget?.reviewReservations?.some(reservation=>reservation.phase==='held')){
          for(const reservation of state.budget.reviewReservations)if(reservation.phase==='held')reservation.phase='recovery-check'
          state.budget.revision++
        }
        for (const receipt of state.steering) if(receipt.status==='accepted'){receipt.status='interrupted';receipt.reason='宿主重启，是否进入模型上下文未确认；未自动重放';receipt.updatedAt=Date.now()}
        for (const message of state.messages) if (message.status === 'running') {
          const owner = state.children.find(child => child.id === message.childId)
          if (owner) owner.paused = true
          message.status = 'interrupted'
          message.outcome = {ok: false, output: '', error: '执行被宿主重启中断，可能已有文件副作用；请核对后发送新的继续指令，未自动重放。'}
          message.updatedAt = Date.now()
        }
        for (const child of state.children) if (child.state === 'running' || child.state === 'queued') {
          child.state = 'interrupted'
          child.reason = '宿主已重启，执行状态 interrupted；请核对已有产物后再继续，未自动重放。'
          child.updatedAt = Date.now()
          delete child.activity
          appendEvent(state,{type:'recovered',childId:child.id,epoch:child.epoch,state:'interrupted'})
        }
      })
    }
  }

  list(): ChildRecord[] {return structuredClone(this.state.children)}
  get(id: string): ChildRecord | undefined {return this.list().find(child => child.id === id)}
  history(){return{events:structuredClone(this.state.events??[]),truncated:this.state.historyTruncated??false}}
  budget(){return budgetView(this.state.budget??initialBudget(this.state.children))}
  configureBudget(limits:RunBudgetLimits,expectedRevision:number){
    this.change(state=>{const budget=state.budget??=initialBudget(state.children);setBudgetLimits(budget,limits,expectedRevision);appendEvent(state,{type:'budget-configured'})})
    return this.budget()
  }
  /** Same ledger as admissions. The caller supplies a host-owned pipeline identity. */
  reserveReviewRuns(pipelineId:string,revisionCycle:number,minimumRuns=3):ReviewRunReservation|undefined{
    if(!Number.isSafeInteger(minimumRuns)||minimumRuns<1||minimumRuns>3)throw new Error('Invalid minimum pipeline runs')
    const key=reviewReservationKey(this.ownerSessionId,pipelineId,revisionCycle),current=this.state.budget?.reviewReservations?.find(reservation=>reservation.key===key)
    if(current){
      if(current.phase==='consumed'||current.phase==='released')throw new UserFacingError('该流程周期的审阅预留已结束，不能重新持有')
      return structuredClone(current)
    }
    if(!this.state.budget?.limits.reserveReviewRuns)return
    this.change(state=>{
      const budget=state.budget!,blocked=budgetBlock(budget,Date.now(),false)
      if(blocked)throw new UserFacingError(blocked.message)
      if(budget.limits.maxRuns===undefined||budget.limits.maxRuns-budget.consumedRuns-heldReviewRuns(budget)<minimumRuns)throw new UserFacingError(`委派预算不足以启动本周期；至少需要 ${minimumRuns} 个执行轮次（含独立审阅预留）`)
      ;(budget.reviewReservations??=[]).push({key,stage:'review',remainingRuns:1,phase:'held'});budget.revision++
    })
    return structuredClone(this.state.budget!.reviewReservations!.find(reservation=>reservation.key===key)!)
  }
  admissionBlock(reviewAdmission?:ReviewRunAdmission,now=Date.now()){
    const parsed=reviewAdmission?ReviewRunAdmissionSchema.parse(reviewAdmission):undefined
    if(parsed)this.requireReservationOwner(parsed.key)
    return budgetBlock(this.state.budget??initialBudget(this.state.children),now,true,parsed)
  }
  /** Durable admission proof, independent of the bounded diagnostic event history. */
  reviewRunAdmitted(reviewAdmission:ReviewRunAdmission,taskAttempt:TaskAttemptBinding):boolean{
    const admission=ReviewRunAdmissionSchema.parse(reviewAdmission),attempt=TaskAttemptBindingSchema.parse(taskAttempt)
    this.requireReservationOwner(admission.key)
    return this.state.budget?.reviewBindings?.some(binding=>binding.admittedEpoch!==undefined&&binding.admission.key===admission.key&&binding.admission.stage===admission.stage&&binding.taskAttempt.teamId===attempt.teamId&&binding.taskAttempt.taskId===attempt.taskId&&binding.taskAttempt.attemptId===attempt.attemptId&&binding.taskAttempt.attempt===attempt.attempt)??false
  }
  /** Freeze a host-owned task attempt, independent of the member's reusable child identity. */
  bindReviewAdmission(childId:string,admission:ReviewRunAdmission,taskAttempt:TaskAttemptBinding):void{
    const parsed=ReviewRunAdmissionSchema.parse(admission),attempt=TaskAttemptBindingSchema.parse(taskAttempt),child=this.get(childId)
    this.requireReservationOwner(parsed.key)
    if(!child||!matchesAttemptOwner(child,attempt))throw new Error('Review binding team owner mismatch')
    const prior=this.state.budget?.reviewBindings?.find(binding=>binding.childId===childId&&binding.taskAttempt.attemptId===attempt.attemptId)
    if(prior){if(JSON.stringify(prior.taskAttempt)!==JSON.stringify(attempt)||JSON.stringify(prior.admission)!==JSON.stringify(parsed))throw new Error('审阅执行绑定已冻结，不能替换流程或代次');return}
    const reservation=this.state.budget?.reviewReservations?.find(reservation=>reservation.key===parsed.key)
    if(!reservation||reservation.phase!=='held'&&reservation.phase!=='recovery-check')throw new Error('Unknown or ended review reservation binding')
    this.change(state=>{const budget=state.budget!;(budget.reviewBindings??=[]).push({childId,taskAttempt:attempt,admission:parsed});budget.revision++})
  }
  /** Caller has reverified frozen versions; this never dispatches or resets consumption. */
  resumeReviewReservation(key:string):void{
    this.requireReservationOwner(key)
    const current=this.state.budget?.reviewReservations?.find(reservation=>reservation.key===key)
    if(!current)throw new Error('Unknown review reservation')
    if(current.phase==='held')return
    if(current.phase!=='recovery-check')throw new Error('Review reservation has ended')
    this.change(state=>{const budget=state.budget!;budget.reviewReservations!.find(reservation=>reservation.key===key)!.phase='held';budget.revision++})
  }
  /** Only a drained pipeline can release its unused hold. Admitted turns are never refunded. */
  releaseReviewReservation(key:string):void{
    this.requireReservationOwner(key)
    const budget=this.state.budget,current=budget?.reviewReservations?.find(reservation=>reservation.key===key)
    if(!current)throw new Error('Unknown review reservation')
    if(budget!.active.some(active=>active.reviewAdmission?.key===key))throw new Error('流程仍有在途执行，必须先排空才能释放预留')
    if(current.phase==='released'||current.phase==='consumed')return
    this.change(state=>{const budget=state.budget!,reservation=budget.reviewReservations!.find(reservation=>reservation.key===key)!;reservation.remainingRuns=0;reservation.phase='released';budget.revision++})
  }
  private requireReservationOwner(key:string):void{
    const canonical=ReviewReservationKeySchema.parse(key)
    if(JSON.parse(canonical)[0]!==this.ownerSessionId)throw new Error('Foreign review reservation owner')
  }
  /** The epoch and its charge are one atomic write before dispatch. */
  beginRun(id:string,taskAttempt?:TaskAttemptBinding,reviewAdmission?:ReviewRunAdmission):number{
    let epoch=0
    const admission=reviewAdmission?ReviewRunAdmissionSchema.parse(reviewAdmission):undefined
    if(admission)this.requireReservationOwner(admission.key)
    this.change(state=>{
      const child=state.children.find(c=>c.id===id);if(!child)throw new Error('Unknown child')
      const budget=state.budget??=initialBudget(state.children)
      if(budget.active.some(active=>active.childId===id))throw new Error('Child is already budgeted in flight')
      const attempt=taskAttempt?TaskAttemptBindingSchema.parse(taskAttempt):undefined,binding=attempt?budget.reviewBindings?.find(binding=>binding.childId===id&&binding.taskAttempt.attemptId===attempt.attemptId):undefined
      if(admission||binding){
        if(!binding||!attempt||!admission||JSON.stringify(binding.taskAttempt)!==JSON.stringify(attempt)||JSON.stringify(binding.admission)!==JSON.stringify(admission))throw new Error('缺少匹配的冻结审阅任务绑定 (binding)')
        if(binding.admittedEpoch!==undefined)throw new Error('该任务代次已经准入 (admitted epoch)，不能重复计费或执行')
      }
      const blocked=budgetBlock(budget,Date.now(),true,admission)
      if(blocked)throw new UserFacingError(blocked.message)
      if(admission?.stage==='review'){
        const reservation=budget.reviewReservations!.find(reservation=>reservation.key===admission.key)!
        reservation.remainingRuns=0;reservation.phase='consumed'
      }
      epoch=++child.epoch;child.state='running';child.reason='';child.updatedAt=Date.now()
      if(binding)binding.admittedEpoch=epoch
      budget.consumedRuns++;budget.startedAt??=Date.now();budget.active.push({childId:id,epoch,...(admission?{reviewAdmission:admission}:{})});budget.revision++
      appendEvent(state,{type:'started',childId:id,epoch,state:'running',...(taskAttempt&&matchesAttemptOwner(child,taskAttempt)?{taskAttempt}:{})})
    })
    return epoch
  }
  /** A settled epoch can charge only once; late or duplicate settlement is rejected. */
  settleRun(id:string,epoch:number,outcome:Outcome,cancelled:boolean):void{
    this.change(state=>{
      const child=state.children.find(c=>c.id===id),budget=state.budget,index=budget?.active.findIndex(active=>active.childId===id&&active.epoch===epoch)??-1
      if(!child||child.epoch!==epoch||!budget||index<0)throw new Error('Stale or already settled budget epoch')
      child.usageTotals=settleUsageTotals(child.usageTotals,epoch,outcome.observation)
      budget.active.splice(index,1);chargeObservation(budget,outcome.observation)
      finishActivity(child);child.state=cancelled?'cancelled':outcome.ok?'completed':'failed';child.result=outcome;child.resultEpoch=epoch;child.reason=outcome.error??'';child.updatedAt=Date.now()
      appendEvent(state,{type:'settled',childId:id,epoch,state:child.state,...(outcome.receipt?{receipt:outcome.receipt.state}:{})})
    })
  }

  observeStage(id:string,epoch:number,stage:ExecutionStage,blockers?:LockOwner[],unknownBlockers?:boolean,resources?:string[]):boolean{
    const child=this.get(id)
    if(!child||child.epoch!==epoch||child.state!=='running')return false
    const detail={stage,...(blockers?.length?{blockers}:{}),...(unknownBlockers?{unknownBlockers:true}:{}),...(resources?.length?{resources}:{})}
    if(child.activity&&JSON.stringify({...child.activity,since:undefined})===JSON.stringify(detail))return false
    this.change(state=>{const current=state.children.find(c=>c.id===id)!;finishActivity(current);current.activity={...detail,since:Date.now()};appendEvent(state,{type:'stage',childId:id,epoch,...detail})})
    return true
  }

  recordEvent(event:Omit<RunEvent,'seq'|'at'>):void{
    if(event.childId){const child=this.get(event.childId);if(!child||event.epoch!==undefined&&event.epoch!==child.epoch)return}
    this.change(state=>appendEvent(state,event))
  }

  register(kind: ChildKind, address: readonly string[], label: string): ChildRecord {
    const id = childIdentity(kind, address, this.ownerSessionId)
    const existing = this.get(id)
    if (existing) {
      if (existing.label !== label) throw new Error(`Child identity conflict: ${id}`)
      return existing
    }
    const child = ChildSchema.parse({id, kind, address: [...address], label, state: 'idle', epoch: 0, updatedAt: Date.now(),usageTotals:initialUsageTotals()})
    this.change(state => {state.children.push(child);appendEvent(state,{type:'registered',childId:child.id,epoch:0})})
    return structuredClone(child)
  }

  /** An external legacy resume proves earlier history, never its counts or token values. */
  markUsageHistoryLegacy(id:string):void{
    const child=this.get(id);if(!child)throw new Error('Unknown child')
    if(child.usageTotals?.legacyHistory)return
    this.change(state=>{const current=state.children.find(child=>child.id===id)!,totals=projectUsageTotals(current.usageTotals);current.usageTotals={...totals,legacyHistory:true,partial:[...USAGE_FIELDS]}})
  }

  /** Bind once, before admission; neither retries nor followups may widen a persisted task. */
  bindTask(id: string, settings: TaskSettings): TaskSettings {
    const parsed=TaskSettingsSchema.parse(settings), child=this.get(id)
    if(!child)throw new Error('Unknown child')
    if(child.settings){
      if(JSON.stringify(child.settings)!==JSON.stringify(parsed))throw new Error('任务设置已冻结，不能修改契约或权限')
      return child.settings
    }
    this.change(state=>{state.children.find(item=>item.id===id)!.settings=parsed})
    return structuredClone(parsed)
  }

  /** null freezes deliberate absence; undefined is an older, unbound record. */
  bindHandoff(id:string,sha256:string|null):void {
    const child=this.get(id)
    if(!child)throw new Error('Unknown child')
    const parsed=z.string().regex(/^[a-f0-9]{64}$/).nullable().parse(sha256)
    if(child.handoffSha256!==undefined){
      if(child.handoffSha256!==parsed)throw new Error('上下文交接已冻结，不可修改')
      return
    }
    this.change(state=>{state.children.find(item=>item.id===id)!.handoffSha256=parsed})
  }

  /** Numeric history only. Does not mutate progress, timing, budgets, or execution state. */
  observeContext(observation:BoundAgentContextSample):ContextObservationAdmission {
    const parsed=BoundAgentContextSampleSchema.parse(observation),child=this.get(parsed.childId)
    if(parsed.ownerSessionId!==this.ownerSessionId||!child||child.epoch!==parsed.epoch||child.state!=='running')return {accepted:false,changed:false}
    const prior=child.contextObservation
    // The same reporter/stdout stream is ordered. Date.now can repeat within a millisecond;
    // equal-time semantic changes are valid, but exact duplicates and strictly older samples are not.
    if(prior?.epoch===parsed.epoch){
      if(prior.sample.observedAt>parsed.sample.observedAt)return {accepted:false,changed:false}
      if(JSON.stringify(prior.sample)===JSON.stringify(parsed.sample))return {accepted:true,changed:false}
    }
    this.change(state=>{state.children.find(item=>item.id===parsed.childId)!.contextObservation=parsed})
    return {accepted:true,changed:true}
  }

  update(id: string, patch: Partial<Pick<ChildRecord, 'state' | 'epoch' | 'reason' | 'result' | 'paused'>>, expectedEpoch?: number): ChildRecord {
    const child = this.get(id)
    if (!child) throw new Error(`Unknown child in this parent session: ${id}`)
    if (expectedEpoch !== undefined && child.epoch !== expectedEpoch) throw new Error(`Stale child epoch: ${id}`)
    const next = ChildSchema.parse({...child, ...patch, updatedAt: Date.now()})
    if(patch.result)next.resultEpoch=next.epoch
    else if(patch.state==='queued'||patch.state==='cancelled')delete next.resultEpoch
    this.change(state => {
      if(patch.state&&patch.state!==child.state||patch.epoch!==undefined&&patch.epoch!==child.epoch){
        if(patch.state!=='running')finishActivity(next)
        const type=patch.state==='running'?'started':patch.state==='queued'?'queued':'settled'
        appendEvent(state,{type,childId:id,epoch:next.epoch,state:next.state,...(patch.result?.receipt?{receipt:patch.result.receipt.state}:{})})
      }
      state.children[state.children.findIndex(item => item.id === id)] = next
    })
    return next
  }

  messages(): ChildMessage[] {return structuredClone(this.state.messages)}
  message(id: string): ChildMessage | undefined {return this.messages().find(message => message.id === id)}

  enqueue(childId: string, requestId: string, text: string, notify: boolean, mode: 'start' | 'continue' = 'continue'): ChildMessage {
    if (!this.get(childId)) throw new Error(`Unknown child in this parent session: ${childId}`)
    const id = this.messageIdentity(childId, requestId)
    const existing = this.message(id)
    if (existing) {
      if (existing.text !== text || existing.notify !== notify || existing.mode !== mode) throw new Error(`Message requestId conflict: ${requestId}`)
      return existing
    }
    const now = Date.now()
    const message = MessageSchema.parse({id, childId, requestId, text, notify, mode, status: 'queued', createdAt: now, updatedAt: now})
    this.change(state => {state.messages.push(message)})
    return structuredClone(message)
  }

  updateMessage(id: string, patch: Partial<Pick<ChildMessage, 'status' | 'outcome' | 'deliveredAt'>>): ChildMessage {
    const previous = this.message(id)
    if (!previous) throw new Error(`Unknown orchestration message: ${id}`)
    const next = MessageSchema.parse({...previous, ...patch, updatedAt: Date.now()})
    this.change(state => {state.messages[state.messages.findIndex(message => message.id === id)] = next})
    return next
  }

  steeringReceipts(childId?:string):SteeringReceipt[]{return structuredClone(this.state.steering.filter(receipt=>!childId||receipt.childId===childId))}

  acceptSteering(childId:string, epoch:number, requestId:string, text:string):SteeringReceipt {
    const child=this.get(childId);if(!child||child.epoch!==epoch||child.state!=='running')throw new Error('Inactive or stale steering target')
    const existing=this.steeringReceipts(childId).find(receipt=>receipt.requestId===requestId)
    if(existing){if(existing.text!==text)throw new Error('Steering requestId conflict');return existing}
    if(this.steeringReceipts(childId).length>=128)throw new Error('Steering receipt history limit reached; start a new child')
    const now=Date.now(),receipt=SteeringReceiptSchema.parse({id:this.steeringIdentity(childId,requestId),childId,epoch,requestId,text,status:'accepted',createdAt:now,updatedAt:now})
    this.change(state=>{state.steering.push(receipt)})
    return receipt
  }

  settleSteering(childId:string,epoch:number,id:string|undefined,status:'applied'|'interrupted',reason?:string):boolean {
    const receipts=this.state.steering.filter(receipt=>receipt.childId===childId&&receipt.epoch===epoch&&(!id||receipt.id===id)&&receipt.status==='accepted')
    if(!receipts.length)return false
    this.change(state=>{for(const receipt of state.steering)if(receipts.some(item=>item.id===receipt.id)){receipt.status=status;receipt.updatedAt=Date.now();if(reason)receipt.reason=reason}})
    return true
  }

  private steeringIdentity(childId:string,requestId:string):string {
    return `steer-${createHash('sha256').update(JSON.stringify([childId,requestId])).digest('hex').slice(0,32)}`
  }

  private messageIdentity(childId: string, requestId: string): string {
    return `message-${createHash('sha256').update(JSON.stringify([childId, requestId])).digest('hex').slice(0, 32)}`
  }

  private change(mutate: (state: State) => void): void {
    const next = structuredClone(this.state)
    mutate(next)
    StateSchema.parse(next)
    mkdirSync(this.directory, {recursive: true})
    const temporary = join(this.directory, `.state-${process.pid}-${randomUUID()}.tmp`)
    writeFileSync(temporary, JSON.stringify(next, null, 2), {mode: 0o600})
    renameSync(temporary, this.file)
    this.state = next
  }
}
