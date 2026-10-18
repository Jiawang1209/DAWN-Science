import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
  const workspace=join(dir,'workspace');mkdirSync(workspace);const sessionDir=join(dir,'session');const events:AgentEvent[]=[];rt.attach('r',e=>events.push(e))
  await rt.start({sessionId:'r',workspace,sessionDir,native:{provider:'deepseek',model:'deepseek-flash'}})
  const say=async(text:string)=>{rt.write('r',text);await rt.waitForIdle('r')}
  try{
   await say('演示分析路线')
   const first=rt.getAnalysisRoute('r',sessionDir).route!
   expect(first.steps).toHaveLength(3);expect(first.steps[0]!.cases).toMatchObject([{server:'mlai-science',caseId:'20251017-e2e-alpha-diversity'}])
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
   await rt.stop('r')
   const recovered=new NativeRuntime({modelsPath,checkpoints:false});try{
    await recovered.start({sessionId:'r',workspace,sessionDir,resume:true,native:{provider:'deepseek',model:'deepseek-flash'}})
    const restored=recovered.getAnalysisRoute('r',sessionDir,true)
    expect(restored.route).toEqual(final.route)
    expect(restored.evidence?.deliverables).toContainEqual({stepId:'S1',path:'results/reports/analysis-route-S1.md',state:'observed'})
   }finally{await recovered.stop('r')}
  }finally{await rt.stop('r');await pool.全关()}
 })
})
