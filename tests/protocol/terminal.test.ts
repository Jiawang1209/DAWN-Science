import { describe, expect, it } from 'vitest'
import { OPERATIONS } from '../../src/protocol/operations.js'

describe('terminal control protocol', () => {
  it('keeps state read-only and validates explicit grant, mode and bounded size', () => {
    expect(OPERATIONS.getTerminalControl.mutating).toBe(false)
    expect(OPERATIONS.setTerminalControl.mutating).toBe(true)
    expect(() => OPERATIONS.setTerminalControl.request.parse({ terminalId: 't', enabled: true, mode: 'guess' })).toThrow()
    expect(() => OPERATIONS.resizeTerminal.request.parse({ terminalId: 't', cols: 0, rows: 20 })).toThrow()
    expect(() => OPERATIONS.resizeTerminal.request.parse({ terminalId: 't', cols: 80, rows: 201 })).toThrow()
    expect(() => OPERATIONS.interruptTerminal.request.parse({ terminalId: 't' })).toThrow()
  })

  it('shares the exact UI operation list with the deterministic model scenario', async () => {
    // @ts-expect-error shared JavaScript model fixture
    const { TERMINAL_CONTROL_OPERATIONS } = await import('../../scripts/mock-terminal-assistance.mjs')
    expect(TERMINAL_CONTROL_OPERATIONS).toEqual(['getTerminalAgentMode', 'setTerminalAgentMode', 'getTerminalControl', 'setTerminalControl', 'resizeTerminal', 'interruptTerminal', 'sendTerminalPrompt'])
    for (const operation of TERMINAL_CONTROL_OPERATIONS as (keyof typeof OPERATIONS)[]) expect(OPERATIONS[operation]).toBeDefined()
  })
})
