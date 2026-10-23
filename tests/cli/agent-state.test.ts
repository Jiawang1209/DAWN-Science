import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import type { DesktopCliEvent } from '../../src/cli/desktop-wire.js'
import type { QuestionRecord } from '../../src/protocol/questions.js'

const harness = vi.hoisted(() => ({
  context: undefined as unknown,
  options: undefined as { onSubmit: (text: string) => void; onExit: () => void } | undefined,
  states: [] as { busy: boolean; permission?: boolean; question?: boolean }[],
  started: false,
}))
vi.mock('../../src/cli/context.js', () => ({ openCliContext: async () => harness.context }))
vi.mock('../../src/cli/tui.js', () => ({
  CliTui: class {
    constructor(options: NonNullable<typeof harness.options>) { harness.options = options }
    start() { harness.started = true }
    stop() {}
    setState(state: (typeof harness.states)[number]) { harness.states.push({ ...state }) }
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
  harness.options = undefined; harness.states = []; harness.started = false
  // Replace only the stream getters; the worker's actual terminal and signal
  // handlers are never driven by these controller tests.
  const input = Object.assign(new EventEmitter(), { isTTY: true, setRawMode: vi.fn(), pause: vi.fn() })
  const output = Object.assign(new EventEmitter(), { isTTY: true, write: vi.fn() })
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as typeof process.stdin)
  vi.spyOn(process, 'stdout', 'get').mockReturnValue(output as unknown as typeof process.stdout)
  let emit!: (event: DesktopCliEvent) => void
  const call = vi.fn(async (_operation: string, _input: unknown) => ({}))
  harness.context = {
    call, sessionId: 'state-test-session', model: 'state-test-model', directory: '/isolated/state-test',
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
    call, emit, submit,
    state: () => harness.states.at(-1),
    close: async () => { harness.options!.onExit(); await running },
  }
}

const pending: QuestionRecord = {
  requestId: 'question-state-test', state: 'pending',
  questions: [{ id: 'range', question: '选择分析范围？', options: [{ label: '全部' }, { label: '部分' }] }],
}

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
