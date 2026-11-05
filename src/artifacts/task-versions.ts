/** Reuse bounded artifact workers for task handoff; no second content store. */
import type {RouteToolEvidence} from '../runtime/analysis-route-evidence.js'
import {validateScienceAcceptance,validateAcceptanceReceipt} from '../team/science-acceptance.js'
import {fileIdentity} from './blobs.js'
import {DEFAULT_LIMITS} from './model.js'
import {FileVersionsSchema,TaskVersionsSchema,sameFileVersions,type FileVersion,type TaskVersions} from '../protocol/file-versions.js'
import type {TaskReceipt,TaskSettings} from '../protocol/task-contract.js'
export const TASK_VERSION_LIMITS={maxFiles:64,maxFileBytes:DEFAULT_LIMITS.hashBytes,maxTotalBytes:4*DEFAULT_LIMITS.hashBytes,timeoutMs:DEFAULT_LIMITS.hashMs}
export async function captureFileVersions(workspace:string,paths:readonly string[],signal?:AbortSignal,limits:Partial<typeof TASK_VERSION_LIMITS>={}):Promise<FileVersion[]> {
 const budget={...TASK_VERSION_LIMITS,...limits}
 for(const [key,value] of Object.entries(budget))if(!Number.isSafeInteger(value)||value<(key==='maxTotalBytes'?0:1))throw new Error('无效内容版本采集上限')
 if(paths.length>budget.maxFiles)throw new Error('内容版本文件数超过上限')
 if(new Set(paths).size!==paths.length)throw new Error('内容版本路径重复')
 const files:FileVersion[]=[];let bytes=0
 for(const path of paths){
  if(signal?.aborted)throw new Error('内容版本采集已取消')
  const identity=await fileIdentity(workspace,path,{maxBytes:Math.min(budget.maxFileBytes,budget.maxTotalBytes-bytes),timeoutMs:budget.timeoutMs,...(signal?{signal}:{})})
  bytes+=identity.bytes;if(bytes>budget.maxTotalBytes)throw new Error('内容版本累计字节超过上限')
  files.push({path,sha256:identity.sha256,bytes:identity.bytes})
 }
 if(signal?.aborted)throw new Error('内容版本采集已取消')
 return FileVersionsSchema.parse(files)
}
export async function assertFileVersions(workspace:string,expected:readonly FileVersion[],signal?:AbortSignal):Promise<void> {
 const files=FileVersionsSchema.parse(expected),actual=await captureFileVersions(workspace,files.map(f=>f.path),signal)
 if(!sameFileVersions(files,actual))throw new Error('文件内容版本已变化，不能沿用原核查、审阅或恢复检查点')
}
export async function versionInputReceipt(settings:TaskSettings|undefined,workspace:string,signal?:AbortSignal):Promise<TaskReceipt|undefined> {
 if(!settings?.versions)return
 try{await assertFileVersions(workspace,settings.versions.inputs,signal)}catch(error){if(signal?.aborted)throw error;return versionFailure(error)}
}
const versionFailure=(error:unknown):TaskReceipt=>({version:1,state:'blocked',summary:'内容版本校验未通过',reason:error instanceof Error?error.message:String(error),deliverables:[]})
export async function finalizeTaskVersions(settings:TaskSettings,receipt:TaskReceipt,workspace:string,signal?:AbortSignal,proof?:{required?:boolean;submitted?:TaskVersions|undefined;evidence?:readonly RouteToolEvidence[]}):Promise<TaskReceipt> {
 receipt=await validateScienceAcceptance(settings.contract,receipt,workspace,signal,proof?.evidence)
 if(!settings.versions)return receipt
 try{
  const expected=settings.versions.inputs
  const inputs=await captureFileVersions(workspace,expected.map(f=>f.path),signal)
  if(!sameFileVersions(expected,inputs))throw new Error('输入内容版本已变化，未接受本轮结果')
  const submitted=proof?.submitted?TaskVersionsSchema.parse(proof.submitted):undefined
  if(proof?.required&&!submitted)throw new Error('缺少正式提交的内容版本证明')
  if(submitted&&!sameFileVersions(expected,submitted.inputs))throw new Error('正式提交输入版本与冻结设置不一致')
  const outputs=receipt.state==='accepted'?await captureFileVersions(workspace,settings.contract?.outputs??[],signal,{maxTotalBytes:TASK_VERSION_LIMITS.maxTotalBytes-inputs.reduce((n,f)=>n+f.bytes,0)}):[]
  if(receipt.state==='accepted'&&receipt.acceptance){const actual=[...inputs,...outputs];if(receipt.acceptance.files.some(file=>!sameFileVersions([file],actual.filter(v=>v.path===file.path))))throw new Error('文件内容在可执行验收后发生变化，未接受本轮结果')}
  if(submitted&&!sameFileVersions(outputs,submitted.outputs))throw new Error('产物内容版本已变化，未接受迟到结果')
  if(signal?.aborted)throw new Error('内容版本核验已取消')
  return {...receipt,versions:{version:1,inputs:inputs.map(f=>({...expected.find(old=>old.path===f.path),...f})),outputs}}
 }catch(error){if(signal?.aborted)throw error;return versionFailure(error)}
}
/** Trusted adapters still must attest the capabilities required by this frozen task. */
export function validateVersionReceipt(settings:TaskSettings|undefined,receipt:TaskReceipt):TaskReceipt {
 receipt=validateAcceptanceReceipt(settings?.contract,receipt)
 if(!settings?.versions||receipt.state==='blocked'&&!receipt.versions)return receipt
 try{
  const versions=TaskVersionsSchema.parse(receipt.versions)
  if(!sameFileVersions(settings.versions.inputs,versions.inputs))throw new Error('后端回执缺少匹配的冻结输入版本')
  const paths=receipt.state==='accepted'?settings.contract?.outputs??[]:[]
  if(paths.length!==versions.outputs.length||paths.some(path=>!versions.outputs.some(file=>file.path===path)))throw new Error('后端回执未覆盖声明的产物版本')
  if(receipt.state==='accepted'&&receipt.acceptance&&receipt.acceptance.files.some(file=>!sameFileVersions([file],[...versions.inputs,...versions.outputs].filter(v=>v.path===file.path))))throw new Error('后端验收内容与版本回执不一致')
  return receipt
 }catch(error){return versionFailure(error)}
}
