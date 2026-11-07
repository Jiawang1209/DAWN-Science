/** Read-only SDK estimate, never cumulative usage or provider-live occupancy. */
import {calculateContextTokens} from '@earendil-works/pi-coding-agent'
import {AgentContextSampleSchema,ContextRouteSchema,type AgentContextSample,type ContextRoute} from '../protocol/agent-context-observation.js'
type RecordValue=Record<string,unknown>
const record=(value:unknown):RecordValue=>value!==null&&typeof value==='object'?value as RecordValue:{}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER
const bytes=(value:unknown)=>typeof value==='string'?Buffer.byteLength(value,'utf8'):0
// Count only public retained content. In particular never serialize a whole SDK message/state.
function publicContentBytes(value:unknown):number {
 if(typeof value==='string')return bytes(value)
 if(!Array.isArray(value))return 0
 let total=0
 for(const block of value){const item=record(block)
  if(item.type==='text')total+=bytes(item.text)
  else if(item.type==='image')total+=bytes(item.data)+bytes(item.mimeType)
  else if(item.type==='toolCall')total+=bytes(item.name)+publicJsonBytes(item.arguments)
 }
 return total
}
const privateKey=/thinking|reasoning|redacted|signature/i
function publicJsonBytes(value:unknown,depth=0):number {
 if(depth>64)return 0
 if(typeof value==='string')return bytes(value)
 if(typeof value==='number'||typeof value==='boolean')return bytes(String(value))
 if(Array.isArray(value))return value.reduce((total,item)=>total+publicJsonBytes(item,depth+1),0)
 if(value&&typeof value==='object'){let total=0;for(const [key,item]of Object.entries(value)){if(privateKey.test(key)||typeof item==='function')continue;total+=bytes(key)+publicJsonBytes(item,depth+1)}return total}
 return 0
}
export function retainedContextComposition(state:unknown):AgentContextSample['composition'] {
 const st=record(state)
 if(typeof st.systemPrompt!=='string'||!Array.isArray(st.tools)||!Array.isArray(st.messages))return undefined
 let toolBytes=0,messageBytes=0
 for(const tool of st.tools){const t=record(tool);toolBytes+=bytes(t.name)+bytes(t.description)+publicJsonBytes(t.parameters)}
 for(const message of st.messages){const m=record(message)
  if(m.role==='user'||m.role==='assistant'||m.role==='toolResult')messageBytes+=publicContentBytes(m.content)
  else if(m.role==='compactionSummary')messageBytes+=bytes(m.summary)
 }
 return {systemBytes:bytes(st.systemPrompt),toolBytes,messageBytes,source:'retained-bytes-estimate'}
}
/** The SDK chooses its latest valid assistant usage, so that exact anchor must match this route. */
export function contextUsageAnchor(branch:readonly unknown[],route:ContextRoute):{tokens?:number;afterCompaction:boolean} {
 for(let i=branch.length-1;i>=0;i--){const entry=record(branch[i]);if(entry.type==='compaction')return{afterCompaction:true}
  if(entry.type!=='message')continue
  const m=record(entry.message)
  if(m.role!=='assistant'||m.stopReason==='aborted'||m.stopReason==='error'||!m.usage)continue
  const n=calculateContextTokens(m.usage as Parameters<typeof calculateContextTokens>[0])
  if(!finite(n)||n<=0)continue // Matches installed SDK valid-usage anchor semantics.
  return m.provider===route.provider&&m.model===route.model?{tokens:n,afterCompaction:false}:{afterCompaction:false}
 }
 return {afterCompaction:false}
}
export function sampleAgentContext(session:unknown,observedAt=Date.now()):AgentContextSample {
 const s=record(session),state=record(s.state),model=record(state.model??s.model)
 const route=ContextRouteSchema.parse({provider:model.provider,model:model.id})
 const capacity=finite(model.contextWindow)&&model.contextWindow>0?{contextWindow:model.contextWindow,contextWindowSource:'model-config' as const}:{}
 const composition=retainedContextComposition(state)
 const common={version:1 as const,observedAt,...route,...capacity,...(composition?{composition}:{})}
 const unknown=(reason:Extract<AgentContextSample,{availability:'unknown'}>['reason']):AgentContextSample=>AgentContextSampleSchema.parse({...common,availability:'unknown',source:'unknown',reason})
 try {
  const manager=record(s.sessionManager)
  if(typeof manager.getBranch!=='function'||typeof s.getContextUsage!=='function')return unknown('unsupported')
  const branch=manager.getBranch.call(s.sessionManager) as unknown
  if(!Array.isArray(branch))return unknown('unsupported')
  const anchor=contextUsageAnchor(branch,route)
  const usage=record(s.getContextUsage.call(session))
  if(usage.tokens===null||anchor.afterCompaction)return unknown('after-compaction')
  if(anchor.tokens===undefined)return unknown('no-current-route-anchor')
  if(!finite(usage.tokens))return unknown('sdk-unavailable')
  return AgentContextSampleSchema.parse({...common,availability:'available',source:'sdk-estimate',usedTokens:usage.tokens})
 }catch{return unknown('sample-failed')}
}
/** Sample only retained-message boundaries, never text/thinking deltas. Observer errors are isolated. */
export function observeAgentContext(session:unknown,report:(sample:AgentContextSample)=>void):()=>void {
 let closed=false,pending=false,lastSignature:string|undefined
 const sample=()=>{if(closed)return;try{
  const reading=sampleAgentContext(session),{observedAt:_,...numeric}=reading,signature=JSON.stringify(numeric)
  if(signature===lastSignature)return
  lastSignature=signature;report(reading)
 }catch{/* Numeric telemetry must not interrupt work. */}}
 sample()
 const s=record(session)
 if(typeof s.subscribe!=='function')return()=>{closed=true}
 let off:unknown
 try{off=s.subscribe.call(session,(event:unknown)=>{
  if(closed||pending||!['message_end','turn_end','compaction_end','agent_end'].includes(String(record(event).type)))return
  // Pi emits message_end before appending that message. Read after its synchronous persistence,
  // and coalesce adjacent boundaries rather than repeatedly traversing the same retained state.
  pending=true;queueMicrotask(()=>{pending=false;sample()})
 })}catch{return()=>{closed=true}}
 return()=>{closed=true;if(typeof off==='function')try{off()}catch{/* Observation cleanup only. */}}
}
