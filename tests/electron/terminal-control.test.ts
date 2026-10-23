import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkbench } from '../../src/electron/wiring.js'
import { memoryCredentials } from '../helpers/credentials.js'

describe('terminal assistance wiring', () => {
  it('binds matching live sessions and manual input revokes AI control without restarting the PTY', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dawn-terminal-wire-'))
    const configPath = join(dir, 'providers.yaml')
    writeFileSync(configPath, 'agents:\n  chat:\n    kind: native\n    provider: deepseek\n    model: deepseek-flash\n    capabilities: [chat]\n  shell:\n    kind: pty\n    command: /bin/bash\n    args: ["--noprofile", "--norc"]\n    capabilities: [exec]\n')
    const wb = createWorkbench({ configPath, dbPath: join(dir, 'db.sqlite'), credentials: memoryCredentials({ deepseek: 'offline' }), skillsDir: join(dir, 'skills'), memoriesDir: join(dir, 'memories') })
    const call = async (op: any, params: any) => {
      const r = await wb.server.handle(op, params)
      expect(r.ok, JSON.stringify(r)).toBe(true)
      return (r as any).data
    }
    try {
      const main = await call('createTask', { agentId: 'chat', workspace: dir })
      const terminal = await call('createTerminalSession', { agentId: 'shell', projectId: main.projectId, ownerSessionId: main.sessionId })
      const state = await call('getTerminalControl', { terminalId: terminal.sessionId })
      expect(state.controlled).toBe(false)
      await call('setTerminalControl', { terminalId: terminal.sessionId, ownerSessionId: main.sessionId, enabled: true, mode: 'shell' })
      await vi.waitFor(async () => {
        const tools = (wb.nativeRuntime as any).sessions.get(main.sessionId).session
        const result = await tools.getToolDefinition('terminal_snapshot').execute('read', { terminal_id: terminal.sessionId })
        expect(JSON.parse(result.content[0].text).cursorLine).toMatch(/[$#] ?$/)
      })
      await call('writeToSession', { sessionId: terminal.sessionId, as: 'user', data: 'echo human\r' })
      expect(await call('getTerminalControl', { terminalId: terminal.sessionId })).toMatchObject({ controlled: false, alive: true, pid: state.pid })
      const other = await call('createTask', { agentId: 'chat', workspace: dir })
      const bad = await wb.server.handle('setTerminalControl' as any, { terminalId: terminal.sessionId, ownerSessionId: other.sessionId, enabled: true, mode: 'shell' })
      expect(bad.ok).toBe(false)
      await call('resizeTerminal', { terminalId: terminal.sessionId, cols: 93, rows: 19 })
      expect(await call('getTerminalControl', { terminalId: terminal.sessionId })).toMatchObject({ cols: 93, rows: 19 })
      const native = (wb.nativeRuntime as any).sessions.get(main.sessionId).session
      const prompt = vi.spyOn(native, 'prompt').mockResolvedValue(undefined)
      await call('sendTerminalPrompt', { terminalId: terminal.sessionId, ownerSessionId: main.sessionId, text: '请查看当前目录' })
      expect(prompt.mock.calls[0]![0]).toContain('请查看当前目录')
      expect(prompt.mock.calls[0]![0]).toContain(`<dawn-terminal-request target="${terminal.sessionId}">`)
      expect(await call('getTerminalControl', { terminalId: terminal.sessionId })).toMatchObject({ controlled: true, pid: state.pid })
      const snapshot = await call('subscribeSession', { sessionId: main.sessionId })
      expect(snapshot.items.some((item: any) => item.type === 'turn' && item.who === 'user' && item.text === '请查看当前目录')).toBe(true)
    } finally { await wb.closeAsync(3000); rmSync(dir, { force: true, recursive: true }) }
  })
})
