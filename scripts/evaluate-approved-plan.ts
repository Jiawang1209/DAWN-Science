import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {NativeRuntime} from '../src/runtime/native.js'
import type {AgentEvent} from '../src/runtime/types.js'
import {读团队,团队目录} from '../src/team/state.js'
// @ts-expect-error Shared isolated mock server; no remote credentials.
import {startMockInferenceServer,mockModelsJson} from './mock-inference-server.mjs'
const until=async(predicate:()=>boolean)=>{const end=Date.now()+45000;while(!predicate()){if(Date.now()>end)throw new Error('本地执行夹具超时');await new Promise(r=>setTimeout(r,25))}}
export async function runApprovedPlanEvaluation(destination:string){
 const root=mkdtempSync(join(tmpdir(),'dawn-approved-eval-')),server=await startMockInferenceServer(),modelsPath=join(root,'models.json')
 writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)));writeFileSync(join(root,'input.csv'),'x\n1\n2\n3\n')
 mkdirSync(join(root,'.dawn/agents'),{recursive:true})
 for(const name of ['data-engineer','reviewer-two'])writeFileSync(join(root,'.dawn/agents',name+'.md'),`---\nname: ${name}\ndescription: local software fixture\ntools: read, write\n---\nOnly the explicit frozen fixture task.`)
 const rt=new NativeRuntime({modelsPath,subagentChildEntry:resolve('dist/electron/subagent-child.js'),credentials:{read:async()=>({type:'api_key' as const,key:'offline-mock'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}}}),events:AgentEvent[]=[]
 const spec={sessionId:'approved-evaluation',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}}
 rt.attach(spec.sessionId,e=>events.push(e));const started=Date.now()
 try{
  await rt.start(spec);await rt.setConfigOption(spec.sessionId,'dawn.plan','1')
  rt.write(spec.sessionId,'请为以下具体任务自动安排。\n清洗、建模并独立审阅 input.csv')
  await until(()=>events.some(e=>e.kind==='plan')&&!rt.terminalBusy(spec.sessionId))
  const proposal=events.find(e=>e.kind==='plan');if(proposal?.kind!=='plan')throw new Error('没有提案')
  const approval=await rt.answerPlan(spec.sessionId,proposal.plan.planId,'approve')
  if(!approval.executionTeamId)throw new Error('没有执行绑定')
  const book=JSON.parse(readFileSync(join(spec.sessionDir,'plans.json'),'utf8')),snapshot=book.方案们[0].executionSnapshot
  const frozen={binding:snapshot.binding,tasks:snapshot.frozenTasks.map((t:any)=>({planTaskId:t.planTaskId,taskId:t.taskId,member:t.memberName,agent:t.definition.name,dependencies:t.dependencies,access:t.settings.scope.access,inputs:t.settings.contract.inputs,outputs:t.settings.contract.outputs}))}
  await rt.answerPlan(spec.sessionId,proposal.plan.planId,'execute')
  const team=()=>读团队(团队目录(spec.sessionDir,approval.executionTeamId!))!
  await until(()=>team().tasks.every(t=>['completed','failed','cancelled'].includes(t.status)))
  const before=server.requests.length
  await rt.answerPlan(spec.sessionId,proposal.plan.planId,'execute')
  const final=team(),rows=final.tasks.map(t=>({task:t.id,status:t.status,attempts:t.attempt,receipt:t.receipt?.state,inputs:t.receipt?.versions?.inputs,outputs:t.receipt?.versions?.outputs,reason:t.receipt?.reason??(t.status==='failed'?t.output:undefined)}))
  const report={version:1,source:'localhost deterministic model fixture + real NativeRuntime / Team / Pi child processes',limitations:['验证软件接线、文件版本和宿主提交路径；不代表真实模型质量或独立科学认证。','未使用正式 App 配置或网络 API 凭证。'],frozen,rows,metrics:{planned:3,mapped:frozen.binding.tasks.length,accepted:rows.filter(t=>t.receipt==='accepted'&&t.status==='completed').length,duplicateStartRequests:server.requests.length-before,inputPreserved:readFileSync(join(root,'input.csv'),'utf8')==='x\n1\n2\n3\n',fixtureModelRequests:server.requests.length,elapsedMs:Date.now()-started}}
  mkdirSync(destination,{recursive:true});writeFileSync(join(destination,'approved-execution.json'),JSON.stringify(report,null,2)+'\n')
  if(report.metrics.accepted!==3||report.metrics.duplicateStartRequests||!report.metrics.inputPreserved)throw new Error('批准方案执行夹具未通过，请查看 approved-execution.json')
  return report.metrics
 }finally{await rt.stop(spec.sessionId);await server.close();rmSync(root,{recursive:true,force:true})}
}
