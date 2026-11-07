/** Reproducible offline route demonstration, never loads user credentials. Run from repo root with npx tsx. */
import {mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {runResearchEvaluation} from '../../../scripts/evaluate-research.js'
import {researchTasks} from '../../../src/evaluation/research-tasks.js'
// @ts-expect-error shared deterministic inference
import {startMockInferenceServer,mockModelsJson} from '../../../scripts/mock-inference-server.mjs'
// @ts-expect-error shared deterministic inference
import {researchScenario} from '../../../scripts/mock-research.mjs'
const destination=process.argv[2]
if(!destination)throw new Error('请显式指定新输出目录，原离线证据不会覆盖。')
const out=resolve(destination);mkdirSync(out,{recursive:false})
const tasks=researchTasks().filter(task=>['carbon-missing','unknown-unit'].includes(task.id))
const server=await startMockInferenceServer({scenario:researchScenario(tasks)}),modelsPath=join(out,'offline-models.json')
try{
 writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
 const report=await runResearchEvaluation(out,{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline-fixture',kind:'fixture',requests:()=>server.requests.length},{repeats:2,taskIds:tasks.map(task=>task.id)})
 console.log(JSON.stringify({completePairs:report.completePairs,incompletePairs:report.incompletePairs,rows:report.rows.map(({caseId,repeat,mode,terminal,requests,submissionAttempts,invalidSubmissions})=>({caseId,repeat,mode,terminal,requests,submissionAttempts,invalidSubmissions}))}))
}finally{await server.close();rmSync(modelsPath,{force:true})}
