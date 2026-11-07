import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {TaskContractSchema,acceptTaskResult} from '../../src/orchestration/task-contract.js'
import {TaskSubmission} from '../../src/orchestration/task-submission.js'
import type {RouteToolEvidence} from '../../src/runtime/analysis-route-evidence.js'
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
it('seals a host-blocked numeric receipt and never accepts model text as the executable check',async()=>{
 const {captureFileVersions}=await import('../../src/artifacts/task-versions.js')
 const cwd=mkdtempSync(join(tmpdir(),'dawn-submit-numeric-'));roots.push(cwd);for(const [path,content] of Object.entries({'in.csv':'x\n1\n2\n3\n','analysis.py':'print("analysis")','report.md':'mean=3 m','result.json':JSON.stringify({n:3,mean:999,unit:'m'})}))writeFileSync(join(cwd,path),content)
 const c=TaskContractSchema.parse({submission:'tool',access:'workspace-write',inputs:['in.csv'],outputs:['analysis.py','result.json','report.md'],resultType:'model-metrics',acceptance:{version:1,kind:'tabular-ecology',scriptPath:'analysis.py',reportPath:'report.md',resultPath:'result.json',numeric:{version:1,dataPath:'in.csv',column:'x',metric:'mean',unit:'m',missing:'block',absoluteTolerance:1e-9}}})
 const submission=new TaskSubmission(c,cwd,()=>[],{version:1,inputs:await captureFileVersions(cwd,['in.csv'])})
 const answer={summary:'model says passed',blockers:[],deliverables:c.outputs.map(path=>({path})),execution:{state:'not_run',note:'fixture'},verification:{state:'unreviewed',note:'fixture'},data:{kind:'model-metrics',method:'mean',metrics:{n:3,mean:999},sampleCount:3,caveats:[]}}
 expect((await submission.submit(answer)).isError).not.toBe(true);expect(submission.receipt()?.state).toBe('blocked');expect(submission.receipt()?.acceptance?.checks.find(c=>c.id==='numeric.mean')).toMatchObject({state:'blocked',expected:'2',actual:'999'});expect(()=>submission.enter()).toThrow('结果已经提交')
})
it('returns structured schema paths and frozen requirements without echoing model data',async()=>{
 const c=TaskContractSchema.parse({submission:'tool',access:'workspace-write',inputs:['in.csv'],outputs:['out.csv'],resultType:'review',requireReview:true})
 const submission=new TaskSubmission(c,root(),()=>[])
 const response=await submission.submit({...result(),summary:'PRIVATE MODEL DATA',execution:{state:'invented',note:'bad'}})
 expect(response.isError).toBe(true)
 const feedback=JSON.parse(response.content[0]!.text)
 expect(feedback).toMatchObject({recorded:false,error:expect.any(String),fieldErrors:expect.arrayContaining([expect.objectContaining({path:'execution.state'})]),contract:{inputs:['in.csv'],outputs:['out.csv'],resultType:'review',requireReview:true,readRequirements:['in.csv']},evidenceCatalog:{entries:[],total:0,omitted:0}})
 expect(response.content[0]!.text).not.toContain('PRIVATE MODEL DATA')
 expect(submission.observation()).toEqual({submissionAttempts:1,invalidSubmissions:1})
})
it('lists latest bounded host evidence without command or result dumps and reports all truncation',async()=>{
 const proof:RouteToolEvidence[]=Array.from({length:30},(_,i)=>({toolCallId:`actual-${i}`,name:'bash',status:'done',execution:'ran',input:{command:'PRIVATE COMMAND'},result:'PRIVATE RESULT'}))
 proof[29]={...proof[29]!,toolCallId:'x'.repeat(10000),filesWritten:Array.from({length:20},()=>'/'+ 'p'.repeat(10000))}
 const paths=Array.from({length:64},(_,i)=>`${i}-${'p'.repeat(1000)}`)
 const submission=new TaskSubmission(TaskContractSchema.parse({access:'workspace-write',outputs:paths}),root(),()=>proof)
 const response=await submission.submit({summary:'bad'})
 const text=response.content[0]!.text,feedback=JSON.parse(text)
 expect(feedback.evidenceCatalog.total).toBe(30);expect(feedback.evidenceCatalog.entries.length).toBeLessThanOrEqual(12)
 expect(feedback.evidenceCatalog.omitted).toBe(30-feedback.evidenceCatalog.entries.length)
 expect(feedback.evidenceCatalog.entries[0].toolCallId).toBe(`actual-${feedback.evidenceCatalog.omitted}`)
 expect(feedback.evidenceCatalog.entries.at(-1).truncatedFields).toContain('toolCallId')
 expect(feedback.evidenceCatalog.entries.at(-1).filesWrittenOmitted).toBeGreaterThan(0)
 expect(feedback.contract.truncatedFields).toContain('outputs');expect(Buffer.byteLength(text)).toBeLessThan(32*1024)
 expect(text).not.toContain('PRIVATE COMMAND');expect(text).not.toContain('PRIVATE RESULT')
})
it('bounds serialized feedback even for escaped control characters and unicode paths',()=>{
 const proof:RouteToolEvidence[]=Array.from({length:8},()=>({toolCallId:'\u0000'.repeat(1000),name:'read',status:'done',execution:'not_observed',input:{path:'\u0000'.repeat(1000)},filesWritten:Array.from({length:3},()=>'\u0000'.repeat(1000)),result:'not disclosed'}))
 const inputs=Array.from({length:64},(_,i)=>`${i}-${'数'.repeat(1000)}`),outputs=inputs.map(path=>'out/'+path)
 const submission=new TaskSubmission(TaskContractSchema.parse({access:'workspace-write',resultType:'review',inputs,outputs}),root(),()=>proof)
 const feedback=submission.feedback(new Error('\u0000'.repeat(10000)))
 expect(Buffer.byteLength(JSON.stringify(feedback))).toBeLessThan(32*1024)
 expect(feedback.contract.truncatedFields).toEqual(expect.arrayContaining(['inputs','outputs','readRequirements']))
 expect(feedback.errorTruncated).toBe(true);expect(feedback.evidenceCatalog.entries[0]?.truncatedFields).toContain('path')
})
it('never suggests a new submission after sealing or cancellation and tells busy calls to wait',async()=>{
 const submission=new TaskSubmission(TaskContractSchema.parse({submission:'tool'}),root(),()=>[])
 const release=submission.enter()
 const busy=JSON.parse((await submission.submit(result())).content[0]!.text)
 expect(busy.retryable).toBe(false);expect(busy.phase).toBe('draining')
 release()
 const controller=new AbortController();controller.abort()
 const stopped=JSON.parse((await submission.submit(result(),controller.signal)).content[0]!.text)
 expect(stopped.retryable).toBe(false);expect(stopped.phase).toBe('cancelled');expect(stopped.instruction).not.toContain('修正后可在本轮再次提交')
 expect((await submission.submit(result())).isError).not.toBe(true)
 const sealed=JSON.parse((await submission.submit(result())).content[0]!.text)
 expect(sealed).toMatchObject({retryable:false,phase:'sealed',sealedState:'accepted'})
 expect(sealed.instruction).not.toContain('修正后可在本轮再次提交')
})
