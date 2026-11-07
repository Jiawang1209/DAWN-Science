/** Offline demo: real Pi and workspace files, local deterministic responses. */
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {researchTasks} from '../src/evaluation/research-tasks.js'
import {runResearchEvaluation} from './evaluate-research.js'
// @ts-expect-error shared localhost inference fixture
import {startMockInferenceServer,mockModelsJson} from './mock-inference-server.mjs'
// @ts-expect-error deterministic task scenarios
import {researchScenario} from './mock-research.mjs'
async function main(){
 const target=process.argv[2]
 if(!target)throw new Error('需要显式指定评测输出目录')
 const out=resolve(target);mkdirSync(out,{recursive:true})
 const evidence=mkdtempSync(join(out,'research-fixture-')),scratch=mkdtempSync(join(tmpdir(),'dawn-research-fixture-'))
 try{
  const server=await startMockInferenceServer({scenario:researchScenario(researchTasks())})
  try{
   const modelsPath=join(scratch,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
   const report=await runResearchEvaluation(evidence,{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline-mock',kind:'fixture',requests:()=>server.requests.length})
   console.log(join(evidence,'research.md'))
   if(report.qualifiedPairs!==researchTasks().length)process.exitCode=1
  }finally{await server.close()}
 }finally{rmSync(scratch,{recursive:true,force:true})}
}
void main().catch(error=>{console.error(error);process.exitCode=1})
