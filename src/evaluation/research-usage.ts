/** Host-receipt usage attribution over disjoint trial scopes; no estimates or price conversion. */
import type {UsageField} from '../runtime/session-usage.js'
import type {TaskObservation} from '../protocol/task-observation.js'
export type ResearchUsagePhase='planning'|'execution'|'review'
export interface ResearchUsageScope {id:string;phase:ResearchUsagePhase;usage?:TaskObservation['usage']}
export interface ResearchUsageSummary {
 state:'not-run'|'recorded'|'partial'|'unknown'
 scopes:number
 input:number|null
 output:number|null
 cacheRead:number|null
 visibleTokens:number|null
 partialUsage:boolean
 partialFields:UsageField[]
 unknownScopes:number
}
export interface ResearchUsageBreakdown {phases:Record<ResearchUsagePhase,ResearchUsageSummary>;total:ResearchUsageSummary}
const fields:UsageField[]=['input','output','cacheRead']
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
function aggregate(scopes:readonly ResearchUsageScope[]):ResearchUsageSummary {
 const totals:Record<UsageField,number|null>={input:null,output:null,cacheRead:null},partial=new Set<UsageField>()
 let unknownScopes=0
 for(const scope of scopes){
  const usage=scope.usage&&typeof scope.usage==='object'?scope.usage:undefined
  let unknown=false
  for(const field of fields){
   const value=usage?.[field],previous=totals[field]
   if(count(value)&&Number.isSafeInteger((previous??0)+value))totals[field]=(previous??0)+value
   else{partial.add(field);unknown=true}
   if(Array.isArray(usage?.partial)&&usage.partial.includes(field)){partial.add(field);unknown=true}
  }
  if(unknown)unknownScopes++
 }
 const known=fields.some(field=>totals[field]!==null),sum=totals.input===null&&totals.output===null?null:(totals.input??0)+(totals.output??0)
 const visibleTokens=sum!==null&&Number.isSafeInteger(sum)?sum:null
 if(sum!==null&&visibleTokens===null){partial.add('input');partial.add('output')}
 const partialFields=fields.filter(field=>partial.has(field))
 return{...totals,visibleTokens,scopes:scopes.length,state:!scopes.length?'not-run':!known?'unknown':partialFields.length?'partial':'recorded',partialUsage:!!partialFields.length,partialFields,unknownScopes}
}
export function summarizeResearchUsage(scopes:readonly ResearchUsageScope[]):ResearchUsageBreakdown {
 const ids=new Set<string>()
 for(const scope of scopes){if(!scope.id||ids.has(scope.id))throw new Error('Duplicate or empty usage scope');ids.add(scope.id)}
 return{phases:{planning:aggregate(scopes.filter(s=>s.phase==='planning')),execution:aggregate(scopes.filter(s=>s.phase==='execution')),review:aggregate(scopes.filter(s=>s.phase==='review'))},total:aggregate(scopes)}
}
