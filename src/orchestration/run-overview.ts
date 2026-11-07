import {AgentContextObservationSchema} from '../protocol/agent-context-observation.js'
import {projectUsageTotals} from './agent-usage-totals.js'
import {readCurrentTeamSnapshot} from '../team/read-current-snapshot.js'
import {existsSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {OrchestrationStateSchema,validateOrchestrationIdentity,type ChildRecord} from './store.js'
import type {OrchestrationService} from './service.js'
import {DISK_OBSERVATION,type RunOverview} from '../protocol/run-overview.js'
export {DISK_OBSERVATION} from '../protocol/run-overview.js'
import {publicTaskTrace,type TaskTrace} from '../protocol/task-trace.js'
import {budgetView,initialBudget} from './budget.js'
type InternalRun=Omit<RunOverview['runs'][number],'trace'>&{trace?:TaskTrace}
export type InternalRunOverview=Omit<RunOverview,'runs'>&{runs:InternalRun[]}
export function publicRunOverview(snapshot:InternalRunOverview):RunOverview{
 return{...snapshot,runs:snapshot.runs.map(({trace,...run})=>({...run,...(run.contextObservation?{contextObservation:AgentContextObservationSchema.parse(run.contextObservation)}:{}),...(trace?{trace:publicTaskTrace(trace)}:{})}))}
}
function project(child:ChildRecord,phase:RunOverview['runs'][number]['phase']):InternalRun{
 const settled=(child.state==='completed'||child.state==='failed')&&phase!=='running'&&phase!=='queued'&&phase!=='stopping'
 const diagnostic=settled||child.state==='cancelled'&&child.resultEpoch===child.epoch&&phase!=='queued'&&phase!=='running'&&phase!=='stopping'
 return{...(settled&&child.result?.receipt?{taskReceipt:child.result.receipt}:{}),...(diagnostic&&child.result?.trace?{trace:child.resultEpoch===child.epoch?child.result.trace:publicTaskTrace(child.result.trace)}:{}),id:child.id,kind:child.kind,label:child.label,address:child.address,state:child.state,epoch:child.epoch,updatedAt:child.updatedAt,phase,
 ...(child.resultEpoch!==undefined?{resultEpoch:child.resultEpoch}:{}),
 usageTotals:projectUsageTotals(child.usageTotals),
 ...(child.reason?{reason:child.reason}:{}),contract:!!child.settings?.contract,
 ...(child.handoffSha256!==undefined?{handoffSha256:child.handoffSha256}:{}),
 ...(child.activity?{activity:child.activity}:{}),...(child.timing?{timing:child.timing}:{}),
 ...(child.result?.receipt?{receipt:child.result.receipt.state}:{}),
 inputVersions:(child.result?.receipt?.versions??child.settings?.versions)?.inputs.length??0,
 outputVersions:child.result?.receipt?.versions?.outputs.length??0,
 ...(child.contextObservation?{contextObservation:{current:false,reason:'historical',sample:child.contextObservation}}:{}),
 ...(child.result?.observation?{observation:child.result.observation}:{})}
}
export function liveRunOverview(service:OrchestrationService):InternalRunOverview{
 return{ownerSessionId:service.store.ownerSessionId,source:'live',observation:service.observation,budget:service.budgetSnapshot(),history:service.store.history(),...(service.observationIssue?{observationIssue:service.observationIssue}:{}),runs:service.store.list().map(child=>({...project(child,service.controlPhase(child.id)),contextObservation:service.contextObservation(child.id),...(service.currentTaskAttempt(child.id)?{taskAttempt:service.currentTaskAttempt(child.id)}:{})}))}
}
/** Do not instantiate OrchestrationStore: its constructor performs recovery writes. */
export function readRunOverview(sessionDir:string,ownerSessionId:string,readState=(file:string)=>existsSync(file)?readFileSync(file,'utf8'):undefined):InternalRunOverview{
 const team=readCurrentTeamSnapshot(sessionDir,ownerSessionId)
 const raw=readState(join(sessionDir,'orchestration','state.json'))
 if(raw===undefined)return{ownerSessionId,source:'disk',observation:{...DISK_OBSERVATION},...team,budget:budgetView(initialBudget([])),runs:[]}
 const state=OrchestrationStateSchema.parse(JSON.parse(raw))
 validateOrchestrationIdentity(state,ownerSessionId)
 return{ownerSessionId,source:'disk',observation:{...DISK_OBSERVATION},...team,budget:budgetView(state.budget??initialBudget(state.children)),history:{events:state.events??[],truncated:state.historyTruncated??false},runs:state.children.map(child=>project(child,'unknown'))}
}
