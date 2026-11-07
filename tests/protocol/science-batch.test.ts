import {expect,it} from 'vitest'
import {ScienceBatchSummarySchema} from '../../src/protocol/science-batch.js'
const legacy={version:1,template:{id:'tabular-ecology',version:1},status:'running',stateRevision:1,index:0,total:1,completed:0,items:[{id:'one',label:'One',status:'running'}],summaryOutputs:['summary.json','summary.md']}
it('keeps legacy batch summaries valid and validates optional exact task membership strictly',()=>{
 expect(ScienceBatchSummarySchema.safeParse(legacy).success).toBe(true)
 expect(ScienceBatchSummarySchema.safeParse({...legacy,taskIds:['check','analysis','review','summary']}).success).toBe(true)
 expect(ScienceBatchSummarySchema.safeParse({...legacy,taskIds:[]}).success).toBe(true)
 expect(ScienceBatchSummarySchema.safeParse({...legacy,taskIds:Array.from({length:288},(_,i)=>`task-${i}`)}).success).toBe(true)
 for(const taskIds of [['same','same'],[''],[1],Array.from({length:289},(_,i)=>`task-${i}`)])expect(ScienceBatchSummarySchema.safeParse({...legacy,taskIds}).success).toBe(false)
 expect(ScienceBatchSummarySchema.safeParse({...legacy,taskIds:['task'],extra:true}).success).toBe(false)
})
