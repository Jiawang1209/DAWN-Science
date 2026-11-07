import {USAGE_FIELDS,type AgentUsageTotals} from '../protocol/agent-usage-totals.js'
import type {TaskObservation} from '../protocol/task-observation.js'
export function initialUsageTotals(legacyHistory=false):AgentUsageTotals{
 return{source:'host-epoch-deltas',settledEpochs:0,unknownEpochs:0,partial:legacyHistory?[...USAGE_FIELDS]:[],...(legacyHistory?{legacyHistory:true}:{})}
}
/** No transcript backfill: absence means earlier history was never tracked here. */
export function projectUsageTotals(totals?:AgentUsageTotals):AgentUsageTotals{return structuredClone(totals??initialUsageTotals(true))}
/** Called only after the durable active-epoch guard, in that same store transaction. */
export function settleUsageTotals(previous:AgentUsageTotals|undefined,epoch:number,observation?:TaskObservation):AgentUsageTotals{
 const totals=projectUsageTotals(previous),partial=new Set(totals.partial),usage=observation?.usage
 let unknown=false
 for(const field of USAGE_FIELDS){
  const delta=usage?.[field],sum=(totals[field]??0)+(delta??0)
  if(delta===undefined||!Number.isSafeInteger(delta)||delta<0||!Number.isSafeInteger(sum)){partial.add(field);unknown=true;continue}
  // A partial zero can be an SDK placeholder for an absent field, not an observed zero.
  if(delta!==0||!usage?.partial?.includes(field)||totals[field]!==undefined)totals[field]=sum
  if(usage?.partial?.includes(field)){partial.add(field);unknown=true}
 }
 totals.settledEpochs++;if(unknown)totals.unknownEpochs++
 totals.lastSettledEpoch=epoch;totals.partial=USAGE_FIELDS.filter(field=>partial.has(field))
 return totals
}
