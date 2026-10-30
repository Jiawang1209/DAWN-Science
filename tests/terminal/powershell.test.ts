import { expect, it } from 'vitest'
import { readyPrompt, terminalCommand } from '../../src/terminal/commands.js'
it('PowerShell uses its own status and OSC commands in the existing interpreter', () => {
  expect(readyPrompt('shell','PS C:\\work> ',false)).toBe(true)
  const command=terminalCommand('shell','Get-Location','token','powershell')
  expect(command).toContain('Get-Location')
  expect(command).toContain('[Console]::Write')
  expect(command).not.toContain('printf')
  expect(command).toContain('dawn;token;')
})
