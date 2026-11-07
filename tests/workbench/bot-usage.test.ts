/** Localhost model, real backend/Native/Pi and disposable SQLite only. */
import {expect,it,vi} from 'vitest'
import Database from 'better-sqlite3'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {migrate} from '../../src/store/schema.js'
import {BotStore} from '../../src/store/bots.js'
import {SessionStore} from '../../src/store/sessions.js'
import {ProjectStore} from '../../src/store/projects.js'
import {TaskStore} from '../../src/store/tasks.js'
import {RunStore} from '../../src/store/runs.js'
import {ProjectManager} from '../../src/project/manager.js'
import {SessionManager} from '../../src/session/manager.js'
import {SessionTranscripts} from '../../src/workbench/events.js'
import {createWorkbenchBackend} from '../../src/workbench/backend.js'
import {NativeRuntime} from '../../src/runtime/native.js'
import type {团队调度器} from '../../src/team/scheduler.js'
import type {OrchestrationService} from '../../src/orchestration/service.js'
import {memoryCredentials} from '../helpers/credentials.js'
// @ts-expect-error shared deterministic JavaScript model
import {startMockInferenceServer,mockModelsJson} from '../../scripts/mock-inference-server.mjs'
it('ordinary managed Bot tasks capture actual local scope deltas without settings or contracts',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-p14-d2-backend-')),db=new Database(':memory:'),disposers:(()=>void)[]=[];migrate(db)
 const server=await startMockInferenceServer({reply:'finished'}),modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
 const runtime=new NativeRuntime({modelsPath,credentials:{read:async()=>({type:'api_key',key:'offline-mock'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},subagentChildEntry:'/unused/child.js'})
 const registry={agents:{native:{kind:'native' as const,provider:'deepseek',model:'deepseek-flash',capabilities:[]}}},store=new SessionStore(db),projectStore=new ProjectStore(db),runs=new RunStore(db),bots=new BotStore(db)
 const sessions=new SessionManager({store,registry,runtimes:{native:runtime,pty:runtime},workspaceRoot:root}),projects=new ProjectManager({projects:projectStore,sessions:store,runs,registry})
 const backend=createWorkbenchBackend({bots,configureBots:bridge=>runtime.configureBots(bridge),tasks:new TaskStore(db),sessions,projects,projectStore,runs,registry,credentials:memoryCredentials({deepseek:'offline-mock'}),events:new SessionTranscripts({terminalMaxChars:10000}),scratchRoot:root,注册收摊:dispose=>disposers.push(dispose)})
 try{
  const main=await backend.createTask({workspace:root,agentId:'native'}) as {sessionId:string},created=await backend.createBot({name:'worker',role:'reader',instructions:'Reply finished.'}) as {bot:{id:string}}
  await backend.subscribeSession({sessionId:main.sessionId})
  const internals=runtime as unknown as {sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,params:unknown):Promise<{isError?:boolean}>}}}>;botTeams:Map<string,{current:{id:string};scheduler:团队调度器}>;orchestrations:Map<string,OrchestrationService>}
  // Exercise the existing compatibility branch where ordinary Bot requests have no task settings.
  ;(internals.botTeams.get(main.sessionId)!.scheduler as unknown as {opts:{prepareTask:()=>undefined}}).opts.prepareTask=()=>undefined
  const result=await internals.sessions.get(main.sessionId)!.session.getToolDefinition('team_create').execute('usage-team',{name:'usage',goal:'reply',members:[{name:'reader',botId:created.bot.id}],tasks:[{id:'t1',subject:'reply one',assignee:'reader'},{id:'t2',subject:'reply two',assignee:'reader',dependencies:['t1']}]})
  expect(result.isError).not.toBe(true)
  const control=internals.botTeams.get(main.sessionId)!
  await vi.waitFor(()=>{const tasks=control.scheduler.读(control.current.id).tasks;expect(tasks.every(task=>task.status==='completed'),JSON.stringify(tasks)).toBe(true)},{timeout:10000})
  const team=control.scheduler.读(control.current.id),service=internals.orchestrations.get(main.sessionId)!,child=service.store.list().find(child=>child.kind==='bot')!
  expect(child.settings).toBeUndefined();expect(team.tasks.every(task=>!task.contract&&!task.receipt)).toBe(true)
  const usages=team.tasks.map(task=>task.observation?.usage)
  expect(usages[0]?.input).toBeGreaterThan(0);expect(usages[1]?.input).toBeGreaterThan(0)
  expect(child.usageTotals).toMatchObject({input:usages.reduce((n,u)=>n+u!.input!,0),output:usages.reduce((n,u)=>n+u!.output!,0),settledEpochs:2})
  expect(child.usageTotals?.input).toBeLessThan(runtime.sessionUsage(team.members[0]!.sessionId!).input!*2)
  expect(service.budgetSnapshot().consumedRuns).toBe(2)
 }finally{await sessions.stopAll();for(const dispose of disposers)dispose();await server.close();db.close();rmSync(root,{recursive:true,force:true})}
},20000)
