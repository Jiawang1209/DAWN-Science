/** Carries the existing execution identity through locks/adapters; never schedules work. */
import {AsyncLocalStorage} from 'node:async_hooks'
import type {ExecutionStage,LockOwner} from '../protocol/run-explanation.js'
export interface ExecutionContext extends LockOwner {
 report(stage:ExecutionStage,blockers?:LockOwner[],unknownBlockers?:boolean,resources?:string[]):void
 observationFailed():void
}
const execution=new AsyncLocalStorage<ExecutionContext>()
export const withExecutionContext=<T>(context:ExecutionContext,work:()=>T):T=>execution.run(context,work)
export const currentExecutionContext=()=>execution.getStore()
export function reportExecutionStage(stage:ExecutionStage,blockers?:LockOwner[],unknownBlockers?:boolean,context=currentExecutionContext(),resources?:string[]):void{
 if(!context)return
 try{context.report(stage,blockers,unknownBlockers,resources)}catch{context.observationFailed()}
}
