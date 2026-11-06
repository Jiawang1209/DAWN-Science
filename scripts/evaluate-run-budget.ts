/** Uses the existing formal contract, version checks and Pi subprocess path. */
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createSubagentTool} from '../src/subagent/tool.js'
import {OrchestrationStore} from '../src/orchestration/store.js'
import {OrchestrationService} from '../src/orchestration/service.js'
import {TaskContractSchema} from '../src/protocol/task-contract.js'
import {resolveTaskSettings} from '../src/subagent/task-tools.js'
import {captureFileVersions,assertFileVersions} from '../src/artifacts/task-versions.js'
import {baselineFingerprint} from '../src/evaluation/science-pipeline.js'
import {summarizeRunBudget,type RunBudgetEvaluationRow} from '../src/evaluation/run-budget.js'
// @ts-expect-error shared localhost inference fixture
import {startMockInferenceServer,mockModelsJson} from './mock-inference-server.mjs'
// @ts-expect-error existing deterministic scientific execution fixture
import {scienceTemplateScenario} from './mock-science-template.mjs'
async function run(mode:'unlimited'|'limited'){
 const root=mkdtempSync(join(tmpdir(),'dawn-run-budget-eval-')),server=await startMockInferenceServer({scenario:scienceTemplateScenario()})
 const store=new OrchestrationStore(root,'evaluation'),service=new OrchestrationService(store,2),started=Date.now(),input='x\n1\n2\n3\n4\n5\n'
 try{
  writeFileSync(join(root,'in.csv'),input);const inputs=await captureFileVersions(root,['in.csv'])
  const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  mkdirSync(join(root,'.dawn/agents'),{recursive:true});writeFileSync(join(root,'.dawn/agents/analyze.md'),'---\nname: analyze\ndescription: deterministic scientific execution\ntools: read,write,bash\n---\nUse the frozen contract. Execute the requested script and formally submit.')
  if(mode==='limited')service.configureBudget({maxRuns:2},0)
  const tool=createSubagentTool({sessionId:'evaluation',projectRoot:root,orchestration:service,taskPolicy:()=> 'allow-all',运行目录:(call,index)=>join(root,'children',call,String(index)),
   childOf:()=>({command:process.execPath,args:[resolve('dist/electron/subagent-child.js')],env:{ELECTRON_RUN_AS_NODE:'1'}}),
   context:{cwd:root,provider:'deepseek',model:'deepseek-flash',modelsPath,credentials:{deepseek:'offline-mock'},agentDirOf:()=>join(root,'unused')},emit:()=>{},
  })
  let accepted=0,rejected=0
  const preservedHashes:string[]=[],receipts=[]
  for(let index=1;index<=3;index++){
   const id=`budget-${index}`,outputs=[`run-${index}.py`,`run-${index}.json`,`run-${index}.md`]
   const contract=TaskContractSchema.parse({submission:'tool',resultType:'model-metrics',inputs:['in.csv'],outputs,access:'workspace-exec',requireExecution:true})
   const child=service.register('subagent',[id,'0'],'analyze'),settings={...resolveTaskSettings(contract,'allow-all',['read','write','bash']),versions:{version:1 as const,inputs}}
   store.bindTask(child.id,settings)
   const result=await tool.execute(id,{agent:'analyze',task:'Compute the arithmetic mean of in.csv; preserve inputs. This is a synthetic fixture.',contract})
   if(result.isError){rejected++;if(mode!=='limited'||index!==3)throw new Error('Unexpected scientific execution failure: '+JSON.stringify(result));continue}
   const receipt=store.get(child.id)?.result?.receipt
   const actual=JSON.parse(readFileSync(join(root,outputs[1]!),'utf8'))
   if(receipt?.state!=='accepted'||actual.n!==5||actual.mean!==3||actual.unit!=='m'||!receipt.versions)throw new Error('Scientific artifact did not pass independent fixture checks')
   await assertFileVersions(root,receipt.versions.outputs);accepted++;receipts.push(receipt)
   if(index<=2)preservedHashes.push(baselineFingerprint(receipt.versions.outputs))
  }
  const before=service.budgetSnapshot();await service.close()
  const restored=new OrchestrationStore(root,'evaluation')
  for(const receipt of receipts)await assertFileVersions(root,receipt.versions!.outputs)
  const row:RunBudgetEvaluationRow={mode,inputHash:inputs[0]!.sha256,inputPreserved:readFileSync(join(root,'in.csv'),'utf8')===input,started:before.consumedRuns,accepted,rejected,modelRequests:server.requests.length,preservedHashes,recoveryConsumed:restored.budget().consumedRuns}
  return{...row,elapsedMs:Date.now()-started,budgetBefore:before,budgetAfter:restored.budget(),receipts,history:restored.history()}
 }finally{await service.close();await server.close();rmSync(root,{recursive:true,force:true})}
}
export async function runRunBudgetEvaluation(outputDir:string){
 const rows=[];for(const mode of ['unlimited','limited'] as const)rows.push(await run(mode))
 const observed=summarizeRunBudget(rows),sourceFiles=['src/orchestration/store.ts','src/orchestration/service.ts','src/orchestration/budget.ts','src/protocol/run-budget.ts','scripts/evaluate-run-budget.ts']
 const report={version:1,generatedAt:new Date().toISOString(),sourceFingerprint:baselineFingerprint(sourceFiles.map(path=>[path,readFileSync(path,'utf8')])),childBuildFingerprint:baselineFingerprint(readFileSync('dist/electron/subagent-child.js','utf8')),rows,observed}
 mkdirSync(outputDir,{recursive:true});writeFileSync(join(outputDir,'run-budget.json'),JSON.stringify(report,null,2)+'\n')
 writeFileSync(join(outputDir,'run-budget.md'),['# 委派预算实测',...observed.limitations,'','| 模式 | 实际启动 | 宿主验收 | 拒绝新轮次 | 本地模型请求 | 恢复后已用轮次 |','|---|---|---|---|---|---|',...rows.map(row=>`| ${row.mode} | ${row.started} | ${row.accepted} | ${row.rejected} | ${row.modelRequests} | ${row.recoveryConsumed} |`),'',`共同的前两项产物版本相同并保留；实际少启动 ${observed.preventedStarts} 轮，少 ${observed.localModelRequestsAvoided} 次本地模型请求。`].join('\n')+'\n')
 return report
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify((await runRunBudgetEvaluation(process.argv[2]??'docs/validation/run-explanation-budget-20261106/evaluation/budget')).observed))
