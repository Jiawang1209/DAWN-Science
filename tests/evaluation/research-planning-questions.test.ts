import {expect,it} from 'vitest'
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {runResearchEvaluation} from '../../scripts/evaluate-research.js'
import {researchTasks} from '../../src/evaluation/research-tasks.js'
// @ts-expect-error shared mock service
import {startMockInferenceServer,mockModelsJson} from '../../scripts/mock-inference-server.mjs'
// @ts-expect-error shared scientific scenario
import {researchScenario} from '../../scripts/mock-research.mjs'
it('records actual planning questions as awaiting-info without running or counting a successful block',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-plan-questions-')),tasks=researchTasks(),base=researchScenario(tasks)
 const server=await startMockInferenceServer({scenario:{...base,toolCall(body:{tools?:{function?:{name:string}}[]}){
  const call=base.toolCall(body);if(call?.toolName==='propose_plan')call.args.arrangement.questions=['输入单位是什么？'];return call

 }}})
 try{
  const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const report=await runResearchEvaluation(join(root,'out'),{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline',kind:'fixture',requestLimit:50,requests:()=>server.requests.length,multiExecution:'automatic-plan'},{taskIds:['unknown-unit'],repeats:1,perArmLimit:25})
  const row=report.rows.find(r=>r.mode==='multi')!
  expect(row).toMatchObject({terminal:'awaiting-info',success:false,falseAcceptance:false,arrangement:{valid:false,questions:['输入单位是什么？'],compiled:false}})
  expect(row.versions).toEqual([]);expect(report.delivery.multi.correctBlocks).toBe(0);expect(report.qualifiedPairs).toBe(0)
  expect(readFileSync(join(root,'out/research.md'),'utf8')).toContain('awaiting-info')
  const multiDirectory=readdirSync(join(root,'out')).find(name=>name.startsWith('unknown-unit-multi-'))
  expect(multiDirectory).toBeTruthy()
  const multiRoot=join(root,'out',multiDirectory!)
  expect(existsSync(join(multiRoot,'planner/proposed-plan.json'))).toBe(true)
  expect(existsSync(join(multiRoot,'approved-plan.json'))).toBe(false)
  expect(existsSync(join(multiRoot,'results/result.json'))).toBe(false)
 }finally{await server.close();rmSync(root,{recursive:true,force:true})}
},30000)
