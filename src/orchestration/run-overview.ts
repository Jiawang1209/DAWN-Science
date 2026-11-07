import {existsSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {OrchestrationStateSchema,validateOrchestrationIdentity,type ChildRecord} from './store.js'
import type {OrchestrationService} from './service.js'
import type {RunOverview} from '../protocol/run-overview.js'
import {budgetView,initialBudget} from './budget.js'
function project(child:ChildRecord,phase:RunOverview['runs'][number]['phase']):RunOverview['runs'][number]{
 const settled=(child.state==='completed'||child.state==='failed')&&phase!=='running'&&phase!=='queued'&&phase!=='stopping'
 const diagnostic=settled||child.state==='cancelled'&&child.resultEpoch===child.epoch&&phase!=='queued'&&phase!=='running'&&phase!=='stopping'
 return{...(settled&&child.result?.receipt?{taskReceipt:child.result.receipt}:{}),...(diagnostic&&child.result?.trace?{trace:child.result.trace}:{}),id:child.id,kind:child.kind,label:child.label,address:child.address,state:child.state,epoch:child.epoch,updatedAt:child.updatedAt,phase,
 ...(child.reason?{reason:child.reason}:{}),contract:!!child.settings?.contract,
 ...(child.handoffSha256!==undefined?{handoffSha256:child.handoffSha256}:{}),
 ...(child.activity?{activity:child.activity}:{}),...(child.timing?{timing:child.timing}:{}),
 ...(child.result?.receipt?{receipt:child.result.receipt.state}:{}),
 inputVersions:(child.result?.receipt?.versions??child.settings?.versions)?.inputs.length??0,
 outputVersions:child.result?.receipt?.versions?.outputs.length??0,
 ...(child.result?.observation?{observation:child.result.observation}:{})}
}
export function liveRunOverview(service:OrchestrationService):RunOverview{
 return{ownerSessionId:service.store.ownerSessionId,source:'live',budget:service.budgetSnapshot(),history:service.store.history(),...(service.observationIssue?{observationIssue:service.observationIssue}:{}),runs:service.store.list().map(child=>project(child,service.controlPhase(child.id)))}
}
/** Do not instantiate OrchestrationStore: its constructor performs recovery writes. */
export function readRunOverview(sessionDir:string,ownerSessionId:string):RunOverview{
 const file=join(sessionDir,'orchestration','state.json')
 if(!existsSync(file))return{ownerSessionId,source:'disk',budget:budgetView(initialBudget([])),runs:[]}
 const state=OrchestrationStateSchema.parse(JSON.parse(readFileSync(file,'utf8')))
 validateOrchestrationIdentity(state,ownerSessionId)
 return{ownerSessionId,source:'disk',budget:budgetView(state.budget??initialBudget(state.children)),history:{events:state.events??[],truncated:state.historyTruncated??false},runs:state.children.map(child=>project(child,'unknown'))}
}
