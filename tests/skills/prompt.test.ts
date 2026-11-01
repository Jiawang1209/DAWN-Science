import { expect, it } from 'vitest'
import { skillPromptEntries } from '../../src/skills/prompt.js'

it('keeps small catalogs compatible and preserves manual flags', () => {
  const entries = [{ name: 'auto', disableModelInvocation: false }, { name: 'manual', disableModelInvocation: true }]
  expect(skillPromptEntries(entries, 1)).toEqual(entries)
})
it('bounds large-catalog metadata without mutating SDK invocation entries', () => {
  const entries = Array.from({ length: 200 }, (_, i) => ({ name: `skill-${i}`, disableModelInvocation: false }))
  const projected = skillPromptEntries(entries, entries.length)
  expect(projected.every(s => s.disableModelInvocation)).toBe(true)
  expect(entries.some(s => s.disableModelInvocation)).toBe(false)
  expect(projected.map(s => s.name)).toEqual(entries.map(s => s.name))
})
