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

it('accepts only the final Bot JSON while retaining tool preamble in the real transcript',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-bot-contract-live-')),db=new Database(':memory:');migrate(db)
 const reply=JSON.stringify({summary:'delivered',blockers:[],deliverables:[{path:'out.txt'}],execution:{state:'not_run',note:'document only'},verification:{state:'unreviewed',note:'not scientific review'}})
 const server=await startMockInferenceServer({reply,toolCall:(body:{messages:{role:string;content:unknown}[]})=>body.messages.at(-1)?.role==='user'&&JSON.stringify(body.messages[0]?.content).includes('BOT_CONTRACT_CHECK')?{toolName:'write',args:{path:'out.txt',content:'verified output'},say:'先写文件，再交最终回执。'}:undefined})
 const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
 const runtime=new NativeRuntime({modelsPath,credentials:{read:async()=>({type:'api_key',key:'offline-mock'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},subagentChildEntry:'/unused/child.js'})
 const registry={agents:{native:{kind:'native' as const,provider:'deepseek',model:'deepseek-flash',capabilities:[]}}},store=new SessionStore(db),projectStore=new ProjectStore(db),runs=new RunStore(db),bots=new BotStore(db)
 const sessions=new SessionManager({store,registry,runtimes:{native:runtime,pty:runtime},workspaceRoot:root}),projects=new ProjectManager({projects:projectStore,sessions:store,runs,registry})
 const backend=createWorkbenchBackend({bots,configureBots:bridge=>runtime.configureBots(bridge),tasks:new TaskStore(db),sessions,projects,projectStore,runs,registry,credentials:memoryCredentials({deepseek:'offline-mock'}),events:new SessionTranscripts({terminalMaxChars:10000}),scratchRoot:root})
 try{
  const main=await backend.createTask({workspace:root,agentId:'native'}) as {sessionId:string}
  const {bot}=await backend.createBot({name:'contract writer',role:'document',instructions:'BOT_CONTRACT_CHECK: return only final JSON.'}) as {bot:{id:string}}
  await backend.subscribeSession({sessionId:main.sessionId})
  const internals=runtime as unknown as {sessions:Map<string,{sessionManager:{getSessionFile():string|undefined};session:{getToolDefinition(name:string):{execute(id:string,params:unknown):Promise<{isError?:boolean}>}}}>;botTeams:Map<string,{current:{id:string};scheduler:团队调度器}>}
  const result=await internals.sessions.get(main.sessionId)!.session.getToolDefinition('team_create').execute('contract-team',{name:'contract',goal:'deliver',members:[{name:'writer',botId:bot.id}],tasks:[{id:'t1',subject:'write document',assignee:'writer',contract:{access:'workspace-write',outputs:['out.txt']}}]})
  expect(result.isError).not.toBe(true)
  const control=internals.botTeams.get(main.sessionId)!
  await vi.waitFor(()=>expect(['completed','failed']).toContain(control.scheduler.读(control.current.id).tasks[0]?.status),{timeout:10000})
  const task=control.scheduler.读(control.current.id).tasks[0]!
  expect(task,JSON.stringify({output:task.output,receipt:task.receipt})).toMatchObject({status:'completed',receipt:{state:'accepted',deliverables:[{path:'out.txt',state:'observed'}]}})
  expect(task.output).toBe(reply);expect(readFileSync(join(root,'out.txt'),'utf8')).toBe('verified output')
  const member=control.scheduler.读(control.current.id).members[0]!
  const transcript=internals.sessions.get(member.sessionId!)!.sessionManager.getSessionFile()!
  expect(readFileSync(transcript,'utf8')).toContain('先写文件，再交最终回执。')
  await vi.waitFor(()=>expect(bots.getResult(`${control.current.id}:${task.id}:${task.attemptId}`)).toBeDefined(),{timeout:3000})
 }finally{await sessions.stopAll();await server.close();db.close();rmSync(root,{recursive:true,force:true})}
},20000)
