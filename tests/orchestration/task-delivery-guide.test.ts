import {expect,it} from 'vitest'
import {TaskSubmission} from '../../src/orchestration/task-submission.js'
import {TaskContractSchema,taskResultParameters} from '../../src/protocol/task-contract.js'
import type {RouteToolEvidence} from '../../src/runtime/analysis-route-evidence.js'
const contract=TaskContractSchema.parse({submission:'tool',resultType:'model-metrics',access:'workspace-write',inputs:['in.csv'],outputs:['script.py','result.json','report.md'],acceptance:{version:1,kind:'tabular-ecology',scriptPath:'script.py',resultPath:'result.json',reportPath:'report.md',numeric:{version:1,dataPath:'in.csv',column:'x',metric:'mean',unit:'m',missing:'block'}}})
it('projects exact frozen scientific keys without inventing values or submitting',()=>{
 const submission=new TaskSubmission(contract,'/tmp',()=>[])
 const guide=submission.checkpoint().deliveryGuide
 expect(guide).toMatchObject({submitTool:'submit_task_result',resultType:'model-metrics',outputs:contract.outputs,numeric:{resultPath:'result.json',requiredKeys:['n','unit','mean'],metric:'mean',unit:'m',dataMetricKeys:['mean']}})
 expect(guide.numeric).not.toHaveProperty('value');expect(submission.observation().submissionAttempts).toBe(0)
 expect(taskResultParameters(contract)).toMatchObject({properties:{data:{properties:{metrics:{properties:{mean:{type:'number'}}}}}}})
})
it('chooses only unique successful evidence from the current instance, not failed or ambiguous IDs',()=>{
 const proof:RouteToolEvidence[]=[{toolCallId:'ok',name:'bash',status:'done',execution:'ran',result:'private'},...['done','error'].map(status=>({toolCallId:'dup',name:'bash',status:status as 'done'|'error',execution:'ran' as const,result:'private'})),{toolCallId:'bad',name:'read',status:'error',result:'private'}]
 const guide=new TaskSubmission(contract,'/tmp',()=>proof).checkpoint().deliveryGuide
 expect(guide.references.executionCompleted).toEqual(['ok']);expect(JSON.stringify(guide)).not.toContain('private')
 expect(new TaskSubmission(contract,'/tmp',()=>[]).checkpoint().deliveryGuide.references.executionCompleted).toEqual([])
})
it('does not force fabricated metrics for a blocked submission',()=>{
 expect(taskResultParameters(contract)).toMatchObject({properties:{data:{properties:{metrics:{properties:{mean:{type:'number'}}}}}}})
 const metrics=(taskResultParameters(contract).properties!.data as {properties:Record<string,Record<string,unknown>>}).properties.metrics!
 expect(metrics.required).toBeUndefined()
})
it('marks truncated numeric fields instead of returning an unbounded exact-looking path',()=>{
 const huge='x'.repeat(50000),c=TaskContractSchema.parse({...contract,outputs:['script.py',huge,'report.md'],acceptance:{...contract.acceptance!,resultPath:huge}})
 const guide=new TaskSubmission(c,'/tmp',()=>[]).checkpoint().deliveryGuide
 expect(Buffer.byteLength(JSON.stringify(guide))).toBeLessThan(8000)
 expect(guide.numeric?.truncatedFields).toContain('resultPath')
})
