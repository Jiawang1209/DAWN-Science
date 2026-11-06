/** Opt-in lifecycle facts written by the app itself, independent of inspector/stdio. */
import {appendFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {performance} from 'node:perf_hooks'
import type {EventEmitter} from 'node:events'
type Events=Pick<EventEmitter,'on'>
interface Host extends Events {pid:number;getActiveResourcesInfo():string[]}
export type ExitCheckpoint='shutdown-check'|'shutdown-sync-start'|'shutdown-sync-complete'|'shutdown-async-start'|'shutdown-async-complete'|'shutdown-async-failed'|'shutdown-drained'|'shutdown-drain-timeout'|'shutdown-drain-failed'|'shutdown-fallback-fired'
const knownResources=new Set(['Timeout','Immediate','PipeWrap','TTYWrap','ProcessWrap','TCPServerWrap','TCPSocketWrap','TLSWrap','UDPWrap','MessagePort','SignalWrap','FSEventWrap','FSReqCallback','FSReqPromise','FileHandle','FileHandleCloseReq','GetAddrInfoReqWrap','ConnectWrap','WriteWrap','ShutdownWrap'])
const reasons=new Set(['clean-exit','abnormal-exit','killed','crashed','oom','launch-failed','integrity-failure'])
export function installAppExitDiagnostics(app:Events,directory:string|undefined,host:Host=process):(event:ExitCheckpoint)=>void {
 if(!directory)return()=>{}
 try{mkdirSync(directory,{recursive:true,mode:0o700})}catch{return()=>{}}
 const file=join(directory,`app-${host.pid}.jsonl`),started=performance.now();let seq=0
 const record=(event:string,detail:Record<string,string|number>={})=>{
  const resources:Record<string,number>={};let resourceSnapshotAvailable=true
  try{for(const type of host.getActiveResourcesInfo()){const key=knownResources.has(type)?type:'Other';resources[key]=(resources[key]??0)+1}}
  catch{resourceSnapshotAvailable=false}
  try{
   appendFileSync(file,JSON.stringify({seq:++seq,event,pid:host.pid,at:new Date().toISOString(),ms:performance.now()-started,resources,resourceSnapshotAvailable,detail})+'\n',{mode:0o600})
  }catch{/* Observation must never change application shutdown. */}
 }
 record('diagnostics-attached')
 app.on('before-quit',()=>record('before-quit'))
 app.on('will-quit',()=>record('will-quit'))
 app.on('quit',(_event,exitCode:number)=>record('quit',{exitCode}))
 app.on('window-all-closed',()=>record('window-all-closed'))
 app.on('browser-window-created',(_event,window:Events&{id:number})=>{
  record('window-created',{id:window.id})
  window.on('close',()=>record('window-close',{id:window.id}))
  window.on('closed',()=>record('window-closed',{id:window.id}))
 })
 app.on('web-contents-created',(_event,contents:Events&{id:number})=>{
  record('contents-created',{id:contents.id})
  contents.on('destroyed',()=>record('contents-destroyed',{id:contents.id}))
  contents.on('render-process-gone',(_event,detail:{reason:string;exitCode:number})=>record('renderer-gone',{id:contents.id,reason:reasons.has(detail.reason)?detail.reason:'other',exitCode:detail.exitCode}))
 })
 app.on('child-process-gone',(_event,detail:{reason:string;exitCode:number})=>record('child-process-gone',{reason:reasons.has(detail.reason)?detail.reason:'other',exitCode:detail.exitCode}))
 host.on('beforeExit',(exitCode:number)=>record('process-before-exit',{exitCode}))
 host.on('exit',(exitCode:number)=>record('process-exit',{exitCode}))
 host.on('uncaughtExceptionMonitor',()=>record('uncaught-exception'))
 return event=>record(event)
}
