import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {researchTasks} from '../../src/evaluation/research-tasks.js'
import {runResearchEvaluation} from '../../scripts/evaluate-research.js'
// @ts-expect-error shared deterministic inference
import {startMockInferenceServer,mockModelsJson} from '../../scripts/mock-inference-server.mjs'
// @ts-expect-error shared deterministic inference
import {researchScenario} from '../../scripts/mock-research.mjs'
const roots:string[]=[]
afterEach(()=>{for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true})})
it('runs paired scientific tasks through actual Pi, files, host acceptance and the existing Team pipeline',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-test-'));roots.push(root)
 const server=await startMockInferenceServer({scenario:researchScenario(researchTasks()[0]!.expected)})
 try{
  const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const report=await runResearchEvaluation(join(root,'results'),{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline-mock',kind:'fixture',requests:()=>server.requests.length},{repeats:2})
  expect(report.completePairs,JSON.stringify(report.rows)).toBe(4)
  expect(report.rows.filter(r=>r.repeat===2)).toHaveLength(4)
  expect(report.requestLimit).toBeNull()
  expect(report.requestAllocation.enforced).toBe(false)
  expect(report.rows.every(r=>r.success),JSON.stringify(report.rows)).toBe(true)
  expect(report.rows.every(r=>!r.falseAcceptance&&r.inputPreserved)).toBe(true)
  expect(report.rows.filter(r=>r.terminal==='accepted').every(r=>r.versions.length===3)).toBe(true)
 }finally{await server.close()}
},60000)
it('records cancellation during a live single child as cancelled, not a failed scientific result',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-cancel-'));roots.push(root)
 const controller=new AbortController(),scenario=researchScenario(researchTasks()[0]!.expected)
 const server=await startMockInferenceServer({scenario:{...scenario,toolCall:(body:unknown)=>{controller.abort();return scenario.toolCall(body)}}})
 try{
  const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const report=await runResearchEvaluation(join(root,'results'),{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline-mock',kind:'fixture',requests:()=>server.requests.length,signal:controller.signal})
  expect(report.rows[0]!.terminal).toBe('cancelled')
  expect(report.rows.slice(1).every(r=>r.terminal==='not-run')).toBe(true)
 }finally{await server.close()}
},30000)
it('retains settled check-stage usage when the analysis stage is cancelled and drained',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-team-cancel-'));roots.push(root)
 const controller=new AbortController(),scenario=researchScenario(researchTasks()[0]!.expected)
 const server=await startMockInferenceServer({scenario:{...scenario,toolCall:(body:unknown)=>{
  if(JSON.stringify(body).includes('阶段 analyze'))controller.abort()
  return scenario.toolCall(body)
 }}})
 try{
  const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const report=await runResearchEvaluation(join(root,'results'),{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline-mock',kind:'fixture',requests:()=>server.requests.length,signal:controller.signal})
  const multi=report.rows.find(r=>r.caseId==='carbon-missing'&&r.mode==='multi')!
  expect(multi.terminal).toBe('cancelled');expect(multi.usage.visibleTokens).toBeGreaterThan(0)
 }finally{await server.close()}
},30000)
