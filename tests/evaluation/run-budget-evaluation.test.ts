import {expect,it} from 'vitest'
import {summarizeRunBudget} from '../../src/evaluation/run-budget.js'
const baseline={mode:'unlimited' as const,inputHash:'input',inputPreserved:true,started:3,accepted:3,rejected:0,modelRequests:12,preservedHashes:['one','two'],recoveryConsumed:3}
const limited={...baseline,mode:'limited' as const,started:2,accepted:2,rejected:1,modelRequests:8,recoveryConsumed:2}
it('reports only measured prevented work with retained accepted artifacts and unchanged inputs',()=>{
 expect(summarizeRunBudget([baseline,limited])).toMatchObject({preventedStarts:1,localModelRequestsAvoided:4,acceptedArtifactsPreserved:true})
})
it.each([{...limited,inputHash:'changed'},{...limited,preservedHashes:['one','different']},{...limited,recoveryConsumed:0},{...limited,inputPreserved:false}])('rejects incomparable or destructive budget evidence',bad=>{
 expect(()=>summarizeRunBudget([baseline,bad])).toThrow()
})
