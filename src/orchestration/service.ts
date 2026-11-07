import {AgentContextSampleSchema,ContextRouteSchema,type AgentContextObservation,type ContextRoute} from '../protocol/agent-context-observation.js'
/** Shared admission and cleanup ownership for existing DAWN child backends. */
import {OrchestrationStore, type Outcome, type ChildKind, type ChildRecord} from './store.js'

import {randomUUID} from 'node:crypto'
import type {SteeringReceipt} from './store.js'
import {withExecutionContext,reportExecutionStage} from './execution-context.js'
import {TaskAttemptBindingSchema,type TaskAttemptBinding} from '../protocol/run-explanation.js'
import type {RunBudgetLimits} from '../protocol/run-budget.js'
import {ReviewRunAdmissionSchema,type ReviewRunAdmission} from './budget.js'

type Work = (signal: AbortSignal) => Promise<Outcome>
interface Entry {
  id: string
  controller: AbortController
  work: Work
  contextBinding?:{route:ContextRoute;observed:boolean}
  admittedEpoch?:number
  taskAttempt?:TaskAttemptBinding
  reviewAdmission?:ReviewRunAdmission
  resolve: (outcome: Outcome) => void
  reject: (error: unknown) => void
  detach: () => void
  finished: Promise<void>
  finish: () => void
}
const cancelled = (): Outcome => ({ok: false, output: '', error: '执行已中止'})

export class OrchestrationService {
  observationIssue:string|undefined
  private readonly controlErrors:unknown[]=[]
  private steering = new Map<string,{epoch:number; send:(receipt:SteeringReceipt)=>void|Promise<void>}>()
  private queue: Entry[] = []
  private active = new Map<string, Entry>()
  private closing: Promise<void> | undefined
  private closed = false
  private readonly listeners = new Set<() => void>()
  private generation = 0
  private readonly observerId = randomUUID()
  private observationRevision = 0
  private readonly observers = new Set<(stamp:{observerId:string;revision:number})=>void>()
  private budgetTimer:ReturnType<typeof setTimeout>|undefined

  constructor(readonly store: OrchestrationStore, readonly capacity = 4) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Invalid orchestration capacity')
  }

  get observation(){return {observerId:this.observerId,revision:this.observationRevision}}
  subscribeObservation(listener:(stamp:{observerId:string;revision:number})=>void):()=>void {
    this.observers.add(listener);return()=>{this.observers.delete(listener)}
  }
  /** Read invalidation only: does not wake dispatch/wait or change its generation. */
  invalidateObservation():void {
    this.observationRevision++
    for(const listener of [...this.observers])try{listener(this.observation)}catch{/* Observation must never interrupt execution/persistence. */}
  }
  disposeObservation():void {this.observers.clear()}
  currentTaskAttempt(id:string):TaskAttemptBinding|undefined {
    const entry=this.active.get(id),child=this.store.get(id)
    return entry?.taskAttempt&&entry.admittedEpoch!==undefined&&child?.epoch===entry.admittedEpoch&&(child.kind==='team'||child.kind==='bot')&&child.address.length===3&&child.address[0]===entry.taskAttempt.teamId?{...entry.taskAttempt}:undefined
  }
  contextObservation(id:string):AgentContextObservation {
    const entry=this.active.get(id),child=this.store.get(id),sample=child?.contextObservation,binding=entry?.contextBinding
    const active=!!entry&&!entry.controller.signal.aborted&&entry.admittedEpoch===child?.epoch
    const current=active&&!!binding?.observed&&!!sample&&sample.epoch===entry?.admittedEpoch&&sample.sample.provider===binding.route.provider&&sample.sample.model===binding.route.model
    const routeChanged=active&&!!binding&&sample?.epoch===entry?.admittedEpoch&&!!sample&&(sample.sample.provider!==binding.route.provider||sample.sample.model!==binding.route.model)
    return {current:!!current,reason:current?'current':routeChanged?'route-changed':active?'awaiting-sample':'historical',...(sample?{sample}:{})}
  }
  private bindContextRoute(entry:Entry,epoch:number,raw:ContextRoute):(raw:unknown)=>void {
    const route=ContextRouteSchema.parse(raw)
    if(this.active.get(entry.id)!==entry||entry.controller.signal.aborted||entry.admittedEpoch!==epoch)return()=>{}
    const binding={route,observed:false};entry.contextBinding=binding;this.invalidateObservation()
    return raw=>{
      // Validate against host-owned execution identity and frozen route, never child-supplied identity.
      if(this.active.get(entry.id)!==entry||entry.controller.signal.aborted||entry.contextBinding!==binding||this.store.get(entry.id)?.epoch!==epoch)return
      const parsed=AgentContextSampleSchema.safeParse(raw)
      if(!parsed.success||parsed.data.provider!==route.provider||parsed.data.model!==route.model)return
      try{
        const admission=this.store.observeContext({ownerSessionId:this.store.ownerSessionId,childId:entry.id,epoch,sample:parsed.data})
        if(!admission.accepted)return
        const becameCurrent=!binding.observed
        binding.observed=true
        if(admission.changed||becameCurrent)this.invalidateObservation()
      }catch{/* Observer failures never abort execution or echo raw payloads. */}
    }
  }
  get revision(): number {return this.generation}
  get isClosed(): boolean {return this.closed}
  get hasPendingWork():boolean {return this.active.size>0||this.queue.length>0}
  budgetSnapshot(){return this.store.budget()}
  reserveReviewRuns(pipelineId:string,cycle:number,minimumRuns=3){
    if(this.closed)throw new Error('Orchestration service is closed')
    const before=this.store.budget().revision,result=this.store.reserveReviewRuns(pipelineId,cycle,minimumRuns)
    if(this.store.budget().revision!==before){this.enforceBudget();this.changed();this.drain()}
    return result
  }
  resumeReviewReservation(key:string){
    if(this.closed)throw new Error('Orchestration service is closed')
    const before=this.store.budget().revision;this.store.resumeReviewReservation(key)
    if(this.store.budget().revision!==before)this.changed()
  }
  hasReviewWork(key:string){return [...this.queue,...this.active.values()].some(entry=>entry.reviewAdmission?.key===key)}
  hasTaskWork(teamId:string,taskIds:readonly string[]){return [...this.queue,...this.active.values()].some(entry=>entry.taskAttempt?.teamId===teamId&&taskIds.includes(entry.taskAttempt.taskId))}
  releaseReviewReservation(key:string){
    if(this.hasReviewWork(key))throw new Error('流程仍有排队或在途执行，必须先排空才能释放预留')
    const before=this.store.budget().revision;this.store.releaseReviewReservation(key)
    if(this.store.budget().revision!==before){this.changed();this.drain()}
  }
  configureBudget(limits:RunBudgetLimits,expectedRevision:number){
    if(this.closed)throw new Error('Orchestration service is closed')
    const result=this.store.configureBudget(limits,expectedRevision)
    this.enforceBudget();this.refreshBudgetTimer();this.changed();this.drain()
    return result
  }

  register(kind: ChildKind, address: readonly string[], label: string): ChildRecord {
    if (this.closed) throw new Error('Orchestration service is closed')
    const count = this.store.list().length
    const child = this.store.register(kind, address, label)
    if (this.store.list().length !== count) this.changed()
    return child
  }

  run(id: string, work: Work, signal?: AbortSignal,taskAttempt?:TaskAttemptBinding,reviewAdmission?:ReviewRunAdmission): Promise<Outcome> {
    if (this.closed) return Promise.reject(new Error('Orchestration service is closed'))
    const child = this.store.get(id)
    if (!child) return Promise.reject(new Error(`Unknown child in this parent session: ${id}`))
    if (signal?.aborted) return Promise.resolve(cancelled())
    const binding=taskAttempt?TaskAttemptBindingSchema.safeParse(taskAttempt):undefined
    if(binding&&!binding.success)this.observationIssue='部分任务阶段无法关联；既有执行和验收继续生效'
    const admission=reviewAdmission?ReviewRunAdmissionSchema.safeParse(reviewAdmission):undefined
    if(admission&&(!admission.success||!binding?.success))return Promise.reject(new Error('审阅预留缺少有效的冻结任务绑定'))
    const boundAdmission=admission?.success?admission.data:undefined
    let blocked:ReturnType<OrchestrationStore['admissionBlock']>
    try{
      blocked=this.store.admissionBlock(boundAdmission)
      if(!blocked&&boundAdmission&&binding?.success)this.store.bindReviewAdmission(id,boundAdmission,binding.data)
    }catch(error){return Promise.reject(error)}
    if(blocked){this.store.recordEvent({type:'budget-blocked',childId:id,epoch:child.epoch});this.changed();return Promise.resolve({ok:false,output:'',error:blocked.message})}
    return new Promise<Outcome>((resolve, reject) => {
      const controller = new AbortController()
      let finish!: () => void
      const finished = new Promise<void>(done => {finish = done})
      const entry: Entry = {id, work, ...(binding?.success?{taskAttempt:binding.data}:{}),...(boundAdmission?{reviewAdmission:boundAdmission}:{}),controller, resolve, reject, finished, finish, detach: () => {}}
      const abort = () => {
        if(this.active.get(id)===entry)this.interruptSteering(id)
        this.observeCancellation(entry)
        controller.abort(signal?.reason)
        const index = this.queue.indexOf(entry)
        if (index < 0) {
          if(this.active.get(id)===entry)this.invalidateObservation()
          return
        }
        this.queue.splice(index, 1)
        try {
          if (!this.active.has(id)) this.store.update(id, {state: 'cancelled', reason: '排队期间已中止'})
          resolve(cancelled())
        } catch (error) {reject(error)}
        finally {entry.detach(); finish(); this.changed(); this.drain()}
      }
      signal?.addEventListener('abort', abort, {once: true})
      entry.detach = () => signal?.removeEventListener('abort', abort)
      try {
        if (!this.active.has(id)) this.store.update(id, {state: 'queued'})
        this.queue.push(entry)
        this.changed()
        this.drain()
      } catch (error) {entry.detach(); finish(); reject(error)}
    })
  }

  controlPhase(id:string):'idle'|'queued'|'running'|'stopping'|'drained'{
    const entry=this.active.get(id)
    if(entry)return entry.controller.signal.aborted?'stopping':'running'
    if(this.queue.some(entry=>entry.id===id))return'queued'
    const state=this.store.get(id)?.state
    return state&&['completed','failed','cancelled','interrupted'].includes(state)?'drained':'idle'
  }

  canSteer(id:string):boolean {
    const adapter=this.steering.get(id),entry=this.active.get(id),child=this.store.get(id)
    return !this.closed&&!!adapter&&!!entry&&!entry.controller.signal.aborted&&child?.epoch===adapter.epoch&&!child.settings?.contract
  }

  attachSteering(id:string,epoch:number,send:(receipt:SteeringReceipt)=>void|Promise<void>):()=>void {
    if(this.closed||!this.active.has(id)||this.active.get(id)!.controller.signal.aborted||this.store.get(id)?.epoch!==epoch||this.steering.has(id))throw new Error('Inactive or stale steering generation')
    const adapter={epoch,send};this.steering.set(id,adapter);this.changed()
    return()=>{if(this.steering.get(id)===adapter){this.interruptSteering(id);this.changed()}}
  }

  async steer(id:string,requestId:string,text:string,expectedEpoch:number):Promise<SteeringReceipt> {
    if(this.closed)throw new Error('Orchestration service is closed')
    const child=this.store.get(id)
    if(!child)throw new Error('Unknown child in this parent session')
    if(child.settings?.contract)throw new Error('科研任务契约已冻结；请先停止，再派生新批次')
    text=text.trim()
    if(!requestId||requestId.length>512||!text.trim()||Buffer.byteLength(text,'utf8')>16*1024)throw new Error('Invalid steering request size')
    const existing=this.store.steeringReceipts(id).find(receipt=>receipt.requestId===requestId)
    if(existing){if(existing.text!==text||existing.epoch!==expectedEpoch)throw new Error('Steering requestId/epoch conflict');return existing}
    if(!Number.isSafeInteger(expectedEpoch)||expectedEpoch<1||child.epoch!==expectedEpoch)throw new Error('Stale steering epoch; inspect the active execution again')
    if(!this.canSteer(id))throw new Error('当前后端或执行代次不支持实时纠偏 (steering capability unavailable)')
    if(this.store.steeringReceipts(id).filter(receipt=>receipt.status==='accepted').length>=8)throw new Error('Steering pending limit reached')
    const adapter=this.steering.get(id)!,receipt=this.store.acceptSteering(id,adapter.epoch,requestId,text)
    this.changed()
    try{await adapter.send(receipt)}catch(error){this.store.settleSteering(id,adapter.epoch,receipt.id,'interrupted','控制发送失败，未确认生效；未自动重放');this.changed();throw error}
    return this.store.steeringReceipts(id).find(item=>item.id===receipt.id)!
  }

  applySteering(id:string,epoch:number,receiptId:string):boolean {
    if(!this.canSteer(id)||this.steering.get(id)?.epoch!==epoch)return false
    const changed=this.store.settleSteering(id,epoch,receiptId,'applied');if(changed)this.changed();return changed
  }

  failSteering(id:string,epoch:number,receiptId:string,reason:string):boolean {
    if(!this.canSteer(id)||this.steering.get(id)?.epoch!==epoch)return false
    const changed=this.store.settleSteering(id,epoch,receiptId,'interrupted',reason);if(changed)this.changed();return changed
  }

  private interruptSteering(id:string):void {
    const adapter=this.steering.get(id);if(!adapter)return
    this.steering.delete(id)
    try{this.store.settleSteering(id,adapter.epoch,undefined,'interrupted','执行结束或已停止，是否进入模型上下文未确认；未自动重放')}catch(error){this.controlErrors.push(error)}
  }

  /** Interrupt only the active turn; later queued work remains explicitly queued. */
  interrupt(id: string): boolean {
    if (!this.store.get(id)) throw new Error(`Unknown child in this parent session: ${id}`)
    const entry = this.active.get(id)
    if (!entry) return false
    this.interruptSteering(id)
    this.observeCancellation(entry)
    entry.controller.abort()
    this.changed()
    return true
  }

  /** Closing admission happens before awaiting any backend cleanup. */
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    clearTimeout(this.budgetTimer)
    const active = [...this.active.values()]
    for (const entry of active) {this.interruptSteering(entry.id);this.observeCancellation(entry);entry.controller.abort()}
    const queued = this.queue.splice(0)
    const errors: unknown[] = []
    for (const entry of queued) {
      entry.controller.abort()
      try {
        if (!this.active.has(entry.id)) this.store.update(entry.id, {state: 'cancelled', reason: '父会话已关闭，未开始执行'})
        entry.resolve(cancelled())
      } catch (error) {errors.push(error); entry.reject(error)}
      finally {entry.detach(); entry.finish()}
    }
    this.changed()
    this.closing = Promise.all(active.map(entry => entry.finished)).then(() => {
      errors.push(...this.controlErrors)
      if (errors.length) throw new AggregateError(errors, 'Orchestration close persistence failed')
    }).finally(()=>this.disposeObservation())
    return this.closing
  }

  /** One-shot change wait with revision protection against missed notifications. */
  wait(afterRevision: number, timeoutMs: number, signal?: AbortSignal): Promise<number> {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 60_000) return Promise.reject(new Error('Wait timeout must be 0..60000 ms'))
    if (this.generation !== afterRevision || this.closed || signal?.aborted) return Promise.resolve(this.generation)
    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(timer); this.listeners.delete(finish); signal?.removeEventListener('abort', finish); resolve(this.generation)
      }
      const timer = setTimeout(finish, timeoutMs)
      this.listeners.add(finish)
      signal?.addEventListener('abort', finish, {once: true})
    })
  }

  private changed(): void {this.generation++; for (const listener of [...this.listeners]) listener();this.invalidateObservation()}

  private drain(): void {
    if (this.closed) return
    this.enforceBudget()
    while (this.active.size < this.capacity) {
      const index = this.queue.findIndex(entry => !this.active.has(entry.id))
      if (index < 0) return
      const entry = this.queue.splice(index, 1)[0]!
      this.active.set(entry.id, entry)
      void this.execute(entry)
    }
  }

  private async execute(entry: Entry): Promise<void> {
    try {
      const epoch = this.store.beginRun(entry.id,entry.taskAttempt,entry.reviewAdmission)
      entry.admittedEpoch=epoch
      this.refreshBudgetTimer()
      this.changed()
      let outcome: Outcome
      try {outcome = await withExecutionContext({ownerSessionId:this.store.ownerSessionId,childId:entry.id,label:this.store.get(entry.id)!.label,epoch,
        bindContextRoute:route=>this.bindContextRoute(entry,epoch,route),
        report:(stage,blockers,unknown,resources)=>{if(this.store.observeStage(entry.id,epoch,stage,blockers,unknown,resources))this.changed()},
        observationFailed:()=>{this.observationIssue='部分运行观察未能保存；不影响既有锁和排空规则'},
      },()=>{reportExecutionStage('execution');return entry.work(entry.controller.signal)})}
      catch (error) {outcome = {ok: false, output: '', error: error instanceof Error ? error.message : String(error)}}
      if (entry.controller.signal.aborted) outcome = {...cancelled(),...(outcome.observation?{observation:outcome.observation}:{}),...(outcome.trace?{trace:outcome.trace}:{})}
      this.store.settleRun(entry.id,epoch,outcome,entry.controller.signal.aborted)
      this.enforceBudget()
      entry.resolve(outcome)
    } catch (error) {entry.reject(error)}
    finally {
      this.interruptSteering(entry.id);entry.detach(); this.active.delete(entry.id); entry.finish(); this.changed(); this.drain();this.refreshBudgetTimer()
    }
  }

  private enforceBudget():void{
    const blocked=this.budgetSnapshot().blocked
    // Run-count admission limits allow the final legally admitted turn to settle.
    let changed=false
    if(blocked&&blocked.code!=='runs')for(const entry of this.active.values())if(!entry.controller.signal.aborted&&this.store.get(entry.id)?.state==='running'){
      this.interruptSteering(entry.id);this.observeCancellation(entry);entry.controller.abort(blocked.message)
      changed=true
    }
    const queued=this.queue.splice(0)
    for(const entry of queued){
      const entryBlock=this.store.admissionBlock(entry.reviewAdmission)
      if(!entryBlock){this.queue.push(entry);continue}
      try{
        if(!this.active.has(entry.id))this.store.update(entry.id,{state:'cancelled',reason:entryBlock.message})
        this.store.recordEvent({type:'budget-blocked',childId:entry.id,epoch:this.store.get(entry.id)!.epoch})
        entry.resolve({ok:false,output:'',error:entryBlock.message})
      }catch(error){entry.reject(error)}finally{entry.detach();entry.finish()}
      changed=true
    }
    if(changed)this.changed()
  }

  private observeCancellation(entry:Entry):void{
    if(this.active.get(entry.id)!==entry||entry.controller.signal.aborted)return
    try{this.store.recordEvent({type:'cancel-requested',childId:entry.id,epoch:this.store.get(entry.id)!.epoch})}catch{this.observationIssue='部分运行观察未能保存；不影响既有锁和排空规则'}
  }

  private refreshBudgetTimer():void{
    clearTimeout(this.budgetTimer);this.budgetTimer=undefined
    if(this.closed||!this.hasPendingWork)return
    const budget=this.budgetSnapshot(),limit=budget.limits.maxElapsedMs
    if(limit===undefined||budget.startedAt===undefined)return
    const remaining=limit-(Date.now()-budget.startedAt)
    if(remaining<=0){this.enforceBudget();return}
    // Sleep or a clock correction can advance wall time while a long timer
    // still has monotonic time remaining. Recheck without writing periodic state.
    this.budgetTimer=setTimeout(()=>{this.budgetTimer=undefined;this.enforceBudget();this.refreshBudgetTimer()},Math.min(remaining,1000))
    this.budgetTimer.unref?.()
  }
}
