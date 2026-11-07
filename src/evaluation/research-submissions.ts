/** Submission accounting from caller-owned Pi transcripts; never executes transcript content. */
export interface SubmissionDiagnostics {
 hostAttempts:number
 hostRejected:number
 sdkRejected?:number
 outputLimitNotExecuted?:number
 source:'host-and-transcript'|'host-only'
 complete:boolean
}
/** One child/epoch only. The reader must flag missing files or malformed/truncated JSONL. */
export interface SubmissionTranscriptScope {scopeId:string;entries:readonly unknown[];complete:boolean}
const submissionTool='submit_task_result'
const messageRoles=new Set(['system','user','assistant','toolResult','bashExecution','custom','branchSummary','compactionSummary'])
const outputLimit='Tool call "submit_task_result" was not executed: the response hit the output token limit, so its arguments may be truncated. Re-issue the tool call with complete arguments.'
const harnessOutputLimit='Tool call "submit_task_result" was not executed because the assistant response hit the output token limit, so its arguments may be truncated. Re-issue the tool call with complete arguments.'
const record=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined
const validId=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0

function contentBlocks(value:unknown,images:boolean):boolean {
 return Array.isArray(value)&&value.every(item=>{
  const block=record(item)
  if(!block||block.truncated===true)return false
  return block.type==='text'&&typeof block.text==='string'||images&&block.type==='image'&&typeof block.data==='string'&&typeof block.mimeType==='string'
 })
}
function ordinaryMessageValid(message:Record<string,unknown>):boolean {
 const content=(images:boolean)=>typeof message.content==='string'||contentBlocks(message.content,images)
 switch(message.role){
  case'system':return content(false)
  case'user':return content(true)
  case'custom':return validId(message.customType)&&typeof message.display==='boolean'&&content(true)
  case'branchSummary':return typeof message.summary==='string'&&(message.fromId===null||validId(message.fromId))
  case'compactionSummary':return typeof message.summary==='string'&&typeof message.tokensBefore==='number'&&Number.isFinite(message.tokensBefore)&&message.tokensBefore>=0
  case'bashExecution':return typeof message.command==='string'&&typeof message.output==='string'&&typeof message.cancelled==='boolean'&&typeof message.truncated==='boolean'&&(message.exitCode===undefined||typeof message.exitCode==='number'&&Number.isFinite(message.exitCode))
  default:return true // Assistant declarations and tool results are checked separately.
 }
}

type Outcome='sdk'|'output-limit'|'host-accepted'|'host-rejected'
function sdkValidationError(text:string):boolean {
 const marker='\n\nReceived arguments:\n',index=text.indexOf(marker)
 if(index<0)return false
 const header=text.slice(0,index)
 const prefix='Validation failed for tool "submit_task_result":\n'
 if(!header.startsWith(prefix))return false
 const errors=header.slice(prefix.length)
 // Each character is inspected a bounded number of times; no nested regex backtracking.
 if(errors!=='Unknown validation error'&&!errors.split('\n').every(line=>line.startsWith('  - ')&&line.length>4))return false
 try{JSON.parse(text.slice(index+marker.length));return true}catch{return false}
}
function submissionOutcome(message:Record<string,unknown>):Outcome|undefined {
 // SDK and host produce a single text block. Never search arbitrary text/JSON for labels.
 if(message.truncated===true||!Array.isArray(message.content)||message.content.length!==1)return
 const content=record(message.content[0])
 if(content?.type!=='text'||typeof content.text!=='string'||content.truncated===true)return
 const text=content.text
 if(message.isError===true){
  if(text===outputLimit||text===harnessOutputLimit)return'output-limit'
  if(sdkValidationError(text))return'sdk'
 }
 try{
  const receipt=record(JSON.parse(text))
  if(receipt?.recorded===false)return'host-rejected'
  if(receipt?.recorded===true&&(receipt.state==='accepted'||receipt.state==='blocked'))return'host-accepted'
 }catch{/* Unknown or cropped JSON is not proof of any rejection category. */}
}

/** Host observations stay authoritative; uncertain transcript totals are omitted, never zero-filled. */
export function researchSubmissionDiagnostics(host:{hostAttempts:number;hostRejected:number},scopes?:readonly SubmissionTranscriptScope[]):SubmissionDiagnostics {
 const incomplete:SubmissionDiagnostics={...host,source:scopes?.length?'host-and-transcript':'host-only',complete:false}
 if(!scopes?.length)return incomplete
 const scopeIds=new Set<string>()
 let sdkRejected=0,outputLimitNotExecuted=0,hostAttempts=0,hostRejected=0
 for(const scope of scopes){
  if(!scope.complete||!validId(scope.scopeId)||scopeIds.has(scope.scopeId))return incomplete
  scopeIds.add(scope.scopeId)
  const calls=new Map<string,{name:unknown;index:number}[]>()
  const results=new Map<string,{message:Record<string,unknown>;index:number}[]>()
  for(const [index,entry] of scope.entries.entries()){
   const item=record(entry),message=item?.type==='message'?record(item.message):undefined
   if(!item||!validId(item.type)||item.type==='message'&&!message)return incomplete
   if(message&&(typeof message.role!=='string'||!messageRoles.has(message.role)))return incomplete
   if(message&&!ordinaryMessageValid(message))return incomplete
   // bashExecution.truncated describes ordinary shell output, not missing transcript records.
   if((message?.role==='assistant'||message?.role==='toolResult')&&message.truncated===true)return incomplete
   if(message?.role==='assistant'&&!Array.isArray(message.content))return incomplete
   if(message?.role==='assistant'&&Array.isArray(message.content)){
    for(const value of message.content){
     const part=record(value)
     if(!part||part.truncated===true)return incomplete
     if(part.type==='text'&&typeof part.text==='string'||part.type==='thinking'&&typeof part.thinking==='string')continue
     if(part.type!=='toolCall')return incomplete
     if(!validId(part.id)||!validId(part.name))return incomplete
     const declarations=calls.get(part.id)??[]
     declarations.push({name:part.name,index});calls.set(part.id,declarations)
    }
   }else if(message?.role==='toolResult'){
    if(!validId(message.toolCallId)||!validId(message.toolName)||typeof message.isError!=='boolean'||!contentBlocks(message.content,true))return incomplete
    const outcomes=results.get(message.toolCallId)??[]
    outcomes.push({message,index});results.set(message.toolCallId,outcomes)
   }
  }
  // Include orphan submission results: a scope with missing declarations is incomplete.
  const submissionIds=new Set([...calls].filter(([,items])=>items.some(item=>item.name===submissionTool)).map(([id])=>id))
  for(const [id,items] of results)if(items.some(item=>item.message.toolName===submissionTool))submissionIds.add(id)
  for(const id of submissionIds){
   const declarations=calls.get(id),outcomes=results.get(id)
   if(declarations?.length!==1||outcomes?.length!==1)return incomplete
   const declaration=declarations[0]!,result=outcomes[0]!
   if(declaration.name!==submissionTool||result.message.toolName!==submissionTool||result.index<=declaration.index)return incomplete
   const outcome=submissionOutcome(result.message)
   if(!outcome)return incomplete
   if(outcome==='sdk')sdkRejected++
   else if(outcome==='output-limit')outputLimitNotExecuted++
   else{hostAttempts++;if(outcome==='host-rejected')hostRejected++}
  }
 }
 // Detect gaps even if the reader accidentally supplied an otherwise well-formed subset.
 if(hostAttempts!==host.hostAttempts||hostRejected!==host.hostRejected)return incomplete
 return{...host,sdkRejected,outputLimitNotExecuted,source:'host-and-transcript',complete:true}
}
