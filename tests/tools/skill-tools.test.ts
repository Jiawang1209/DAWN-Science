import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSkillCatalog } from '../../src/skills/catalog.js'
import { createSkillTools } from '../../src/tools/skills.js'
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
it('searches without read receipts and records only actual successful instruction reads', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-skill-tools-')); dirs.push(root)
  mkdirSync(join(root, 'demo'))
  writeFileSync(join(root, 'demo', 'SKILL.md'), '---\nname: demo\ndescription: 数据初探 workflow\n---\n# Real instructions')
  const catalog = loadSkillCatalog({ roots: [{ path: root, scope: 'global' }] })
  const tools = createSkillTools({ catalog: () => catalog })
  const search = tools.find(t => t.name === 'search_skills')!, use = tools.find(t => t.name === 'use_skill')!
  const found = await search.execute('search', { query: '数据初探' } as never)
  expect(found.details?.skillRead).toBeUndefined()
  const read = await use.execute('read', { name: 'demo' } as never)
  expect(read.details?.skillRead).toMatchObject({ name: 'demo', resourcePath: 'SKILL.md', via: 'use_skill' })
  expect(read.content[0]?.text).toContain('Real instructions')
  const denied = await use.execute('bad', { name: 'absent' } as never)
  expect(denied.isError).toBe(true); expect(denied.details?.skillRead).toBeUndefined()
})
it('bounds diagnostics and explicitly reports omitted information', async () => {
  const catalog = loadSkillCatalog({ roots: [] })
  catalog.problems.push(...Array.from({ length: 25 }, () => ({ path: 'p'.repeat(3000), reason: 'r'.repeat(800) })))
  const result = await createSkillTools({ catalog: () => catalog })[0]!.execute('diagnostics', { query: '' })
  const response = JSON.parse(result.content[0]!.text)
  expect(response.problems).toHaveLength(20)
  expect(response.problems[0].path).toHaveLength(2048)
  expect(response.problems[0].reason).toHaveLength(512)
  expect(response).toMatchObject({ problemsTotal: 25, problemsTruncated: true })
  expect(result.details?.skillRead).toBeUndefined()
})
