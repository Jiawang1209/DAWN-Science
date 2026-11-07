import {expect,it} from 'vitest'
import {researchTasks,judgeResearch,summarizeResearch,notRunResearch,type ResearchRow} from '../../src/evaluation/research-tasks.js'
it('judges actual data independently of accepted claims and protects the complete input',()=>{
 const task=researchTasks()[0]!
 expect(judgeResearch(task,'accepted',task.expected,true).success).toBe(true)
 expect(judgeResearch(task,'accepted',{...task.expected,mean:999},true).falseAcceptance).toBe(true)
 expect(judgeResearch(task,'accepted',task.expected,false).success).toBe(false)
 expect(judgeResearch(researchTasks()[1]!,'blocked',undefined,true,{reasons:['单位未提供'],inputRead:true}).success).toBe(true)
 expect(judgeResearch(researchTasks()[1]!,'blocked',undefined,true,{reasons:['输入不存在'],inputRead:true}).success).toBe(false)
 expect(judgeResearch(researchTasks()[1]!,'blocked',undefined,true,{reasons:['单位未提供'],inputRead:false}).success).toBe(false)
 expect(judgeResearch(researchTasks()[1]!,'failed',undefined,true).success).toBe(false)
})
it('refuses incomparable pairs and distinguishes incomplete trials from completed comparisons',()=>{
 const row={caseId:'carbon-missing',mode:'single',repeat:1,fingerprint:'same',terminal:'accepted',success:true,falseAcceptance:false,inputPreserved:true,requests:4,elapsedMs:10,usage:{visibleTokens:0,unknownUsageTasks:1,partialUsage:true},versions:[]} as ResearchRow
 expect(()=>summarizeResearch([row,{...row,mode:'multi',fingerprint:'other'}])).toThrow(/配对/)
 expect(summarizeResearch([row]).completePairs).toBe(0)
 const report=summarizeResearch([row,{...row,mode:'multi',terminal:'not-run',success:false}])
 expect(report.completePairs).toBe(0);expect(report.incompletePairs).toBe(1)
 expect(report.rows[0]!.usage.partialUsage).toBe(true)
})
it('does not invent input verification or unknown executed tasks for a trial that never started',()=>{
 expect(notRunResearch(researchTasks()[0]!,'single','same')).toMatchObject({terminal:'not-run',inputPreserved:null,requests:0,usage:{unknownUsageTasks:0,partialUsage:false}})
})
