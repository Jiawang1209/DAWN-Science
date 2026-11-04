import {afterEach,expect,it,vi} from 'vitest'
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {NativeRuntime} from '../../src/runtime/native.js'
import type {团队调度器} from '../../src/team/scheduler.js'
import type {AnalysisRouteBook} from '../../src/runtime/analysis-route-book.js'
// @ts-expect-error shared deterministic development model
import {startMockInferenceServer,mockModelsJson} from '../../scripts/mock-inference-server.mjs'
// @ts-expect-error shared deterministic acceptance scenario
import {sciencePipelineScenario} from '../../scripts/mock-science-pipeline.mjs'
const roots:string[]=[];afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
it.each(['pass','revise','blocked'] as const)('real Pi children and persisted route/receipts complete the %s scenario',async mode=>{
 expect(existsSync(resolve('dist/electron/subagent-child.js')),'Build before this actual-entry integration').toBe(true)
 const root=mkdtempSync(join(tmpdir(),'dawn-science-live-'));roots.push(root)
 const server=await startMockInferenceServer({scenario:sciencePipelineScenario(mode)}),modelsPath=join(root,'models.json')
 writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)));writeFileSync(join(root,'in.csv'),'x\n1\n2\n3\n4\n5\n')
 mkdirSync(join(root,'.dawn','agents'),{recursive:true})
 for(const stage of ['check','analyze','review'])writeFileSync(join(root,'.dawn','agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: pipeline ${stage}\ntools: read, write, bash\n---\n按当前阶段与冻结契约执行，最终调用 submit_task_result。\n`)
 const runtime=new NativeRuntime({modelsPath,credentials:{read:async()=>({type:'api_key',key:'offline-mock'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},subagentChildEntry:resolve('dist/electron/subagent-child.js')})
 try{
  await runtime.start({sessionId:'parent',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}})
  runtime.write('parent','科研流水线验收：建立分析路线，按已确认方法执行合成数据核查、分析及独立审阅。')
  await runtime.waitForIdle('parent')
  const internals=runtime as unknown as {botTeams:Map<string,{current:{id:string};scheduler:团队调度器}>;routeBooks:Map<string,{book:AnalysisRouteBook}>}
  const control=internals.botTeams.get('parent');expect(control?.current.id).toBeTruthy()
  await vi.waitFor(()=>{const t=control!.scheduler.读(control!.current.id);expect(['completed','blocked'],JSON.stringify({pipeline:t.pipeline,tasks:t.tasks.map(task=>({id:task.id,status:task.status,output:task.output,observation:task.observation})),requests:server.requests?.length})).toContain(t.pipeline?.status)},{timeout:20000})
  const team=control!.scheduler.读(control!.current.id)
  expect(team.pipeline?.status).toBe(mode==='blocked'?'blocked':'completed')
  expect(team.tasks).toHaveLength(mode==='revise'?5:mode==='blocked'?1:3)
  expect(team.tasks[0]?.observation?.invalidSubmissions).toBe(1)
  expect(team.tasks[0]?.observation?.usage?.input,JSON.stringify(team.tasks[0]?.observation)).toBeGreaterThan(0)
  expect(readFileSync(join(root,'in.csv'),'utf8')).toBe('x\n1\n2\n3\n4\n5\n')
  if(mode!=='blocked'){
   expect(readFileSync(join(root,'results','pipeline.csv'),'utf8')).toContain('synthetic')
   expect(team.pipeline?.routeSync).toBe('applied');expect(internals.routeBooks.get('parent')?.book.read()?.steps[0]?.status).toBe('delivered')
   expect(team.tasks.at(-1)?.receipt?.result?.data).toMatchObject({kind:'review',verdict:'pass'})
  }else expect(existsSync(join(root,'results','pipeline.csv'))).toBe(false)
 }finally{await runtime.stop('parent');await server.close()}
},40000)

it('reopens without replay and explicitly resumes only the interrupted stage',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-pipeline-resume-'));roots.push(root)
 const server=await startMockInferenceServer({scenario:sciencePipelineScenario('interrupt')}),modelsPath=join(root,'models.json')
 writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)));writeFileSync(join(root,'in.csv'),'x\n1\n2\n3\n4\n5\n');mkdirSync(join(root,'.dawn','agents'),{recursive:true})
 for(const stage of ['check','analyze','review'])writeFileSync(join(root,'.dawn','agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: test\ntools: read, write, bash\n---\n按冻结契约执行。\n`)
 const runtime=new NativeRuntime({modelsPath,credentials:{read:async()=>({type:'api_key',key:'offline-mock'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},subagentChildEntry:resolve('dist/electron/subagent-child.js')})
 const spec={sessionId:'parent',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}}
 const internals=runtime as unknown as {botTeams:Map<string,{current:{id:string};scheduler:团队调度器}>;sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,args:unknown):Promise<{isError?:boolean}>}}}>}
 try{
  await runtime.start(spec);runtime.write('parent','科研流水线验收：按已确认方法执行。');await runtime.waitForIdle('parent')
  const first=internals.botTeams.get('parent')!
  await vi.waitFor(()=>expect(first.scheduler.读(first.current.id).tasks.at(-1)?.status).toBe('in_progress'),{timeout:5000})
  await vi.waitFor(()=>expect(server.requests.some((r:{body?:unknown})=>JSON.stringify(r.body??{}).includes('阶段 analyze'))).toBe(true),{timeout:5000})
  const before=first.scheduler.读(first.current.id);expect(before.tasks[0]?.status).toBe('completed')
  await runtime.stop('parent');await runtime.start({...spec,resume:true})
  const control=internals.botTeams.get('parent')!,snapshot=control.scheduler.读(control.current.id)
  expect(snapshot.pipeline?.status).toBe('interrupted');expect(snapshot.tasks[0]).toEqual(before.tasks[0])
  expect(control.scheduler.几个在跑()).toBe(0)
  const resume=internals.sessions.get('parent')!.session.getToolDefinition('resume_science_pipeline')
  expect((await resume.execute('no-ack',{stateRevision:snapshot.pipeline!.stateRevision})).isError).toBe(true)
  expect((await resume.execute('ack',{stateRevision:snapshot.pipeline!.stateRevision,acknowledgeInterrupted:true})).isError).not.toBe(true)
  await vi.waitFor(()=>expect(control.scheduler.读(control.current.id).pipeline?.status).toBe('completed'),{timeout:15000})
  const team=control.scheduler.读(control.current.id)
  expect(team.tasks).toHaveLength(4);expect(team.tasks[0]).toEqual(before.tasks[0]);expect(team.tasks[2]?.settings).toEqual(before.tasks[1]?.settings)
  expect(team.pipeline?.acknowledgedTaskIds).toEqual([before.tasks[1]!.id]);expect(team.pipeline?.routeSync).toBe('applied')
 }finally{await runtime.stop('parent');await server.close()}
},30000)

it.each(['queued','executing'] as const)('cancel_science_pipeline closes %s work and releases only drained reservations',async phase=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-pipeline-cancel-'));roots.push(root)
 const server=await startMockInferenceServer({scenario:sciencePipelineScenario('interrupt')}),modelsPath=join(root,'models.json')
 writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)));writeFileSync(join(root,'in.csv'),'x\n1\n2\n3\n4\n5\n');mkdirSync(join(root,'.dawn','agents'),{recursive:true})
 for(const stage of ['check','analyze','review'])writeFileSync(join(root,'.dawn','agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: test\ntools: read, write, bash\n---\n按冻结契约执行。\n`)
 const runtime=new NativeRuntime({modelsPath,credentials:{read:async()=>({type:'api_key',key:'offline-mock'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},subagentChildEntry:resolve('dist/electron/subagent-child.js')})
 const {sharedTaskOutputLocks,outputLockScope,taskOutputReservation}=await import('../../src/bot/output-locks.js'),{resolveTaskSettings}=await import('../../src/subagent/task-tools.js'),{TaskContractSchema}=await import('../../src/orchestration/task-contract.js')
 let release=()=>{},competitor:Promise<void>|undefined
 if(phase==='queued')release=await sharedTaskOutputLocks.acquire(outputLockScope(root),undefined,new AbortController().signal)
 const internal=runtime as unknown as {botTeams:Map<string,{current:{id:string};scheduler:团队调度器}>;sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,args:unknown):Promise<{isError?:boolean}>}}}>}
 try{
  await runtime.start({sessionId:'parent',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}})
  runtime.write('parent','科研流水线验收：按已确认方法执行。');await runtime.waitForIdle('parent')
  const control=internal.botTeams.get('parent')!
  await vi.waitFor(()=>{const t=control.scheduler.读(control.current.id);expect(t.pipeline?.stage).toBe(phase==='queued'?'check':'analyze');expect(t.tasks.at(-1)?.status).toBe('in_progress')},{timeout:5000})
  if(phase==='executing')await vi.waitFor(()=>expect(server.requests.some((r:{body?:unknown})=>JSON.stringify(r.body??{}).includes('阶段 analyze'))).toBe(true),{timeout:5000})
  let competitorEntered=false
  competitor=taskOutputReservation(root,resolveTaskSettings(TaskContractSchema.parse({access:'workspace-write',outputs:['results/pipeline.csv']}),'allow-all'),new AbortController().signal).then(unlock=>{competitorEntered=true;unlock()})
  await new Promise<void>(done=>setImmediate(done));expect(competitorEntered).toBe(false)
  const before=control.scheduler.读(control.current.id),cancel=internal.sessions.get('parent')!.session.getToolDefinition('cancel_science_pipeline')
  expect((await cancel.execute('stale',{stateRevision:before.pipeline!.stateRevision+1})).isError).toBe(true);expect(control.scheduler.读(control.current.id)).toEqual(before)
  expect((await cancel.execute('cancel',{stateRevision:before.pipeline!.stateRevision})).isError).not.toBe(true)
  await vi.waitFor(()=>expect(control.scheduler.几个在跑()).toBe(0),{timeout:5000})
  const team=control.scheduler.读(control.current.id);expect(team.pipeline?.status).toBe('cancelled');expect(team.tasks).toHaveLength(phase==='queued'?1:2);expect(team.tasks.at(-1)?.status).toBe('cancelled')
  if(phase==='queued'){expect(competitorEntered).toBe(false);release()}
  await competitor;expect(competitorEntered).toBe(true);expect(existsSync(join(root,'results','pipeline.csv'))).toBe(false)
  const count=server.requests.length;await control.scheduler.踢一下(team.id);await new Promise<void>(done=>setImmediate(done));expect(server.requests).toHaveLength(count)
  expect((await internal.sessions.get('parent')!.session.getToolDefinition('resume_science_pipeline').execute('resume',{stateRevision:team.pipeline!.stateRevision,acknowledgeInterrupted:true})).isError).toBe(true)
 }finally{release();await runtime.stop('parent');await competitor;await server.close()}
},30000)
