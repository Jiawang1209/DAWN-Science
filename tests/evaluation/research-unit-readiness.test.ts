import {expect,it} from 'vitest'
import {mkdtempSync,writeFileSync,readFileSync,rmSync,readdirSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {runResearchEvaluation} from '../../scripts/evaluate-research.js'
import {researchTasks} from '../../src/evaluation/research-tasks.js'
// @ts-expect-error shared local fixture
import {startMockInferenceServer,mockModelsJson} from '../../scripts/mock-inference-server.mjs'
// @ts-expect-error shared local fixture
import {researchScenario} from '../../scripts/mock-research.mjs'
it('uses explicit missing-unit readiness in the product pilot; no single child and no result files in either arm',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-unit-')),server=await startMockInferenceServer({scenario:researchScenario(researchTasks())})
 try{
  const modelsPath=join(root,'models.json'),out=join(root,'out');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const report=await runResearchEvaluation(out,{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline',kind:'fixture',requestLimit:50,requests:()=>server.requests.length,multiExecution:'automatic-plan'},{taskIds:['unknown-unit'],perArmLimit:25})
  expect(report.rows.find(r=>r.mode==='single')).toMatchObject({terminal:'awaiting-info',requests:0,success:false,readiness:{missing:['units'],executionStarted:false}})
  expect(report.rows.find(r=>r.mode==='multi')).toMatchObject({terminal:'awaiting-info',success:false,arrangement:{catalogSource:'confirmed-product'},readiness:{missing:['units'],executionStarted:false}})
  for(const name of readdirSync(out).filter(n=>n.startsWith('unknown-unit-'))){for(const path of ['results/result.json','results/analysis.py','results/report.md'])expect(existsSync(join(out,name,path))).toBe(false)}
  expect(report.delivery.single.correctBlocks).toBe(0);expect(report.delivery.multi.correctBlocks).toBe(0)
  expect(readFileSync(join(out,'research.md'),'utf8')).toContain('awaiting-info')
 }finally{await server.close();rmSync(root,{recursive:true,force:true})}
},30000)
