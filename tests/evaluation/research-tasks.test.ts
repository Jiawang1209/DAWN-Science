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
it('counts wrong scientific acceptance and reports requests including unsuccessful trials, without treating a correct block as a delivery',()=>{
 const [task,unknown]=researchTasks()
 expect(judgeResearch(task!,'accepted',task!.expected,false).falseAcceptance).toBe(true)
 const base={caseId:task!.id,mode:'single',repeat:1,fingerprint:'x',terminal:'accepted',success:true,falseAcceptance:false,inputPreserved:true,requests:3,elapsedMs:100,usage:{visibleTokens:0,unknownUsageTasks:0,partialUsage:false},versions:[]} as ResearchRow
 const report=summarizeResearch([base,{...base,repeat:2,terminal:'failed',success:false,requests:5,requestBudget:{limit:5,reserved:5,forwarded:5,denied:1}},{...base,caseId:unknown!.id,terminal:'blocked',requests:2}],true)
 expect(report.delivery.single).toMatchObject({qualifiedDeliveries:1,correctBlocks:1,exhausted:1,requestsPerDelivery:10})
 expect(report.delivery.multi.requestsPerDelivery).toBeNull()
})
it('reports an exhausted review subquota even when the whole arm still has unused requests',()=>{
 const base={caseId:'carbon-missing',mode:'multi',repeat:1,fingerprint:'same',terminal:'failed',success:false,falseAcceptance:false,inputPreserved:true,requests:13,elapsedMs:100,usage:{visibleTokens:1,unknownUsageTasks:0,partialUsage:false},versions:[],requestBudget:{limit:15,reserved:13,forwarded:13,denied:4},stageRequestBudgets:{work:{limit:11,reserved:9,forwarded:9,denied:0},review:{limit:4,reserved:4,forwarded:4,denied:4}}} as ResearchRow
 expect(summarizeResearch([base],true).delivery.multi.exhausted).toBe(1)
 expect(summarizeResearch([{...base,terminal:'cancelled'}],true).delivery.multi.exhausted).toBe(0)
 expect(summarizeResearch([{...base,requestBudget:{...base.requestBudget!,denied:0},stageRequestBudgets:{...base.stageRequestBudgets!,review:{limit:4,reserved:4,forwarded:4,denied:0}}}],true).delivery.multi.exhausted).toBe(0)
})
