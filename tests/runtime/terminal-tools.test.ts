import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeRuntime } from '../../src/runtime/native.js'
import { TerminalControl } from '../../src/terminal/control.js'
import { 内核请求标记 } from '../../src/kernel/shortcuts.js'

async function setup(deny = false, remote = false) {
  const workspace = mkdtempSync(join(tmpdir(), 'dawn-terminal-tools-'))
  const terminals = new TerminalControl(), write = vi.fn()
  terminals.register({ id: 't', pid: 42, cwd: workspace, command: '/bin/bash', cols: 80, rows: 24, write, resize: vi.fn() })
  terminals.output('t', '$ '); terminals.grant('chat', 't', 'shell')
  const runtime = new NativeRuntime({ terminals, provenance: false, checkpoints: false,
    gate: () => deny ? { kind: 'deny', reason: '本次权限拒绝' } : { kind: 'allow' },
    credentials: { read: async () => ({ type: 'api_key', key: 'offline' }), list: async () => [], modify: async () => {}, delete: async () => {} },
  })
  await runtime.start({ sessionId: 'chat', workspace, sessionDir: join(workspace, '.dawn'), native: { provider: 'deepseek', model: 'deepseek-flash' },
    ...(remote ? { remote: { executor: { readFile: vi.fn(), writeFile: vi.fn(), exec: vi.fn() }, cwd: { get: () => '/remote', set: vi.fn() } } } : {}),
  })
  const state = (runtime as any).sessions.get('chat')
  const say = (text: string) => { const m = { role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() }; state.sessionManager.appendMessage(m); state.session.messages.push(m) }
  return { terminals, write, runtime, say, session: state.session,
    close: async () => { await runtime.stop('chat'); terminals.dispose(); rmSync(workspace, { force: true, recursive: true }) } }
}

describe('native terminal tool boundaries', () => {
  it('explicit Notebook selection and kernel prohibition cannot be bypassed through terminal input', async () => {
    const x = await setup()
    try {
      x.say('@R 运行计算\n' + 内核请求标记(['R']))
      const call = (code: string) => x.session.getToolDefinition('terminal_execute').execute('blocked', { terminal_id: 't', code })
      expect((await call('echo wrong path')).isError).toBe(true)
      x.say('先查看现有下载状态，不要启动 Python 内核。')
      expect((await call('python -m ipykernel')).isError).toBe(true)
      expect(x.write).not.toHaveBeenCalled()
    } finally { await x.close() }
  })
  it('registers live read tools, but permission refusal sends no bytes', async () => {
    const x = await setup(true)
    try {
      expect(x.session.getToolDefinition('terminal_snapshot')).toBeDefined()
      expect((await x.session.getToolDefinition('terminal_snapshot').execute('read', { terminal_id: 't' })).isError).not.toBe(true)
      const result = await x.session.getToolDefinition('terminal_execute').execute('run', { terminal_id: 't', code: 'echo hello' })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('本次权限拒绝')
      expect(x.write).not.toHaveBeenCalled()
    } finally { await x.close() }
  })

  it('discussion and plan modes allow observing but prohibit terminal input', async () => {
    const x = await setup()
    try {
      x.say('先讨论，不要执行。')
      expect((await x.session.getToolDefinition('terminal_snapshot').execute('read', { terminal_id: 't' })).isError).not.toBe(true)
      expect((await x.session.getToolDefinition('terminal_execute').execute('run', { terminal_id: 't', code: 'echo hello' })).isError).toBe(true)
      x.say('现在开始执行。')
      await x.runtime.setConfigOption('chat', 'dawn.plan', '1')
      expect((await x.session.getToolDefinition('terminal_snapshot').execute('read-plan', { terminal_id: 't' })).isError).not.toBe(true)
      expect((await x.session.getToolDefinition('terminal_key').execute('interrupt-plan', { terminal_id: 't', key: 'ctrl-c' })).isError).toBe(true)
      expect(x.write).not.toHaveBeenCalled()
    } finally { await x.close() }
  })

  it('stopping the model revokes control without writing Ctrl-C or closing the terminal', async () => {
    const x = await setup()
    try {
      await x.runtime.abort('chat')
      expect(x.terminals.state('t')).toMatchObject({ alive: true, controlled: false, pid: 42 })
      expect(x.write).not.toHaveBeenCalled()
    } finally { await x.close() }
  })

  it('does not expose local terminal tools to a remote session', async () => {
    const x = await setup(false, true)
    try { expect(x.session.getToolDefinition('terminal_snapshot')).toBeUndefined() }
    finally { await x.close() }
  })
})
