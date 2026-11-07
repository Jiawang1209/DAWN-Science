/** Bounded post-drain reads of exact host-bound synthetic trial directories; no recursive discovery. */
import {closeSync,constants,fstatSync,lstatSync,openSync,readdirSync,readSync,realpathSync} from 'node:fs'
import {isAbsolute,join} from 'node:path'
import type {SubmissionTranscriptScope} from '../src/evaluation/research-submissions.js'
export interface ResearchTranscriptBinding {scopeId:string;relativeDirectory:string}
type Issue={scopeId:string;reason:'missing'|'ambiguous'|'unsafe'|'oversized'|'invalid'|'truncated'}
const maxBytes=8*1024*1024
export function readResearchTranscripts(root:string,bindings:readonly ResearchTranscriptBinding[]):{scopes?:SubmissionTranscriptScope[];issues:Issue[]}{
 const issues:Issue[]=[],scopes:SubmissionTranscriptScope[]=[];let observed=false
 for(const binding of bindings){
  let fd:number|undefined
  const fail=(reason:Issue['reason'])=>{issues.push({scopeId:binding.scopeId,reason});scopes.push({scopeId:binding.scopeId,entries:[],complete:false})}
  try{
   const parts=binding.relativeDirectory.split('/')
   if(isAbsolute(binding.relativeDirectory)||binding.relativeDirectory.includes('\\')||parts.some(p=>!p||p==='.'||p==='..')){fail('unsafe');continue}
   let directory=realpathSync(root),unsafe=false
   for(const part of parts){directory=join(directory,part);if(lstatSync(directory).isSymbolicLink()){unsafe=true;break}}
   if(unsafe){fail('unsafe');continue}
   const files=readdirSync(directory,{withFileTypes:true}).filter(e=>e.name.endsWith('.jsonl'))
   if(files.length!==1){fail(files.length?'ambiguous':'missing');continue}
   if(!files[0]!.isFile()||files[0]!.isSymbolicLink()){fail('unsafe');continue}
   fd=openSync(join(directory,files[0]!.name),constants.O_RDONLY|(constants.O_NOFOLLOW??0))
   const stat=fstatSync(fd)
   if(!stat.isFile()){fail('unsafe');continue}
   if(stat.size>maxBytes){fail('oversized');continue}
   const chunks:Buffer[]=[];let total=0
   for(;;){
    const chunk=Buffer.alloc(Math.min(65536,maxBytes+1-total)),n=readSync(fd,chunk,0,chunk.length,null)
    if(!n)break
    chunks.push(chunk.subarray(0,n));total+=n
    if(total>maxBytes)break
   }
   if(total>maxBytes){fail('oversized');continue}
   const text=Buffer.concat(chunks).toString('utf8'),lines=text.split('\n'),entries:unknown[]=[]
   let complete=text.endsWith('\n')&&text.length>0
   if(complete)lines.pop()
   let invalid=false
   for(const line of lines){try{const entry:unknown=JSON.parse(line);if(entry===null||typeof entry!=='object'||Array.isArray(entry))throw new Error('invalid entry');entries.push(entry)}catch{complete=false;invalid=true;break}}
   if(invalid)issues.push({scopeId:binding.scopeId,reason:'invalid'})
   else if(!complete)issues.push({scopeId:binding.scopeId,reason:'truncated'})
   observed=observed||entries.length>0||complete;scopes.push({scopeId:binding.scopeId,entries,complete})
  }catch{fail('missing')}
  finally{if(fd!==undefined)closeSync(fd)}
 }
 return{...(observed?{scopes}:{}),issues}
}
