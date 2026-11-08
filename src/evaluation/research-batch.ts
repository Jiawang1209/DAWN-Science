/** Explicit live trial selection, validated before build, credential access or model requests. */
import {z} from 'zod'
import {researchRequestLimit,researchStageLimits} from './research-budget.js'
import {researchTasks} from './research-tasks.js'
const schema=z.object({taskIds:z.array(z.string().min(1)).min(1).max(12),repeats:z.number().int().min(1).max(4),perArmLimit:z.number().int().min(2).max(150)}).strict()
export type ResearchBatch=z.infer<typeof schema>
export function researchBatchAllocation(raw:unknown,limit:number):ResearchBatch {
 const total=researchRequestLimit(limit)
 const value=raw===undefined?{taskIds:['carbon-missing'],repeats:1,perArmLimit:Math.floor(total/2)}:raw
 // Preserve the staged-budget error for legacy totals 2/3 before host creation.
 if(raw===undefined)researchStageLimits(Math.floor(total/2))
 const batch=schema.parse(value),known=new Set(researchTasks().map(t=>t.id))
 if(new Set(batch.taskIds).size!==batch.taskIds.length||batch.taskIds.some(id=>!known.has(id)))throw new Error('评测批次题目重复或不存在')
 if(batch.taskIds.length*batch.repeats*2*batch.perArmLimit>total)throw new Error('评测批次分配超过本轮总请求上限')
 researchStageLimits(batch.perArmLimit)
 return batch
}
