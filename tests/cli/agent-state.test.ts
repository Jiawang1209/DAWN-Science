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
    notice() {}
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
  harness.context = {
    call, usage, suggest, sessionId: 'state-test-session', model: 'state-test-model', directory: '/isolated/state-test',
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
    call, usage, suggest, emit, submit,
    state: () => harness.states.at(-1),
    close: async () => { harness.options!.onExit(); await running },
  }
}

const pending: QuestionRecord = {
  requestId: 'question-state-test', state: 'pending',
  questions: [{ id: 'range', question: '选择分析范围？', options: [{ label: '全部' }, { label: '部分' }] }],
}

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
