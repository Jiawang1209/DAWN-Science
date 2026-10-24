import { expect, it } from 'vitest'
import { parsePlanCommand, executeApprovedPlan } from '../../src/cli/planning.js'
import { vi } from 'vitest'
import { OPERATIONS } from '../../src/protocol/operations.js'

it('matches the existing GUI /plan prefix and preserves the complete question', () => {
  expect(parsePlanCommand('/plan')).toEqual({ kind: 'enable', prompt: '' })
  expect(parsePlanCommand('/plan 分析数据\n并设计绘图方案')).toEqual({ kind: 'enable', prompt: '分析数据\n并设计绘图方案' })
  expect(parsePlanCommand('/planet')).toBeUndefined()
})

it('only executes the canonical latest approved plan and constructs the shared user instruction', async () => {
  const plan = { type: 'plan' as const, id: 'plan:p1', planId: 'p1', version: 1, title: '方案', markdown: '## 图\n绘图', status: 'approved' as const, savedPath: 'analysis/plans/a.md' }
  const call = vi.fn(async () => ({ planning: false, plan }))
  await executeApprovedPlan('owned', 'p1', call)
  expect(call).toHaveBeenLastCalledWith('writeToSession', { sessionId: 'owned', as: 'user', data: '照批准的方案做：`analysis/plans/a.md`。和方案不一样的地方，做完时逐条说出来，并说明为什么。' })
  call.mockClear()
  await expect(executeApprovedPlan('owned', 'stale', call)).rejects.toThrow(/状态已改变/)
  expect(call.mock.calls.some(([operation]: any[]) => operation === 'writeToSession')).toBe(false)
})
it('shares the terminal planning operations with the deterministic dev and Electron model fixture', async () => {
  // @ts-expect-error shared JavaScript inference fixture
  const { TERMINAL_PLAN_OPERATIONS } = await import('../../scripts/mock-inference-server.mjs')
  expect(TERMINAL_PLAN_OPERATIONS).toEqual(['getSessionPlan', 'setSessionConfigOption', 'answerPlan'])
  for (const name of TERMINAL_PLAN_OPERATIONS as (keyof typeof OPERATIONS)[]) expect(OPERATIONS[name]).toBeDefined()
  expect(OPERATIONS.getSessionPlan.mutating).toBe(false)
})
it('requires an explicit proposal identity for approval/discard and rejects ambiguous reserved arguments', () => {
  expect(parsePlanCommand('/plan approve plan-2')).toEqual({ kind: 'answer', planId: 'plan-2', action: 'approve' })
  expect(parsePlanCommand('/plan discard plan-1')).toEqual({ kind: 'answer', planId: 'plan-1', action: 'discard' })
  for (const text of ['/plan approve', '/plan discard', '/plan off extra', '/plan status extra', '/plan approve p1 p2']) expect(parsePlanCommand(text)).toEqual({ kind: 'help' })
  expect(parsePlanCommand('/plan off')).toEqual({ kind: 'disable' })
  expect(parsePlanCommand('/plan status')).toEqual({ kind: 'status' })
})
