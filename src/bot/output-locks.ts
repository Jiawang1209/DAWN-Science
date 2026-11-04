import {posix,resolve,dirname,basename,join} from "node:path"
import {realpathSync,statSync} from "node:fs"
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
/** Local reservations include existing file identity: realpath cannot unify hard links.
 * Keep this separate from canonical paths used for permission checks and remote paths. */
export function localOutputReservationPaths(outputs:readonly string[]|undefined,workspace:string):string[]|undefined {
 const paths=canonicalOutputPaths(outputs,workspace)
 return paths?.flatMap(path=>{
  if(path==='*')return[path]
  try{const file=statSync(path);return file.isFile()?[path,`inode:${file.dev}:${file.ino}`]:[path]}catch{return[path]}
 })
}
/** Conservative reservation identity only; permission checks keep the actual paths.
 * Future names may alias on case/normalization-insensitive filesystems. */
export const outputReservationKey=(path:string)=>posix.normalize(path.replace(/\\/g,'/')).normalize('NFD').toLowerCase()
const reservationKeys=(paths:readonly string[]|undefined)=>paths?.length?[...new Set(paths.map(outputReservationKey))]:['*']
interface Entry {scope:string;paths:string[];resolvePaths:(()=>readonly string[]|undefined)|undefined;start():void;cancel():void}
const overlaps=(a:string[],b:string[])=>a.some(x=>b.some(y=>x==="*"||y==="*"||x===y||x.startsWith(y+"/")||y.startsWith(x+"/")))
/** Declared output reservations; unknown output sets take the whole scope. */
export class BotOutputLocks {
 private active=new Set<Entry>();private queue:Entry[]=[]
 acquire(scope:string,outputs:readonly string[]|undefined,signal:AbortSignal,resolvePaths?:()=>readonly string[]|undefined):Promise<()=>void>{
  return new Promise((resolve,reject)=>{
   if(signal.aborted){reject(new Error("任务已停止"));return}
   const paths=reservationKeys(outputs)
   const entry:Entry={scope,paths,resolvePaths,start:()=>{
    signal.removeEventListener("abort",entry.cancel);this.active.add(entry);let released=false
    resolve(()=>{if(released)return;released=true;this.active.delete(entry);this.drain()})
   },cancel:()=>{this.queue=this.queue.filter(e=>e!==entry);reject(new Error("任务已停止"));this.drain()}}
   signal.addEventListener("abort",entry.cancel,{once:true});this.queue.push(entry);this.drain()
  })
 }
 private drain(){
  // Resolve in this synchronous admission section, after any previous owner's replacements.
  // Active owners retain old inode keys too: an open descriptor/old hard link may still use them.
  const refresh=(entry:Entry,active:boolean)=>{
   if(!entry.resolvePaths)return
   let current:string[];try{current=reservationKeys(entry.resolvePaths())}catch{current=['*']}
   entry.paths=active?[...new Set([...entry.paths,...current])]:current
  }
  for(const entry of this.active)refresh(entry,true)
  for(const entry of this.queue)refresh(entry,false)
  const blocked:Entry[]=[]
  for(const entry of [...this.queue]){
   if([...this.active,...blocked].some(e=>e.scope===entry.scope&&overlaps(e.paths,entry.paths))){blocked.push(entry);continue}
   this.queue=this.queue.filter(e=>e!==entry);entry.start()
  }
 }
}

/** One writer reservation pool for all local execution adapters, including different parent chats. */
export const sharedTaskOutputLocks = new BotOutputLocks()
export function outputLockScope(workspace:string):string {
 return `workspace:${outputReservationKey(realpathSync(workspace))}`
}
export function localTaskOutputReservation(workspace:string,paths:readonly string[]|undefined,signal:AbortSignal):Promise<()=>void>{
 const references=paths?[...paths]:undefined,resolvePaths=()=>localOutputReservationPaths(references,workspace)
 return sharedTaskOutputLocks.acquire(outputLockScope(workspace),resolvePaths(),signal,resolvePaths)
}
export async function taskOutputReservation(workspace:string,settings:import('../orchestration/task-contract.js').TaskSettings,signal:AbortSignal):Promise<()=>void> {
 const {scope}=settings
 // Scientific checks/reviews hold the existing reservation pool through host acceptance.
 if(scope.access==='read-only'&&(settings.contract?.resultType||settings.versions)&&scope.inputs.length)return localTaskOutputReservation(workspace,scope.inputs,signal)
 if(scope.access==='read-only'||(!settings.versions&&!scope.tools.includes('*')&&scope.tools.every(name=>['read','ls','grep','find','resource_search','resource_read','team_send','team_status'].includes(name))))return()=>{}
 const outputs=scope.access==='workspace-write'?(settings.versions?[...scope.inputs,...scope.outputs]:scope.outputs):undefined
 return localTaskOutputReservation(workspace,outputs,signal)
}
