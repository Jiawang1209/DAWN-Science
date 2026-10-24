import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import type { DesktopCliEvent } from '../../src/cli/desktop-wire.js'
import type { QuestionRecord } from '../../src/protocol/questions.js'
import type { SessionUsage } from '../../src/runtime/session-usage.js'

const harness = vi.hoisted(() => ({
  context: undefined as unknown,
  options: undefined as { onSubmit: (text: string) => void; onExit: () => void; onDraftChange: () => void } | undefined,
  states: [] as { busy: boolean; permission?: boolean; question?: boolean }[],
  started: false,
  usages: [] as SessionUsage[],
  suggestions: [] as string[], draft: '',
  permissions: [] as unknown[], notices: [] as string[],
  plans: [] as unknown[], users: [] as string[],
  questions: [] as { record: QuestionRecord; index: number; answers: unknown[] }[],
}))
vi.mock('../../src/cli/context.js', () => ({ openCliContext: async () => harness.context }))
vi.mock('../../src/cli/tui.js', () => ({
  CliTui: class {
    constructor(options: NonNullable<typeof harness.options>) { harness.options = options }
    start() { harness.started = true }
    stop() {}
    setState(state: (typeof harness.states)[number]) { harness.states.push({ ...state }) }
    draft() { return harness.draft }
    setSuggestion(text: string) { harness.suggestions.push(text) }
    setUsage(usage: SessionUsage) { harness.usages.push(usage) }
    notice(text: string) { harness.notices.push(text) }
    setPermissions(value: unknown) { harness.permissions.push(value) }
    setPlanState(value: unknown) { harness.plans.push(value) }
    plan(value: unknown) { harness.plans.push(value) }
    question(record: QuestionRecord, index = 0, answers: unknown[] = []) { harness.questions.push(structuredClone({ record, index, answers })) }
    user(text: string) { harness.users.push(text) }
    recoverDraft(text: string) { if (harness.draft) return false; harness.draft = text; return true }
    finish() {}
    reply() {}
    image() {}
    toolStart() {}
    toolEnd() {}
  },
}))
import { runCliAgent } from '../../src/cli/agent.js'

afterEach(() => { vi.restoreAllMocks() })

async function interactiveAgent() {
  harness.permissions = []; harness.notices = []
  harness.plans = []; harness.users = []; harness.questions = []
  harness.options = undefined; harness.states = []; harness.started = false; harness.usages = []; harness.suggestions = []; harness.draft = ''
  // Replace only the stream getters; the worker's actual terminal and signal
  // handlers are never driven by these controller tests.
  const input = Object.assign(new EventEmitter(), { isTTY: true, setRawMode: vi.fn(), pause: vi.fn() })
  const output = Object.assign(new EventEmitter(), { isTTY: true, write: vi.fn() })
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as typeof process.stdin)
  vi.spyOn(process, 'stdout', 'get').mockReturnValue(output as unknown as typeof process.stdout)
  let emit!: (event: DesktopCliEvent) => void
  const call = vi.fn(async (_operation: string, _input: unknown) => ({}))
  const suggest = vi.fn(async () => ({ text: '检查缺失值' }))
  const usage = vi.fn(async (): Promise<SessionUsage> => ({}))
  let permissionTier = 'inherit'
  const permissions = vi.fn(async (value?: string) => { if (value) permissionTier = value; return { current: permissionTier, effective: permissionTier === 'inherit' ? 'ask-risky' : permissionTier } })
  const planState: import('../../src/protocol/planning.js').SessionPlan = { planning: false }
  const planning = vi.fn(async (enabled?: boolean) => { if (enabled !== undefined) planState.planning = enabled; return structuredClone(planState) })
  const answerPlan = vi.fn(async (_id: string, action: string) => {
    planState.planning = false
    planState.plan = { ...planState.plan!, status: action === 'approve' ? 'approved' : 'discarded', ...(action === 'approve' ? { savedPath: 'analysis/plans/approved.md' } : {}) }
    return action === 'approve' ? { savedPath: 'analysis/plans/approved.md' } : {}
  })
  const executePlan = vi.fn(async (_id: string) => ({}))
  harness.context = {
    call, usage, suggest, permissions, planning, answerPlan, executePlan, sessionId: 'state-test-session', model: 'state-test-model', directory: '/isolated/state-test',
    attach: (sink: typeof emit) => { emit = sink; return vi.fn() },
    onExit: () => vi.fn(), close: vi.fn(async () => {}), waitForIdle: vi.fn(async () => {}),
  }
  const running = runCliAgent()
  await vi.waitFor(() => expect(harness.started).toBe(true))
  const submit = async (text: string) => {
    harness.options!.onSubmit(text)
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  return {
    call, usage, suggest, permissions, planning, answerPlan, executePlan, planState, emit, submit,
    state: () => harness.states.at(-1),
    close: async () => { harness.options!.onExit(); await running },
  }
}

it('handles /permissions locally, validates tiers, synchronizes config events and never answers a pending approval', async () => {
  const agent = await interactiveAgent()
  try {
    expect(harness.permissions.at(-1)).toEqual({ current: 'inherit', effective: 'ask-risky' })
    await agent.submit('/permissions allow-all')
    expect(agent.permissions).toHaveBeenCalledWith('allow-all')
    expect(harness.permissions.at(-1)).toEqual({ current: 'allow-all', effective: 'allow-all' })
    agent.permissions.mockClear()
    await agent.submit('/permissions invalid')
    expect(agent.permissions).not.toHaveBeenCalled()
    expect(agent.call.mock.calls.some(([op]) => op === 'writeToSession')).toBe(false)
    agent.emit({ kind: 'permission_request', sessionId: 'state-test-session', requestId: 'pending', title: '确认？', options: [{ optionId: 'yes', kind: 'allow_once', name: '允许' }] })
    await agent.submit('/permissions deny-risky')
    expect(agent.state()?.permission).toBe(true)
    expect(agent.call.mock.calls.some(([op]) => op === 'answerPermission')).toBe(false)
    agent.emit({ kind: 'config_options', sessionId: 'state-test-session', options: [] })
    await vi.waitFor(() => expect(agent.permissions).toHaveBeenCalledWith())
  } finally { await agent.close() }
})

const pending: QuestionRecord = {
  requestId: 'question-state-test', state: 'pending',
  questions: [{ id: 'range', question: '选择分析范围？', options: [{ label: '全部' }, { label: '部分' }] }],
}

it('keeps prior choices visible across questions, duplicate pending events and the final accepted answer', async () => {
  const a = await interactiveAgent()
  const two = { ...pending, questions: [...pending.questions, { id: 'format', question: '输出格式？', options: [{ label: '表格' }] }] }
  try {
    a.emit({ kind: 'question', sessionId: 'state-test-session', question: two })
    await a.submit('1')
    expect(harness.questions.at(-1)).toMatchObject({ index: 1, answers: [{ selected: ['全部'] }] })
    a.emit({ kind: 'question', sessionId: 'state-test-session', question: two })
    expect(harness.questions.at(-1)?.index).toBe(1)
    await a.submit('1')
    expect(harness.questions.at(-1)?.record).toMatchObject({ state: 'answered', answer: { answers: [{ id: 'range', selected: ['全部'] }, { id: 'format', selected: ['表格'] }] } })
    expect(a.call).toHaveBeenCalledExactlyOnceWith('answerQuestion', expect.objectContaining({ requestId: two.requestId }))
    expect(harness.users).toEqual([])
  } finally { await a.close() }
})

const proposed = { type: 'plan' as const, id: 'plan:p1', planId: 'p1', version: 1, title: '分组方案', markdown: '## 图\n绘制散点图', status: 'proposed' as const }
it('does not let an old plan read overwrite a newer successful toggle', async () => {
  const a = await interactiveAgent()
  try {
    let resolve!: (value: any) => void
    a.planning.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    a.emit({ kind: 'config_options', sessionId: 'state-test-session', options: [] })
    await a.submit('/plan')
    resolve({ planning: false })
    await vi.waitFor(() => expect(harness.plans.at(-1)).toMatchObject({ planning: true }))
  } finally { await a.close() }
})
it('locks duplicate plan operations while a mutation is in flight without approving a different version', async () => {
  const a = await interactiveAgent()
  try {
    let resolve!: (value: any) => void
    a.planning.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    await a.submit('/plan')
    expect(a.state()?.busy).toBe(true)
    await a.submit('/plan status')
    expect(harness.notices.at(-1)).toContain('方案操作正在处理')
    await a.submit('/plan approve p1')
    expect(a.answerPlan).not.toHaveBeenCalled()
    resolve({ planning: true })
    await vi.waitFor(() => expect(a.state()?.busy).toBe(false))
  } finally { await a.close() }
})
it('/plan enables before sending only the question; empty /plan and status do not generate model turns', async () => {
  const a = await interactiveAgent()
  try {
    await a.submit('/plan'); expect(a.planning).toHaveBeenCalledWith(true)
    expect(a.call.mock.calls.some(([op]) => op === 'writeToSession')).toBe(false)
    await a.submit('/plan 比较两组数据')
    expect(a.call).toHaveBeenCalledWith('writeToSession', { sessionId: 'state-test-session', as: 'user', data: '比较两组数据' })
    expect(harness.users).toEqual(['比较两组数据'])
    a.emit({ kind: 'idle', sessionId: 'state-test-session' })
    await a.submit('/plan off'); expect(a.planState.planning).toBe(false)
    expect(a.answerPlan).not.toHaveBeenCalled()
  } finally { await a.close() }
})
it('approves only the exact displayed proposal, sends the shared execution instruction once, and rejects stale IDs', async () => {
  const a = await interactiveAgent()
  try {
    a.planState.planning = true; a.planState.plan = proposed
    await a.submit('/plan approve wrong')
    expect(a.answerPlan).not.toHaveBeenCalled()
    await a.submit('/plan approve p1')
    expect(a.answerPlan).toHaveBeenCalledExactlyOnceWith('p1', 'approve')
    expect(a.executePlan).toHaveBeenCalledExactlyOnceWith('p1')
    expect(harness.users[0]).toContain('照批准的方案做：`analysis/plans/approved.md`')
    await a.submit('/plan approve p1')
    expect(a.answerPlan).toHaveBeenCalledTimes(1)
  } finally { await a.close() }
})
it('discards without executing, and busy plan commands never become question or permission answers', async () => {
  const a = await interactiveAgent()
  try {
    a.planState.planning = true; a.planState.plan = proposed
    await a.submit('/plan discard p1')
    expect(a.answerPlan).toHaveBeenCalledExactlyOnceWith('p1', 'discard')
    expect(a.executePlan).not.toHaveBeenCalled()
    a.emit({ kind: 'permission_request', sessionId: 'state-test-session', requestId: 'p', title: '确认？', options: [{ optionId: 'yes', name: '允许', kind: 'allow_once' }] })
    await a.submit('/plan off')
    expect(a.call.mock.calls.some(([op]) => op === 'answerPermission')).toBe(false)
    expect(a.state()?.permission).toBe(true)
    expect(harness.draft).toBe('/plan off')
  } finally { await a.close() }
})
it('failed enable preserves the original command and an unsent approved instruction never overwrites a later draft', async () => {
  const a = await interactiveAgent()
  try {
    a.planning.mockRejectedValueOnce(Error('plan unavailable'))
    await a.submit('/plan 分析数据'); expect(harness.draft).toBe('/plan 分析数据')
    expect(a.call.mock.calls.some(([op]) => op === 'writeToSession')).toBe(false)
    harness.draft = 'LATER_DRAFT'; a.planState.planning = true; a.planState.plan = proposed
    a.executePlan.mockRejectedValueOnce(Error('connection lost'))
    await a.submit('/plan approve p1')
    expect(harness.draft).toBe('LATER_DRAFT')
    expect(harness.notices.join('\n')).toContain('照批准的方案做：`analysis/plans/approved.md`')
    expect(a.state()?.busy).toBe(false)
  } finally { await a.close() }
})

it('loads follow-ups only after idle, hides them for a draft, and does not send suggestions automatically', async () => {
  const agent = await interactiveAgent()
  try {
    expect(agent.suggest).not.toHaveBeenCalled()
    await agent.submit('检查数据'); agent.emit({ kind: 'turn_end', sessionId: 'state-test-session' })
    expect(agent.suggest).not.toHaveBeenCalled()
    agent.emit({ kind: 'idle', sessionId: 'state-test-session' })
    await vi.waitFor(() => expect(harness.suggestions.at(-1)).toBe('检查缺失值'))
    harness.draft = 'MY_DRAFT'; harness.options!.onDraftChange()
    expect(harness.suggestions.at(-1)).toBe('')
    expect(agent.call.mock.calls.filter(([op]) => op === 'writeToSession')).toHaveLength(1)
    harness.draft = ''; harness.options!.onDraftChange()
    await vi.waitFor(() => expect(harness.suggestions.at(-1)).toBe('检查缺失值'))
    expect(agent.suggest).toHaveBeenCalledOnce()
  } finally { await agent.close() }
})

it('refreshes suggestions for a new round received from the same conversation without a local submit', async () => {
  const agent = await interactiveAgent()
  try {
    await agent.submit('首轮'); agent.emit({ kind: 'idle', sessionId: 'state-test-session' })
    await vi.waitFor(() => expect(harness.suggestions.at(-1)).toBe('检查缺失值'))
    agent.suggest.mockResolvedValue({ text: '绘制分布图' })
    agent.emit({ kind: 'output', sessionId: 'state-test-session', data: 'GUI 发起的新一轮结果' })
    expect(agent.state()).toMatchObject({ busy: true }); expect(harness.suggestions.at(-1)).toBe('')
    agent.emit({ kind: 'idle', sessionId: 'state-test-session' })
    await vi.waitFor(() => expect(harness.suggestions.at(-1)).toBe('绘制分布图'))
    expect(agent.suggest).toHaveBeenCalledTimes(2)
  } finally { await agent.close() }
})

it.each([
  { kind: 'thinking', sessionId: 'state-test-session', delta: 'thinking' },
  { kind: 'notice', sessionId: 'state-test-session', text: '请求未完成', failed: true },
] as const)('clears an old suggestion for an external $kind before any output', async event => {
  const agent = await interactiveAgent()
  try {
    await agent.submit('首轮'); agent.emit({ kind: 'idle', sessionId: 'state-test-session' })
    await vi.waitFor(() => expect(harness.suggestions.at(-1)).toBe('检查缺失值'))
    agent.suggest.mockResolvedValue({ text: '' }); agent.emit(event)
    expect(agent.state()).toMatchObject({ busy: event.kind === 'thinking' }); expect(harness.suggestions.at(-1)).toBe('')
    agent.emit({ kind: 'turn_end', sessionId: 'state-test-session' }); agent.emit({ kind: 'idle', sessionId: 'state-test-session' })
    await vi.waitFor(() => expect(agent.suggest).toHaveBeenCalledTimes(2))
    expect(harness.suggestions.at(-1)).toBe('')
  } finally { await agent.close() }
})

it('refreshes the current model and context after model switches and compaction', async () => {
  const agent = await interactiveAgent()
  try {
    agent.usage.mockResolvedValue({ context: { model: 'changed-model', usedTokens: 100, contextWindow: 128000 } } as never)
    agent.emit({ kind: 'model', sessionId: 'state-test-session', provider: 'deepseek', model: 'changed-model' })
    await vi.waitFor(() => expect(harness.usages.at(-1)).toMatchObject({ context: { model: 'changed-model', usedTokens: 100 } }))
    agent.usage.mockResolvedValue({ context: { model: 'changed-model', contextWindow: 128000, afterCompaction: true } } as never)
    agent.emit({ kind: 'compaction_end', sessionId: 'state-test-session', reason: 'manual', status: 'done' })
    await vi.waitFor(() => expect(harness.usages.at(-1)).toMatchObject({ context: { afterCompaction: true } }))
    expect(harness.usages.at(-1)).not.toHaveProperty('context.usedTokens')
  } finally { await agent.close() }
})

it('updates cumulative snapshots when usage arrives after turn_end without adding history twice', async () => {
  const agent = await interactiveAgent()
  try {
    expect(harness.usages).toEqual([{}])
    agent.usage.mockResolvedValue({ input: 30, output: 6, cacheRead: 70 })
    agent.emit({ kind: 'turn_end', sessionId: 'state-test-session' })
    agent.emit({ kind: 'turn_usage', sessionId: 'state-test-session', usage: { input: 30, output: 6, cacheRead: 70 } })
    await vi.waitFor(() => expect(harness.usages.at(-1)).toEqual({ input: 30, output: 6, cacheRead: 70 }))
    agent.emit({ kind: 'idle', sessionId: 'state-test-session' })
    await vi.waitFor(() => expect(agent.usage).toHaveBeenCalledTimes(3))
    expect(harness.usages.at(-1)).toEqual({ input: 30, output: 6, cacheRead: 70 })
  } finally { await agent.close() }
})
it('ignores a stale usage snapshot arriving after a newer idle refresh', async () => {
  const agent = await interactiveAgent(); let resolve!: (usage: SessionUsage) => void
  try {
    agent.usage.mockReturnValueOnce(new Promise(done => { resolve = done })).mockResolvedValue({ input: 40, output: 8 })
    agent.emit({ kind: 'turn_usage', sessionId: 'state-test-session', usage: { input: 20 } })
    agent.emit({ kind: 'idle', sessionId: 'state-test-session' })
    await vi.waitFor(() => expect(harness.usages.at(-1)).toEqual({ input: 40, output: 8 }))
    resolve({ input: 20 }); await new Promise<void>(done => setImmediate(done))
    expect(harness.usages.at(-1)).toEqual({ input: 40, output: 8 })
  } finally { await agent.close() }
})
it('keeps input working if usage cannot be read', async () => {
  const agent = await interactiveAgent()
  try {
    agent.usage.mockRejectedValue(Error('usage unavailable'))
    agent.emit({ kind: 'idle', sessionId: 'state-test-session' })
    await new Promise<void>(done => setImmediate(done))
    expect(harness.usages.at(-1)).toEqual({})
    await agent.submit('CONTINUE_AFTER_USAGE_FAILURE')
    expect(agent.call).toHaveBeenCalledWith('writeToSession', expect.objectContaining({ data: 'CONTINUE_AFTER_USAGE_FAILURE' }))
  } finally { await agent.close() }
})

it('clears the waiting state after the final answer while the same turn is still busy', async () => {
  const agent = await interactiveAgent()
  try {
    await agent.submit('开始分析')
    agent.emit({ kind: 'question', sessionId: 'state-test-session', question: pending })
    expect(agent.state()).toMatchObject({ busy: true, question: true })
    await agent.submit('1')
    expect(agent.call).toHaveBeenCalledWith('answerQuestion', {
      sessionId: 'state-test-session', requestId: pending.requestId,
      answer: { answers: [{ id: 'range', selected: ['全部'] }] },
    })
    // No idle event has arrived. The editor must already protect the next draft
    // from being submitted and cleared while the model resumes its response.
    expect(agent.state()).toMatchObject({ busy: true, question: false })
  } finally { await agent.close() }
})

it.each(['answered', 'cancelled', 'interrupted'] as const)('clears a remotely %s question before idle', async state => {
  const agent = await interactiveAgent()
  try {
    await agent.submit('开始分析')
    agent.emit({ kind: 'question', sessionId: 'state-test-session', question: pending })
    expect(agent.state()).toMatchObject({ busy: true, question: true })
    agent.emit({ kind: 'question', sessionId: 'state-test-session', question: {
      ...pending, state,
      ...(state === 'answered' ? { answer: { answers: [{ id: 'range', selected: ['全部'] }] } } : {}),
    } })
    expect(agent.state()).toMatchObject({ busy: true, question: false })
  } finally { await agent.close() }
})

it('protects the next draft while a permission answer is in flight, then restores retry on failure', async () => {
  const agent = await interactiveAgent()
  let reject!: (error: Error) => void
  try {
    await agent.submit('开始分析')
    agent.emit({ kind: 'permission_request', sessionId: 'state-test-session', requestId: 'permit-1', title: '允许这次操作？', options: [{ optionId: 'yes', name: '允许', kind: 'allow_once' }] })
    expect(agent.state()).toMatchObject({ busy: true, permission: true })
    agent.call.mockImplementation(async operation => operation === 'answerPermission' ? new Promise((_resolve, fail) => { reject = fail }) : {})
    await agent.submit('y')
    expect(agent.state()).toMatchObject({ busy: true, permission: false })
    reject(Error('try permission again'))
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(agent.state()).toMatchObject({ busy: true, permission: true })
  } finally { await agent.close() }
})

it('protects the draft during a final question answer and retries only that answer after a failed request', async () => {
  const agent = await interactiveAgent()
  let reject!: (error: Error) => void
  const two = { ...pending, questions: [...pending.questions, { id: 'format', question: '输出格式？', options: [{ label: '表格' }] }] }
  try {
    await agent.submit('开始分析'); agent.emit({ kind: 'question', sessionId: 'state-test-session', question: two })
    await agent.submit('1')
    agent.call.mockImplementation(async operation => operation === 'answerQuestion' ? new Promise((_resolve, fail) => { reject = fail }) : {})
    await agent.submit('1'); expect(agent.state()).toMatchObject({ busy: true, question: false })
    reject(Error('question answer failed')); await new Promise<void>(resolve => setImmediate(resolve))
    expect(agent.state()).toMatchObject({ busy: true, question: true })
    agent.call.mockImplementation(async () => ({})); await agent.submit('1')
    expect(agent.call).toHaveBeenLastCalledWith('answerQuestion', {
      sessionId: 'state-test-session', requestId: pending.requestId,
      answer: { answers: [{ id: 'range', selected: ['全部'] }, { id: 'format', selected: ['表格'] }] },
    })
    expect(agent.state()).toMatchObject({ busy: true, question: false })
  } finally { await agent.close() }
})
it('does not revive a remotely settled question when its in-flight answer fails later', async () => {
  const agent = await interactiveAgent(); let reject!: (error: Error) => void
  try {
    await agent.submit('开始分析'); agent.emit({ kind: 'question', sessionId: 'state-test-session', question: pending })
    agent.call.mockImplementation(async operation => operation === 'answerQuestion' ? new Promise((_resolve, fail) => { reject = fail }) : {})
    await agent.submit('1')
    agent.emit({ kind: 'question', sessionId: 'state-test-session', question: { ...pending, state: 'cancelled' } })
    reject(Error('late question failure')); await new Promise<void>(resolve => setImmediate(resolve))
    expect(agent.state()).toMatchObject({ busy: true, question: false })
  } finally { await agent.close() }
})
