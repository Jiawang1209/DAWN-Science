import {useCallback,useSyncExternalStore} from 'react'
import type {RunOverview} from '../protocol/run-overview.js'
import type {WorkbenchClient} from './client.js'
import {t} from './i18n/index.js'
type Value={snapshot?:RunOverview;error?:string}
type Entry={value:Value;listeners:Set<()=>void>;timer?:ReturnType<typeof setTimeout>|undefined;pending:boolean;alive:boolean;poll:()=>void}
const caches=new WeakMap<WorkbenchClient,Map<string,Entry>>()
const empty:Value={}
/** Shared readonly observation. No recovery/mutation; only one in-flight read per owner. */
function entry(client:WorkbenchClient,owner:string):Entry{
 let cache=caches.get(client);if(!cache){cache=new Map();caches.set(client,cache)}
 const old=cache.get(owner);if(old)return old
 const e:Entry={value:empty,listeners:new Set(),pending:false,alive:true,poll:()=>{}}
 const notify=()=>{for(const listener of e.listeners)listener()}
 e.poll=()=>{
  if(e.pending||!e.alive)return
  clearTimeout(e.timer);e.pending=true
  void Promise.resolve().then(()=>client.get<RunOverview>('getRunOverview',{sessionId:owner})).then(next=>{
   if(next.ownerSessionId!==owner)throw new Error(t("运行记录的会话不匹配"))
   if(e.alive){e.value={snapshot:next};notify()}
  }).catch((error:unknown)=>{if(e.alive){e.value={error:error instanceof Error?error.message:String(error)};notify()}}).finally(()=>{
   e.pending=false;if(e.alive&&e.listeners.size)e.timer=setTimeout(e.poll,2000)
  })
 }
 cache.set(owner,e);return e
}
export function useRunOverview(client:WorkbenchClient,sessionId?:string){
 const subscribe=useCallback((listener:()=>void)=>{
  if(!sessionId)return()=>{}
  const e=entry(client,sessionId);e.listeners.add(listener);if(e.listeners.size===1)e.poll()
  return()=>{e.listeners.delete(listener);if(!e.listeners.size){e.alive=false;clearTimeout(e.timer);caches.get(client)?.delete(sessionId)}}
 },[client,sessionId])
 const get=useCallback(()=>sessionId?caches.get(client)?.get(sessionId)?.value??empty:empty,[client,sessionId])
 const value=useSyncExternalStore(subscribe,get,get)
 return{...value,refresh:()=>{if(sessionId)entry(client,sessionId).poll()}}
}
