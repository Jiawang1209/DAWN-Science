import {posix,resolve,dirname,basename,join} from "node:path"
import {realpathSync} from "node:fs"
/** Resolve existing ancestors too: not-yet-created files can still have symlink aliases. */
export function canonicalOutputPaths(outputs:readonly string[]|undefined,workspace:string):string[]|undefined {
 return outputs?.map(output=>{
  if(output==="*")return output
  let current=resolve(workspace,output);const tail:string[]=[]
  for(;;){
   try{return join(realpathSync(current),...tail)}catch{
    const parent=dirname(current);if(parent===current)return resolve(workspace,output)
    tail.unshift(basename(current));current=parent
   }
  }
 })
}
interface Entry {scope:string;paths:string[];start():void;cancel():void}
const overlaps=(a:string[],b:string[])=>a.some(x=>b.some(y=>x==="*"||y==="*"||x===y||x.startsWith(y+"/")||y.startsWith(x+"/")))
/** Declared output reservations; unknown output sets take the whole scope. */
export class BotOutputLocks {
 private active=new Set<Entry>();private queue:Entry[]=[]
 acquire(scope:string,outputs:readonly string[]|undefined,signal:AbortSignal):Promise<()=>void>{
  return new Promise((resolve,reject)=>{
   if(signal.aborted){reject(new Error("任务已停止"));return}
   const paths=outputs?.length?outputs.map(p=>posix.normalize(p.replace(/\\/g,"/"))):["*"]
   const entry:Entry={scope,paths,start:()=>{
    signal.removeEventListener("abort",entry.cancel);this.active.add(entry);let released=false
    resolve(()=>{if(released)return;released=true;this.active.delete(entry);this.drain()})
   },cancel:()=>{this.queue=this.queue.filter(e=>e!==entry);reject(new Error("任务已停止"));this.drain()}}
   signal.addEventListener("abort",entry.cancel,{once:true});this.queue.push(entry);this.drain()
  })
 }
 private drain(){
  const blocked:Entry[]=[]
  for(const entry of [...this.queue]){
   if([...this.active,...blocked].some(e=>e.scope===entry.scope&&overlaps(e.paths,entry.paths))){blocked.push(entry);continue}
   this.queue=this.queue.filter(e=>e!==entry);entry.start()
  }
 }
}
