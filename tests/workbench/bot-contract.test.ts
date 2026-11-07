/** Real backend, SQLite, Native/Pi Bot and localhost model; no provider calls. */
import {expect,it,vi} from 'vitest'
import Database from 'better-sqlite3'
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
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
import {memoryCredentials} from '../helpers/credentials.js'
// @ts-expect-error shared deterministic JavaScript model
import {startMockInferenceServer,mockModelsJson} from '../../scripts/mock-inference-server.mjs'

it.each(['legacy','tool','versioned','acceptance-cancel'] as const)('handles the authoritative %s Bot result through real backend and SQLite',async mode=>{
 const cancelledAcceptance=mode==='acceptance-cancel'
 const root=mkdtempSync(join(tmpdir(),'dawn-bot-contract-live-')),db=new Database(':memory:'),disposers:(()=>void)[]=[];migrate(db)
 const reply=JSON.stringify({summary:'delivered',blockers:[],deliverables:[{path:'out.txt'}],execution:{state:'not_run',note:'document only'},verification:{state:'unreviewed',note:'not scientific review'}})
 const server=await startMockInferenceServer({reply,toolCall:(body:{messages:{role:string;content:unknown;tool_calls?:{function:{name:string}}[]}[]})=>{
  if(!JSON.stringify(body.messages[0]?.content).includes('BOT_CONTRACT_CHECK'))return undefined
  const calls=body.messages.flatMap(m=>m.tool_calls??[])
  if(!calls.some(c=>c.function.name==='write'))return{toolName:'write',args:{path:'out.txt',content:'verified output'},say:'先写文件，再交最终回执。',usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}}
  if(mode!=='legacy'&&!calls.some(c=>c.function.name==='submit_task_result'))return{toolName:'submit_task_result',args:JSON.parse(reply),usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}}
 }})
 const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
 const {ArtifactCapture}=await import('../../src/artifacts/capture.js'),{ArtifactStore}=await import('../../src/artifacts/store.js'),{captureFileVersions}=await import('../../src/artifacts/task-versions.js')
 new ProjectStore(db).insert({projectId:'versions',name:'versions',workspace:root,createdAt:new Date().toISOString()});writeFileSync(join(root,'in.txt'),'immutable input')
 const inputVersions=await captureFileVersions(root,['in.txt']),artifactStore=new ArtifactStore(db),artifactCapture=new ArtifactCapture({store:artifactStore,scope:sessionId=>({projectId:'versions',workspace:root,sessionId})})
 const runtime=new NativeRuntime({artifactCapture,modelsPath,credentials:{read:async()=>({type:'api_key',key:'offline-mock'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},subagentChildEntry:'/unused/child.js'})
 const registry={agents:{native:{kind:'native' as const,provider:'deepseek',model:'deepseek-flash',capabilities:[]}}},store=new SessionStore(db),projectStore=new ProjectStore(db),runs=new RunStore(db),bots=new BotStore(db)
 const sessions=new SessionManager({store,registry,runtimes:{native:runtime,pty:runtime},workspaceRoot:root}),projects=new ProjectManager({projects:projectStore,sessions:store,runs,registry})
 const backend=createWorkbenchBackend({bots,configureBots:bridge=>runtime.configureBots(bridge),tasks:new TaskStore(db),sessions,projects,projectStore,runs,registry,credentials:memoryCredentials({deepseek:'offline-mock'}),events:new SessionTranscripts({terminalMaxChars:10000}),scratchRoot:root,注册收摊:dispose=>disposers.push(dispose)})
 try{
  const main=await backend.createTask({workspace:root,agentId:'native'}) as {sessionId:string}
  const {bot}=await backend.createBot({name:'contract writer',role:'document',instructions:'BOT_CONTRACT_CHECK: return only final JSON.'}) as {bot:{id:string}}
  await backend.subscribeSession({sessionId:main.sessionId})
  const internals=runtime as unknown as {sessions:Map<string,{sessionManager:{getSessionFile():string|undefined};session:{getToolDefinition(name:string):{execute(id:string,params:unknown):Promise<{isError?:boolean}>}}}>;botTeams:Map<string,{current:{id:string};scheduler:团队调度器}>;orchestrations:Map<string,import('../../src/orchestration/service.js').OrchestrationService>}
  if(mode==='versioned'||cancelledAcceptance){const control=internals.botTeams.get(main.sessionId)!,opts=(control.scheduler as unknown as {opts:{prepareTask:(member:never,task:never)=>import('../../src/protocol/task-contract.js').TaskSettings|undefined}}).opts,prepare=opts.prepareTask;opts.prepareTask=(member,task)=>{const settings=prepare(member,task);return settings?{...settings,versions:{version:1,inputs:inputVersions}}:settings}}
  let cancelledAtAcceptance=false
  const coordinator=internals.orchestrations.get(main.sessionId)!
  if(cancelledAcceptance){const observe=coordinator.store.observeStage.bind(coordinator.store);coordinator.store.observeStage=(...args)=>{const changed=observe(...args);if(args[2]==='acceptance'&&coordinator.store.get(args[0])?.kind==='bot'){cancelledAtAcceptance=true;coordinator.interrupt(args[0])}return changed}}
  const result=await internals.sessions.get(main.sessionId)!.session.getToolDefinition('team_create').execute('contract-team',{name:'contract',goal:'deliver',members:[{name:'writer',botId:bot.id}],tasks:[{id:'t1',subject:'write document',assignee:'writer',contract:{access:'workspace-write',...((mode==='versioned'||cancelledAcceptance)?{inputs:['in.txt']}:{}),outputs:['out.txt'],...(mode!=='legacy'?{submission:'tool'}:{})}}]})
  expect(result.isError).not.toBe(true)
  const control=internals.botTeams.get(main.sessionId)!
  await vi.waitFor(()=>expect(['completed','failed']).toContain(control.scheduler.读(control.current.id).tasks[0]?.status),{timeout:10000})
  const task=control.scheduler.读(control.current.id).tasks[0]!
  if(cancelledAcceptance){
   await vi.waitFor(()=>expect(coordinator.hasPendingWork).toBe(false))
   expect(cancelledAtAcceptance).toBe(true)
   expect(task.status).toBe('failed');expect(task.output??'').not.toBe(reply);expect(task.receipt).toBeUndefined()
   const child=coordinator.store.list().find(c=>c.kind==='bot')!
   expect(child).toMatchObject({state:'cancelled',usageTotals:{input:24,output:16,settledEpochs:1,unknownEpochs:1,partial:['cacheRead']},result:{ok:false,output:'',observation:{usage:{input:24,output:16}}}})
   expect(child.result?.receipt).toBeUndefined();expect(child.result?.trace?.records.some(r=>r.name==='write')).toBe(true)
   expect(coordinator.budgetSnapshot()).toMatchObject({knownTokens:40,consumedRuns:1,unknownRuns:1,inFlight:0})
   expect(()=>coordinator.store.settleRun(child.id,child.epoch,{ok:true,output:reply},false)).toThrow(/Stale|settled/)
   const {OrchestrationStore}=await import('../../src/orchestration/store.js')
   expect(new OrchestrationStore(coordinator.store.sessionDir,coordinator.store.ownerSessionId).get(child.id)?.usageTotals).toEqual(child.usageTotals)
   const {localTaskOutputReservation}=await import('../../src/bot/output-locks.js')
   const release=await localTaskOutputReservation(root,['out.txt'],AbortSignal.timeout(1000));release()
   expect(readFileSync(join(root,'in.txt'),'utf8')).toBe('immutable input')
   return
  }
  expect(task,JSON.stringify({output:task.output,receipt:task.receipt})).toMatchObject({status:'completed',receipt:{state:'accepted',deliverables:[{path:'out.txt',state:'observed'}]}})
  expect(task.output).toBe(reply);if(mode!=='legacy')expect(task.observation).toMatchObject({submissionAttempts:1,invalidSubmissions:0,usage:{input:24,output:16}});expect(readFileSync(join(root,'out.txt'),'utf8')).toBe('verified output')
  if(mode==='versioned'){expect(task.receipt?.versions?.inputs[0]?.sha256).toBe(inputVersions[0]?.sha256);expect(task.receipt?.versions?.outputs[0]?.versionId).toBeTruthy();expect(artifactStore.observation({projectId:'versions',workspace:root},task.receipt!.versions!.outputs[0]!.observationId!).sha256).toBe(task.receipt?.versions?.outputs[0]?.sha256);expect(readFileSync(join(root,'in.txt'),'utf8')).toBe('immutable input')}
  const member=control.scheduler.读(control.current.id).members[0]!
  const transcript=internals.sessions.get(member.sessionId!)!.sessionManager.getSessionFile()!
  expect(readFileSync(transcript,'utf8')).toContain('先写文件，再交最终回执。')
  await vi.waitFor(()=>expect(bots.getResult(`${control.current.id}:${task.id}:${task.attemptId}`)).toBeDefined(),{timeout:3000})
 }finally{await sessions.stopAll();for(const dispose of disposers)dispose();await server.close();db.close();rmSync(root,{recursive:true,force:true})}
},20000)
