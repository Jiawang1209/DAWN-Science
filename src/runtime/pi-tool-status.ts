import type {AgentSession} from '@earendil-works/pi-coding-agent'

/** Pi normally flags thrown failures. Preserve structured failures returned by DAWN tools too. */
export function preservePiToolStatus(agent:AgentSession['agent']):void{
 const after=agent.afterToolCall
 agent.afterToolCall=async(context,signal)=>{
  const isError=context.isError||Boolean((context.result as {isError?:boolean}).isError)
  const result=await after?.({...context,isError},signal)
  if(!result&&isError===context.isError)return undefined
  return{...result,isError:result?.isError??isError}
 }
}
