import {researchBatchAllocation} from '../src/evaluation/research-batch.js'
import {researchRequestLimit,researchStageLimits,researchTrialTimeoutMs} from '../src/evaluation/research-budget.js'
/** Standalone Electron helper: read existing encrypted credential, run isolated trials, never write user state. */
import {app,safeStorage} from 'electron'
import {writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs'
import {join,resolve,basename} from 'node:path'
import {tmpdir} from 'node:os'
import {getBuiltinModel} from '@earendil-works/pi-ai/providers/all'
import {CredentialStore,defaultCredentialFile,readOnlyCredentials} from '../src/electron/credentials.js'
import {loadRegistry} from '../src/config/loader.js'
import {startEvaluationGate} from './evaluation-request-gate.js'
import {researchBudgetTrial,RESEARCH_STAGE_PROVIDERS} from './research-trial-budget.js'
import {researchProxyModel} from './research-model-compat.js'
import {runResearchEvaluation} from './evaluate-research.js'
async function main(){
const [outputArg,profileArg,provider,modelId,variant,requestLimitArg,batchArg]=process.argv.slice(2)
const scratch=mkdtempSync(join(tmpdir(),'dawn-research-host-'))
app.setPath('userData',scratch)
// safeStorage's macOS service name follows the host name; a standalone .js otherwise becomes Electron.
if(profileArg)app.setName(basename(resolve(profileArg)))
await app.whenReady()
console.log('research-host-ready')
let gate:Awaited<ReturnType<typeof startEvaluationGate>>|undefined
const controller=new AbortController(),cancel=()=>controller.abort()
process.on('SIGINT',cancel);process.on('SIGTERM',cancel)
let output:string|undefined,stage='preflight'
try{
 if(!outputArg||!profileArg||!provider||!modelId)throw new Error('缺少明确输出目录、只读配置目录、provider 和 model')
 if(variant!==undefined&&!['approved-plan','automatic-plan'].includes(variant))throw new Error('不支持的真实复验候选')
 output=resolve(outputArg)
 const requestLimit=researchRequestLimit(requestLimitArg===undefined?undefined:Number(requestLimitArg)),batch=researchBatchAllocation(batchArg===undefined?undefined:JSON.parse(batchArg),requestLimit),perArmLimit=batch.perArmLimit,stageLimits=researchStageLimits(perArmLimit)
 const profile=resolve(profileArg),registry=loadRegistry(join(profile,'providers.yaml')),model=getBuiltinModel(provider,modelId)
 if(!model)throw new Error('当前模型不在本地目录；不会隐式替换模型')
 const connection=registry.providers?.[provider]
 if(model.api!=='openai-completions'||connection?.api&&connection.api!=='openai-completions')throw new Error('当前试验转发器只支持 OpenAI completions，其他 API 明确不支持')
 const proxyModel=researchProxyModel(model)
 stage='credential-read'
 const port=readOnlyCredentials(new CredentialStore({file:defaultCredentialFile(profile),safeStorage,onInsecure:()=>{}}));port.warm?.()
 const key=port.get(provider);if(!key){console.log(JSON.stringify({stage:'credential-read',hostName:app.getName(),encryptionAvailable:safeStorage.isEncryptionAvailable(),modelRequests:0}));throw new Error('当前 API 凭证不可读；未发模型请求')}
 const target=new URL((connection?.baseUrl??model.baseUrl).replace(/\/$/,'')+'/chat/completions')
 if(target.protocol!=='https:')throw new Error('联网试验要求 HTTPS 配置')
 mkdirSync(output,{recursive:true})
 writeFileSync(join(output,'live-attempt.json'),JSON.stringify({provider,model:modelId,limit:requestLimit,batch,perArmLimit,stageLimits,perArmTimeoutMs:researchTrialTimeoutMs(perArmLimit),multiExecution:variant??'pipeline',startedAt:new Date().toISOString()}),{flag:'wx'})
 stage='inference'
 gate=await startEvaluationGate({limit:requestLimit,forward:(body,path,signal)=>{
  if(path!=='/chat/completions')throw new Error('unsupported route')
  writeFileSync(join(output!,'request-gate.json'),JSON.stringify(gate!.stats(),null,2)+'\n')
  return fetch(target,{method:'POST',headers:{...connection?.headers,'content-type':'application/json',authorization:`Bearer ${key}`},body:new Uint8Array(body),signal,redirect:'error'})
 }})
 const modelsPath=join(scratch,'models.json')
 const modelConfig={baseUrl:gate.url,api:'openai-completions',models:[proxyModel]}
 writeFileSync(modelsPath,JSON.stringify({providers:Object.fromEntries([provider,...Object.values(RESEARCH_STAGE_PROVIDERS)].map(name=>[name,modelConfig]))}))
 const workModel={provider:RESEARCH_STAGE_PROVIDERS.work,model:modelId},reviewModel={provider:RESEARCH_STAGE_PROVIDERS.review,model:modelId}
 const report=await runResearchEvaluation(output,{requestLimit,provider,model:modelId,modelsPath,credential:gate.token,requests:()=>gate!.stats().forwarded,kind:'live',...(variant?{multiExecution:variant as 'approved-plan'|'automatic-plan'}:{}),requestBudgetFeedback:'partition-live-v1',multiStageLimits:stageLimits,multiStageModels:{check:workModel,analyze:workModel,review:reviewModel},signal:controller.signal,beginTrial:(limit,mode)=>researchBudgetTrial(gate!.partition(limit),mode,modelId)},batch)
 mkdirSync(output,{recursive:true});writeFileSync(join(output,'request-gate.json'),JSON.stringify(gate.stats(),null,2)+'\n')
 console.log(JSON.stringify({provider,model:modelId,forwarded:gate.stats().forwarded,completePairs:report.completePairs,incompletePairs:report.incompletePairs,rows:report.rows.map(r=>({caseId:r.caseId,mode:r.mode,terminal:r.terminal,success:r.success,requests:r.requests}))}))
}catch{console.error(`真实 API 试验未完成（${stage}）；未输出凭证、端点或请求正文。查看隔离报告；不会自动重新联网。`);process.exitCode=1}
finally{await gate?.close();if(output&&gate)writeFileSync(join(output,'request-gate.json'),JSON.stringify(gate.stats(),null,2)+'\n');process.off('SIGINT',cancel);process.off('SIGTERM',cancel);rmSync(scratch,{recursive:true,force:true});app.exit(process.exitCode??0)}
}
void main().catch(()=>{console.error('research host failed before initialization');app.exit(1)})
