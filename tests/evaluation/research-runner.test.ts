import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,writeFileSync,readFileSync,rmSync,readdirSync,existsSync} from 'node:fs'
import {SettingsManager} from '@earendil-works/pi-coding-agent'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {researchTasks} from '../../src/evaluation/research-tasks.js'
import {runResearchEvaluation} from '../../scripts/evaluate-research.js'
// @ts-expect-error shared deterministic inference
import {startMockInferenceServer,mockModelsJson} from '../../scripts/mock-inference-server.mjs'
// @ts-expect-error shared deterministic inference
import {researchScenario} from '../../scripts/mock-research.mjs'
const roots:string[]=[]
const trialPolicy={retry:{enabled:false,maxRetries:0,provider:{maxRetries:0}},compaction:{enabled:false},cacheWarming:'off'}
afterEach(()=>{for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true})})
it('pins both arms to no automatic retries and sends each failed child scope to a localhost 500 provider once',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-no-retry-'));roots.push(root)
 const server=await startMockInferenceServer({failStatus:500})
 try{
  const modelsPath=join(root,'models.json'),out=join(root,'results');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const report=await runResearchEvaluation(out,{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline-mock',kind:'fixture',requests:()=>server.requests.length},{taskIds:['carbon-missing'],perArmLimit:15})
  expect(report.rows.map(r=>[r.mode,r.terminal,r.requests])).toEqual([['single','failed',1],['multi','failed',1]])
  expect(server.requests).toHaveLength(2)
  for(const arm of report.rows){
   const trial=join(out,readdirSync(out).find(p=>p.startsWith(`carbon-missing-${arm.mode}-`))!)
   expect(JSON.parse(readFileSync(join(trial,'.pi/settings.json'),'utf8'))).toEqual(trialPolicy)
   const globals=readdirSync(trial,{recursive:true}).map(String).filter(p=>p.endsWith('/settings.json')&&!p.startsWith('.pi/'))
   expect(globals).toHaveLength(arm.mode==='single'?1:3)
   for(const path of globals){
    const settings=SettingsManager.create(trial,join(trial,path.slice(0,-'/settings.json'.length)))
    expect(settings.getRetrySettings()).toMatchObject({enabled:false,maxRetries:0})
    expect(settings.getProviderRetrySettings().maxRetries).toBe(0)
    expect(settings.getCompactionEnabled()).toBe(false)
    expect(settings.getCacheWarmingMode()).toBe('off')
   }
  }
  const manifest=JSON.parse(readFileSync(join(out,'research-manifest.json'),'utf8'))
  expect(manifest.execution.trialSettings).toEqual({project:trialPolicy,agent:trialPolicy})
  expect(report.comparisonEligible).toBe(true)
 }finally{await server.close()}
},60000)

it('invalidates settings drift and stops later arms while retaining the scientific acceptance of the completed arm',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-settings-drift-'));roots.push(root)
 const out=join(root,'results'),scenario=researchScenario(researchTasks());let changed=false
 const server=await startMockInferenceServer({scenario:{...scenario,toolCall:(body:unknown)=>{
  if(!changed){
   changed=true
   const trial=join(out,readdirSync(out).find(p=>p.startsWith('carbon-missing-single-'))!),path=join(trial,'.pi/settings.json')
   if(existsSync(path))writeFileSync(path,JSON.stringify({...JSON.parse(readFileSync(path,'utf8')),drift:true}))
  }
  return scenario.toolCall(body)
 }}})
 try{
  const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const report=await runResearchEvaluation(out,{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline-mock',kind:'fixture',requests:()=>server.requests.length},{taskIds:['carbon-missing']})
  expect(report.rows[0]).toMatchObject({terminal:'accepted',success:true})
  expect(report.comparisonEligible).toBe(false)
  expect(report.integrity.changed).toContain('trial-settings')
  expect(report.rows[1]!.terminal).toBe('not-run')
  expect(report.qualifiedPairs).toBe(0)
 }finally{await server.close()}
},30000)
it('runs paired scientific tasks through actual Pi, files, host acceptance and the existing Team pipeline',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-test-'));roots.push(root)
 const server=await startMockInferenceServer({scenario:researchScenario(researchTasks())})
 try{
  const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const report=await runResearchEvaluation(join(root,'results'),{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline-mock',kind:'fixture',requests:()=>server.requests.length},{repeats:2})
  expect(report.version).toBe(2)
  expect('submissionDiagnostics' in report).toBe(false) // observations belong to each trial
  expect(report.rows.every(r=>r.submissionDiagnostics?.complete),JSON.stringify(report.rows)).toBe(true)
  expect(report.rows.every(r=>r.submissionDiagnostics?.sdkRejected===0&&r.submissionDiagnostics?.outputLimitNotExecuted===0)).toBe(true)
  const manifest=JSON.parse(readFileSync(join(root,'results/research-manifest.json'),'utf8'))
  expect(manifest.runId).toBe(report.runId)
  expect(manifest.fingerprint).toBe(report.manifestFingerprint)
  expect(manifest.arms).toHaveLength(16)
  expect(report.comparisonEligible).toBe(true)
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
  expect(report.rows[0]!.submissionDiagnostics?.complete).toBe(false)
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
  const multiStageModels={check:{provider:RESEARCH_STAGE_PROVIDERS.work,model:'deepseek-flash'},analyze:{provider:RESEARCH_STAGE_PROVIDERS.work,model:'deepseek-flash'},review:{provider:RESEARCH_STAGE_PROVIDERS.review,model:'deepseek-flash'}}
  const report=await runResearchEvaluation(join(root,'results'),{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:gate.token,kind:'fixture',requests:()=>gate.stats().forwarded,multiStageLimits:{work:11,review:4},multiStageModels,beginTrial:(limit,mode)=>researchBudgetTrial(gate.partition(limit),mode,'deepseek-flash')},{taskIds:['carbon-missing'],perArmLimit:15})
  expect(report.qualifiedPairs).toBe(1)
  const multi=report.rows.find(r=>r.mode==='multi')!
  expect(multi.stageRequestBudgets).toMatchObject({work:{limit:11,forwarded:6},review:{limit:4,forwarded:4}})
  expect(gate.stats().forwarded).toBe(14)
  expect(gate.stats().inFlight).toBe(0)
 }finally{await gate.close();await server.close()}
},30000)

it('refuses a reused output directory before inference so an old experiment is never overwritten',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-manifest-exclusive-'));roots.push(root)
 const path=join(root,'research.json');writeFileSync(path,'original report')
 await expect(runResearchEvaluation(root,{provider:'deepseek',model:'deepseek-flash',modelsPath:join(root,'absent.json'),credential:'offline',kind:'fixture',requests:()=>0})).rejects.toThrow(/existing|已存在|覆盖/)
 expect(readFileSync(path,'utf8')).toBe('original report')
})
it('rejects a staged model declaration with a different effective setting before any inference',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-alias-drift-'));roots.push(root)
 const config=mockModelsJson('http://127.0.0.1:1')
 config.providers.review=structuredClone(config.providers.deepseek)
 config.providers.review.models[0].maxTokens=1024
 const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(config));let begun=0
 await expect(runResearchEvaluation(join(root,'results'),{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline',kind:'fixture',requests:()=>0,multiStageLimits:{work:11,review:4},multiStageModels:{check:{provider:'deepseek',model:'deepseek-flash'},analyze:{provider:'deepseek',model:'deepseek-flash'},review:{provider:'review',model:'deepseek-flash'}},beginTrial:()=>{begun++;throw new Error('inference must not start')}},{taskIds:['carbon-missing'],perArmLimit:15})).rejects.toThrow(/阶段.*(?:模型|配置)/)
 expect(begun).toBe(0)
})
it('samples final request counters after asynchronous lease cleanup, including cancelled arms',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-final-counters-'));roots.push(root)
 const controller=new AbortController(),scenario=researchScenario(researchTasks());let closed=false,closeCalls=0
 const server=await startMockInferenceServer({scenario:{...scenario,toolCall:(body:unknown)=>{controller.abort();return scenario.toolCall(body)}}})
 try{
  const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const report=await runResearchEvaluation(join(root,'results'),{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline',kind:'fixture',signal:controller.signal,requests:()=>server.requests.length,beginTrial:()=>({credential:'offline',requests:()=>server.requests.length,stats:()=>({limit:15,forwarded:server.requests.length,reserved:server.requests.length,denied:0,inFlight:closed?0:1}),close:async()=>{closeCalls++;await new Promise(r=>setTimeout(r,20));closed=true}})},{taskIds:['carbon-missing'],perArmLimit:15})
  expect(report.rows[0]?.terminal).toBe('cancelled')
  expect(report.rows[0]?.requestBudget?.inFlight).toBe(0)
  expect(closeCalls).toBe(1)
 }finally{await server.close()}
},30000)
it('invalidates a comparison if its declared model config changes during a trial and never starts the next arm',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-config-drift-'));roots.push(root)
 const scenario=researchScenario(researchTasks()),modelsPath=join(root,'models.json');let changed=false
 const server=await startMockInferenceServer({scenario:{...scenario,toolCall:(body:unknown)=>{
  if(!changed){changed=true;const config=JSON.parse(readFileSync(modelsPath,'utf8'));config.providers.deepseek.models[0].name='changed';writeFileSync(modelsPath,JSON.stringify(config))}
  return scenario.toolCall(body)
 }}})
 try{
  writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const report=await runResearchEvaluation(join(root,'results'),{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline',kind:'fixture',requests:()=>server.requests.length},{taskIds:['carbon-missing']})
  expect(report.comparisonEligible).toBe(false)
  expect(report.integrity.changed).toContain('model-config')
  expect(report.rows[1]!.terminal).toBe('not-run')
  expect(report.qualifiedPairs).toBe(0)
 }finally{await server.close()}
},30000)
