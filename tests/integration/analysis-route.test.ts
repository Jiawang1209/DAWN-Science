import Database from 'better-sqlite3'
import { migrate } from '../../src/store/schema.js'
import { RunStore } from '../../src/store/runs.js'
import { RunRecorder } from '../../src/project/run-recorder.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeRuntime } from '../../src/runtime/native.js'
import { MCP池 } from '../../src/mcp/客户端.js'
// @ts-expect-error -- shared .mjs fixture has no type declaration
import { startMockInferenceServer, mockModelsJson } from '../../scripts/mock-inference-server.mjs'
import type { AgentEvent } from '../../src/runtime/types.js'
let server:Awaited<ReturnType<typeof startMockInferenceServer>>;let dir:string;let modelsPath:string
beforeAll(async()=>{server=await startMockInferenceServer({port:0});dir=mkdtempSync(join(tmpdir(),'dawn-route-chain-'));modelsPath=join(dir,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))})
afterAll(async()=>{await server?.close();rmSync(dir,{recursive:true,force:true})})
describe('analysis route shared mock over real pi/tools',()=>{
 it('builds via actual tools, reads/searches without execution and delivers a generated-only report', {timeout:60000},async()=>{
  const pool=new MCP池({取密:()=>undefined});const config={command:process.execPath,args:[join(process.cwd(),'scripts/mcp-test-server.mjs')]};const listed=await pool.备好('mlai-science',config)
  const rt=new NativeRuntime({modelsPath,checkpoints:false,mcp:{池:pool,取工具:async()=>({工具:listed.工具,名单:[{名:'mlai-science',服务器:config}],问题:[]})}})
  const workspace=join(dir,'workspace');mkdirSync(workspace);const sessionDir=join(dir,'session');const events:AgentEvent[]=[]
  const db=new Database(':memory:');migrate(db)
  db.prepare('INSERT INTO projects (id,name,workspace,created_at) VALUES (?,?,?,?)').run('route-project','Route',workspace,new Date().toISOString())
  const runs=new RunStore(db);const recorder=new RunRecorder({runs,projectOf:id=>id==='r'?'route-project':undefined})
  rt.attach('r',e=>{events.push(e);recorder.ingest(e)})
  await rt.start({sessionId:'r',workspace,sessionDir,native:{provider:'deepseek',model:'deepseek-flash'}})
  const say=async(text:string)=>{recorder.beginTurn('r');rt.write('r',text);await rt.waitForIdle('r')}
  try{
   await say('演示分析路线')
   const first=rt.getAnalysisRoute('r',sessionDir).route!
   expect(first.steps).toHaveLength(3);expect(first.steps[0]!.cases).toMatchObject([{server:'mlai-science',caseId:'20251017-e2e-alpha-diversity'}])
   expect(runs.artifactsOf('r')).toEqual({artifacts:[],unknown:[]})
   const checkpoint=events.length
   await say(rt.actOnAnalysisRoute('r',{routeId:first.routeId,expectedRevision:first.revision,stepId:'S1',action:'view'}).message!)
   expect(events.slice(checkpoint).filter(e=>e.kind==='tool_start').map(e=>e.toolName)).toEqual(['get_analysis_route'])
   let route=rt.getAnalysisRoute('r',sessionDir).route!
   await say(rt.actOnAnalysisRoute('r',{routeId:route.routeId,expectedRevision:route.revision,stepId:'S1',action:'search'}).message!)
   expect(existsSync(join(workspace,'results/reports/analysis-route-S1.md'))).toBe(false)
   route=rt.getAnalysisRoute('r',sessionDir).route!
   await say(rt.actOnAnalysisRoute('r',{routeId:route.routeId,expectedRevision:route.revision,stepId:'S1',action:'continue'}).message!)
   const final=rt.getAnalysisRoute('r',sessionDir,true)
   expect(final.route!.steps[0]).toMatchObject({status:'delivered',execution:{state:'not_run'},verification:{state:'unreviewed'},deliverables:[{path:'results/reports/analysis-route-S1.md'}]})
   expect(final.evidence?.deliverables).toContainEqual({stepId:'S1',path:'results/reports/analysis-route-S1.md',state:'observed'})
   expect(readFileSync(join(workspace,'results/reports/analysis-route-S1.md'),'utf8')).toContain('未运行')
   expect(events.filter(e=>e.kind==='tool_start').some(e=>e.toolName==='run_code'||e.toolName==='bash')).toBe(false)
   const metadataCalls=events.filter((e):e is Extract<AgentEvent,{kind:'tool_start'}>=>e.kind==='tool_start'&&(e.toolName==='get_analysis_route'||e.toolName==='update_analysis_route'))
   expect(metadataCalls.length).toBeGreaterThan(0)
   for(const call of metadataCalls) expect(events).toContainEqual({kind:'tool_files',sessionId:'r',toolCallId:call.toolCallId,filesWritten:[],filesRead:[],filesCreated:[],mayIncludeUserEdits:false})
   const artifacts=runs.artifactsOf('r')
   expect(artifacts.unknown).toEqual([])
   expect(artifacts.artifacts.map(file=>file.path)).toEqual(['results/reports/analysis-route-S1.md'])
   await rt.stop('r')
   const recovered=new NativeRuntime({modelsPath,checkpoints:false});try{
    await recovered.start({sessionId:'r',workspace,sessionDir,resume:true,native:{provider:'deepseek',model:'deepseek-flash'}})
    const restored=recovered.getAnalysisRoute('r',sessionDir,true)
    expect(restored.route).toEqual(final.route)
    expect(restored.evidence?.deliverables).toContainEqual({stepId:'S1',path:'results/reports/analysis-route-S1.md',state:'observed'})
   }finally{await recovered.stop('r')}
  }finally{await rt.stop('r');await pool.全关();db.close()}
 })
 it.each(['view','search','continue'] as const)('rejects %s at real pi followUp admission when another turn started first', {timeout:30000},async action=>{
  const id='queued-'+action;const workspace=join(dir,id);mkdirSync(workspace);const sessionDir=join(dir,id+'-session')
  const rt=new NativeRuntime({modelsPath,checkpoints:false});const events:AgentEvent[]=[];rt.attach(id,event=>events.push(event))
  await rt.start({sessionId:id,workspace,sessionDir,native:{provider:'deepseek',model:'deepseek-flash'}})
  try{
   rt.write(id,'演示分析路线');await rt.waitForIdle(id)
   const route=rt.getAnalysisRoute(id,sessionDir).route!
   const pending=rt.actOnAnalysisRoute(id,{routeId:route.routeId,expectedRevision:route.revision,stepId:'S1',action}).message!
   rt.write(id,'慢慢跑')
   await vi.waitFor(()=>expect(events.some(e=>e.kind==='tool_start'&&e.toolName==='bash')).toBe(true),{timeout:5000})
   expect(()=>rt.write(id,pending,'followUp','stale-route-action')).toThrow(/会话正在运行/)
   expect(events.some(e=>e.kind==='queue_delivered'&&e.id==='stale-route-action')).toBe(false)
   const state=(rt as unknown as {sessions:Map<string,{待发:{文:string}[]}>}).sessions.get(id)!
   expect(state.待发.some(item=>item.文===pending)).toBe(false)
  }finally{await rt.abort(id);await rt.waitForIdle(id);await rt.stop(id)}
 })

})
