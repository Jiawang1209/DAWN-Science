/** Retained deterministic evidence only; never reads credentials or calls a remote model. */
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,rmSync,readdirSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {runResearchFixtureEvaluation} from '../../../scripts/evaluate-research-fixture.js'
import {runResearchEvaluation} from '../../../scripts/evaluate-research.js'
import {researchTasks} from '../../../src/evaluation/research-tasks.js'
// @ts-expect-error shared fixture
import {startMockInferenceServer,mockModelsJson} from '../../../scripts/mock-inference-server.mjs'
// @ts-expect-error shared fixture
import {researchScenario} from '../../../scripts/mock-research.mjs'
const evidence=join(fileURLToPath(new URL('.',import.meta.url)),'a-baseline')
const complete=await runResearchFixtureEvaluation(join(evidence,'fixture-final'))
assert.equal(complete.qualifiedPairs,6)
const scratch=mkdtempSync(join(tmpdir(),'dawn-guidance-preview-')),base=researchScenario(researchTasks())
const server=await startMockInferenceServer({scenario:{...base,toolCall(body:{tools?:{function?:{name:string}}[]}){
 if(body.tools?.some(t=>t.function?.name==='propose_plan'))return{toolName:'propose_plan',args:{title:'确认单位',plan:'## 问题与假设\n等待单位\n## 数据与切分\ninput.csv\n## 统计检验与模型\n待确认\n## 图\n无\n## 产物\n无',arrangement:{mode:'single',rationale:'缺少单位时等待补充',independentReview:false,questions:['输入单位是什么？'],tasks:[{id:'inspect',title:'确认单位',goal:'不猜单位',role:'核查',inputs:['input.csv'],outputs:[],dependencies:[],acceptance:'单位已确认',review:false}]}}}
 return base.toolCall(body)
}}})
try{
 const modelsPath=join(scratch,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
 const output=join(evidence,'awaiting-info-evaluation')
 const report=await runResearchEvaluation(output,{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline',kind:'fixture',requestLimit:50,requests:()=>server.requests.length,multiExecution:'automatic-plan'},{taskIds:['unknown-unit'],repeats:1,perArmLimit:25})
 const row=report.rows.find(r=>r.mode==='multi')!,multiRoot=join(output,readdirSync(output).find(name=>name.startsWith('unknown-unit-multi-'))!)
 assert.equal(row.terminal,'awaiting-info');assert.equal(row.success,false);assert.equal(report.delivery.multi.correctBlocks,0)
 assert.equal(existsSync(join(multiRoot,'approved-plan.json')),false);assert.equal(existsSync(join(multiRoot,'results/result.json')),false)
 const summary={inference:'localhost fixture',paidModelRequests:0,complete:{qualifiedPairs:complete.qualifiedPairs,completePairs:complete.completePairs},clarification:{terminal:row.terminal,questions:row.arrangement?.questions,successfulDelivery:row.success,correctBlocks:report.delivery.multi.correctBlocks,executionStarted:false}}
 writeFileSync(join(evidence,'final-evaluation-observation.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'})
 console.log(JSON.stringify(summary,null,2))
}finally{await server.close();rmSync(scratch,{recursive:true,force:true})}
