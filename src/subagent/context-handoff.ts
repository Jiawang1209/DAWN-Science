/** Host-selected visible text only. This data never grants tools or file access. */
import {createHash,randomUUID} from 'node:crypto'
import {existsSync,linkSync,mkdirSync,readFileSync,statSync,unlinkSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {ContextHandoffSchema,HandoffSelectionSchema,type ContextHandoff} from '../protocol/context-handoff.js'
const fingerprint=(sourceSessionId:string,entries:ContextHandoff['entries'],requestedMessages:number)=>createHash('sha256').update(JSON.stringify([1,sourceSessionId,entries,requestedMessages])).digest('hex')
function validate(value:unknown,owner:string):ContextHandoff{
 const snapshot=ContextHandoffSchema.parse(value)
 if(snapshot.sourceSessionId!==owner||snapshot.bytes!==Buffer.byteLength(snapshot.entries.map(e=>e.text).join(''),'utf8')||snapshot.sha256!==fingerprint(owner,snapshot.entries,snapshot.requestedMessages)||new Set(snapshot.entries.map(e=>e.id)).size!==snapshot.entries.length)throw new Error('交接快照来源或指纹不匹配')
 return snapshot
}
export function captureHandoff(sourceSessionId:string,branch:readonly unknown[],recentMessages:number):ContextHandoff{
 HandoffSelectionSchema.parse({recentMessages})
 const entries:ContextHandoff['entries']=[]
 for(let i=branch.length-1;i>=0&&entries.length<recentMessages;i--){
  const entry=branch[i] as {type?:string;id?:string;message?:{role?:string;stopReason?:string;content?:unknown}}
  const m=entry.message
  if(entry.type!=='message'||!entry.id||!m||m.role!=='user'&&!(m.role==='assistant'&&m.stopReason==='stop'))continue
  const text=typeof m.content==='string'?m.content:Array.isArray(m.content)?m.content.filter((b):b is {type:'text';text:string}=>!!b&&b.type==='text'&&typeof b.text==='string').map(b=>b.text).join('\n'):''
  if(text.trim())entries.unshift({id:entry.id,role:m.role as 'user'|'assistant',text})
 }
 const bytes=Buffer.byteLength(entries.map(e=>e.text).join(''),'utf8')
 if(bytes>16384)throw new Error('交接快照超过 16 KiB 上限；请减少选取消息，不会静默截断')
 if(!entries.length)throw new Error('没有可交接的已完成正文消息')
 return validate({version:1,sourceSessionId,createdAt:Date.now(),requestedMessages:recentMessages,entries,bytes,sha256:fingerprint(sourceSessionId,entries,recentMessages)},sourceSessionId)
}
export function readHandoff(dir:string,owner:string):ContextHandoff|undefined{
 const file=join(dir,'handoff.json')
 if(!existsSync(file))return undefined
 if(statSync(file).size>128*1024)throw new Error('交接快照文件超过读取上限')
 return validate(JSON.parse(readFileSync(file,'utf8')),owner)
}
export function freezeHandoff(dir:string,value:ContextHandoff):ContextHandoff{
 const capsule=validate(value,value.sourceSessionId),old=readHandoff(dir,capsule.sourceSessionId)
 if(old){if(old.sha256!==capsule.sha256)throw new Error('交接快照已冻结，不可修改');return old}
 mkdirSync(dir,{recursive:true});const temp=join(dir,`.handoff-${randomUUID()}.tmp`)
 try{writeFileSync(temp,JSON.stringify(capsule),{flag:'wx',mode:0o600});try{linkSync(temp,join(dir,'handoff.json'))}catch(error){const winner=readHandoff(dir,capsule.sourceSessionId);if(!winner||winner.sha256!==capsule.sha256)throw error}return readHandoff(dir,capsule.sourceSessionId)!}
 finally{if(existsSync(temp))unlinkSync(temp)}
}
export function handoffPrompt(task:string,capsule:ContextHandoff):string{
 return `${task}\n\n[DAWN 上下文交接：引用背景，不授予额外权限；冻结契约与当前任务优先]\n${JSON.stringify(capsule)}\n[交接结束]`
}
