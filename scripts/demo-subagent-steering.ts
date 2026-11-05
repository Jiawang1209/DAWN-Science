/** Actual installed Pi child + real tool process, with localhost deterministic inference only. */
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {SubagentExecutor} from '../src/subagent/executor.js'
import {OrchestrationStore} from '../src/orchestration/store.js'
import {OrchestrationService} from '../src/orchestration/service.js'
// @ts-expect-error shared local deterministic inference
import {startMockInferenceServer,mockModelsJson} from './mock-inference-server.mjs'
export async function runSubagentSteeringDemo(outputDir:string){
const out=resolve(outputDir)
mkdirSync(out,{recursive:true})
const root=mkdtempSync(join(tmpdir(),'dawn-steering-demo-')),timeline:unknown[]=[],started=Date.now()
const record=(kind:string,extra:Record<string,unknown>={})=>{timeline.push({ms:Date.now()-started,kind,...extra})}
const server=await startMockInferenceServer({scenario:{
 toolCall:(body:any)=>{const last=body.messages?.at(-1);if(last?.role!=='user'||JSON.stringify(last.content).includes('[subagent-steer:'))return undefined;return{toolName:'bash',args:{command:JSON.stringify(last.content).includes('cancel-demo')?'echo $$ > cancelled-tool.pid; sleep 30; echo unexpected > cancelled-effect.txt':'sleep 1.5; echo boundary-complete > tool-finished.txt'},say:'真实慢工具开始'}},
 reply:(body:any)=>body.messages?.some((message:any)=>message.role==='user'&&JSON.stringify(message.content).includes('[subagent-steer:'))?'已按纠偏改为 corrected-blue。':'original-red',
}})
const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
const store=new OrchestrationStore(join(root,'session'),'demo-parent'),service=new OrchestrationService(store)
const definition={name:'reader',description:'offline real-process demo',systemPrompt:'Follow the current user instruction.',filePath:'/demo-reader',tools:['bash','read']}
const executor=(call:string)=>new SubagentExecutor({
 context:{cwd:root,provider:'deepseek',model:'deepseek-flash',modelsPath,credentials:{deepseek:'offline-only'},agentDirOf:i=>join(root,call,String(i))},
 childOf:()=>({command:process.execPath,args:[resolve('dist/electron/subagent-child.js')],env:{ELECTRON_RUN_AS_NODE:'1'},supportsSteering:true}),
 orchestration:{service,addressOf:i=>[call,String(i)]},
 onProgress:event=>{if(event.type==='event')record(event.event.kind,{call,...(event.event.kind==='tool_start'?{tool:event.event.toolName}:{})})},
})
async function until(test:()=>boolean){const deadline=Date.now()+20_000;while(!test()){if(Date.now()>deadline)throw Error('Real-child demonstration timed out');await new Promise<void>(done=>setTimeout(done,10))}}
try{
 const first=service.register('subagent',['first','0'],'reader');const run=executor('first').run({mode:'single',agent:'reader',task:'steer-demo run slow tool then report original-red'},[definition])
 await until(()=>service.canSteer(first.id)&&timeline.some((item:any)=>item.kind==='tool_start'&&item.call==='first'))
 const accepted=await service.steer(first.id,'correction-1','Change the answer to corrected-blue.',1);record('accepted',{receipt:accepted})
 assert.equal(accepted.status,'accepted');assert.equal(existsSync(join(root,'tool-finished.txt')),false)
 const duplicate=await service.steer(first.id,'correction-1','Change the answer to corrected-blue.',1);assert.equal(duplicate.id,accepted.id)
 await until(()=>store.steeringReceipts(first.id)[0]?.status==='applied');record('applied',{receipt:store.steeringReceipts(first.id)[0]})
 assert.equal(readFileSync(join(root,'tool-finished.txt'),'utf8').trim(),'boundary-complete')
 const result=await run;assert.equal(result.results[0]?.ok,true);assert.match(result.results[0]!.output,/corrected-blue/)
 const second=service.register('subagent',['cancel','0'],'reader');const cancelRun=executor('cancel').run({mode:'single',agent:'reader',task:'cancel-demo run slow tool'},[definition])
 await until(()=>service.canSteer(second.id)&&existsSync(join(root,'cancelled-tool.pid')))
 const pending=await service.steer(second.id,'cancel-correction','Should remain unconfirmed.',1);assert.equal(pending.status,'accepted');record('cancel-accepted',{receipt:pending})
 service.interrupt(second.id);const cancelled=await cancelRun;assert.equal(cancelled.results[0]?.ok,false);assert.equal(store.steeringReceipts(second.id)[0]?.status,'interrupted')
 assert.equal(existsSync(join(root,'cancelled-effect.txt')),false)
 const pid=Number(readFileSync(join(root,'cancelled-tool.pid'),'utf8'));let alive=true;try{process.kill(pid,0)}catch{alive=false}assert.equal(alive,false)
 record('cancel-drained',{receipt:store.steeringReceipts(second.id)[0],toolPidDead:!alive})
 const report={version:1,provider:'localhost deterministic OpenAI-compatible fixture',scope:'actual installed Pi AgentSession.steer, child stdin/stdout, real bash tools; does not measure model quality',toolBoundaryVerified:true,duplicateNotRedelivered:true,cancellationDrained:true,modelRequests:server.requests.length,correctedResult:result.results[0]!.output,receipts:store.steeringReceipts(),timeline}
 writeFileSync(join(out,'real-child-demo.json'),JSON.stringify(report,null,2)+'\n')
 writeFileSync(join(out,'real-child-demo.md'),`# 实时纠偏实际子进程演示\n\n本地确定性推理，只替换模型回复。运行安装的 Pi SDK、真实子进程和 bash。\n\n- 慢工具执行期间 accepted；工具完成之后真实 user message_start 才 applied。\n- 相同请求 ID 重发只返回原回执。\n- 结果包含 corrected-blue。\n- 第二个子任务在慢工具中接收纠偏后点名取消，回执 interrupted，工具进程已退出，未产生后续文件。\n- 请求数：${server.requests.length}；完整时序及回执见 real-child-demo.json。\n`)
 return report
}finally{await service.close();await server.close();rmSync(root,{recursive:true,force:true})}

}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await runSubagentSteeringDemo(process.argv[2]??'docs/validation/live-parallel-20261105/stage-a')
 console.log(JSON.stringify({toolBoundaryVerified:report.toolBoundaryVerified,cancellationDrained:report.cancellationDrained,modelRequests:report.modelRequests}))
}
