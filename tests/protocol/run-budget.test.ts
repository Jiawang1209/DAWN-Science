import {expect,it} from 'vitest'
import {OPERATIONS,isMutating} from '../../src/protocol/operations.js'
import {ReviewRunReservationSchema,RunBudgetLimitsSchema} from '../../src/protocol/run-budget.js'
it('budget changes are explicit mutations with revision and bounded limits, never consumption supplied by the client',()=>{
 expect('setRunBudget' in OPERATIONS).toBe(true)
 const operation=OPERATIONS.setRunBudget
 expect(isMutating('setRunBudget')).toBe(true)
 expect(operation.request.parse({sessionId:'p',expectedRevision:0,limits:{maxRuns:2}})).toEqual({sessionId:'p',expectedRevision:0,limits:{maxRuns:2}})
 for(const limits of [{maxRuns:0},{maxTokens:-1},{maxElapsedMs:Infinity},{consumedRuns:0}])expect(()=>operation.request.parse({sessionId:'p',expectedRevision:0,limits})).toThrow()
 expect(()=>operation.request.parse({sessionId:'p',expectedRevision:0,limits:{},ownerSessionId:'other'})).toThrow()
})
it('review run protection is optional and requires an explicit execution-run limit',()=>{
 expect(RunBudgetLimitsSchema.parse({})).toEqual({})
 expect(RunBudgetLimitsSchema.parse({maxRuns:3,reserveReviewRuns:true})).toEqual({maxRuns:3,reserveReviewRuns:true})
 expect(()=>RunBudgetLimitsSchema.parse({reserveReviewRuns:true})).toThrow()
 expect(RunBudgetLimitsSchema.parse({reserveReviewRuns:false})).toEqual({reserveReviewRuns:false})
})
it('reservation records require canonical scoped keys and matching remaining/phase state',()=>{
 const good={key:JSON.stringify(['parent','pipeline',0]),stage:'review',remainingRuns:1,phase:'held'}
 expect(ReviewRunReservationSchema.parse(good)).toEqual(good)
 for(const patch of [{key:'["parent", "pipeline",0]'},{key:'["parent","pipeline",-1]'},{key:'["parent","pipeline"]'},{key:'["","pipeline",0]'},{phase:'consumed'},{remainingRuns:0},{stage:'analyze'}])expect(()=>ReviewRunReservationSchema.parse({...good,...patch})).toThrow()
 expect(ReviewRunReservationSchema.parse({...good,phase:'consumed',remainingRuns:0})).toMatchObject({phase:'consumed',remainingRuns:0})
})
