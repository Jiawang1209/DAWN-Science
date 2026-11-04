import {expect,it} from 'vitest'
import {completedVersionedPipeline} from '../helpers/versioned-science.js'
import {startScienceBatch,advanceScienceBatch,recoverScienceBatch,resumeScienceBatch} from '../../src/team/science-batch.js'
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path'
it('archives an accepted item and atomically queues only the next namespaced frozen item',async()=>{
 const root=mkdtempSync(join(tmpdir(),'batch-reducer-'));try{
 const {team}=await completedVersionedPipeline(root),p=structuredClone(team.pipeline!);team.tasks=[];Reflect.deleteProperty(team,'pipeline')
 startScienceBatch(team,'batch',{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},[{id:'a',label:'A',definition:p.definition},{id:'b',label:'B',definition:{...p.definition,outputs:['b.csv']}}],['summary.json','summary.md'])
 expect(team.pipeline?.currentTaskId).toContain('a-check');expect(team.tasks).toHaveLength(1)
 team.pipeline={...p,requestId:'batch:a'};advanceScienceBatch(team)
 expect(team.scienceBatch?.index).toBe(1);expect(team.scienceBatch?.items[0]?.completed?.status).toBe('completed');expect(team.pipeline?.currentTaskId).toContain('b-check')
 const frozen=structuredClone(team.scienceBatch?.items[1]?.settingsByStage);recoverScienceBatch(team);expect(team.scienceBatch?.status).toBe('interrupted');resumeScienceBatch(team,false);expect(team.scienceBatch?.status).toBe('running');expect(team.pipeline?.settingsByStage).toEqual(frozen)
 team.pipeline!.status='blocked';advanceScienceBatch(team);expect(team.scienceBatch?.status).toBe('blocked');expect(team.scienceBatch?.items[1]?.completed).toBeUndefined()
 }finally{rmSync(root,{recursive:true,force:true})}
})
it.each([27,32])('accepts a %i-character item ID throughout all three stages without oversized task IDs',async size=>{
 const {advancePipeline}=await import('../../src/team/science-pipeline.js'),{领取,结算}=await import('../../src/team/state.js')
 const root=mkdtempSync(join(tmpdir(),'batch-long-id-'));try{
 const {team}=await completedVersionedPipeline(root),p=structuredClone(team.pipeline!),receipts=team.tasks.map(t=>t.receipt!);team.tasks=[];Reflect.deleteProperty(team,'pipeline')
 startScienceBatch(team,'batch',{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},[{id:'a'.repeat(size),label:'long',definition:p.definition}],['summary.json','summary.md'])
 for(const receipt of receipts){const task=team.tasks.find(t=>t.id===team.pipeline!.currentTaskId)!,attempt=领取(team,task.id,task.assignee!);结算(team,task.id,attempt.attemptId,{ok:true,output:'fixture',receipt});advancePipeline(team)}
 expect(team.pipeline?.status).toBe('completed');expect(team.tasks.every(t=>t.id.length<=40)).toBe(true)
 }finally{rmSync(root,{recursive:true,force:true})}
})
