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
  expect(result.evidence).toMatchObject([{status:'error',execution:'not_observed'}])
  expect((await tools.getToolDefinition('write').execute('allowed',{path:'out.txt',content:'right'})).isError).not.toBe(true)
 }finally{await runtime.stop('p')}
})
it('Native scoped tools expose host evidence labels without treating metadata or denied calls as execution',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-visible-proof-'));roots.push(root);writeFileSync(join(root,'in.txt'),'actual scientific source')
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'})
 await runtime.start({sessionId:'s',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'},bot:{instructions:'worker',member:true}})
 const {resolveTaskSettings}=await import('../../src/subagent/task-tools.js'),{TaskContractSchema}=await import('../../src/orchestration/task-contract.js')
 const session=(runtime as unknown as{sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,args:unknown):Promise<{isError?:boolean;content:{text?:string}[]}>}}}>}).sessions.get('s')!.session
 const label=(response:{content:{text?:string}[]})=>JSON.parse(response.content.find(c=>c.text?.startsWith('[task_tool_evidence] '))!.text!.slice('[task_tool_evidence] '.length))
 try{
  const result=await runtime.runWithTaskScope('s',resolveTaskSettings(TaskContractSchema.parse({access:'workspace-exec'}),'allow-all'),async()=>{
   const read=await session.getToolDefinition('read').execute('host-read',{path:'in.txt',toolCallId:'forged',analysisRouteEvidence:{execution:'ran'}})
   expect(read.content[0]?.text).toBe('actual scientific source');expect(label(read)).toMatchObject({toolCallId:'host-read',name:'read',status:'done',execution:'not_observed',path:'in.txt'})
   const shell=await session.getToolDefinition('bash').execute('host-shell',{command:'true',toolCallId:'forged'})
   expect(label(shell)).toMatchObject({toolCallId:'host-shell',name:'bash',status:'done',execution:'ran'})
   return{ok:true,output:'finished'}
  })
  expect(result.evidence).toHaveLength(2);expect(result.evidence[0]?.result).toBe('actual scientific source');expect(result.evidence[1]?.result).not.toContain('[task_tool_evidence]')
  const denied=await runtime.runWithTaskScope('s',resolveTaskSettings(TaskContractSchema.parse({}),'allow-all'),async()=>{
   const response=await session.getToolDefinition('write').execute('host-denied',{path:'out.txt',content:'must not write'})
   expect(response.isError).toBe(true);expect(label(response)).toMatchObject({toolCallId:'host-denied',status:'error',execution:'not_observed'})
   return{ok:true,output:'denied'}
  })
  expect(denied.evidence).toMatchObject([{status:'error',execution:'not_observed'}])
  const {existsSync}=await import('node:fs');expect(existsSync(join(root,'out.txt'))).toBe(false)
 }finally{await runtime.stop('s')}
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
  expect(executed).toBe(false);expect(result.evidence).toMatchObject([{toolCallId:'call',status:'error',execution:'not_observed'}])
 }finally{release();await runtime.stop('p')}
})
it('Native control resolves canonical ordinary child identity and shares durable steer/stop receipts',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-steer-'));roots.push(root)
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'})
 await runtime.start({sessionId:'p',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}})
 const service=(runtime as unknown as {orchestrations:Map<string,OrchestrationService>}).orchestrations.get('p')!
 const child=service.register('subagent',['call_1','0'],'reader');let finish!:()=>void
 const run=service.run(child.id,async()=>{await new Promise<void>(done=>finish=done);return{ok:true,output:''}})
 service.attachSteering(child.id,1,()=>{})
 try{
  expect(await runtime.controlSubagent('p','call.1',0,{action:'inspect'})).toMatchObject({childId:child.id,canSteer:true,receipts:[]})
  const accepted=await runtime.controlSubagent('p','call_1',0,{action:'steer',expectedEpoch:1,requestId:'correct',text:'correct'})
  expect(accepted.receipts[0]?.status).toBe('accepted')
  const stopped=await runtime.controlSubagent('p','call.1',0,{action:'interrupt'});expect(stopped.canSteer).toBe(false);expect(stopped.receipts[0]?.status).toBe('interrupted')
  await expect(runtime.controlSubagent('p','unknown',0,{action:'steer',expectedEpoch:1,requestId:'other',text:'x'})).rejects.toThrow()
 }finally{finish();await run;await runtime.stop('p')}
})
it('a denied scoped call invalidates previous evidence under a reused ID without changing a sealed proof',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-reused-proof-'));roots.push(root);writeFileSync(join(root,'in.csv'),'x\n1\n')
 const runtime=new NativeRuntime({credentials}),spec={sessionId:'p',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'},bot:{instructions:'scoped reviewer',member:true}}
 const {resolveTaskSettings}=await import('../../src/subagent/task-tools.js'),{TaskContractSchema}=await import('../../src/orchestration/task-contract.js')
 await runtime.start(spec)
 type Tool={execute(id:string,args:unknown):Promise<{isError?:boolean;content:{text:string}[]}>}
 const s=(runtime as unknown as {sessions:Map<string,{session:{getToolDefinition(name:string):Tool}}>}).sessions.get('p')!.session
 try{
  const result=await runtime.runWithTaskScope('p',resolveTaskSettings(TaskContractSchema.parse({submission:'tool',resultType:'review',inputs:['in.csv'],requireReview:true}),'allow-all'),async()=>{
   expect((await s.getToolDefinition('read').execute('same-id',{path:'in.csv'})).isError).not.toBe(true)
   expect((await s.getToolDefinition('read').execute('same-id',{path:'/etc/hosts'})).isError).toBe(true)
   const value={summary:'review',blockers:[],deliverables:[],execution:{state:'not_run',note:'read only'},verification:{state:'reviewed',note:'read',toolCallIds:['same-id']},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:['in.csv']}}
   expect((await s.getToolDefinition('submit_task_result').execute('submit',value)).isError).toBe(true)
   await s.getToolDefinition('read').execute('fresh-read',{path:'in.csv'})
   expect((await s.getToolDefinition('submit_task_result').execute('correct',{...value,verification:{...value.verification,toolCallIds:['fresh-read']}})).isError).not.toBe(true)
   await s.getToolDefinition('read').execute('fresh-read',{path:'/etc/hosts'})
   return{ok:true,output:''}
  })
  expect(result.evidence.filter(e=>e.toolCallId==='same-id').map(e=>e.status)).toEqual(['done','error'])
  expect(result.evidence.filter(e=>e.toolCallId==='fresh-read').map(e=>e.status)).toEqual(['done'])
 }finally{await runtime.stop('p')}
})

it('publishes independent owned team snapshots and coherent live to disk stamps across reopening',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-observer-'));roots.push(root)
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'}),sessionDir=join(root,'session')
 const spec={sessionId:'p',workspace:root,sessionDir,native:{provider:'deepseek',model:'deepseek-flash'}}
 const {readRunOverview,DISK_OBSERVATION}=await import('../../src/orchestration/run-overview.js')
 let old:OrchestrationService|undefined,previousId:string|undefined
 for(let cycle=0;cycle<2;cycle++){
  await runtime.start({...spec,resume:cycle>0})
  const events:import('../../src/runtime/types.js').AgentEvent[]=[];runtime.attach('p',e=>events.push(e))
  const internal=runtime as unknown as {orchestrations:Map<string,OrchestrationService>;botTeams:Map<string,{current:{id?:string};scheduler:import('../../src/team/scheduler.js').团队调度器}>;sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,args:unknown):Promise<{isError?:boolean}>}}}>}
  const service=internal.orchestrations.get('p')!,session=internal.sessions.get('p')!.session
  expect(runtime.runOverview('p')?.observation?.observerId).not.toBe(previousId)
  expect(runtime.runOverview('p')?.team).toBeNull()
  if(old){const count=events.length;old.invalidateObservation();expect(events).toHaveLength(count)}
  await session.getToolDefinition('team_create').execute('new',{name:'readonly',goal:'g',members:[]})
  const control=internal.botTeams.get('p')!,snapshot=runtime.runOverview('p')!
  expect(snapshot.team?.name).toBe('readonly');expect(snapshot.observation).toEqual(service.observation)
  const revision=service.revision,observed=service.observation.revision
  control.scheduler.改(control.current.id!,team=>{team.goal='changed without child state'})
  expect(service.revision).toBe(revision);expect(service.observation.revision).toBeGreaterThan(observed)
  expect(runtime.runOverview('p')?.team?.goal).toBe('changed without child state')
  await session.getToolDefinition('team_finish').execute('finish',{})
  expect(runtime.runOverview('p')?.team).toBeNull()
  previousId=service.observation.observerId;old=service
  await runtime.stop('p')
  expect(events.filter(e=>e.kind==='run_overview_changed').at(-1)).toMatchObject({kind:'run_overview_changed',...DISK_OBSERVATION})
  expect(readRunOverview(sessionDir,'p').observation).toEqual(DISK_OBSERVATION)
  expect(readRunOverview(sessionDir,'p').runs.every(r=>r.phase==='unknown')).toBe(true)
 }
})
it('late old coordinator cleanup cannot delete or notify for a replacement service',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-observer-replace-'));roots.push(root)
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'}),sessionDir=join(root,'session')
 await runtime.start({sessionId:'p',workspace:root,sessionDir,native:{provider:'deepseek',model:'deepseek-flash'}})
 const internal=runtime as unknown as {orchestrations:Map<string,OrchestrationService>;orchestrationControls:Map<string,unknown>}
 const old=internal.orchestrations.get('p')!,child=old.register('subagent',['c'],'c');let release!:()=>void
 const run=old.run(child.id,async()=>{await new Promise<void>(r=>release=r);return{ok:true,output:''}})
 const events:import('../../src/runtime/types.js').AgentEvent[]=[];runtime.attach('p',e=>events.push(e))
 const stopping=runtime.stop('p');await new Promise<void>(r=>setImmediate(r))
 const {OrchestrationStore}=await import('../../src/orchestration/store.js'),{OrchestrationService}=await import('../../src/orchestration/service.js')
 const replacement=new OrchestrationService(new OrchestrationStore(join(root,'replacement'),'p'))
 const replacementControls={replacement:true};internal.orchestrations.set('p',replacement);internal.orchestrationControls.set('p',replacementControls)
 const count=events.filter(e=>e.kind==='run_overview_changed').length;old.invalidateObservation()
 expect(events.filter(e=>e.kind==='run_overview_changed')).toHaveLength(count)
 release();await run;await stopping
 expect(internal.orchestrations.get('p')).toBe(replacement);expect(internal.orchestrationControls.get('p')).toBe(replacementControls)
 expect(events.filter(e=>e.kind==='run_overview_changed').at(-1)?.observerId).not.toBe('disk')
 internal.orchestrations.delete('p');internal.orchestrationControls.delete('p');await replacement.close()
})
it('startup failure cleanup guards old controls and coordinator identities after awaiting close',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-observer-start-fail-'));roots.push(root)
 const runtime=new NativeRuntime({credentials}),{vi}=await import('vitest'),{OrchestrationStore}=await import('../../src/orchestration/store.js'),{OrchestrationService}=await import('../../src/orchestration/service.js')
 const old=new OrchestrationService(new OrchestrationStore(join(root,'old'),'p')),replacement=new OrchestrationService(new OrchestrationStore(join(root,'new'),'p'))
 let release!:()=>void;const gate=new Promise<void>(r=>release=r)
 const internals=runtime as unknown as {启动一次(spec:unknown):Promise<never>;orchestrations:Map<string,OrchestrationService>;orchestrationControls:Map<string,unknown>;pipelineProjections:Map<string,unknown>}
 const replacementControl={new:true},replacementProjection={new:true}
 vi.spyOn(internals,'启动一次').mockImplementation(async()=>{
  internals.orchestrations.set('p',old);internals.orchestrationControls.set('p',{delivery:{close(){}},mailbox:{close:()=>gate}});throw Error('startup failed')
 })
 const starting=runtime.start({sessionId:'p',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}})
 await new Promise<void>(r=>setImmediate(r));internals.orchestrations.set('p',replacement);internals.orchestrationControls.set('p',replacementControl);internals.pipelineProjections.set('p',replacementProjection)
 release();await expect(starting).rejects.toThrow('startup failed')
 expect(internals.orchestrations.get('p')).toBe(replacement);expect(internals.orchestrationControls.get('p')).toBe(replacementControl);expect(internals.pipelineProjections.get('p')).toBe(replacementProjection)
 await replacement.close()
})
it('live current team reads stay pure, reject foreign/malformed pointers and only attach trusted live Bot owner context',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-owned-read-'));roots.push(root)
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'}),sessionDir=join(root,'session'),{vi}=await import('vitest')
 let liveScope='scope'
 runtime.configureBots({list:()=>[],ownerContext:()=>({key:liveScope,workspace:'/trusted'}),run:async()=>({ok:true,output:''}),result:async()=>{},recover:async()=>{}})
 await runtime.start({sessionId:'p',workspace:root,sessionDir,native:{provider:'deepseek',model:'deepseek-flash'}})
 const internal=runtime as unknown as {botTeams:Map<string,{current:{id?:string};scheduler:import('../../src/team/scheduler.js').团队调度器}>}
 const control=internal.botTeams.get('p')!,team={...建团队({id:'owned',name:'owned',goal:'g',captainSessionId:'p'}),botOriginScopeKey:'scope',botOwnerContext:{key:'scope',workspace:'/imported-private'}}
 mkdirSync(join(sessionDir,'teams','owned'),{recursive:true});writeFileSync(join(sessionDir,'teams','owned','team.json'),JSON.stringify(team));control.current.id='owned'
 const read=vi.spyOn(control.scheduler,'读').mockImplementation(()=>{throw Error('mutable scheduler read forbidden')})
 try{
  expect(runtime.runOverview('p')?.team?.botOwnerContext).toEqual({key:'scope',workspace:'/trusted'})
  liveScope='foreign';expect(runtime.runOverview('p')?.team?.botOwnerContext).toBeUndefined();expect(read).not.toHaveBeenCalled()
  writeFileSync(join(sessionDir,'teams','owned','team.json'),JSON.stringify({...team,captainSessionId:'foreign'}))
  expect(runtime.runOverview('p')).toMatchObject({team:null,teamIssue:expect.any(String)})
  for(const id of ['../owned','a/b','a\\b','.','..','x\0y']){control.current.id=id;expect(runtime.runOverview('p')).toMatchObject({team:null,teamIssue:expect.any(String)})}
 }finally{read.mockRestore();delete control.current.id;await runtime.stop('p')}
})
it('publishes a fresh live source stamp when an empty coordinator is installed',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-empty-start-observer-'));roots.push(root)
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'}),seen:import('../../src/runtime/types.js').AgentEvent[]=[]
 runtime.attach('p',e=>seen.push(e))
 await runtime.start({sessionId:'p',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}})
 try{expect(seen.filter(e=>e.kind==='run_overview_changed').at(-1)).toMatchObject({kind:'run_overview_changed',...runtime.runOverview('p')!.observation})}
 finally{await runtime.stop('p')}
})
it('late event attachment receives the current live observation stamp without changing the observation',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-late-observer-'));roots.push(root)
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'})
 await runtime.start({sessionId:'p',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}})
 try{
  const before=runtime.runOverview('p')!.observation,seen:import('../../src/runtime/types.js').AgentEvent[]=[]
  const offBad=runtime.attach('p',()=>{throw Error('isolated observer')});offBad();const off=runtime.attach('p',e=>seen.push(e))
  expect(seen).toEqual([{kind:'run_overview_changed',sessionId:'p',...before}]);expect(runtime.runOverview('p')!.observation).toEqual(before)
  const second:unknown[]=[],foreign:unknown[]=[],offSecond=runtime.attach('p',e=>second.push(e)),offForeign=runtime.attach('other',e=>foreign.push(e))
  expect(second).toEqual(seen);expect(seen).toHaveLength(1);expect(foreign).toEqual([])
  off();offSecond();offForeign()
  ;(runtime as unknown as {orchestrations:Map<string,OrchestrationService>}).orchestrations.get('p')!.invalidateObservation()
  expect(seen).toHaveLength(1);expect(second).toHaveLength(1);expect(foreign).toEqual([])
 }finally{await runtime.stop('p')}
})
it('a sessionless stop cannot remove replacement coordination maps after awaiting old cleanup',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-sessionless-replace-'));roots.push(root)
 const {OrchestrationStore}=await import('../../src/orchestration/store.js'),{OrchestrationService}=await import('../../src/orchestration/service.js')
 const runtime=new NativeRuntime({credentials}),old=new OrchestrationService(new OrchestrationStore(join(root,'old'),'p')),replacement=new OrchestrationService(new OrchestrationStore(join(root,'new'),'p'))
 const internal=runtime as unknown as {orchestrations:Map<string,OrchestrationService>;orchestrationControls:Map<string,unknown>}
 internal.orchestrations.set('p',old);const child=old.register('subagent',['c'],'c');let release!:()=>void
 const run=old.run(child.id,async()=>{await new Promise<void>(r=>release=r);return{ok:true,output:''}})
 const stopping=runtime.stop('p'),controls={new:true};internal.orchestrations.set('p',replacement);internal.orchestrationControls.set('p',controls)
 release();await run;await stopping;expect(internal.orchestrations.get('p')).toBe(replacement);expect(internal.orchestrationControls.get('p')).toBe(controls)
 internal.orchestrations.delete('p');internal.orchestrationControls.delete('p');await replacement.close()
})
it('late old team writes retain cancellation side effects without notifying or overwriting the new observer',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-old-team-observer-'));roots.push(root)
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'}),sessionDir=join(root,'session'),{vi}=await import('vitest')
 const cancel=vi.fn(async()=>{})
 runtime.configureBots({list:()=>[],run:async()=>({ok:true,output:''}),result:async()=>{},recover:async()=>{},cancel})
 await runtime.start({sessionId:'p',workspace:root,sessionDir,native:{provider:'deepseek',model:'deepseek-flash'}})
 const internal=runtime as unknown as {orchestrations:Map<string,OrchestrationService>;botTeams:Map<string,{current:{id?:string};scheduler:import('../../src/team/scheduler.js').团队调度器}>}
 const old=internal.orchestrations.get('p')!,control=internal.botTeams.get('p')!,{加成员,加任务,取消任务}=await import('../../src/team/state.js')
 const team=建团队({id:'owned',name:'owned',goal:'g',captainSessionId:'p'});加成员(team,{name:'m',agent:'bot-b',botId:'b',botScopeKey:'scope'});加任务(team,{id:'t',subject:'task',assignee:'m'})
 写团队(join(sessionDir,'teams','owned'),team);control.current.id='owned'
 const {OrchestrationStore}=await import('../../src/orchestration/store.js'),{OrchestrationService}=await import('../../src/orchestration/service.js'),replacement=new OrchestrationService(new OrchestrationStore(join(root,'replacement'),'p'))
 const seen:import('../../src/runtime/types.js').AgentEvent[]=[];const off=runtime.attach('p',event=>seen.push(event));seen.length=0
 internal.orchestrations.set('p',replacement)
 try{
  control.scheduler.改('owned',team=>取消任务(team,'t'))
  expect(cancel).toHaveBeenCalledTimes(1);expect(seen.filter(event=>event.kind==='run_overview_changed'||event.kind==='team_changed')).toEqual([])
  expect(control.scheduler.读('owned').tasks[0]?.status).toBe('cancelled')
 }finally{off();internal.orchestrations.set('p',old);await runtime.stop('p');await replacement.close()}
})
it('retains the owned persisted team while stopping children drain, while explicit live empty stays empty',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-native-stopping-owned-team-'));roots.push(root)
 const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'}),sessionDir=join(root,'session')
 await runtime.start({sessionId:'p',workspace:root,sessionDir,native:{provider:'deepseek',model:'deepseek-flash'}})
 const internal=runtime as unknown as {orchestrations:Map<string,OrchestrationService>;botTeams:Map<string,{current:{id:string|undefined}}>;sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,args:unknown):Promise<{isError?:boolean}>}}}>}
 await internal.sessions.get('p')!.session.getToolDefinition('team_create').execute('create',{name:'stopping team',goal:'g',members:[]})
 const current=internal.botTeams.get('p')!.current,teamId=current.id!
 current.id=undefined;expect(runtime.runOverview('p')?.team).toBeNull();current.id=teamId
 expect(runtime.runOverview('p')?.team?.id).toBe(teamId)
 const service=internal.orchestrations.get('p')!,child=service.register('subagent',['deferred','0'],'deferred');let release!:()=>void
 const running=service.run(child.id,async()=>{await new Promise<void>(r=>release=r);return{ok:true,output:''}})
 const stopping=runtime.stop('p')
 try{
  await new Promise<void>(r=>setImmediate(r));expect(internal.botTeams.has('p')).toBe(false)
  const view=runtime.runOverview('p')!
  expect(view).toMatchObject({source:'live',team:{id:teamId,captainSessionId:'p'}})
  expect(view.runs.find(run=>run.id===child.id)?.phase).toBe('stopping')
 }finally{release();await running;await stopping;await runtime.stop('p')}
 expect(runtime.runOverview('p')).toBeUndefined()
 const {readRunOverview}=await import('../../src/orchestration/run-overview.js'),disk=readRunOverview(sessionDir,'p')
 expect(disk).toMatchObject({source:'disk',team:{id:teamId},observation:{observerId:'disk',revision:0}})
 expect(disk.runs.find(run=>run.id===child.id)?.phase).toBe('unknown')
})
