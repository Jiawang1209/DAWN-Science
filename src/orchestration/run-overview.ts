import {existsSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {OrchestrationStateSchema,childIdentity,type ChildRecord} from './store.js'
import type {OrchestrationService} from './service.js'
import type {RunOverview} from '../protocol/run-overview.js'
function project(child:ChildRecord,phase:RunOverview['runs'][number]['phase']):RunOverview['runs'][number]{
 return{id:child.id,kind:child.kind,label:child.label,address:child.address,state:child.state,epoch:child.epoch,updatedAt:child.updatedAt,phase,
 ...(child.reason?{reason:child.reason}:{}),contract:!!child.settings?.contract,
 ...(child.handoffSha256!==undefined?{handoffSha256:child.handoffSha256}:{}),
 ...(child.result?.receipt?{receipt:child.result.receipt.state}:{}),
 inputVersions:(child.result?.receipt?.versions??child.settings?.versions)?.inputs.length??0,
 outputVersions:child.result?.receipt?.versions?.outputs.length??0,
 ...(child.result?.observation?{observation:child.result.observation}:{})}
}
export function liveRunOverview(service:OrchestrationService):RunOverview{
 return{ownerSessionId:service.store.ownerSessionId,source:'live',runs:service.store.list().map(child=>project(child,service.controlPhase(child.id)))}
}
/** Do not instantiate OrchestrationStore: its constructor performs recovery writes. */
export function readRunOverview(sessionDir:string,ownerSessionId:string):RunOverview{
 const file=join(sessionDir,'orchestration','state.json')
 if(!existsSync(file))return{ownerSessionId,source:'disk',runs:[]}
 const state=OrchestrationStateSchema.parse(JSON.parse(readFileSync(file,'utf8')))
 if(state.ownerSessionId!==ownerSessionId||new Set(state.children.map(c=>c.id)).size!==state.children.length||state.children.some(c=>c.id!==childIdentity(c.kind,c.address,ownerSessionId)))throw new Error('Invalid orchestration owner or child identity')
 return{ownerSessionId,source:'disk',runs:state.children.map(child=>project(child,'unknown'))}
}
