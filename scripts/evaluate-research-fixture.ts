/** Reproducible automatic-plan paired evaluation using only localhost inference and synthetic CSV. */
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {researchBatchAllocation,type ResearchBatch} from '../src/evaluation/research-batch.js'
import {researchTasks} from '../src/evaluation/research-tasks.js'
import {researchStageLimits} from '../src/evaluation/research-budget.js'
import {runResearchEvaluation} from './evaluate-research.js'
import {startEvaluationGate} from './evaluation-request-gate.js'
import {researchBudgetTrial,RESEARCH_STAGE_PROVIDERS} from './research-trial-budget.js'
// @ts-expect-error shared localhost model fixture
import {startMockInferenceServer,mockModelsJson} from './mock-inference-server.mjs'
// @ts-expect-error shared deterministic scientific fixture
import {researchScenario} from './mock-research.mjs'
export async function runResearchFixtureEvaluation(output:string,options?:ResearchBatch,signal?:AbortSignal){
 if(['research.json','research.md','research-manifest.json','request-gate.json'].some(name=>existsSync(join(output,name))))throw new Error('本地评测结果已存在，不覆盖旧证据')
 const batch=researchBatchAllocation(options??{taskIds:researchTasks().map(t=>t.id),repeats:1,perArmLimit:25},300)
 const scratch=mkdtempSync(join(tmpdir(),'dawn-research-fixture-'))
 let ownedServer:Awaited<ReturnType<typeof startMockInferenceServer>>|undefined,gate:Awaited<ReturnType<typeof startEvaluationGate>>|undefined
 try{
  const server=await startMockInferenceServer({scenario:researchScenario(researchTasks())});ownedServer=server
  gate=await startEvaluationGate({limit:300,forward:(body,path,signal)=>fetch(server.url+path,{method:'POST',headers:{'content-type':'application/json'},body:new Uint8Array(body),signal})})
  const quota=gate,modelsPath=join(scratch,'models.json'),config=mockModelsJson(quota.url)
  for(const alias of Object.values(RESEARCH_STAGE_PROVIDERS))config.providers[alias]=structuredClone(config.providers.deepseek)
  writeFileSync(modelsPath,JSON.stringify(config))
  const work={provider:RESEARCH_STAGE_PROVIDERS.work,model:'deepseek-flash'},review={provider:RESEARCH_STAGE_PROVIDERS.review,model:'deepseek-flash'}
  const report=await runResearchEvaluation(output,{requestLimit:300,provider:'deepseek',model:'deepseek-flash',modelsPath,credential:quota.token,kind:'fixture',requests:()=>quota.stats().forwarded,multiExecution:'automatic-plan',multiStageLimits:researchStageLimits(batch.perArmLimit),multiStageModels:{check:work,analyze:work,review},requestBudgetFeedback:'partition-live-v1',beginTrial:(limit,mode)=>researchBudgetTrial(quota.partition(limit),mode,'deepseek-flash'),...(signal?{signal}:{})},batch)
  if(!Array.isArray(report.rows)||report.rows.length!==batch.taskIds.length*batch.repeats*2)throw new Error('本地科研评测未通过；报告结构不完整，保留原始证据')
  const known=researchTasks().filter(t=>batch.taskIds.includes(t.id)&&t.expected).length*batch.repeats
  const unknown=report.rows.filter(r=>!researchTasks().find(t=>t.id===r.caseId)!.expected)
  const unknownReady=unknown.every(r=>r.terminal==='awaiting-info'&&r.readiness?.missing[0]==='units'&&r.readiness.executionStarted===false&&r.versions.length===0)
  const noUnknownResults=readdirSync(output).filter(n=>n.startsWith('unknown-unit-')).every(n=>['analysis.py','result.json','report.md'].every(file=>!existsSync(join(output,n,'results',file))))
  if(report.qualifiedPairs!==known||!unknownReady||!noUnknownResults)throw new Error('本地科研评测未通过；保留原始报告，不覆盖或重跑')
  return report
 }finally{
  try{await gate?.close();if(gate){mkdirSync(output,{recursive:true});writeFileSync(join(output,'request-gate.json'),JSON.stringify(gate.stats(),null,2)+'\n',{flag:'wx'})}}
  finally{try{await ownedServer?.close()}finally{rmSync(scratch,{recursive:true,force:true})}}
 }
}
/** CLI signals cancel the owning batch and await its existing drain before exiting. */
export async function runResearchFixtureCommand(output:string){
 const controller=new AbortController(),cancel=()=>controller.abort()
 process.on('SIGINT',cancel);process.on('SIGTERM',cancel)
 try{return await runResearchFixtureEvaluation(output,undefined,controller.signal)}
 finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel)}
}
// Preserve the original direct command; importing this module never starts a batch.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 void (async()=>{
  const target=process.argv[2]
  if(!target||process.argv.length!==3)throw new Error('需要显式指定评测输出目录：evaluate-research-fixture.ts OUTPUT')
  const out=resolve(target);mkdirSync(out,{recursive:true})
  const evidence=mkdtempSync(join(out,'research-fixture-'))
  await runResearchFixtureCommand(evidence)
  console.log(join(evidence,'research.md'))
 })().catch(error=>{console.error(error);process.exitCode=1})
}
