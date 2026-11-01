import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeRuntime } from '../../src/runtime/native.js'
import type { CredentialStore } from '@earendil-works/pi-ai'

const roots: string[] = [], runtimes: NativeRuntime[] = []
afterEach(async () => { for (const rt of runtimes.splice(0)) await rt.stop('refresh'); for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }) })
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dawn-skill-refresh-')); roots.push(root)
  const skills = join(root, 'skills'); mkdirSync(skills)
  const put = (name: string, extra = '') => { mkdirSync(join(skills, name), { recursive: true }); writeFileSync(join(skills, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} instructions\n${extra}---\n# ${name}`) }
  put('first')
  const credentials: CredentialStore = { read: async () => ({ type: 'api_key', key: 'offline' }), list: async () => [], modify: async () => undefined, delete: async () => {} }
  const rt = new NativeRuntime({ credentials, skills: { 全局目录: skills, 项目目录名: '.dawn/skills' } }); runtimes.push(rt)
  await rt.start({ sessionId: 'refresh', workspace: root, sessionDir: join(root, 'session'), native: { provider: 'deepseek', model: 'deepseek-flash' } })
  return { rt, put, skills, state: (rt as any).sessions.get('refresh') }
}
it('refreshes the live index and prompt while preserving messages, tools, model and session', async () => {
  const { rt, put, skills, state } = await fixture()
  const session = state.session
  await session.sendCustomMessage({ customType: 'probe', content: 'Keep this history', display: false })
  const messages = [...session.agent.state.messages], tools = session.getActiveToolNames(), model = session.model
  put('second'); put('manual-only', 'disable-model-invocation: true\n'); put('disabled', 'disable-model-invocation: true\nuser-invocable: false\n')
  rmSync(join(skills, 'first'), { recursive: true })
  expect(typeof (rt as any).refreshSkills).toBe('function')
  const result = await (rt as any).refreshSkills('refresh')
  expect(result.count).toBe(2)
  expect(session.resourceLoader.getSkills().skills.map((s: any) => s.name).sort()).toEqual(['manual-only', 'second'])
  // Public SDK build options drive the next request's system prompt.
  const prompt = (session as any)._baseSystemPromptOptions.skills
  expect(prompt.map((s: any) => s.name)).toEqual(expect.arrayContaining(['second']))
  expect(prompt.some((s: any) => s.name === 'first')).toBe(false)
  expect(session.agent.state.messages).toEqual(messages)
  expect(session.getActiveToolNames()).toEqual(tools); expect(session.model).toBe(model)
  expect((rt as any).sessions.get('refresh').session).toBe(session)
  // A second refresh must not accumulate duplicates or lose existing scope precedence.
  expect((await (rt as any).refreshSkills('refresh')).count).toBe(2)
})
it('rejects busy sessions without changing their resource snapshot', async () => {
  const { rt, put, state } = await fixture(); put('later'); state.inFlight = 1
  try { await expect((rt as any).refreshSkills('refresh')).rejects.toThrow(/还没说完|正在/) }
  finally { state.inFlight = 0 }
  expect(state.session.resourceLoader.getSkills().skills.some((s: any) => s.name === 'later')).toBe(false)
})
