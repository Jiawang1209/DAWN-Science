/** Model-facing controls; all authority derives from this parent's service instance. */
import {Type} from 'typebox'
import {z} from 'zod'
import type {OrchestrationService} from './service.js'
import type {OrchestrationMailbox} from './mailbox.js'
import type {ChildMessage, ChildRecord} from './store.js'

export interface OrchestrationToolOptions {
  service: OrchestrationService
  mailbox: OrchestrationMailbox
  start: (agent: string, task: string, requestId: string) => {child: ChildRecord; message: ChildMessage}
  sendMember?: (child: ChildRecord, text: string, requestId: string) => Promise<unknown>
  interruptMember?: (child: ChildRecord) => void
}
const id = z.string().min(1).max(512)
const body = z.string().trim().min(1).max(64 * 1024)

export function createOrchestrationTools(opts: OrchestrationToolOptions) {
  const {service, mailbox} = opts
  const resolve = (childId: string) => {
    const child = service.store.get(childId)
    if (!child) throw new Error('子 agent 不属于当前父会话或不存在')
    return child
  }
  const make = <S extends z.ZodType>(name: string, description: string, parameters: unknown, schema: S, action: (args: z.output<S>, callId: string, signal?: AbortSignal) => unknown) => ({
    name, label: name, description, parameters,
    async execute(callId: string, raw: unknown, signal?: AbortSignal) {
      try {
        if (signal?.aborted) throw new Error('调用已中止')
        const value = await action(schema.parse(raw), callId, signal)
        return {content: [{type: 'text' as const, text: JSON.stringify(value)}], details: undefined}
      } catch (error) {
        return {content: [{type: 'text' as const, text: error instanceof Error ? error.message : String(error)}], isError: true, details: undefined}
      }
    },
  })
  return [
    make('start_subagent', '后台启动一个名册中的子 agent，立即返回稳定 childId 和消息接收回执；完成结果会回主对话。写清执行范围、数据保护和交付要求。', Type.Object({agent: Type.String(), task: Type.String()}), z.object({agent: id, task: body}).strict(), (args, callId) => {
      const {child, message} = opts.start(args.agent, args.task, callId)
      return {childId: child.id, messageId: message.id, delivery: 'queued', revision: service.revision}
    }),
    make('send_subagent_message', '向当前会话的子 agent 排队发送后续指令；当前轮结束后续同一份转录，不是实时 Steer。回执只表示接收，结果随后回送。中断后发送新指令可继续。', Type.Object({childId: Type.String(), message: Type.String()}), z.object({childId: id, message: body}).strict(), async (args, callId) => {
      const child = resolve(args.childId)
      if (child.kind !== 'subagent') {
        if (!opts.sendMember) throw new Error('此后端没有装配成员消息适配器')
        return opts.sendMember(child, args.message, callId)
      }
      const message = mailbox.send(child.id, args.message, callId)
      return {childId: child.id, messageId: message.id, delivery: 'queued'}
    }),
    make('list_subagents', '列出当前父会话的普通子任务、团队成员和 Bot 的执行状态、最后结果及控制能力。completed 只表示后端返回成功，不能代替产物核验。', Type.Object({}), z.object({}).strict(), () => ({
      revision: service.revision,
      children: service.store.list().map(child => ({...child, capabilities: {queue: child.kind === 'subagent' || !!opts.sendMember, steer: false, interrupt: child.kind === 'subagent' || !!opts.interruptMember}})),
    })),
    make('interrupt_subagent', '中断点名子 agent 当前执行，保留转录与身份；普通子 agent 的剩余消息暂停，新的发送可继续。', Type.Object({childId: Type.String()}), z.object({childId: id}).strict(), args => {
      const child = resolve(args.childId)
      if (child.kind === 'subagent') return {childId: child.id, interrupted: mailbox.interrupt(child.id)}
      if (!opts.interruptMember) throw new Error('此后端没有装配中断适配器')
      opts.interruptMember(child)
      return {childId: child.id, interrupted: true}
    }),
    make('wait_subagents', '等当前父会话的子 agent 状态变化，最长 60 秒；传入上次 list_subagents 的 revision，避免漏掉刚发生的变化。', Type.Object({revision: Type.Optional(Type.Integer({minimum: 0})), timeoutSec: Type.Optional(Type.Integer({minimum: 0, maximum: 60}))}), z.object({revision: z.number().int().nonnegative().optional(), timeoutSec: z.number().int().min(0).max(60).optional()}).strict(), async (args, _callId, signal) => {
      const revision = args.revision ?? service.revision
      const next = await service.wait(revision, (args.timeoutSec ?? 30) * 1000, signal)
      return {revision: next, changed: next !== revision, children: service.store.list()}
    }),
  ]
}
