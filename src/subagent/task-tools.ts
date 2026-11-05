import {runControlledScience} from '../team/science-execution.js'
/** Frozen child capabilities around existing Pi tools. Arbitrary shell is never a path sandbox. */
import {realpathSync,statSync} from 'node:fs'
import {resolve,relative,isAbsolute,sep} from 'node:path'
import {createReadToolDefinition,createWriteToolDefinition,createEditToolDefinition,createBashToolDefinition,createLocalBashOperations,createLsToolDefinition,createGrepToolDefinition,createFindToolDefinition} from '@earendil-works/pi-coding-agent'
import {看风险,照这一档,type 权限档} from '../policy/permissions.js'
import {canonicalOutputPaths} from '../bot/output-locks.js'
import {不自己下载} from '../runtime/no-tool-download.js'
import type {TaskContract,TaskSettings,TaskScope} from '../orchestration/task-contract.js'
import type {RouteToolEvidence} from '../runtime/analysis-route-evidence.js'
import {TaskSubmission} from '../orchestration/task-submission.js'
const readers=new Set(['read','ls','grep','find','resource_search','resource_read','team_status','bot_say'])
const defaults=['*']
export function resolveTaskSettings(contract:TaskContract|undefined,tier:权限档,tools:readonly string[]=defaults):TaskSettings {
 const access=contract?.access??'workspace-exec'
 const candidates=tools.includes('*')&&access!=='workspace-exec'?[...readers,...(access==='workspace-write'?['write','edit']:[])]:tools
 const selected=candidates.filter(name=>access==='workspace-exec'||readers.has(name)||access==='workspace-write'&&['write','edit'].includes(name))
 return{...(contract?{contract}:{}),scope:{version:1,tier,access,tools:[...new Set(selected)],inputs:contract?.inputs??[],outputs:contract?.outputs??[]}}
}
const canonical=(cwd:string,path:string)=>canonicalOutputPaths([path],cwd)![0]!
export function taskToolDenial(scope:TaskScope,cwd:string,name:string,params:Record<string,unknown>):string|undefined {
 if(name==='submit_task_result')return undefined // control capability; never a filesystem or execution grant
 if(!scope.tools.includes('*')&&!scope.tools.includes(name)&&!['resource_search','resource_read','team_send','team_status','bot_message','bot_say'].includes(name))return `子任务范围不允许 ${name}；请交还主 agent 处理，不能扩大范围`
 if(scope.access==='read-only'&&!readers.has(name))return '子任务为只读，不允许执行或写入'
 if(scope.access==='workspace-write'&&!readers.has(name)&&!['write','edit'].includes(name))return '限定路径写入不支持 shell 或未知副作用工具'
 const path=typeof params.path==='string'?params.path:undefined
 if(['read','write','edit','ls','grep','find'].includes(name)){
  if(path?.startsWith('~'))return '任务工具不接受 home 路径缩写'
  let root:string
  try{root=realpathSync(cwd)}catch{return '任务工作目录无法核验'}
  const target=canonical(cwd,path??'.'),rel=relative(root,target)
  if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))return '子任务路径超出工作目录或通过符号链接越界'
  if(name==='write'||name==='edit'){
   if(!path)return '写入缺少路径'
   const normalized=rel.split(sep).join('/')
   if(normalized==='data/raw'||normalized.startsWith('data/raw/'))return '原始数据 data/raw 不允许写入'
   if(scope.inputs.some(p=>{const input=canonical(cwd,p);if(input===target)return true;try{const a=statSync(input),b=statSync(target);return a.dev===b.dev&&a.ino===b.ino}catch{return false}}))return '任务输入文件不允许覆盖（包括文件别名）'
   if(scope.access==='workspace-write'&&!scope.outputs.some(p=>canonical(cwd,p)===target))return '写入目标未在任务 outputs 声明'
  }
 }
 const decision=照这一档(scope.tier,看风险(name,params,{workspace:cwd}))
 if(decision.kind!=='allow')return `${decision.reason}（子任务不能新增批准，请交还主 agent）`
 return undefined
}
export interface TaskTool {name:string;label:string;description:string;parameters:unknown;execute(id:string,params:Record<string,unknown>,signal?:AbortSignal,onUpdate?:unknown,ctx?:unknown):Promise<{content:{type:string;text?:string}[];isError?:boolean;details?:unknown}>}
export function createTaskTools(cwd:string,settings:TaskSettings,authorize?:(name:string,params:Record<string,unknown>,signal?:AbortSignal)=>Promise<string|undefined>){
 const records:RouteToolEvidence[]=[]
 const submission=settings.contract?new TaskSubmission(settings.contract,cwd,()=>records,settings.versions):undefined
 const shell=createLocalBashOperations()
 const definitions=[createReadToolDefinition(cwd),createWriteToolDefinition(cwd),createEditToolDefinition(cwd),createBashToolDefinition(cwd,{exposeSessionEnvironment:false}),createLsToolDefinition(cwd),不自己下载(createGrepToolDefinition(cwd),'rg'),不自己下载(createFindToolDefinition(cwd),'fd')] as TaskTool[]
 const wrap=(def:TaskTool,observe=true):TaskTool=>({...def,async execute(id:string,params:Record<string,unknown>,signal?:AbortSignal,onUpdate?:unknown,ctx?:unknown){
  let release=()=>{}
  try{if(submission)release=submission.enter()}catch(error){return{content:[{type:'text',text:String(error)}],isError:true}}
  try{
  let denial=taskToolDenial(settings.scope,cwd,def.name,params)
  if(!denial)denial=await authorize?.(def.name,params,signal)
  if(signal?.aborted)denial='调用已中止'
  if(denial){const result={content:[{type:'text',text:denial}],isError:true};records.push({toolCallId:id,name:def.name,status:'error',result:denial,input:params,execution:'not_observed'});return result}
  let observed=false
  const actual=def.name==='bash'?createBashToolDefinition(cwd,{exposeSessionEnvironment:false,operations:{exec:async(command,directory,options)=>{
   const result=await shell.exec(command,directory,{...options,onData:data=>{if(data.length)observed=true;options.onData(data)}})
   if(typeof result.exitCode==='number')observed=true
   return result
  }}}) as TaskTool:def
  try{
   const controlled=def.name==='bash'?await runControlledScience(settings.contract?.acceptance,cwd,params,signal,[...settings.scope.inputs,...settings.scope.outputs]):undefined
   if(controlled)observed=true
   const result=controlled??await actual.execute(id,params,signal,onUpdate,ctx)
   if(observe)records.push({toolCallId:id,name:def.name,status:result.isError?'error':'done',input:params,result:result.content.map(c=>c.text??'').join('\n'),
    ...(controlled?.scienceExecution?{scienceExecution:controlled.scienceExecution}:{}),execution:def.name==='bash'&&observed?(result.isError?'failed':'ran'):'not_observed',
    ...(!result.isError&&['write','edit'].includes(def.name)&&typeof params.path==='string'?{filesWritten:[resolve(cwd,params.path)]}:{})})
   if(!observe)return result
   const observedRecord=records[records.length-1]!
   const details=typeof result.details==='object'&&result.details?result.details:{}
   return {...result,details:{...details,analysisRouteEvidence:{execution:observedRecord.execution,...(observedRecord.filesWritten?{filesWritten:observedRecord.filesWritten}:{})}}}
  }catch(error){if(observe)records.push({toolCallId:id,name:def.name,status:'error',input:params,result:String(error),execution:observed?'failed':'not_observed'});throw error}
  }finally{release()}
 }})
 const tools:TaskTool[]=definitions.filter(t=>settings.scope.tools.includes('*')||settings.scope.tools.includes(t.name)).map(def=>wrap(def))
 if(submission)tools.push(submission.tool() as TaskTool)
 return{tools,submission,evidence:()=>submission?.sealedEvidence()??structuredClone(records),guardExtras:(extra:TaskTool[])=>extra.map(def=>wrap(def,false))}
}
