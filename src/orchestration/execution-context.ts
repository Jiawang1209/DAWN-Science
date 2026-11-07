/** Carries the existing execution identity through locks/adapters; never schedules work. */
import {AsyncLocalStorage} from 'node:async_hooks'
import type {ContextRoute,AgentContextSample} from '../protocol/agent-context-observation.js'
import type {ExecutionStage,LockOwner} from '../protocol/run-explanation.js'
export interface ExecutionContext extends LockOwner {
 report(stage:ExecutionStage,blockers?:LockOwner[],unknownBlockers?:boolean,resources?:string[]):void
 /** Host route binding is captured at actual spawn/scope entry; independent of steering and task settings. */
 bindContextRoute?(route:ContextRoute):(sample:unknown)=>void
 observationFailed():void
}
const execution=new AsyncLocalStorage<ExecutionContext>()
export const withExecutionContext=<T>(context:ExecutionContext,work:()=>T):T=>execution.run(context,work)
export const currentExecutionContext=()=>execution.getStore()
export function reportExecutionStage(stage:ExecutionStage,blockers?:LockOwner[],unknownBlockers?:boolean,context=currentExecutionContext(),resources?:string[]):void{
 if(!context)return
 try{context.report(stage,blockers,unknownBlockers,resources)}catch{context.observationFailed()}
}

export function bindExecutionContextRoute(route:ContextRoute,context=currentExecutionContext()):(sample:AgentContextSample|unknown)=>void {
 try{return context?.bindContextRoute?.(route)??(()=>{})}catch{return()=>{}}
}
