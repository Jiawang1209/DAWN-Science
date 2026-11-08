import {expect,it} from 'vitest'
import {startEvaluationGate} from '../../scripts/evaluation-request-gate.js'
import {researchBudgetTrial} from '../../scripts/research-trial-budget.js'
import {researchManifest,researchModelDeclaration} from '../../src/evaluation/research-manifest.js'
import {researchTasks} from '../../src/evaluation/research-tasks.js'
const input={runId:'300',generatedAt:'2026-11-08T00:00:00.000Z',inference:'live' as const,provider:'fixture',model:'fixture',modelDeclaration:researchModelDeclaration({},'fixture','fixture'),tasks:researchTasks().slice(0,1),repeats:1,perArmLimit:150,enforced:true,sourceFingerprint:'source',childBuildFingerprint:'child'}
it('caps 301 parallel arrivals at exactly 300 forwarded requests and drains all of them',async()=>{
 let received=0
 const gate=await startEvaluationGate({limit:300,forward:async()=>{received++;return new Response('ok')}})
 try{
  const results=await Promise.all(Array.from({length:301},()=>fetch(gate.url+'/chat/completions',{method:'POST',headers:{authorization:'Bearer '+gate.token},body:'{}'}).then(async r=>{await r.text();return r.status})))
  expect(results.filter(s=>s===200)).toHaveLength(300);expect(results.filter(s=>s===429)).toHaveLength(1)
  expect(received).toBe(300);expect(gate.stats()).toMatchObject({limit:300,reserved:300,forwarded:300,denied:1,inFlight:0})
 }finally{await gate.close()}
})
it('keeps work/planning110 and review40 isolated inside the 150-request multi arm',async()=>{
 const gate=await startEvaluationGate({limit:300,forward:async()=>new Response('ok')})
 try{
  const single=researchBudgetTrial(gate.partition(150),'single','fixture'),multi=researchBudgetTrial(gate.partition(150),'multi','fixture')
  expect(multi.stageStats!()).toMatchObject({work:{limit:110},review:{limit:40}})
  const call=(token:string)=>fetch(gate.url+'/chat/completions',{method:'POST',headers:{authorization:'Bearer '+token},body:'{"messages":[]}'}).then(async r=>{await r.text();return r.status})
  expect((await Promise.all(Array.from({length:111},()=>call(multi.stageRoutes!.analyze.credential)))).filter(s=>s===429)).toHaveLength(1)
  expect(multi.stageStats!()).toMatchObject({work:{forwarded:110,denied:1},review:{forwarded:0,reserved:0}})
  expect(multi.stageGuidance!('analyze',true)).toContain('110');expect(multi.stageGuidance!('review',true)).toContain('40')
  expect(await call(multi.stageRoutes!.review.credential)).toBe(200);expect(await call(single.credential)).toBe(200)
  await multi.close();expect(await call(multi.stageRoutes!.review.credential)).toBe(403)
  expect(single.stats!().forwarded).toBe(1)
 }finally{await gate.close()}
})
it('requires an explicit 300 limit in the frozen manifest and pins a 30-minute per-arm timeout',()=>{
 const manifest=researchManifest({...input,requestLimit:300,multiStageLimits:{work:110,review:40}})
 expect(manifest.requestAllocation).toMatchObject({totalLimit:300,perArmLimit:150,multiStageLimits:{work:110,review:40}})
 expect(manifest.execution.perArmTimeoutMs).toBe(1800000)
 expect(()=>researchManifest(input)).toThrow(/quota/)
 expect(()=>researchManifest({...input,requestLimit:301})).toThrow()
})
it('preserves default30 and15-arm semantics and rejects noninteger or excessive overrides',async()=>{
 const b=await import('../../src/evaluation/research-budget.js')
 expect(b.researchRequestLimit()).toBe(30);expect(b.researchRequestLimit(300)).toBe(300)
 for(const bad of [0,1,301,Infinity,NaN,1.5])expect(()=>b.researchRequestLimit(bad)).toThrow()
 expect(b.researchStageLimits(15)).toEqual({work:11,review:4});expect(b.researchStageLimits(150)).toEqual({work:110,review:40})
 expect(b.researchTrialTimeoutMs(15)).toBe(180000);expect(b.researchTrialTimeoutMs(150)).toBe(1800000)
 const manifest=researchManifest({...input,perArmLimit:15});expect(manifest.requestAllocation.totalLimit).toBe(30)
 await expect(startEvaluationGate({limit:301,forward:async()=>new Response('forbidden')})).rejects.toThrow()
})

it('freezes and executes both 150-request arms through the existing runner and real per-arm timeout',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path')
 const {vi}=await import('vitest'),{runResearchEvaluation}=await import('../../scripts/evaluate-research.js')
 // @ts-expect-error shared local inference fixture
 const {startMockInferenceServer,mockModelsJson}=await import('../../scripts/mock-inference-server.mjs')
 // @ts-expect-error shared local scientific fixture
 const {researchScenario}=await import('../../scripts/mock-research.mjs')
 const root=mkdtempSync(join(tmpdir(),'dawn-budget300-')),server=await startMockInferenceServer({scenario:researchScenario(researchTasks())})
 const timer=vi.spyOn(globalThis,'setTimeout')
 const gate=await startEvaluationGate({limit:300,forward:(body,path,signal)=>fetch(server.url+path,{method:'POST',headers:{authorization:'Bearer offline-mock','content-type':'application/json'},body:new Uint8Array(body),signal})})
 try{
  const modelsPath=join(root,'models.json'),config=mockModelsJson(gate.url)
  config.providers['dawn-evaluation-work']=structuredClone(config.providers.deepseek);config.providers['dawn-evaluation-review']=structuredClone(config.providers.deepseek)
  writeFileSync(modelsPath,JSON.stringify(config))
  const work={provider:'dawn-evaluation-work',model:'deepseek-flash'},review={provider:'dawn-evaluation-review',model:'deepseek-flash'}
  const out=join(root,'output'),report=await runResearchEvaluation(out,{requestLimit:300,provider:'deepseek',model:'deepseek-flash',modelsPath,credential:gate.token,kind:'fixture',requests:()=>gate.stats().forwarded,multiExecution:'approved-plan',multiStageLimits:{work:110,review:40},multiStageModels:{check:work,analyze:work,review},beginTrial:(limit,mode)=>researchBudgetTrial(gate.partition(limit),mode,'deepseek-flash')},{taskIds:['carbon-missing']})
  expect(report.qualifiedPairs).toBe(1);expect(report.requestAllocation.perArmLimit).toBe(150)
  const manifest=JSON.parse(readFileSync(join(out,'research-manifest.json'),'utf8'))
  expect(manifest.requestAllocation).toMatchObject({totalLimit:300,perArmLimit:150,multiStageLimits:{work:110,review:40}})
  expect(timer.mock.calls.filter(c=>c[1]===1800000&&typeof c[0]==='function'&&c[0].name==='abort')).toHaveLength(2)
  expect(report.rows.find(r=>r.mode==='multi')!.stageRequestBudgets).toMatchObject({work:{limit:110,inFlight:0},review:{limit:40,inFlight:0}})
  expect(gate.stats().forwarded).toBeLessThan(300)
 }finally{timer.mockRestore();await gate.close();await server.close();rmSync(root,{recursive:true,force:true})}
},30000)
it('rejects invalid explicit CLI caps before building a host or reading any credential',async()=>{
 const {runCurrentApiResearch}=await import('../../scripts/research-cli.js')
 await expect(runCurrentApiResearch(['out','private-profile','p','m','automatic-plan','301'])).rejects.toThrow(/2\.\.300/)
 await expect(runCurrentApiResearch(['out','private-profile','p','m','automatic-plan','300','extra'])).rejects.toThrow(/用法/)
})
