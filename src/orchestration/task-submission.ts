/** One turn's terminal result ownership, shared by Pi children and managed Bots. */
import {finalizeTaskVersions} from '../artifacts/task-versions.js'
import type {TaskSettings} from '../protocol/task-contract.js'
import {acceptTaskResult,TaskResultSchema,TaskResultParameters,type TaskContract,type TaskResult,type TaskReceipt} from './task-contract.js'
import type {RouteToolEvidence} from '../runtime/analysis-route-evidence.js'
import {ZodError} from 'zod'
const catalogLimit=8,pathLimit=16,fieldLimit=256
/** Budget JSON-escaped UTF-8 bytes, including control characters and Unicode. */
const bounded=(value:string,limit=fieldLimit)=>{
 let bytes=0,end=0
 for(const char of value){const cost=Buffer.byteLength(JSON.stringify(char),'utf8')-2;if(bytes+cost>limit)break;bytes+=cost;end+=char.length}
 return value.slice(0,end)
}
/** A display projection only. Never feed this back into scientific evidence. */
export function taskEvidenceMetadata(record:RouteToolEvidence){
 const truncatedFields:string[]=[]
 const field=(key:string,value:string,limit=fieldLimit)=>{const text=bounded(value,limit);if(text!==value)truncatedFields.push(key);return text}
 const input=record.input&&typeof record.input==='object'?record.input as {path?:unknown}:undefined
 const path=['read','write','edit','ls','grep','find'].includes(record.name)&&typeof input?.path==='string'?input.path:undefined
 return{toolCallId:field('toolCallId',record.toolCallId),name:field('name',record.name,80),status:record.status,execution:record.execution??'not_observed',
  ...(path!==undefined?{path:field('path',path)}:{}),
  ...(record.filesWritten?{filesWritten:record.filesWritten.slice(0,2).map((p,i)=>field(`filesWritten.${i}`,p)),filesWrittenOmitted:Math.max(0,record.filesWritten.length-2)}:{}),truncatedFields}
}
export function appendTaskEvidence<T extends {content?:{type?:string;text?:string}[]}>(result:T,record:RouteToolEvidence):T {
 return{...result,content:[...(result.content??[]),{type:'text',text:`[task_tool_evidence] ${JSON.stringify(taskEvidenceMetadata(record))}`}]}
}
export class TaskSubmission {
 private active=0
 private validating=false
 private committed:{result:TaskResult;receipt:TaskReceipt}|undefined
 private proof:RouteToolEvidence[]|undefined
 private attempts=0
 private invalid=0
 constructor(private readonly contract:TaskContract,private readonly workspace:string,private readonly evidence:()=>readonly RouteToolEvidence[],private readonly versions?:TaskSettings['versions']){}
 denial():string|undefined{return this.committed?'结果已经提交，本轮工具已冻结':this.validating?'正在核验内容版本，请等待提交结束':undefined}
 enter():()=>void {
  const denial=this.denial();if(denial)throw new Error(denial)
  this.active++;let released=false
  return()=>{if(!released){released=true;this.active--}}
 }
 async submit(value:unknown,signal?:AbortSignal){
  this.attempts++
  try{
   if(signal?.aborted)throw new Error('本轮已停止，不能提交')
   if(this.committed)throw new Error('结果已经提交，不能重复提交')
   if(this.validating)throw new Error('正在核验内容版本，不能重复提交')
   if(this.active)throw new Error('仍有工具执行中，请等待排空后再提交')
   const result=TaskResultSchema.parse(value)
   if(Buffer.byteLength(JSON.stringify(result),'utf8')>64*1024)throw new Error('提交结果超过 64 KiB，请缩短摘要和数据')
   let receipt=acceptTaskResult(this.contract,JSON.stringify(result),this.evidence(),this.workspace)
   if(receipt.state==='invalid')throw new Error(receipt.reason??'未通过验收')
   if(this.versions||this.contract.acceptance){
    this.validating=true
    try{receipt=await finalizeTaskVersions({contract:this.contract,scope:{version:1,tier:'deny-risky',access:this.contract.access,tools:[],inputs:this.contract.inputs,outputs:this.contract.outputs},versions:this.versions},receipt,this.workspace,signal,{evidence:this.evidence()})}finally{this.validating=false}
   }
   if(signal?.aborted)throw new Error('本轮已停止，不能提交')
   this.committed=structuredClone({result,receipt})
   this.proof=structuredClone([...this.evidence()])
   return{content:[{type:'text' as const,text:JSON.stringify({recorded:true,state:receipt.state,reason:receipt.reason})}],details:undefined}
  }catch(error){this.invalid++;return{content:[{type:'text' as const,text:JSON.stringify(this.feedback(error,signal?.aborted??false))}],isError:true,details:undefined}}
 }
 feedback(error:unknown,aborted=false){
  const issues=error instanceof ZodError?error.issues:[]
  const message=error instanceof ZodError?'提交字段未通过校验，请按 fieldErrors 修正':error instanceof Error?error.message:String(error)
  const truncatedFields:string[]=[]
  const paths=(key:string,values:readonly string[])=>{const selected=values.slice(0,pathLimit).map(v=>bounded(v));if(values.length>pathLimit||selected.some((v,i)=>v!==values[i]))truncatedFields.push(key);return selected}
  const reads=this.contract.resultType==='review'||this.contract.resultType==='data-summary'&&this.contract.requireReview?this.contract.inputs:[]
  const contract={access:this.contract.access,resultType:this.contract.resultType??null,requireExecution:this.contract.requireExecution,requireReview:this.contract.requireReview,
   inputs:paths('inputs',this.contract.inputs),outputs:paths('outputs',this.contract.outputs),readRequirements:paths('readRequirements',reads),
   inputsOmitted:Math.max(0,this.contract.inputs.length-pathLimit),outputsOmitted:Math.max(0,this.contract.outputs.length-pathLimit),readRequirementsOmitted:Math.max(0,reads.length-pathLimit),truncatedFields}
  const evidence=this.proof??this.evidence()
  const phase=this.committed?'sealed':aborted?'cancelled':this.validating?'validating':this.active?'draining':'correctable'
  return{recorded:false,phase,retryable:phase==='correctable',...(this.committed?{sealedState:this.committed.receipt.state}:{}),error:bounded(message,512),errorTruncated:bounded(message,512)!==message,
   fieldErrors:issues.slice(0,12).map(issue=>{const path=issue.path.map(String).join('.')||'$',clippedPath=bounded(path),clippedMessage=bounded(issue.message,160);return{path:clippedPath,message:clippedMessage,truncated:clippedPath!==path||clippedMessage!==issue.message}}),fieldErrorsOmitted:Math.max(0,issues.length-12),
   contract,evidenceCatalog:{entries:evidence.slice(-catalogLimit).map(taskEvidenceMetadata),total:evidence.length,omitted:Math.max(0,evidence.length-catalogLimit)},
   instruction:phase==='sealed'?'本轮已有正式结果，工具已冻结；不能再次提交或追加执行。':phase==='cancelled'?'当前调用已取消，不能在已停止的调用中重试；交还主 agent 核对。':phase==='validating'?'已有提交正在核验，请等待本次提交结束，不要重复提交。':phase==='draining'?'等待所有工具执行排空后再修正提交；不能并发追加提交。':'修正后可在本轮再次提交；仅引用本任务实际证据中未截断的 toolCallId。截断字段不完整；原冻结契约仍为准。工具完成不代表科学结论正确。'}
 }
 result():TaskResult|undefined{return this.committed?structuredClone(this.committed.result):undefined}
 receipt():TaskReceipt|undefined{return this.committed?structuredClone(this.committed.receipt):undefined}
 sealedEvidence():RouteToolEvidence[]|undefined{return this.proof?structuredClone(this.proof):undefined}
 observation(){return{submissionAttempts:this.attempts,invalidSubmissions:this.invalid}}
 tool(){return{name:'submit_task_result',label:'submit_task_result',description:'正式提交本轮最终任务结果；参数错误可当轮修正。成功提交（含 blocked）后冻结后续工具，不能追加写入、执行或委派。',parameters:TaskResultParameters,execute:async(_id:string,params:unknown,signal?:AbortSignal)=>this.submit(params,signal)}}
}
