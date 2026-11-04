/** One turn's terminal result ownership, shared by Pi children and managed Bots. */
import {acceptTaskResult,TaskResultSchema,TaskResultParameters,type TaskContract,type TaskResult,type TaskReceipt} from './task-contract.js'
import type {RouteToolEvidence} from '../runtime/analysis-route-evidence.js'
export class TaskSubmission {
 private active=0
 private committed:{result:TaskResult;receipt:TaskReceipt}|undefined
 private proof:RouteToolEvidence[]|undefined
 private attempts=0
 private invalid=0
 constructor(private readonly contract:TaskContract,private readonly workspace:string,private readonly evidence:()=>readonly RouteToolEvidence[]){}
 denial():string|undefined{return this.committed?'结果已经提交，本轮工具已冻结':undefined}
 enter():()=>void {
  const denial=this.denial();if(denial)throw new Error(denial)
  this.active++;let released=false
  return()=>{if(!released){released=true;this.active--}}
 }
 submit(value:unknown,signal?:AbortSignal){
  this.attempts++
  try{
   if(signal?.aborted)throw new Error('本轮已停止，不能提交')
   if(this.committed)throw new Error('结果已经提交，不能重复提交')
   if(this.active)throw new Error('仍有工具执行中，请等待排空后再提交')
   const result=TaskResultSchema.parse(value)
   if(Buffer.byteLength(JSON.stringify(result),'utf8')>64*1024)throw new Error('提交结果超过 64 KiB，请缩短摘要和数据')
   const receipt=acceptTaskResult(this.contract,JSON.stringify(result),this.evidence(),this.workspace)
   if(receipt.state==='invalid')throw new Error(receipt.reason??'未通过验收')
   this.committed=structuredClone({result,receipt})
   this.proof=structuredClone([...this.evidence()])
   return{content:[{type:'text' as const,text:JSON.stringify({recorded:true,state:receipt.state,reason:receipt.reason})}],details:undefined}
  }catch(error){this.invalid++;return{content:[{type:'text' as const,text:`提交未接受，可修正后再次调用：${error instanceof Error?error.message:String(error)}`}],isError:true,details:undefined}}
 }
 result():TaskResult|undefined{return this.committed?structuredClone(this.committed.result):undefined}
 receipt():TaskReceipt|undefined{return this.committed?structuredClone(this.committed.receipt):undefined}
 sealedEvidence():RouteToolEvidence[]|undefined{return this.proof?structuredClone(this.proof):undefined}
 observation(){return{submissionAttempts:this.attempts,invalidSubmissions:this.invalid}}
 tool(){return{name:'submit_task_result',label:'submit_task_result',description:'正式提交本轮最终任务结果；参数错误可当轮修正。成功提交（含 blocked）后冻结后续工具，不能追加写入、执行或委派。',parameters:TaskResultParameters,execute:async(_id:string,params:unknown,signal?:AbortSignal)=>this.submit(params,signal)}}
}
