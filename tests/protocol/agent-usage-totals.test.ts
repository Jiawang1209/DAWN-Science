import {expect,it} from 'vitest'
import {AgentUsageTotalsSchema} from '../../src/protocol/agent-usage-totals.js'
import {RunOverviewSchema} from '../../src/protocol/run-overview.js'
const zero={source:'host-epoch-deltas',settledEpochs:0,unknownEpochs:0,partial:[]}
it('accepts optional backwards-compatible coverage but never defaults legacy records to full coverage',()=>{
 expect(RunOverviewSchema.parse({ownerSessionId:'o',source:'disk',runs:[]})).not.toHaveProperty('usageTotals')
 expect(AgentUsageTotalsSchema.parse(zero)).toEqual(zero)
 expect(AgentUsageTotalsSchema.parse({...zero,legacyHistory:true,partial:['input','output','cacheRead']})).toMatchObject({legacyHistory:true})
})
it.each([
 {...zero,input:0},{...zero,unknownEpochs:1},{...zero,partial:['input']},
 {...zero,legacyHistory:true},{...zero,lastSettledEpoch:1},
 {...zero,settledEpochs:1},{...zero,settledEpochs:2,lastSettledEpoch:1},
 {...zero,settledEpochs:1,lastSettledEpoch:1,input:0.5,output:1,cacheRead:1},
 {...zero,settledEpochs:1,lastSettledEpoch:1,input:Infinity,output:1,cacheRead:1},
 {...zero,settledEpochs:1,lastSettledEpoch:1,input:Number.MAX_SAFE_INTEGER+1,output:1,cacheRead:1},
 {...zero,settledEpochs:1,lastSettledEpoch:1,input:1,output:1,cacheRead:1,partial:['input']},
 {...zero,settledEpochs:1,lastSettledEpoch:1,unknownEpochs:1,partial:['input','input','output']},
])('rejects unsafe or inconsistent settled coverage %j',value=>expect(AgentUsageTotalsSchema.safeParse(value).success).toBe(false))
