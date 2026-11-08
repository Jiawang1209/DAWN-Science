import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {TaskSubmission} from '../../src/orchestration/task-submission.js'
import {TaskContractSchema} from '../../src/protocol/task-contract.js'
import {createTaskTools,resolveTaskSettings} from '../../src/subagent/task-tools.js'
import type {RouteToolEvidence} from '../../src/runtime/analysis-route-evidence.js'
const roots:string[]=[]
const root=()=>{const p=mkdtempSync(join(tmpdir(),'dawn-checkpoint-'));roots.push(p);return p}
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
const value={summary:'checked',blockers:[],deliverables:[],execution:{state:'not_run',note:'read only'},verification:{state:'unreviewed',note:'not a scientific review'}}
it('reads delivery gaps without submitting, inventing evidence or checking arbitrary paths',()=>{
 const evidence:RouteToolEvidence[]=[],cwd=root(),s=new TaskSubmission(TaskContractSchema.parse({inputs:['in.csv'],outputs:['out.csv'],resultType:'review',submission:'tool',access:'workspace-exec',requireExecution:true}),cwd,()=>evidence)
 const before=s.observation(),a=s.checkpoint()
 expect(a).toMatchObject({version:1,phase:'correctable',submissionPending:true,readProgress:{missing:['in.csv']},outputObservation:{unobserved:['out.csv']},missingEvidence:['execution.completed','verification.reviewed']})
 expect(s.observation()).toEqual(before);expect(evidence).toEqual([]);expect(s.result()).toBeUndefined()
 evidence.push({toolCallId:'failed',name:'read',status:'error',input:{path:'in.csv'},result:'error'},{toolCallId:'r',name:'read',status:'done',input:{path:join(cwd,'in.csv')},result:'x'},{toolCallId:'w',name:'write',status:'done',input:{path:'out.csv'},filesWritten:[join(cwd,'out.csv')],result:'ok'},{toolCallId:'x',name:'bash',status:'done',execution:'ran',result:''})
 const b=s.checkpoint();expect(b.readProgress.missing).toEqual([]);expect(b.outputObservation.unobserved).toEqual([]);expect(b.missingEvidence).toEqual([])
 expect(b.referenceChoices.executionCompleted).toEqual(['x']);expect(b.referenceChoices.verificationReviewed).not.toContain('failed')
 expect(b).not.toHaveProperty('accepted');b.readProgress.missing.push('mutated');expect(s.checkpoint().readProgress.missing).toEqual([])
})
it('isolates evidence and only proposes unique complete IDs',()=>{
 const evidence:RouteToolEvidence[]=[{toolCallId:'dup',name:'bash',status:'done',execution:'ran',result:''},{toolCallId:'dup',name:'read',status:'done',result:''}]
 const a=new TaskSubmission(TaskContractSchema.parse({submission:'tool'}),root(),()=>evidence),b=new TaskSubmission(TaskContractSchema.parse({submission:'tool'}),root(),()=>[])
 expect(a.checkpoint().referenceChoices.executionCompleted).toEqual([]);expect(b.checkpoint().evidenceCatalog.total).toBe(0)
})
it('reflects draining, cancellation and sealed state without changing submission counters',async()=>{
 const s=new TaskSubmission(TaskContractSchema.parse({submission:'tool'}),root(),()=>[]),release=s.enter()
 expect(s.checkpoint().phase).toBe('draining');release();expect(s.checkpoint(true).phase).toBe('cancelled')
 await s.submit(value);const before=s.observation();expect(s.checkpoint()).toMatchObject({phase:'sealed',sealedState:'accepted',submissionPending:false});expect(s.observation()).toEqual(before)
})
it('exposes the internal checkpoint only for contracted tasks, including read-only scopes',async()=>{
 const cwd=root(),task=createTaskTools(cwd,resolveTaskSettings(TaskContractSchema.parse({submission:'tool',access:'read-only'}),'deny-risky',['read']))
 const checkpoint=task.tools.find(t=>t.name==='get_task_status')!;expect(checkpoint).toBeDefined()
 const result=await checkpoint.execute('status',{});expect(JSON.parse(result.content[0]!.text!)).toMatchObject({submissionPending:true});expect(task.evidence()).toEqual([])
 await task.tools.find(t=>t.name==='submit_task_result')!.execute('submit',value)
 expect(JSON.parse((await checkpoint.execute('sealed',{})).content[0]!.text!).phase).toBe('sealed')
 expect(createTaskTools(cwd,resolveTaskSettings(undefined,'deny-risky',['read'])).tools.some(t=>t.name==='get_task_status')).toBe(false)
})
it('adds bounded progress guidance when evidence advances, without contaminating authoritative evidence',async()=>{
 const cwd=root();writeFileSync(join(cwd,'in.csv'),'x\n1')
 const task=createTaskTools(cwd,resolveTaskSettings(TaskContractSchema.parse({submission:'tool',resultType:'review',inputs:['in.csv'],access:'read-only'}),'deny-risky',['read']))
 const read=task.tools.find(t=>t.name==='read')!,first=await read.execute('r1',{path:'in.csv'}),again=await read.execute('r2',{path:'in.csv'})
 expect(first.content.some(c=>c.text?.startsWith('[task_delivery_status] '))).toBe(true)
 expect(again.content.some(c=>c.text?.startsWith('[task_delivery_status] '))).toBe(false)
 expect(task.evidence().every(e=>!e.result.includes('[task_delivery_status]'))).toBe(true)
})
it('bounds long paths and counts omitted gaps without presenting truncated values as complete',()=>{
 const inputs=Array.from({length:40},(_,i)=>`${i}-${'数'.repeat(200)}`),s=new TaskSubmission(TaskContractSchema.parse({resultType:'review',inputs,submission:'tool'}),root(),()=>[])
 const status=s.checkpoint();expect(status.readProgress.omitted).toBe(24);expect(status.readProgress.truncated).toBe(true);expect(Buffer.byteLength(JSON.stringify(status))).toBeLessThan(32*1024)
})

it('demonstrates real read -> checkpoint -> formal review without counting queries as submissions',async()=>{
 const cwd=root();writeFileSync(join(cwd,'in.csv'),'x\n1')
 const task=createTaskTools(cwd,resolveTaskSettings(TaskContractSchema.parse({submission:'tool',resultType:'review',inputs:['in.csv'],access:'read-only',requireReview:true}),'deny-risky',['read']))
 const query=async()=>JSON.parse((await task.tools.find(t=>t.name==='get_task_status')!.execute('checkpoint',{})).content[0]!.text!)
 const before=await query();await task.tools.find(t=>t.name==='read')!.execute('actual-read',{path:'in.csv'});const observed=await query()
 const submitted=await task.tools.find(t=>t.name==='submit_task_result')!.execute('submit',{...value,verification:{state:'reviewed',note:'read declared input',toolCallIds:['actual-read']},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:['in.csv']}})
 expect(submitted.isError).not.toBe(true);const sealed=await query()
 expect([before.observation.submissionAttempts,observed.observation.submissionAttempts,sealed.observation.submissionAttempts]).toEqual([0,0,1]);expect(task.evidence()).toHaveLength(1)
 if(process.env.DAWN_CHECKPOINT_EVIDENCE_DIR){mkdirSync(process.env.DAWN_CHECKPOINT_EVIDENCE_DIR,{recursive:true});writeFileSync(join(process.env.DAWN_CHECKPOINT_EVIDENCE_DIR,'checkpoint-demo.json'),JSON.stringify({source:'real local file tools; no model/API',before,observed,sealed},null,2)+'\n')}
})
it('keeps a worst-case checkpoint bounded across maximum file lists and a large evidence history',()=>{
 const inputs=Array.from({length:64},(_,i)=>`${i}-${'数'.repeat(200)}`),outputs=inputs.map(path=>'out/'+path)
 const evidence:RouteToolEvidence[]=Array.from({length:1024},(_,i)=>({toolCallId:String(i)+'x'.repeat(200),name:'read',status:'done',input:{path:inputs[i%inputs.length]},result:'large content not returned'}))
 const s=new TaskSubmission(TaskContractSchema.parse({resultType:'review',inputs,outputs,submission:'tool',access:'workspace-write'}),root(),()=>evidence)
 const status=s.checkpoint();expect(Buffer.byteLength(JSON.stringify(status))).toBeLessThan(32*1024);expect(status.evidenceCatalog.omitted).toBe(1016)
})
