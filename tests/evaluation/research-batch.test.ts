import {expect,it} from 'vitest'
import {researchBatchAllocation} from '../../src/evaluation/research-batch.js'
it('preserves the legacy one-pair default and freezes a 300-request six-pair batch',()=>{
 expect(researchBatchAllocation(undefined,30)).toEqual({taskIds:['carbon-missing'],repeats:1,perArmLimit:15})
 const batch={taskIds:['short-known-mean','carbon-missing','unknown-unit'],repeats:2,perArmLimit:25}
 expect(researchBatchAllocation(batch,300)).toEqual(batch)
 expect(()=>researchBatchAllocation(batch,299)).toThrow()
})
it.each([
 null,
 {taskIds:['carbon-missing','carbon-missing'],repeats:1,perArmLimit:15},
 {taskIds:['not-a-task'],repeats:1,perArmLimit:15},
 {taskIds:[],repeats:1,perArmLimit:15},
 {taskIds:['carbon-missing'],repeats:0,perArmLimit:15},
 {taskIds:['carbon-missing'],repeats:1,perArmLimit:1},
 {taskIds:['carbon-missing'],repeats:1,perArmLimit:15,unexpected:true},
])('rejects invalid or silently lossy batch allocations before any model host: %j',batch=>{
 expect(()=>researchBatchAllocation(batch,300)).toThrow()
})
it('returns a detached task list so later caller edits cannot change the validated batch',()=>{
 const batch={taskIds:['carbon-missing'],repeats:1,perArmLimit:15},parsed=researchBatchAllocation(batch,30)
 batch.taskIds[0]='unknown-unit';expect(parsed.taskIds).toEqual(['carbon-missing'])
})
