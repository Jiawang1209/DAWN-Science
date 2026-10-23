import { afterEach, expect, it } from 'vitest'
import { $terminalAgentSessions, rememberTerminalAgentSession, $终端归属, 记终端归属 } from '../../../src/ui/state/dock.js'
afterEach(() => { $terminalAgentSessions.set(new Map()); $终端归属.set(new Map()); sessionStorage.clear() })
it('associates the latest CLI view with its terminal without moving the original owner', () => {
  记终端归属('a', 'original')
  rememberTerminalAgentSession('a', 'cli-1'); rememberTerminalAgentSession('b', 'cli-b')
  expect($终端归属.get().get('a')).toBe('original')
  rememberTerminalAgentSession('a', 'cli-2')
  expect($terminalAgentSessions.get().get('a')).toBe('cli-2')
  expect($terminalAgentSessions.get().get('b')).toBe('cli-b')
  expect(JSON.parse(sessionStorage.getItem('dawn.window.terminal-agent-sessions')!)).toEqual({ a: 'cli-2', b: 'cli-b' })
})
