/** A read-only catalog query; no creation, execution, submission or approval authority. */
import {Type} from 'typebox'
import type {PlanningContractContext} from '../runtime/planning-contract-context.js'
import {科研契约目录工具名} from '../protocol/plan.js'

export function createGetPlanContractsTool(opts:{isPlanning:()=>boolean;context:()=>PlanningContractContext|undefined}){
 const text=(value:unknown,isError=false)=>({content:[{type:'text' as const,text:JSON.stringify(value)}],...(isError?{isError:true}:{}),details:undefined})
 return{name:科研契约目录工具名,label:科研契约目录工具名,description:'先出方案期间只读查询用户已确认的科研模板与精确契约引用；不会批准或启动执行。',parameters:Type.Object({}),
  async execute(_id:string,_params:Record<string,never>,signal?:AbortSignal){
   if(signal?.aborted)return text({available:false,reason:'本轮已停止，未读取目录'},true)
   if(!opts.isPlanning())return text({available:false,reason:'目录查询只在只读方案期可用'},true)
   try{
    const context=opts.context()
    if(!context)return text({available:false,reason:'尚无用户确认的科研约束；普通任务沿用完整contract，不猜测目录引用。'})
    return text({available:true,revision:context.revision,fingerprint:context.fingerprint,template:context.source.template,instructions:context.instructions,independentReview:context.source.independentReview,catalog:context.catalog,
     instruction:'目录不是任务数或执行批准。依据实际任务选择；保留已确认科学约束。提交propose_plan时带上catalogFingerprint=fingerprint核对来源；使用完整引用，不同时提交contract。'})
   }catch(error){return text({available:false,reason:(error instanceof Error?error.message:String(error)).slice(0,2000)},true)}
  },
 }
}
