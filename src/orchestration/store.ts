/** Durable, parent-scoped identities and execution facts. Pi remains the transcript owner. */
import {createHash, randomUUID} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'
import {TaskSettingsSchema, TaskReceiptSchema, type TaskSettings} from './task-contract.js'
import {TaskObservationSchema} from '../protocol/task-observation.js'

export const ChildKindSchema = z.enum(['subagent', 'team', 'bot'])
export type ChildKind = z.infer<typeof ChildKindSchema>
export const RunStateSchema = z.enum(['idle', 'queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'])
export type RunState = z.infer<typeof RunStateSchema>
export const OutcomeSchema = z.object({ok: z.boolean(), output: z.string(), error: z.string().optional(), receipt: TaskReceiptSchema.optional(),observation:TaskObservationSchema.optional()}).strict()
export interface Outcome {ok: boolean; output: string; error?: string; receipt?: import('./task-contract.js').TaskReceipt;observation?:import('../protocol/task-observation.js').TaskObservation}
const ChildSchema = z.object({
  id: z.string(), kind: ChildKindSchema, address: z.array(z.string().min(1)).min(1).max(8),
  label: z.string().min(1), paused: z.boolean().optional(), state: RunStateSchema, epoch: z.number().int().nonnegative(),
  updatedAt: z.number().finite(), reason: z.string().optional(), result: OutcomeSchema.optional(), settings: TaskSettingsSchema.optional(),
}).strict()
export type ChildRecord = z.infer<typeof ChildSchema>
const MessageSchema = z.object({
  id: z.string(), childId: z.string(), requestId: z.string().min(1).max(512), text: z.string().min(1).max(64 * 1024),
  mode: z.enum(['start', 'continue']), status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted']),
  notify: z.boolean(), createdAt: z.number().finite(), updatedAt: z.number().finite(),
  outcome: OutcomeSchema.optional(), deliveredAt: z.number().finite().optional(),
}).strict()
export type ChildMessage = z.infer<typeof MessageSchema>
const StateSchema = z.object({
  version: z.literal(1), ownerSessionId: z.string().min(1), children: z.array(ChildSchema), messages: z.array(MessageSchema).default([]),
}).strict()
type State = z.infer<typeof StateSchema>

/** Backend addresses are data, never filesystem paths supplied by a model. */
export function childIdentity(kind: ChildKind, address: readonly string[], ownerSessionId: string): string {
  return `child-${createHash('sha256').update(JSON.stringify([ownerSessionId, kind, address])).digest('hex').slice(0, 32)}`
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
      if (this.state.ownerSessionId !== ownerSessionId) throw new Error('owner mismatch')
      const ids = new Set<string>()
      for (const child of this.state.children) {
        if (child.id !== childIdentity(child.kind, child.address, ownerSessionId) || ids.has(child.id)) throw new Error('invalid or duplicate child identity')
        ids.add(child.id)
      }
    } catch (error) {
      throw new Error(`Cannot open orchestration state: ${error instanceof Error ? error.message : String(error)}`, {cause: error})
    }
    const messageIds = new Set<string>()
    for (const message of this.state.messages) {
      const expected = this.messageIdentity(message.childId, message.requestId)
      if (!this.get(message.childId) || messageIds.has(message.id) || expected !== message.id) throw new Error('Cannot open orchestration state: invalid message identity')
      messageIds.add(message.id)
    }
    if (this.state.messages.some(message => message.status === 'running') || this.state.children.some(child => child.state === 'running' || child.state === 'queued')) {
      this.change(state => {
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
        }
      })
    }
  }

  list(): ChildRecord[] {return structuredClone(this.state.children)}
  get(id: string): ChildRecord | undefined {return this.list().find(child => child.id === id)}

  register(kind: ChildKind, address: readonly string[], label: string): ChildRecord {
    const id = childIdentity(kind, address, this.ownerSessionId)
    const existing = this.get(id)
    if (existing) {
      if (existing.label !== label) throw new Error(`Child identity conflict: ${id}`)
      return existing
    }
    const child = ChildSchema.parse({id, kind, address: [...address], label, state: 'idle', epoch: 0, updatedAt: Date.now()})
    this.change(state => {state.children.push(child)})
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

  update(id: string, patch: Partial<Pick<ChildRecord, 'state' | 'epoch' | 'reason' | 'result' | 'paused'>>, expectedEpoch?: number): ChildRecord {
    const child = this.get(id)
    if (!child) throw new Error(`Unknown child in this parent session: ${id}`)
    if (expectedEpoch !== undefined && child.epoch !== expectedEpoch) throw new Error(`Stale child epoch: ${id}`)
    const next = ChildSchema.parse({...child, ...patch, updatedAt: Date.now()})
    this.change(state => {state.children[state.children.findIndex(item => item.id === id)] = next})
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
