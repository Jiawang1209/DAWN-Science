import {afterEach, expect, it} from 'vitest'
import {mkdtempSync, rmSync, mkdirSync, renameSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NativeRuntime} from '../../src/runtime/native.js'
import type {CredentialStore} from '@earendil-works/pi-ai'
import type {OrchestrationService} from '../../src/orchestration/service.js'
import {建团队, 写团队} from '../../src/team/state.js'

const roots: string[] = []
afterEach(() => {for (const dir of roots.splice(0)) rmSync(dir, {recursive: true, force: true})})
const credentials: CredentialStore = {read: async () => ({type: 'api_key', key: 'sk-offline'}), list: async () => [], modify: async () => undefined, delete: async () => {}}

it('the real Native assembly shares the coordinator and drains it before parent disposal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-coord-')); roots.push(root)
  const runtime = new NativeRuntime({credentials, subagentChildEntry: '/unused.js'})
  await runtime.start({sessionId: 'p', workspace: root, sessionDir: join(root, 'session'), native: {provider: 'deepseek', model: 'deepseek-flash'}})
  const internals = runtime as unknown as {orchestrations: Map<string, OrchestrationService>}
  const coordinator = internals.orchestrations.get('p')!
  expect(coordinator).toBeDefined()
  const child = coordinator.store.register('subagent', ['c', '0'], 'a')
  let cleaned = false
  const run = coordinator.run(child.id, async signal => {
    await new Promise<void>(resolve => signal.addEventListener('abort', () => {cleaned = true; resolve()}, {once: true}))
    return {ok: true, output: 'late'}
  })
  await runtime.stop('p')
  expect(cleaned).toBe(true); expect((await run).ok).toBe(false)
  expect(internals.orchestrations.has('p')).toBe(false)
  expect(coordinator.store.get(child.id)?.state).toBe('cancelled')
})

it('registers usable control tools in the Native assembly and protects plan-mode execution', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-control-')); roots.push(root)
  const runtime = new NativeRuntime({credentials, subagentChildEntry: '/unused.js'})
  await runtime.start({sessionId: 'p', workspace: root, sessionDir: join(root, 'session'), native: {provider: 'deepseek', model: 'deepseek-flash'}})
  type Tool = {execute: (callId: string, params: unknown) => Promise<{isError?: boolean; content: {text: string}[]}>}
  const internals = runtime as unknown as {sessions: Map<string, {session: {getToolDefinition(name: string): Tool | undefined; getAllTools(): {name: string}[]}}>}
  const session = internals.sessions.get('p')!.session
  try {
    expect(session.getAllTools().map(tool => tool.name)).toEqual(expect.arrayContaining(['start_subagent', 'send_subagent_message', 'list_subagents', 'wait_subagents', 'interrupt_subagent']))
    await runtime.setConfigOption('p', 'dawn.plan', '1')
    const rejected = await session.getToolDefinition('start_subagent')!.execute('start', {agent: 'x', task: 'y'})
    expect(rejected.isError).toBe(true); expect(rejected.content[0]?.text).toContain('先出方案')
    const listing = await session.getToolDefinition('list_subagents')!.execute('list', {})
    expect(listing.isError).not.toBe(true)
  } finally {await runtime.stop('p')}
})

it('acknowledges a result only after the real Pi session has persisted its receipt', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-receipt-')); roots.push(root)
  const runtime = new NativeRuntime({credentials, subagentChildEntry: '/unused.js'})
  await runtime.start({sessionId: 'p', workspace: root, sessionDir: join(root, 'session'), native: {provider: 'deepseek', model: 'deepseek-flash'}})
  const internals = runtime as unknown as {
    sessions: Map<string, {sessionManager: import('@earendil-works/pi-coding-agent').SessionManager}>
    orchestrations: Map<string, OrchestrationService>
    orchestrationControls: Map<string, {delivery: {flush(): Promise<number>}}>
  }
  const store = internals.orchestrations.get('p')!.store
  const child = store.register('subagent', ['c', '0'], 'a')
  const message = store.enqueue(child.id, 'r', 'work', true)
  store.updateMessage(message.id, {status: 'completed', outcome: {ok: true, output: 'verified execution'}})
  try {
    expect(await internals.orchestrationControls.get('p')!.delivery.flush()).toBe(0)
    expect(store.message(message.id)?.deliveredAt).toBeUndefined()
    // Pi defers file creation until its first assistant message.
    internals.sessions.get('p')!.sessionManager.appendMessage({role: 'assistant', content: [{type: 'text', text: 'fixture reply'}], stopReason: 'stop', timestamp: Date.now()} as never)
    expect(await internals.orchestrationControls.get('p')!.delivery.flush()).toBe(0)
    expect(store.message(message.id)?.deliveredAt).toBeDefined()
  } finally {await runtime.stop('p')}
})

it('a pause persistence failure does not leave rewind permanently busy', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-rewind-')); roots.push(root)
  const runtime = new NativeRuntime({credentials, subagentChildEntry: '/unused.js'})
  await runtime.start({sessionId: 'p', workspace: root, sessionDir: join(root, 'session'), native: {provider: 'deepseek', model: 'deepseek-flash'}})
  const internal = runtime as unknown as {sessions: Map<string, {回退中: boolean}>; orchestrationControls: Map<string, {mailbox: {pauseAll(): void}}>}
  internal.orchestrationControls.get('p')!.mailbox.pauseAll = () => {throw new Error('disk full')}
  try {
    await expect(runtime.rewind('p', {倒数第几句: 0, 文: 'missing'}, 'conversation', [])).rejects.toThrow()
    expect(internal.sessions.get('p')!.回退中).toBe(false)
  } finally {await runtime.stop('p')}
})


it('a failed Pi append cannot become a delivered receipt merely because it remains in memory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-durable-receipt-')); roots.push(root)
  const runtime = new NativeRuntime({credentials, subagentChildEntry: '/unused.js'})
  await runtime.start({sessionId: 'p', workspace: root, sessionDir: join(root, 'session'), native: {provider: 'deepseek', model: 'deepseek-flash'}})
  const internal = runtime as unknown as {sessions: Map<string, {sessionManager: import('@earendil-works/pi-coding-agent').SessionManager}>;
    orchestrations: Map<string, OrchestrationService>; orchestrationControls: Map<string, {delivery: {flush(): Promise<number>}}>}
  const manager = internal.sessions.get('p')!.sessionManager
  manager.appendMessage({role: 'assistant', content: [{type: 'text', text: 'fixture reply'}], stopReason: 'stop', timestamp: Date.now()} as never)
  const file = manager.getSessionFile()!, backup = file + '.backup'
  const store = internal.orchestrations.get('p')!.store
  const child = store.register('subagent', ['c', '0'], 'a'), message = store.enqueue(child.id, 'r', 'work', true)
  store.updateMessage(message.id, {status: 'completed', outcome: {ok: true, output: 'result'}})
  renameSync(file, backup); mkdirSync(file)
  const delivery = internal.orchestrationControls.get('p')!.delivery
  try {
    await expect(delivery.flush()).rejects.toThrow()
    await expect(delivery.flush()).rejects.toThrow()
    expect(store.message(message.id)?.deliveredAt).toBeUndefined()
  } finally {rmSync(file, {recursive: true, force: true}); renameSync(backup, file); await runtime.stop('p')}
})

it('joins concurrent stop calls and rejects reopening until old backend cleanup has drained', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-stop-reopen-')); roots.push(root)
  const runtime = new NativeRuntime({credentials, subagentChildEntry: '/unused.js'})
  const spec = {sessionId: 'p', workspace: root, sessionDir: join(root, 'session'), native: {provider: 'deepseek', model: 'deepseek-flash'}}
  await runtime.start(spec)
  const internals = runtime as unknown as {orchestrations: Map<string, OrchestrationService>}
  const coordinator = internals.orchestrations.get('p')!, child = coordinator.register('subagent', ['c', '0'], 'a')
  let release!: () => void
  const gate = new Promise<void>(resolve => {release = resolve})
  const run = coordinator.run(child.id, async signal => {
    await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), {once: true}))
    await gate; return {ok: true, output: 'late'}
  })
  const first = runtime.stop('p')
  let secondStopped = false
  const second = runtime.stop('p').then(() => {secondStopped = true})
  await new Promise<void>(resolve => setImmediate(resolve))
  const stoppedBeforeCleanup = secondStopped
  const reopened = await runtime.start({...spec, resume: true}).then(() => true, () => false)
  release(); await Promise.all([first, second, run]); await runtime.stop('p')
  expect(stoppedBeforeCleanup).toBe(false)
  expect(reopened).toBe(false)
  await runtime.start({...spec, resume: true})
  expect(internals.orchestrations.get('p')).toBeDefined()
  await runtime.stop('p')
})

it('a corrupt team snapshot cannot prevent stop from cancelling and disposing the parent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-stop-disk-')); roots.push(root)
  const runtime = new NativeRuntime({credentials, subagentChildEntry: '/unused.js'})
  const sessionDir = join(root, 'session')
  await runtime.start({sessionId: 'p', workspace: root, sessionDir, native: {provider: 'deepseek', model: 'deepseek-flash'}})
  const internal = runtime as unknown as {
    orchestrations: Map<string, OrchestrationService>
    botTeams: Map<string, {current: {id: string | undefined}}>
    sessions: Map<string, unknown>
  }
  const team = 建团队({id: 't', name: 't', goal: 'g', captainSessionId: 'p'})
  写团队(join(sessionDir, 'teams', 't'), team)
  internal.botTeams.get('p')!.current.id = team.id
  const coordinator = internal.orchestrations.get('p')!, child = coordinator.register('subagent', ['c', '0'], 'a')
  let cancelled = false
  const run = coordinator.run(child.id, async signal => {
    await new Promise<void>(resolve => signal.addEventListener('abort', () => {cancelled = true; resolve()}, {once: true}))
    return {ok: true, output: 'late'}
  })
  writeFileSync(join(sessionDir, 'teams', 't', 'team.json'), '{corrupt')
  await expect(runtime.stop('p')).rejects.toThrow()
  const cancelledBeforeRepair = cancelled, disposedBeforeRepair = !internal.sessions.has('p')
  writeFileSync(join(sessionDir, 'teams', 't', 'team.json'), JSON.stringify(team))
  await runtime.stop('p'); await run
  expect(cancelledBeforeRepair).toBe(true)
  expect(disposedBeforeRepair).toBe(true)
})

it('a scoped persistent Bot turn uses the same gate and cannot retain a wider scope after cleanup',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-task-scope-'));roots.push(root)
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'})
 await runtime.start({sessionId:'p',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}})
 const {resolveTaskSettings}=await import('../../src/subagent/task-tools.js')
 const {TaskContractSchema}=await import('../../src/orchestration/task-contract.js')
 const tools=(runtime as unknown as{sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,params:unknown):Promise<{isError?:boolean}>}}}>}).sessions.get('p')!.session
 try{
  const result=await runtime.runWithTaskScope('p',resolveTaskSettings(TaskContractSchema.parse({}),'allow-all'),async()=>{
   expect((await tools.getToolDefinition('write').execute('denied',{path:'out.txt',content:'wrong'})).isError).toBe(true)
   return{ok:true,output:'finished'}
  })
  expect(result.evidence).toEqual([])
  expect((await tools.getToolDefinition('write').execute('allowed',{path:'out.txt',content:'right'})).isError).not.toBe(true)
 }finally{await runtime.stop('p')}
})

it('a persistent Bot submits through the actual scoped control tool and freezes later effects',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-submit-'));roots.push(root)
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'})
 await runtime.start({sessionId:'s',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'},bot:{instructions:'scoped worker',member:true}})
 const {resolveTaskSettings}=await import('../../src/subagent/task-tools.js'),{TaskContractSchema}=await import('../../src/orchestration/task-contract.js')
 const session=(runtime as unknown as {sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,args:unknown):Promise<{isError?:boolean}>}|undefined}}>} ).sessions.get('s')!.session
 try{
  const result=await runtime.runWithTaskScope('s',resolveTaskSettings(TaskContractSchema.parse({submission:'tool'}),'allow-all'),async()=>{
   const submit=session.getToolDefinition('submit_task_result');expect(submit).toBeDefined()
   expect((await submit!.execute('bad',{summary:'incomplete'})).isError).toBe(true)
   expect((await submit!.execute('good',{summary:'submitted',blockers:[],deliverables:[],execution:{state:'not_run',note:'read only'},verification:{state:'unreviewed',note:'not scientific review'}})).isError).not.toBe(true)
   expect((await session.getToolDefinition('write')!.execute('late',{path:'late.txt',content:'wrong'})).isError).toBe(true)
   return{ok:true,output:'not authoritative'}
  })
  expect(JSON.parse(result.output).summary).toBe('submitted')
  expect(result).toMatchObject({observation:{submissionAttempts:2,invalidSubmissions:1}})
 }finally{await runtime.stop('s')}
})
it('a real pipeline pointer write failure stays reviewable and cannot launch an orphan',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-pipeline-pointer-'));roots.push(root);writeFileSync(join(root,'in.csv'),'x\n1\n')
 mkdirSync(join(root,'.dawn','agents'),{recursive:true})
 for(const name of ['check','analyze','review'])writeFileSync(join(root,'.dawn','agents',name+'.md'),`---\nname: ${name}\ndescription: ${name}\n---\n${name}\n`)
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'}),sessionDir=join(root,'session')
 await runtime.start({sessionId:'p',workspace:root,sessionDir,native:{provider:'deepseek',model:'deepseek-flash'}})
 const internal=runtime as unknown as {routeBooks:Map<string,{book:import('../../src/runtime/analysis-route-book.js').AnalysisRouteBook}>;botTeams:Map<string,{current:{id?:string};scheduler:import('../../src/team/scheduler.js').团队调度器}>;sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,args:unknown):Promise<{isError?:boolean}>}}}>}
 const control=internal.botTeams.get('p')!,{vi}=await import('vitest'),kick=vi.spyOn(control.scheduler,'踢一下').mockResolvedValue()
 const route=internal.routeBooks.get('p')!.book.replace(0,{title:'study',goal:'approved',dataContext:[],steps:[{id:'s',title:'s',purpose:'confirmed',inputs:[],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
 const start=internal.sessions.get('p')!.session.getToolDefinition('start_science_pipeline'),args={routeId:route.routeId,revision:1,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'confirmed',requireExecution:false}
 try{
  mkdirSync(join(sessionDir,'teams','current'),{recursive:true})
  expect((await start.execute('req',args)).isError).toBe(true);expect(control.current.id).toBeUndefined();expect(kick).not.toHaveBeenCalled()
  rmSync(join(sessionDir,'teams','current'),{recursive:true})
  expect((await start.execute('req',args)).isError).not.toBe(true)
  expect(control.scheduler.读(control.current.id!).pipeline?.status).toBe('interrupted');expect(kick).not.toHaveBeenCalled()
 }finally{await runtime.stop('p')}
})
it('all external message and Bot dispatch adapters preserve a fixed pipeline team',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-pipeline-external-entry-'));roots.push(root);writeFileSync(join(root,'in.csv'),'x\n1\n')
 mkdirSync(join(root,'.dawn','agents'),{recursive:true})
 for(const name of ['check','analyze','review'])writeFileSync(join(root,'.dawn','agents',name+'.md'),`---\nname: ${name}\ndescription: test\n---\n${name}\n`)
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'}),{vi}=await import('vitest')
 const bot={id:'extra',name:'extra',role:'writer',instructions:'test',enabled:true}
 runtime.configureBots({list:()=>[bot],scopeKey:()=> 'scope',run:async()=>({ok:true,output:'unused'}),result:async()=>{},recover:async()=>{}})
 await runtime.start({sessionId:'p',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}})
 const internal=runtime as unknown as {routeBooks:Map<string,{book:import('../../src/runtime/analysis-route-book.js').AnalysisRouteBook}>;botTeams:Map<string,{current:{id:string};scheduler:import('../../src/team/scheduler.js').团队调度器}>;orchestrations:Map<string,OrchestrationService>;sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,args:unknown):Promise<{isError?:boolean}>}}}>}
 const control=internal.botTeams.get('p')!;vi.spyOn(control.scheduler,'踢一下').mockResolvedValue()
 const route=internal.routeBooks.get('p')!.book.replace(0,{title:'study',goal:'approved',dataContext:[],steps:[{id:'s',title:'s',purpose:'confirmed',inputs:[],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
 const session=internal.sessions.get('p')!.session
 try{
  expect((await session.getToolDefinition('start_science_pipeline').execute('start',{routeId:route.routeId,revision:1,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],executors:{check:{botId:'extra'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'confirmed',requireExecution:false})).isError).not.toBe(true)
  const child=internal.orchestrations.get('p')!.store.list().find(c=>c.label==='analyze')!
  for(const state of ['running','interrupted','completed','cancelled'] as const){
   control.scheduler.改(control.current.id,t=>{t.pipeline!.status=state})
   const before=control.scheduler.读(control.current.id)
   expect((await session.getToolDefinition('send_subagent_message').execute('inject-'+state,{childId:child.id,message:'alter the output outside the current stage'})).isError).toBe(true)
   await expect(runtime.dispatchBotTask('p','extra','extra task')).rejects.toThrow(/科研流程/)
   await expect(runtime.messageBotTask('p',before.id,before.tasks[0]!.id,'extra message')).rejects.toThrow(/科研流程/)
   expect((await session.getToolDefinition('team_add_task').execute('extra-'+state,{subject:'extra task'})).isError).toBe(true)
   await expect(runtime.messageBotTeam('p',before.id,{requestId:'public-'+state,message:'extra turn'})).rejects.toThrow(/科研流程/)
   expect(control.scheduler.读(control.current.id)).toEqual(before)
  }
 }finally{await runtime.stop('p')}
})
it('a scoped Native tool cancelled while awaiting its checkpoint never enters the underlying adapter',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-cancel-checkpoint-'));roots.push(root)
 const runtime=new NativeRuntime({credentials}),spec={sessionId:'p',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}}
 await runtime.start(spec)
 const {vi}=await import('vitest'),{resolveTaskSettings}=await import('../../src/subagent/task-tools.js'),{TaskContractSchema}=await import('../../src/orchestration/task-contract.js')
 const internal=runtime as unknown as {记轮基线(id:string):Promise<unknown>;套方案期门(def:Record<string,unknown>,context:typeof spec):{execute(id:string,args:unknown,signal:AbortSignal):Promise<{isError?:boolean}>}}
 let release!:()=>void;const checkpoint=new Promise<void>(r=>{release=r}),controller=new AbortController();let executed=false
 vi.spyOn(internal,'记轮基线').mockReturnValue(checkpoint)
 const tool=internal.套方案期门({name:'external_effect',execute:async()=>{executed=true;return{content:[{type:'text',text:'effect'}]}}},spec)
 try{
  const result=await runtime.runWithTaskScope('p',resolveTaskSettings(TaskContractSchema.parse({submission:'tool',access:'workspace-exec'}),'allow-all'),async()=>{
   const pending=tool.execute('call',{},controller.signal);controller.abort();release()
   expect((await pending).isError).toBe(true);return{ok:false,output:'cancelled'}
  })
  expect(executed).toBe(false);expect(result.evidence).toEqual([])
 }finally{release();await runtime.stop('p')}
})
