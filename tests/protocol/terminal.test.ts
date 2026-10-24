import { describe, expect, it } from 'vitest'
import { OPERATIONS } from '../../src/protocol/operations.js'

describe('terminal control protocol', () => {
  it('validates scoped image staging and opaque image lookup', () => {
    expect(OPERATIONS.getTerminalAgentAttachments.mutating).toBe(false)
    expect(OPERATIONS.getTerminalAgentImage.mutating).toBe(false)
    expect(OPERATIONS.updateTerminalAgentAttachments.mutating).toBe(true)
    expect(OPERATIONS.updateTerminalAgentAttachments.request.safeParse({ terminalId: 't', sessionId: 's', action: 'add', images: [] }).success).toBe(false)
    expect(OPERATIONS.getTerminalAgentImage.request.safeParse({ terminalId: 't', imageId: '../a.png' }).success).toBe(false)
  })
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
    expect(TERMINAL_CONTROL_OPERATIONS).toEqual(['getTerminalAgentAttachments', 'updateTerminalAgentAttachments', 'getTerminalAgentImage', 'getTerminalAgentMode', 'listTerminalAgentHistory', 'setTerminalAgentMode', 'getTerminalControl', 'setTerminalControl', 'resizeTerminal', 'interruptTerminal', 'sendTerminalPrompt'])
    for (const operation of TERMINAL_CONTROL_OPERATIONS as (keyof typeof OPERATIONS)[]) expect(OPERATIONS[operation]).toBeDefined()
  })
})

it('keeps the CLI target and current selection in the read-only terminal state', () => {
  const schema = OPERATIONS.getTerminalAgentMode.response
  expect(schema.parse({ mode: 'dawn', sessionId: 'cli-id', projectId: 'project-id', selection: { provider: 'existing', model: 'selected' } }).sessionId).toBe('cli-id')
  expect(schema.safeParse({ mode: 'normal' }).success).toBe(true)
  expect(schema.safeParse({ mode: 'dawn', sessionId: '' }).success).toBe(false)
  expect(schema.safeParse({ mode: 'dawn', sessionId: 123 }).success).toBe(false)
})
