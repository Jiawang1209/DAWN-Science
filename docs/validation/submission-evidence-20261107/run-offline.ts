/** Reproducible offline route demonstration, never loads user credentials. Run from repo root with npx tsx. */
import {mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {runResearchEvaluation} from '../../../scripts/evaluate-research.js'
import {researchTasks} from '../../../src/evaluation/research-tasks.js'
// @ts-expect-error shared deterministic inference
import {startMockInferenceServer,mockModelsJson} from '../../../scripts/mock-inference-server.mjs'
// @ts-expect-error shared deterministic inference
import {researchScenario} from '../../../scripts/mock-research.mjs'
const out=resolve('docs/validation/submission-evidence-20261107/offline');mkdirSync(out,{recursive:true})
const server=await startMockInferenceServer({scenario:researchScenario(researchTasks()[0]!.expected)}),modelsPath=join(out,'offline-models.json')
try{
 writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
 const report=await runResearchEvaluation(out,{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline-fixture',kind:'fixture',requests:()=>server.requests.length},{repeats:2})
 console.log(JSON.stringify({completePairs:report.completePairs,incompletePairs:report.incompletePairs,rows:report.rows.map(({caseId,repeat,mode,terminal,requests,submissionAttempts,invalidSubmissions})=>({caseId,repeat,mode,terminal,requests,submissionAttempts,invalidSubmissions}))}))
}finally{await server.close();rmSync(modelsPath,{force:true})}
