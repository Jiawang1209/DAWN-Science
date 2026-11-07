import {useCallback,useSyncExternalStore} from 'react'
import type {RunOverview,RunOverviewChanged} from '../protocol/run-overview.js'
import type {WorkbenchClient} from './client.js'
import {t} from './i18n/index.js'

type Value={snapshot?:RunOverview;error?:string}
type Observation=NonNullable<RunOverview['observation']>
type Entry={
 value:Value;listeners:Set<()=>void>;timer?:ReturnType<typeof setTimeout>|undefined
 unsubscribe?:()=>void;pending:boolean;trailing:boolean;alive:boolean
 observation?:Observation;diskHint:boolean;retired:Set<string>;noticeSequence:number;poll:()=>void
}
const caches=new WeakMap<WorkbenchClient,Map<string,Entry>>()
const empty:Value={}

/** A service UUID can retire once; the reserved disk marker can recur after every service. */
function observe(e:Entry,next:Observation){
 const previous=e.observation
 if(previous&&previous.observerId!==next.observerId&&previous.observerId!=='disk')e.retired.add(previous.observerId)
 e.observation=next;e.diskHint=false
}
/** Shared readonly observation: one in-flight read and at most one explicitly requested tail. */
function entry(client:WorkbenchClient,owner:string):Entry{
 let cache=caches.get(client);if(!cache){cache=new Map();caches.set(client,cache)}
 const old=cache.get(owner);if(old)return old
 const e:Entry={value:empty,listeners:new Set(),pending:false,trailing:false,alive:true,diskHint:false,retired:new Set(),noticeSequence:0,poll:()=>{}}
 const active=()=>e.alive&&e.listeners.size>0
 const notify=()=>{for(const listener of e.listeners)listener()}
 e.poll=()=>{
  if(!active())return
  if(e.pending){e.trailing=true;return}
  clearTimeout(e.timer);e.timer=undefined;e.pending=true
  const sequence=e.noticeSequence
  void Promise.resolve().then(()=>client.get<RunOverview>('getRunOverview',{sessionId:owner})).then(next=>{
   if(!active())return
   if(next.ownerSessionId!==owner)throw new Error(t("运行记录的会话不匹配"))
   const stamp=next.observation,expected=e.observation
   // A response started before a notice is usable only if a live stamp proves it caught up.
   // disk:0 has no generation information, so it cannot prove a later disk lifecycle.
   if(sequence!==e.noticeSequence&&(!stamp||stamp.observerId==='disk'||stamp.observerId!==expected?.observerId||stamp.revision<expected.revision))return
   // Legacy metadata-free responses are safe only until this entry first expects metadata.
   if(!stamp&&expected)return
   if(stamp){
    if(e.retired.has(stamp.observerId))return
    if(expected?.observerId===stamp.observerId&&stamp.revision<expected.revision)return
    observe(e,stamp)
   }
   e.value={snapshot:next};notify()
  }).catch((error:unknown)=>{
   if(active()&&sequence===e.noticeSequence){e.value={error:error instanceof Error?error.message:String(error)};notify()}
  }).finally(()=>{
   e.pending=false
   if(!active())return
   if(e.trailing){e.trailing=false;e.poll()}
   else e.timer=setTimeout(e.poll,2000)
  })
 }
 cache.set(owner,e);return e
}
function invalidate(e:Entry,owner:string,change:RunOverviewChanged){
 if(!e.alive||!e.listeners.size||change.ownerSessionId!==owner||e.retired.has(change.observerId))return
 const previous=e.observation
 // disk:0 can be a delayed close notice from an older service. Keep the live guard
 // until a read confirms disk or a distinct live UUID proves replacement.
 if(change.observerId==='disk'&&previous&&previous.observerId!=='disk'){
  if(e.diskHint)return
  e.diskHint=true;e.noticeSequence++;e.poll();return
 }
 if(previous?.observerId===change.observerId&&change.revision<=previous.revision)return
 observe(e,{observerId:change.observerId,revision:change.revision})
 e.noticeSequence++;e.poll()
}
export function useRunOverview(client:WorkbenchClient,sessionId?:string){
 const subscribe=useCallback((listener:()=>void)=>{
  if(!sessionId)return()=>{}
  const e=entry(client,sessionId);e.listeners.add(listener)
  if(e.listeners.size===1){
   // Runtime check keeps old get-only backends and existing consumers on the fallback poll.
   if(typeof client.subscribeRunOverviewChanges==='function')e.unsubscribe=client.subscribeRunOverviewChanges(change=>invalidate(e,sessionId,change))
   // Native subscriptions may replay a stamp synchronously and already have started the read.
   if(!e.pending)e.poll()
  }
  return()=>{
   e.listeners.delete(listener)
   if(!e.listeners.size){
    e.alive=false;e.trailing=false;clearTimeout(e.timer);e.unsubscribe?.()
    if(caches.get(client)?.get(sessionId)===e)caches.get(client)?.delete(sessionId)
   }
  }
 },[client,sessionId])
 const get=useCallback(()=>sessionId?caches.get(client)?.get(sessionId)?.value??empty:empty,[client,sessionId])
 const value=useSyncExternalStore(subscribe,get,get)
 const refresh=useCallback(()=>{
  // A captured refresh after unmount must never create an orphan entry or start a read.
  if(sessionId)caches.get(client)?.get(sessionId)?.poll()
 },[client,sessionId])
 return{...value,refresh}
}
