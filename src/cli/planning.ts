import { 执行那句 } from '../protocol/plan.js'
import { SessionPlanSchema } from '../protocol/planning.js'

export const PLAN_HELP = '/plan 开启先出方案 · /plan 问题 开启并提问 · /plan off 退出方案期 · /plan status 查看状态 · /plan approve <方案ID> 照这个做 · /plan discard <方案ID> 不做了'
type Command = { kind: 'enable'; prompt: string } | { kind: 'disable' } | { kind: 'status' } | { kind: 'help' } | { kind: 'answer'; planId: string; action: 'approve' | 'discard' }
export function parsePlanCommand(text: string): Command | undefined {
  if (!/^\/plan(?:\s|$)/.test(text)) return undefined
  const prompt = text.slice(5).trim(), [verb, ...args] = prompt.split(/\s+/)
  if (verb === 'approve' || verb === 'discard') return args.length === 1 && args[0] ? { kind: 'answer', planId: args[0], action: verb } : { kind: 'help' }
  if (['on', 'off', 'status', 'help'].includes(verb!)) {
    if (args.length) return { kind: 'help' }
    return verb === 'on' ? { kind: 'enable', prompt: '' } : verb === 'off' ? { kind: 'disable' } : verb === 'status' ? { kind: 'status' } : { kind: 'help' }
  }
  return { kind: 'enable', prompt }
}

/** Bypass only the pending attachment composer, never the native gate/lease. */
export async function executeApprovedPlan(sessionId: string, planId: string, call: (operation: string, input: unknown) => Promise<unknown>) {
  const state = SessionPlanSchema.parse(await call('getSessionPlan', { sessionId }))
  const plan = state.plan
  if (!plan || plan.planId !== planId || plan.status !== 'approved' || !plan.savedPath || state.planning) throw new Error('方案状态已改变，请重新查看当前方案。')
  await call('writeToSession', { sessionId, as: 'user', data: 执行那句(plan.savedPath, Boolean(plan.edited)) })
}
