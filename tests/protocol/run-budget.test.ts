import {expect,it} from 'vitest'
import {OPERATIONS,isMutating} from '../../src/protocol/operations.js'
it('budget changes are explicit mutations with revision and bounded limits, never consumption supplied by the client',()=>{
 expect('setRunBudget' in OPERATIONS).toBe(true)
 const operation=OPERATIONS.setRunBudget
 expect(isMutating('setRunBudget')).toBe(true)
 expect(operation.request.parse({sessionId:'p',expectedRevision:0,limits:{maxRuns:2}})).toEqual({sessionId:'p',expectedRevision:0,limits:{maxRuns:2}})
 for(const limits of [{maxRuns:0},{maxTokens:-1},{maxElapsedMs:Infinity},{consumedRuns:0}])expect(()=>operation.request.parse({sessionId:'p',expectedRevision:0,limits})).toThrow()
 expect(()=>operation.request.parse({sessionId:'p',expectedRevision:0,limits:{},ownerSessionId:'other'})).toThrow()
})
