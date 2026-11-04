import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {TaskContractSchema,acceptTaskResult} from '../../src/orchestration/task-contract.js'
import {TaskSubmission} from '../../src/orchestration/task-submission.js'
const roots:string[]=[];afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
const result=()=>({summary:'checked',blockers:[],deliverables:[],execution:{state:'not_run',note:'read only'},verification:{state:'unreviewed',note:'no scientific review'}})
const root=()=>{const p=mkdtempSync(join(tmpdir(),'dawn-submit-'));roots.push(p);return p}
it('lets the same turn fix an invalid submission, then freezes its authoritative result',async()=>{
 const submission=new TaskSubmission(TaskContractSchema.parse({submission:'tool'}),root(),()=>[])
 expect((await submission.submit({summary:'wrong'})).isError).toBe(true);expect(submission.result()).toBeUndefined()
 const value=result();expect((await submission.submit(value)).isError).not.toBe(true);value.summary='mutated'
 expect(submission.result()?.summary).toBe('checked');expect(()=>submission.enter()).toThrow(/提交/)
 expect((await submission.submit(result())).isError).toBe(true)
 expect(submission.observation()).toEqual({submissionAttempts:3,invalidSubmissions:2})
})
it('cannot commit while another actual tool call has not drained',async()=>{
 const submission=new TaskSubmission(TaskContractSchema.parse({submission:'tool'}),root(),()=>[])
 const release=submission.enter();expect((await submission.submit(result())).isError).toBe(true)
 release();release();expect((await submission.submit(result())).isError).not.toBe(true)
})
it('commits legitimate blockers but does not fabricate success for failed acceptance',async()=>{
 const submission=new TaskSubmission(TaskContractSchema.parse({submission:'tool'}),root(),()=>[])
 expect((await submission.submit({...result(),blockers:['missing unit']})).isError).not.toBe(true)
 expect(submission.receipt()?.state).toBe('blocked');expect(()=>submission.enter()).toThrow()
})
it('requires the declared scientific payload and actual reads of the reviewed files',()=>{
 const cwd=root();writeFileSync(join(cwd,'out.csv'),'x\n1')
 const contract=TaskContractSchema.parse({resultType:'review',inputs:['out.csv'],requireReview:true})
 const value={...result(),data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:['out.csv']},verification:{state:'reviewed',note:'read file',toolCallIds:['r']}}
 expect(acceptTaskResult(contract,JSON.stringify(value),[{toolCallId:'r',name:'read',status:'done',input:{path:'other.csv'},result:'x'}],cwd).state).toBe('invalid')
 expect(acceptTaskResult(contract,JSON.stringify(value),[{toolCallId:'r',name:'read',status:'done',input:{path:'out.csv'},result:'x'}],cwd).state).toBe('accepted')
 expect(acceptTaskResult(TaskContractSchema.parse({resultType:'model-metrics'}),JSON.stringify(result()),[],cwd).state).toBe('invalid')
})
it('blocks new effects while version capture is pending and abort never seals a result',async()=>{
 const {captureFileVersions}=await import('../../src/artifacts/task-versions.js')
 const cwd=root();writeFileSync(join(cwd,'in.csv'),'x\n1')
 const inputs=await captureFileVersions(cwd,['in.csv']),contract=TaskContractSchema.parse({inputs:['in.csv'],submission:'tool'})
 const submission=new TaskSubmission(contract,cwd,()=>[],{version:1,inputs})
 const controller=new AbortController(),pending=submission.submit(result(),controller.signal)
 expect(()=>submission.enter()).toThrow(/核验/)
 controller.abort();expect((await pending).isError).toBe(true);expect(submission.result()).toBeUndefined()
 expect((await submission.submit(result())).isError).not.toBe(true);expect(submission.receipt()?.versions?.inputs).toEqual(inputs)
})
