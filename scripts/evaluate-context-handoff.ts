/** Paired software-path evaluation; no production credentials, no remote inference. */
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createSubagentTool} from '../src/subagent/tool.js'
import {captureHandoff,readHandoff} from '../src/subagent/context-handoff.js'
import {读元} from '../src/subagent/run-dir.js'
import {OrchestrationService} from '../src/orchestration/service.js'
import {OrchestrationStore} from '../src/orchestration/store.js'
import {liveRunOverview} from '../src/orchestration/run-overview.js'
import {baselineFingerprint} from '../src/evaluation/science-pipeline.js'
// @ts-expect-error shared localhost inference fixture
import {startMockInferenceServer,mockModelsJson} from './mock-inference-server.mjs'
// @ts-expect-error shared deterministic scenario
import {contextHandoffScenario,CONTEXT_FACTS,CONTEXT_RESULT} from './mock-context-handoff.mjs'
async function run(mode:'task-only'|'handoff'){
 const root=mkdtempSync(join(tmpdir(),'dawn-context-eval-')),server=await startMockInferenceServer({scenario:contextHandoffScenario()})
 const original='x\n1\n2\n3\n4\n5\n',modelsPath=join(root,'models.json'),dir=join(root,'child'),events:{name:string;input:unknown}[]=[]
 const service=new OrchestrationService(new OrchestrationStore(root,'evaluation'),1)
 try{
  writeFileSync(join(root,'in.csv'),original);writeFileSync(join(root,'context.txt'),CONTEXT_FACTS);writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  mkdirSync(join(root,'.dawn/agents'),{recursive:true});writeFileSync(join(root,'.dawn/agents/reader.md'),'---\nname: reader\ndescription: read only fixture\ntools: read\n---\nUse approved inputs. Reply with the requested JSON.')
  const tool=createSubagentTool({sessionId:'evaluation',projectRoot:root,orchestration:service,taskPolicy:()=> 'deny-risky',运行目录:()=>dir,
   captureHandoff:s=>captureHandoff('evaluation',[{id:'approved-context',type:'message',message:{role:'user',content:CONTEXT_FACTS}}],s.recentMessages),
   childOf:()=>({command:process.execPath,args:[resolve('dist/electron/subagent-child.js')],env:{ELECTRON_RUN_AS_NODE:'1'}}),
   context:{cwd:root,provider:'deepseek',model:'deepseek-flash',modelsPath,credentials:{deepseek:'offline-mock'},agentDirOf:()=>dir},
   emit:e=>{if(e.kind==='subagent_event'&&e.event.kind==='tool_start')events.push({name:e.event.toolName,input:e.event.input})},
  })
  const started=Date.now(),result=await tool.execute('evaluation',{agent:'reader',task:'Read in.csv. Use approved context; if absent read context.txt. Return JSON with n, mean, unit, method, preserveInput.',...(mode==='handoff'?{handoff:{recentMessages:1}}:{})})
  const meta=读元(dir),capsule=readHandoff(dir,'evaluation'),overview=liveRunOverview(service)
  let output:unknown;try{output=JSON.parse(meta?.result?.text??'')}catch{}
  const success=!result.isError&&JSON.stringify(output)===JSON.stringify(CONTEXT_RESULT),inputPreserved=readFileSync(join(root,'in.csv'),'utf8')===original
  if(!success||!inputPreserved)throw new Error(`交接评测失败：${mode} ${JSON.stringify(result)}`)
  return{mode,success,inputPreserved,output,modelRequests:server.requests.length,contextReads:events.filter(e=>e.name==='read'&&(e.input as {path?:string})?.path==='context.txt').length,
   inputReads:events.filter(e=>e.name==='read'&&(e.input as {path?:string})?.path==='in.csv').length,
   handoffBytes:capsule?.bytes??0,handoffEnvelopeBytes:capsule?Buffer.byteLength(JSON.stringify(capsule)):0,
   handoffSourceVerified:!capsule||capsule.entries[0]?.text===CONTEXT_FACTS,
   elapsedMs:Date.now()-started,
   overviewFacts:{executor:overview.runs[0]?.label==='reader',epoch:overview.runs[0]?.epoch===1,completed:overview.runs[0]?.state==='completed',drained:overview.runs[0]?.phase==='drained',contractNotInvented:overview.runs[0]?.contract===false,acceptanceNotInvented:overview.runs[0]?.receipt===undefined},
   permissions:meta?.settings?.scope,
  }
 }finally{await service.close();await server.close();rmSync(root,{recursive:true,force:true})}
}
export async function runContextHandoffEvaluation(outputDir:string){
 const rows=[];for(const mode of ['task-only','handoff'] as const)rows.push(await run(mode))
 if(JSON.stringify(rows[0]!.permissions)!==JSON.stringify(rows[1]!.permissions)||rows.some(r=>Object.values(r.overviewFacts).some(v=>!v)))throw new Error('权限或观测事实不一致')
 const sourceFiles=['scripts/evaluate-context-handoff.ts','scripts/mock-context-handoff.mjs','src/subagent/context-handoff.ts','src/subagent/tool.ts','src/subagent/executor.ts','src/orchestration/run-overview.ts']
 const report={version:1,generatedAt:new Date().toISOString(),scope:'paired localhost deterministic inference; actual Pi, child processes, files, tools, scope and coordinator',limitations:['固定 fixture 的请求/工具调用变化，不代表真实模型质量或费用收益。','不度量人的排查时间；耗时只记录，不作速度结论。','快照是正文引用，不是文件版本证明；科研任务继续使用原冻结契约。'],sourceFiles,sourceFingerprint:baselineFingerprint(sourceFiles.map(p=>[p,readFileSync(p,'utf8')])),childBuildFingerprint:baselineFingerprint(readFileSync(resolve('dist/electron/subagent-child.js'),'utf8')),rows,
  observed:{contextReadsSaved:rows[0]!.contextReads-rows[1]!.contextReads,modelRequestsSaved:rows[0]!.modelRequests-rows[1]!.modelRequests,addedHandoffBytes:rows[1]!.handoffEnvelopeBytes,allOutputsEqual:JSON.stringify(rows[0]!.output)===JSON.stringify(rows[1]!.output),permissionsEqual:JSON.stringify(rows[0]!.permissions)===JSON.stringify(rows[1]!.permissions)}}
 mkdirSync(outputDir,{recursive:true});writeFileSync(join(outputDir,'context-handoff.json'),JSON.stringify(report,null,2)+'\n')
 writeFileSync(join(outputDir,'context-handoff.md'),['# 可观测编排与交接对照',...report.limitations,'','| 模式 | 成功 | 输入读取 | 背景重读 | 本地模型请求 | 交接正文 / 信封字节 |','|---|---|---|---|---|---|',...rows.map(r=>`| ${r.mode} | ${r.success} | ${r.inputReads} | ${r.contextReads} | ${r.modelRequests} | ${r.handoffBytes} / ${r.handoffEnvelopeBytes} |`),'',`事实覆盖：每次核验 ${Object.keys(rows[0]!.overviewFacts).length} 项；两组权限相同；输出相同。`].join('\n')+'\n')
 return report
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify((await runContextHandoffEvaluation(process.argv[2]??'docs/validation/observable-handoff-20261106/evaluation')).observed))
