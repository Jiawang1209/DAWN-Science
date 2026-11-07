import {createHash} from 'node:crypto'
import {taskEvidenceTag} from './task-submission.js'
import {basename} from 'node:path'
import type {SessionEntry,FileEntry} from '@earendil-works/pi-coding-agent'
import type {RouteToolEvidence} from '../runtime/analysis-route-evidence.js'
import {ToolRecordRefSchema,type ToolRecordRef,type ToolRecordResponse} from '../protocol/tool-record.js'

/** Capture coordinates from the current invocation only. No second copy of tool payloads. */
export function bindToolRecords(records:readonly RouteToolEvidence[],entries:readonly SessionEntry[],file:string|undefined,hasHostTags=false):RouteToolEvidence[]{
 if(!file)return [...records]
 const calls=new Map<string,{id:string;index:number;name:string;input:unknown}|null>()
 const results=new Map<string,{id:string;index:number;name:string;error:boolean;content:unknown}|null>()
 const counts=new Map<string,number>()
 for(const [index,entry] of entries.entries()){
  if(entry.type!=='message')continue
  const msg=entry.message
  if(msg.role==='assistant')for(const call of msg.content)if(call.type==='toolCall')
   calls.set(call.id,calls.has(call.id)?null:{id:entry.id,index,name:call.name,input:call.arguments})
  if(msg.role==='toolResult')results.set(msg.toolCallId,results.has(msg.toolCallId)?null:{id:entry.id,index,name:msg.toolName,error:msg.isError,content:msg.content})
 }
 for(const record of records)counts.set(record.toolCallId,(counts.get(record.toolCallId)??0)+1)
 return records.map(record=>{
  const call=calls.get(record.toolCallId),result=results.get(record.toolCallId)
  if(counts.get(record.toolCallId)!==1||!call||!result||call.index>=result.index||call.name!==record.name||result.name!==record.name||result.error!==(record.status==='error'))return record
  const ref=ToolRecordRefSchema.safeParse({file:basename(file),callEntry:call.id,resultEntry:result.id,payloadSha256:payloadFingerprint(call.input,result.content),...(hasHostTags?{evidenceTagSha256:sha256(taskEvidenceTag(record))}:{})})
  return ref.success?{...record,transcriptRef:ref.data}:record
 })
}

const sha256=(text:string)=>createHash('sha256').update(text).digest('hex')
const payloadFingerprint=(input:unknown,content:unknown)=>sha256(JSON.stringify([input,content]))
const unavailable={state:'unavailable'} as const
export function selectToolRecord(entries:readonly FileEntry[],record:{toolCallId:string;name:string;status:'done'|'error';transcriptRef?:ToolRecordRef|undefined}):ToolRecordResponse{
 const ref=record.transcriptRef
 if(!ref?.payloadSha256)return unavailable
 const matches=entries.flatMap((entry,index)=>entry.type==='message'&&(entry.id===ref.callEntry||entry.id===ref.resultEntry)?[{entry,index}]:[])
 if(matches.length!==2)return unavailable
 const [first,second]=matches
 if(first!.entry.id!==ref.callEntry||second!.entry.id!==ref.resultEntry)return unavailable
 const call=first!.entry.message,result=second!.entry.message
 if(call.role!=='assistant'||result.role!=='toolResult'||result.toolCallId!==record.toolCallId||result.toolName!==record.name||result.isError!==(record.status==='error'))return unavailable
 const blocks=call.content.filter(c=>c.type==='toolCall'&&c.id===record.toolCallId)
 if(blocks.length!==1||blocks[0]?.type!=='toolCall'||blocks[0].name!==record.name)return unavailable
 if(ref.payloadSha256!==payloadFingerprint(blocks[0].arguments,result.content))return unavailable
 const last=result.content.at(-1)
 const evidenceTag=last?.type==='text'&&last.text.length<=4096&&ref.evidenceTagSha256===sha256(last.text)?last.text:undefined
 const body=evidenceTag===undefined?result.content:result.content.slice(0,-1)
 const input=JSON.stringify(blocks[0].arguments,null,2)??'',output=body.flatMap(block=>block.type==='text'?[block.text]:[]).join('\n')
 return{state:'available',input:input.slice(0,8192),output:output.slice(0,16384),...(evidenceTag===undefined?{}:{evidenceTag}),clipped:input.length>8192||output.length>16384||body.some(b=>b.type!=='text')}
}
