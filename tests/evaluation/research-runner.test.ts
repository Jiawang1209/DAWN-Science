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
 const server=await startMockInferenceServer({scenario:researchScenario(researchTasks())})
 try{
  const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const report=await runResearchEvaluation(join(root,'results'),{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline-mock',kind:'fixture',requests:()=>server.requests.length},{repeats:2})
  expect(report.completePairs,JSON.stringify(report.rows)).toBe(8)
  expect(report.rows.filter(r=>r.repeat===2)).toHaveLength(8)
  expect(report.qualifiedPairs).toBe(8)
  expect(report.delivery.single).toMatchObject({qualifiedDeliveries:6,correctBlocks:2,falseAcceptances:0})
  expect(report.delivery.multi).toMatchObject({qualifiedDeliveries:6,correctBlocks:2,falseAcceptances:0})
  expect(report.requestLimit).toBeNull()
  expect(report.requestAllocation.enforced).toBe(false)
  expect(report.rows.every(r=>r.success),JSON.stringify(report.rows)).toBe(true)
  expect(report.rows.every(r=>!r.falseAcceptance&&r.inputPreserved)).toBe(true)
  expect(report.rows.filter(r=>r.terminal==='accepted').every(r=>r.versions.length===3)).toBe(true)
 }finally{await server.close()}
},60000)
it('records cancellation during a live single child as cancelled, not a failed scientific result',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-cancel-'));roots.push(root)
 const controller=new AbortController(),scenario=researchScenario(researchTasks())
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
 const controller=new AbortController(),scenario=researchScenario(researchTasks())
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
it('runs a full paired task with staged credentials and leaves a hard review reserve under the same arm cap',async()=>{
 const {startEvaluationGate}=await import('../../scripts/evaluation-request-gate.js')
 const {researchBudgetTrial,RESEARCH_STAGE_PROVIDERS}=await import('../../scripts/research-trial-budget.js')
 const root=mkdtempSync(join(tmpdir(),'dawn-research-reserve-'));roots.push(root)
 const server=await startMockInferenceServer({scenario:researchScenario(researchTasks())})
 const gate=await startEvaluationGate({limit:30,forward:async(body,path,signal)=>fetch(server.url+path,{method:'POST',headers:{authorization:'Bearer offline-mock','content-type':'application/json'},body:new Uint8Array(body),signal})})
 try{
  const config=mockModelsJson(gate.url)
  for(const alias of Object.values(RESEARCH_STAGE_PROVIDERS))config.providers[alias]=structuredClone(config.providers.deepseek)
  const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(config))
  const report=await runResearchEvaluation(join(root,'results'),{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:gate.token,kind:'fixture',requests:()=>gate.stats().forwarded,beginTrial:(limit,mode)=>researchBudgetTrial(gate.partition(limit),mode,'deepseek-flash')},{taskIds:['carbon-missing'],perArmLimit:15})
  expect(report.qualifiedPairs).toBe(1)
  const multi=report.rows.find(r=>r.mode==='multi')!
  expect(multi.stageRequestBudgets).toMatchObject({work:{limit:11,forwarded:6},review:{limit:4,forwarded:4}})
  expect(gate.stats().forwarded).toBe(14)
  expect(gate.stats().inFlight).toBe(0)
 }finally{await gate.close();await server.close()}
},30000)
