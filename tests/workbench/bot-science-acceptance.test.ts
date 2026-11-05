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

// @ts-expect-error shared deterministic scientific fixture
import {scienceTemplateScenario} from '../../scripts/mock-science-template.mjs'
import type {AnalysisRouteBook} from '../../src/runtime/analysis-route-book.js'
it.each(['pass','wrong-numeric'] as const)('enforces actual scientific acceptance for %s Native Bots and persists authoritative SQLite results',async mode=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-bot-science-')),db=new Database(':memory:');migrate(db)
 const server=await startMockInferenceServer({scenario:scienceTemplateScenario({mode})}),modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)));writeFileSync(join(root,'in.csv'),'x\n1\n2\n3\n4\n5\n')
 const {ArtifactCapture}=await import('../../src/artifacts/capture.js'),{ArtifactStore}=await import('../../src/artifacts/store.js');new ProjectStore(db).insert({projectId:'science',name:'science',workspace:root,createdAt:new Date().toISOString()});const artifacts=new ArtifactStore(db),capture=new ArtifactCapture({store:artifacts,scope:sessionId=>({projectId:'science',workspace:root,sessionId})})
 const runtime=new NativeRuntime({artifactCapture:capture,modelsPath,credentials:{read:async()=>({type:'api_key',key:'offline-mock'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},subagentChildEntry:'/unused/child.js'})
 const registry={agents:{native:{kind:'native' as const,provider:'deepseek',model:'deepseek-flash',capabilities:[]}}},store=new SessionStore(db),projectStore=new ProjectStore(db),runs=new RunStore(db),bots=new BotStore(db),sessions=new SessionManager({store,registry,runtimes:{native:runtime,pty:runtime},workspaceRoot:root}),projects=new ProjectManager({projects:projectStore,sessions:store,runs,registry})
 const disposers:(()=>void)[]=[]
 const backend=createWorkbenchBackend({注册收摊:fn=>disposers.push(fn),bots,configureBots:bridge=>runtime.configureBots(bridge),tasks:new TaskStore(db),sessions,projects,projectStore,runs,registry,credentials:memoryCredentials({deepseek:'offline-mock'}),events:new SessionTranscripts({terminalMaxChars:10000}),scratchRoot:root})
 try{
  const main=await backend.createTask({workspace:root,agentId:'native'}) as {sessionId:string};await backend.subscribeSession({sessionId:main.sessionId})
  const internals=runtime as unknown as {sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,params:unknown):Promise<{isError?:boolean}>}}}>;botTeams:Map<string,{current:{id:string};scheduler:团队调度器}>;routeBooks:Map<string,{book:AnalysisRouteBook}>}
  const executors:Record<string,{botId:string}>={};for(const stage of ['check','analyze','review']){const {bot}=await backend.createBot({name:stage,role:stage,instructions:'Use frozen scientific contract; submit actual results.'}) as {bot:{id:string}};executors[stage]={botId:bot.id}}
  const book=internals.routeBooks.get(main.sessionId)!.book,route=book.replace(0,{title:'fixture',goal:'mean',dataContext:[],steps:[{id:'s',title:'mean',purpose:'approved mean',inputs:['in.csv'],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
  const result=await internals.sessions.get(main.sessionId)!.session.getToolDefinition('start_science_batch').execute('science',{routeId:route.routeId,revision:route.revision,stepId:'s',executors,instructions:'approved mean',template:{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block',validation:{version:1,column:'x',metric:'mean',unit:'m',missing:'block'}},items:[{id:'a',label:'A',inputs:['in.csv'],dataPath:'in.csv'}],outputRoot:'results'})
  expect(result.isError).not.toBe(true);const c=internals.botTeams.get(main.sessionId)!
  await vi.waitFor(()=>expect(c.scheduler.读(c.current.id).scienceBatch?.status).toBe(mode==='pass'?'completed':'blocked'),{timeout:20000})
  const team=c.scheduler.读(c.current.id),analysis=team.tasks.find(t=>t.contract?.resultType==='model-metrics')!;expect(analysis.receipt?.acceptance).toMatchObject({state:mode==='pass'?'passed':'blocked',environment:{state:'known',executionBound:true}})
  expect(JSON.parse(readFileSync(join(root,analysis.contract!.acceptance!.resultPath),'utf8')).mean).toBe(mode==='pass'?3:999)
  if(mode==='pass'){expect(analysis.receipt?.versions?.outputs.every(f=>f.versionId&&f.observationId)).toBe(true);expect(team.tasks.some(t=>t.contract?.resultType==='review')).toBe(true)}else expect(team.tasks.some(t=>t.contract?.resultType==='review')).toBe(false)
  await vi.waitFor(()=>expect(bots.getResult(`${team.id}:${analysis.id}:${analysis.attemptId}`)).toBeDefined(),{timeout:3000})
 }finally{await sessions.stopAll();for(const dispose of disposers)dispose();await server.close();db.close();rmSync(root,{recursive:true,force:true})}
},30000)
