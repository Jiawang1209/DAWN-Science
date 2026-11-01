import { expect, it } from 'vitest'
import { OPERATIONS, 只读模式该拦 } from '../../src/protocol/operations.js'

it('keeps installed package reads read-only and protects tag/mode/session mutations', () => {
  for (const name of ['listInstalledSkillFiles', 'readInstalledSkillFile'] as const) expect(只读模式该拦(name)).toBe(false)
  for (const name of ['setSkillTags', 'setSkillsInvocation', 'refreshSessionSkills'] as const) expect(只读模式该拦(name)).toBe(true)
})
it('requires a precise tag edit or reset and rejects unknown fields and oversized bulk changes', () => {
  const tags = OPERATIONS.setSkillTags.request
  expect(tags.safeParse({ filePath: '/skills/demo/SKILL.md', tags: [] }).success).toBe(true)
  expect(tags.safeParse({ filePath: '/skills/demo/SKILL.md', reset: true }).success).toBe(true)
  expect(tags.safeParse({ filePath: '/skills/demo/SKILL.md' }).success).toBe(false)
  expect(tags.safeParse({ filePath: '/skills/demo/SKILL.md', tags: [], reset: true }).success).toBe(false)
  expect(OPERATIONS.readInstalledSkillFile.request.safeParse({ filePath: 'x', path: 'SKILL.md', root: '/' }).success).toBe(false)
  expect(OPERATIONS.setSkillsInvocation.request.safeParse({ filePaths: Array(1001).fill('x'), mode: 'off' }).success).toBe(false)
})
