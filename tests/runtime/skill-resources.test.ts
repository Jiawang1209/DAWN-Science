import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeSkillResources } from '../../src/runtime/skill-resources.js'
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function fixture(mode = '') {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-skill-resource-')); dirs.push(root)
  mkdirSync(join(root, 'demo')); const path = join(root, 'demo', 'SKILL.md')
  writeFileSync(path, `---\nname: demo\ndescription: 数据初探\n${mode}---\n# Instructions`)
  return { path, resources: new NativeSkillResources({ roots: [{ path: root, scope: 'global' }] }) }
}
it('records successful direct reads and blocks automatic manual/off reads before dispatch', async () => {
  const { path, resources } = fixture()
  const read = resources.wrapRead(resources.createReadTool(process.cwd()) as unknown as Record<string, unknown>)
  const result = await (read.execute as any)('call', { path })
  expect(result.details.skillRead).toMatchObject({ name: 'demo', via: 'read', resourcePath: 'SKILL.md' })
  writeFileSync(path, '---\nname: demo\ndescription: Demo\ndisable-model-invocation: true\n---\nBody')
  await expect((read.execute as any)('call', { path })).rejects.toThrow(/manual|手动/)
})
it('records only matching actual SDK expansion from an explicit user command', () => {
  const { path, resources } = fixture('disable-model-invocation: true\n')
  const expanded = `<skill name="demo" location="${path}">\nReferences are relative to ${join(path, '..')}.\n\n# Instructions\n</skill>`
  expect(resources.observeManual('ordinary user prose', expanded)).toBeUndefined()
  expect(resources.observeManual('/skill:demo inspect', 'unexpanded input')).toBeUndefined()
  resources.prepareManual('/skill:demo inspect')
  expect(resources.observeManual('/skill:demo inspect', expanded)).toMatchObject({ name: 'demo', via: 'manual', partial: false })
  const read = resources.wrapRead({ name: 'read', execute: async () => ({ content: [{ type: 'text', text: 'Reference' }] }) })
  expect(read).toBeTruthy()
})
it('does not stamp failed reads or permit explicit invocation of off Skills', async () => {
  const { path, resources } = fixture()
  const read = resources.wrapRead({ name: 'read', execute: async () => ({ content: [{ type: 'text', text: 'Denied' }], isError: true }) })
  expect((await (read.execute as any)('call', { path })).details?.skillRead).toBeUndefined()
  writeFileSync(path, '---\nname: demo\ndescription: Demo\ndisable-model-invocation: true\nuser-invocable: false\n---\nBody')
  expect(() => resources.prepareManual('/skill:demo')).toThrow(/off|停用/)
})
it('keeps the conversation usable and search diagnostic-only when a root is denied', () => {
  const resources = new NativeSkillResources({ roots: [{ path: '/denied-skills', scope: 'global' }], authorize: () => 'Denied root' })
  expect(resources.catalog.skills).toEqual([])
  expect(resources.catalog.problems[0]?.reason).toContain('Denied root')
})
it('rejects unknown or malformed packages inside Skill roots through the real reader', async () => {
  const { path, resources } = fixture()
  const invalid = join(path, '..', '..', 'invalid', 'SKILL.md')
  mkdirSync(join(invalid, '..'), { recursive: true })
  writeFileSync(invalid, '---\nname: invalid\n---\nInstructions missing a description')
  const read = resources.wrapRead(resources.createReadTool(process.cwd()) as unknown as Record<string, unknown>)
  await expect((read.execute as any)('invalid', { path: invalid })).rejects.toThrow(/不可见|无效/)
})
it('guards the effective SDK path for aliases and context cwd, and observes successful alias reads', async () => {
  const { path, resources } = fixture('disable-model-invocation: true\n')
  const read = resources.wrapRead(resources.createReadTool(process.cwd()) as unknown as Record<string, unknown>)
  for (const input of [`@${path}`, `file://${path}`]) await expect((read.execute as any)('alias', { path: input })).rejects.toThrow(/manual|手动/)
  await expect((read.execute as any)('context', { path: 'SKILL.md' }, undefined, undefined, { cwd: join(path, '..') })).rejects.toThrow(/manual|手动/)
  writeFileSync(path, '---\nname: demo\ndescription: Demo\n---\n# Instructions')
  const result = await (read.execute as any)('alias-success', { path: `@${path}` })
  expect(result.details.skillRead).toMatchObject({ name: 'demo', via: 'read', resourcePath: 'SKILL.md' })
})
