/** Durable, parent-scoped identities and execution facts. Pi remains the transcript owner. */
import {createHash, randomUUID} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'
import {TaskTraceSchema,type TaskTrace} from '../protocol/task-trace.js'
import {TaskSettingsSchema, TaskReceiptSchema, type TaskSettings} from './task-contract.js'
import {SteeringReceiptSchema,type SteeringReceipt} from '../protocol/subagent-control.js'
export {SteeringReceiptSchema,type SteeringReceipt} from '../protocol/subagent-control.js'
import {TaskObservationSchema} from '../protocol/task-observation.js'
import {RunActivitySchema,RunTimingSchema,RunEventSchema,stageTimingKey,type ExecutionStage,type LockOwner,type RunEvent} from '../protocol/run-explanation.js'
import {BudgetRecordSchema,initialBudget,budgetView,chargeObservation,setBudgetLimits} from './budget.js'
import type {RunBudgetLimits} from '../protocol/run-budget.js'

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
  activity:RunActivitySchema.optional(),timing:RunTimingSchema.optional(),
}).strict()
export type ChildRecord = z.infer<typeof ChildSchema>
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
 let sequence=0
 for(const event of state.events??[]){
  const child=event.childId?children.get(event.childId):undefined
  if(event.seq<=sequence||event.seq>(state.eventSequence??0)||event.childId&&!child||event.epoch!==undefined&&(!child||event.epoch>child.epoch))throw new Error('invalid event identity or order')
  sequence=event.seq
 }
 const activeIds=new Set<string>()
 for(const active of state.budget?.active??[]){const child=children.get(active.childId);if(!child||child.epoch!==active.epoch||activeIds.has(active.childId))throw new Error('invalid budget execution identity');activeIds.add(active.childId)}
 if(state.budget&&(state.budget.active.length>state.budget.consumedRuns||state.budget.legacyRuns>state.budget.consumedRuns||state.budget.unknownRuns>state.budget.consumedRuns))throw new Error('invalid budget accounting')
}

export class OrchestrationStore {
  private state: State
  private readonly directory: string
  private readonly file: string

  constructor(sessionDir: string, readonly ownerSessionId: string) {
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
    if (this.state.budget?.active.length || this.state.steering.some(receipt=>receipt.status==='accepted') || this.state.messages.some(message => message.status === 'running') || this.state.children.some(child => child.state === 'running' || child.state === 'queued')) {
      this.change(state => {
        if(state.budget?.active.length){state.budget.unknownRuns+=state.budget.active.length;state.budget.active=[];state.budget.revision++}
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
  /** The epoch and its charge are one atomic write before dispatch. */
  beginRun(id:string):number{
    let epoch=0
    this.change(state=>{
      const child=state.children.find(c=>c.id===id);if(!child)throw new Error('Unknown child')
      const budget=state.budget??=initialBudget(state.children)
      if(budget.active.some(active=>active.childId===id))throw new Error('Child is already budgeted in flight')
      epoch=++child.epoch;child.state='running';child.reason='';child.updatedAt=Date.now()
      budget.consumedRuns++;budget.startedAt??=Date.now();budget.active.push({childId:id,epoch});budget.revision++
      appendEvent(state,{type:'started',childId:id,epoch,state:'running'})
    })
    return epoch
  }
  /** A settled epoch can charge only once; late or duplicate settlement is rejected. */
  settleRun(id:string,epoch:number,outcome:Outcome,cancelled:boolean):void{
    this.change(state=>{
      const child=state.children.find(c=>c.id===id),budget=state.budget,index=budget?.active.findIndex(active=>active.childId===id&&active.epoch===epoch)??-1
      if(!child||child.epoch!==epoch||!budget||index<0)throw new Error('Stale or already settled budget epoch')
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
    const child = ChildSchema.parse({id, kind, address: [...address], label, state: 'idle', epoch: 0, updatedAt: Date.now()})
    this.change(state => {state.children.push(child);appendEvent(state,{type:'registered',childId:child.id,epoch:0})})
    return structuredClone(child)
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
