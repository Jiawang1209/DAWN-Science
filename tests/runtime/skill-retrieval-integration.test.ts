import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeRuntime } from '../../src/runtime/native.js'
import type { CredentialStore } from '@earendil-works/pi-ai'
import type { AgentEvent } from '../../src/runtime/types.js'
const roots: string[] = [], runtimes: NativeRuntime[] = []
afterEach(async () => { for (const rt of runtimes.splice(0)) await rt.stop('retrieval'); for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }) })
async function fixture(count = 1) {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-retrieval-')); roots.push(root)
  const skills = join(root, 'skills'); mkdirSync(skills)
  const put = (name: string, mode = '') => { mkdirSync(join(skills, name), { recursive: true }); writeFileSync(join(skills, name, 'SKILL.md'), `---\nname: ${name}\ndescription: 土壤数据探索 EDA workflow\n${mode}---\n# ${name} instructions`) }
  for (let i = 0; i < count; i++) put(`demo-${i}`)
  const tags = new Map<string, string[]>()
  const credentials: CredentialStore = { read: async () => ({ type: 'api_key', key: 'offline' }), list: async () => [], modify: async () => undefined, delete: async () => {} }
  const rt = new NativeRuntime({ credentials, skills: { 全局目录: skills, 项目目录名: '.dawn/skills', tagOverride: path => tags.get(path) } }); runtimes.push(rt)
  const events: AgentEvent[] = []; rt.attach('retrieval', event => events.push(event))
  await rt.start({ sessionId: 'retrieval', workspace: root, sessionDir: join(root, 'session'), native: { provider: 'deepseek', model: 'deepseek-flash' } })
  return { rt, put, skills, tags, root, events, state: (rt as any).sessions.get('retrieval') }
}
it('installs controlled retrieval tools and records successful reads through live translation and history', async () => {
  const { rt, state, events } = await fixture()
  const search = state.session.getToolDefinition('search_skills'), use = state.session.getToolDefinition('use_skill')
  expect(search).toBeTruthy(); expect(use).toBeTruthy()
  const found = await search.execute('search', { query: 'EDA' })
  expect(JSON.parse(found.content[0].text).items[0].name).toBe('demo-0')
  expect(found.details?.skillRead).toBeUndefined()
  const read = await use.execute('read', { name: 'demo-0' })
  expect(read.details.skillRead.via).toBe('use_skill')
  ;(rt as any).translate('retrieval', { type: 'tool_execution_end', toolCallId: 'read', toolName: 'use_skill', result: read })
  expect(events.some(e => e.kind === 'tool_end' && e.skillRead?.name === 'demo-0')).toBe(true)
  ;(rt as any).translate('retrieval', { type: 'tool_execution_end', toolCallId: 'bad', toolName: 'arbitrary_mcp', result: read })
  expect(events.find(e => e.kind === 'tool_end' && e.toolCallId === 'bad')).not.toHaveProperty('skillRead')
})
it('keeps slash command entries while removing large catalog hints, then refreshes tag retrieval', async () => {
  const { rt, state, tags, skills } = await fixture(21)
  const loaded = state.session.resourceLoader.getSkills().skills
  expect(loaded).toHaveLength(21); expect(loaded.every((s: any) => s.disableModelInvocation)).toBe(true)
  expect(state.session.resourceLoader.getAppendSystemPrompt().join("\n")).toContain('search_skills')
  tags.set(join(skills, 'demo-0', 'SKILL.md'), ['独有标签'])
  await rt.refreshSkills('retrieval')
  const found = await state.session.getToolDefinition('search_skills').execute('tag', { query: '独有标签' })
  expect(JSON.parse(found.content[0].text).items[0].name).toBe('demo-0')
})
it('persists only actual explicit manual expansion as a host receipt', async () => {
  const { rt, state, skills, put, events } = await fixture()
  put('manual', 'disable-model-invocation: true\n'); await rt.refreshSkills('retrieval')
  const text = `<skill name="manual" location="${join(skills, 'manual', 'SKILL.md')}">\n# Manual instructions\n</skill>`
  state.dispatchedInputs.push('/skill:manual inspect')
  ;(rt as any).translate('retrieval', { type: 'message_end', message: { role: 'user', content: [{ type: 'text', text }] } })
  await new Promise<void>(resolve => queueMicrotask(resolve))
  expect(events.some(e => e.kind === 'tool_end' && e.skillRead?.via === 'manual')).toBe(true)
  expect(state.sessionManager.getEntries().some((e: any) => e.type === 'custom' && e.customType === 'dawn-skill-read')).toBe(true)
  const use = state.session.getToolDefinition('use_skill')
  expect((await use.execute('manual', { name: 'manual' })).isError).not.toBe(true)
  state.dispatchedInputs.push('ordinary question')
  ;(rt as any).translate('retrieval', { type: 'message_end', message: { role: 'user', content: 'ordinary question' } })
  expect((await use.execute('manual-after', { name: 'manual' })).isError).toBe(true)
})
it('records the SDK queued instruction snapshot after a later off change while denying all fresh reads', async () => {
  const { rt, state, put, skills, events } = await fixture()
  put('queued', 'disable-model-invocation: true\n'); await rt.refreshSkills('retrieval')
  const input = '/skill:queued inspect'
  state.skillResources.prepareManual(input)
  // followUp is the public SDK queue entry and expands instructions immediately.
  await state.session.followUp(input)
  const expanded = state.session.getFollowUpMessages()[0]
  expect(expanded).toContain('# queued instructions')
  put('queued', 'disable-model-invocation: true\nuser-invocable: false\n')
  expect(state.session.getFollowUpMessages()[0]).toBe(expanded)
  state.dispatchedInputs.push(input)
  ;(rt as any).translate('retrieval', { type: 'message_end', message: { role: 'user', content: expanded } })
  await new Promise<void>(resolve => queueMicrotask(resolve))
  expect(events.some(e => e.kind === 'tool_end' && e.skillRead?.name === 'queued')).toBe(true)
  expect((await state.session.getToolDefinition('use_skill').execute('fresh', { name: 'queued' })).isError).toBe(true)
  for (const path of [join(skills, 'queued', 'SKILL.md'), `@${join(skills, 'queued', 'SKILL.md')}`, new URL(`file://${join(skills, 'queued', 'SKILL.md')}`).href]) {
    expect((await state.session.getToolDefinition('read').execute('fresh-read', { path })).isError, path).toBe(true)
  }
  expect(() => state.skillResources.prepareManual(input)).toThrow(/off|停用/)
  state.session.clearQueue()
})
