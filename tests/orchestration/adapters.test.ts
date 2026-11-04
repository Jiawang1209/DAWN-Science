import {afterEach, expect, it} from 'vitest'
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {SubagentExecutor} from '../../src/subagent/executor.js'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {团队调度器} from '../../src/team/scheduler.js'
import {建团队, 加成员, 加任务, 写团队} from '../../src/team/state.js'

const roots: string[] = []
afterEach(() => {for (const dir of roots.splice(0)) rmSync(dir, {recursive: true, force: true})})
const until = async (condition: () => boolean) => {const end = Date.now() + 4000; while (!condition()) {if (Date.now() > end) throw new Error('Timed out'); await new Promise(resolve => setTimeout(resolve, 10))}}

it('a real child process and managed team member share parent capacity', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-adapters-')); roots.push(dir)
  const service = new OrchestrationService(new OrchestrationStore(dir, 'p'), 1)
  const marker = join(dir, 'started'), release = join(dir, 'release')
  const executor = new SubagentExecutor({
    childOf: () => ({command: process.execPath, args: ['-e', `const fs=require('fs');let spec='';process.stdin.on('data',d=>spec+=d);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(marker)},'yes');const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){clearInterval(t);console.log(JSON.stringify({type:'done',ok:true,output:'finished'}))}},10)})`]}),
    context: {provider: 'p', model: 'm', cwd: dir, agentDirOf: i => join(dir, 'subagents', String(i))},
    orchestration: {service, addressOf: i => ['call', String(i)]},
  })
  const running = executor.run({mode: 'single', agent: 'a', task: 'work'}, [{name: 'a', description: 'a', systemPrompt: 'a', filePath: '/a'}])
  await until(() => existsSync(marker))
  let botStarted = false
  const scheduler = new 团队调度器({sessionDir: dir, 定义: () => [], 跑: {childOf: () => ({command: 'unused', args: []}), context: {provider: 'p', model: 'm', cwd: dir}}, onChange: () => {}, orchestration: service,
    memberRunner: async () => {botStarted = true; return {ok: true, output: 'bot result'}}})
  const team = 建团队({name: 't', goal: 'g', captainSessionId: 'p', id: 't'})
  加成员(team, {name: 'bot', agent: 'bot', botId: 'b', botScopeKey: 'scope'})
  加任务(team, {subject: 'task', assignee: 'bot'})
  写团队(scheduler.dir(team.id), team)
  try {
    await scheduler.踢一下(team.id)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(botStarted).toBe(false)
    expect(service.store.list().map(child => child.kind).sort()).toEqual(['bot', 'subagent'])
    writeFileSync(release, 'yes'); expect((await running).results[0]?.ok).toBe(true)
    await until(() => botStarted && scheduler.读(team.id).tasks[0]?.status === 'completed')
    expect(service.store.list().every(child => child.state === 'completed')).toBe(true)
  } finally {writeFileSync(release, 'yes'); await running; await service.close()}
})

it('releases a subprocess execution slot only after its process has closed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-drain-process-')); roots.push(dir)
  const service = new OrchestrationService(new OrchestrationStore(dir, 'p'), 1)
  const marker = join(dir, 'pid')
  const executor = new SubagentExecutor({
    childOf: () => ({command: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000)`]}),
    context: {provider: 'p', model: 'm', cwd: dir, agentDirOf: () => dir},
    orchestration: {service, addressOf: () => ['c', '0']},
  })
  const running = executor.run({mode: 'single', agent: 'a', task: 'long'}, [{name: 'a', description: 'a', systemPrompt: 'a', filePath: '/a'}])
  await until(() => existsSync(marker))
  const {readFileSync} = await import('node:fs')
  const pid = Number(readFileSync(marker, 'utf8'))
  await service.close(); await running
  let alive = true
  try {process.kill(pid, 0)} catch {alive = false}
  expect(alive).toBe(false)
})
