import {expect,it} from 'vitest'
import {summarizeResearchUsage} from '../../src/evaluation/research-usage.js'
it('counts planning, execution and independent review once each and keeps cache reads separate',()=>{
 const result=summarizeResearchUsage([
  {id:'planner',phase:'planning',usage:{input:6,output:4,cacheRead:1}},
  {id:'task-1:attempt-1',phase:'execution',usage:{input:12,output:8,cacheRead:2}},
  {id:'task-2:attempt-1',phase:'review',usage:{input:18,output:12,cacheRead:3}},
 ])
 expect(result.phases.planning).toMatchObject({visibleTokens:10,scopes:1,state:'recorded'})
 expect(result.phases.execution.visibleTokens).toBe(20);expect(result.phases.review.visibleTokens).toBe(30)
 expect(result.total).toMatchObject({input:36,output:24,cacheRead:6,visibleTokens:60,scopes:3,state:'recorded'})
})
it('preserves known lower bounds when a failed or cancelled scope has incomplete receipts',()=>{
 const result=summarizeResearchUsage([{id:'planner',phase:'planning',usage:{input:5,output:3,partial:['output']}},{id:'failed-task',phase:'execution'}])
 expect(result.total).toMatchObject({visibleTokens:8,scopes:2,state:'partial',partialUsage:true,unknownScopes:2})
 expect(result.phases.execution).toMatchObject({input:null,output:null,visibleTokens:null,state:'unknown'})
 expect(result.total.partialFields).toEqual(expect.arrayContaining(['input','output','cacheRead']))
})
it('does not describe an unstarted phase as zero-cost, and rejects duplicate scope accounting',()=>{
 const result=summarizeResearchUsage([])
 expect(result.total).toMatchObject({state:'not-run',visibleTokens:null,input:null,output:null,scopes:0})
 expect(result.phases.review.state).toBe('not-run')
 expect(summarizeResearchUsage([{id:'zod-optional',phase:'execution',usage:{input:undefined,output:undefined}}]).total.state).toBe('unknown')
 expect(()=>summarizeResearchUsage([{id:'same',phase:'planning',usage:{input:10}},{id:'same',phase:'execution',usage:{input:20}}])).toThrow(/scope/)
})
it('keeps malformed or overflowing numeric fields unknown instead of reporting invented totals',()=>{
 const bad=summarizeResearchUsage([{id:'bad',phase:'execution',usage:{input:NaN,output:-1}},{id:'large',phase:'execution',usage:{input:Number.MAX_SAFE_INTEGER,output:1}},{id:'overflow',phase:'execution',usage:{input:2}}])
 expect(bad.total.state).toBe('partial');expect(bad.total.partialFields).toContain('input')
 expect(bad.total.visibleTokens).toBeNull() // input + output cannot be represented exactly
})
