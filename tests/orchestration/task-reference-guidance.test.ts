import {expect,it} from 'vitest'
import {TaskContractSchema,taskResultParameters} from '../../src/protocol/task-contract.js'
import {TaskSubmission,taskEvidenceMetadata} from '../../src/orchestration/task-submission.js'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
it('advertises only the frozen scientific data shape and explains separate reference fields',()=>{
 const schema=taskResultParameters(TaskContractSchema.parse({resultType:'data-summary',requireReview:true,inputs:['in.csv']})) as any
 expect(schema.required).toContain('data')
 expect(schema.properties.data.properties.kind.const).toBe('data-summary')
 expect(schema.properties.execution.properties.toolCallIds.description).toMatch(/write/)
 expect(schema.properties.verification.properties.toolCallIds.description).toMatch(/成功|successful/)
})
it('distinguishes usable execution and review labels without upgrading failed reads or writes',()=>{
 const base={toolCallId:'actual',name:'read',status:'done' as const,execution:'not_observed' as const,result:''}
 expect(taskEvidenceMetadata(base).references).toEqual(['verification.reviewed'])
 expect(taskEvidenceMetadata({...base,status:'error'}).references).toEqual([])
 expect(taskEvidenceMetadata({...base,name:'write'}).references).toEqual([])
 expect(taskEvidenceMetadata({...base,name:'bash',execution:'ran'}).references).toEqual(['execution.completed','verification.reviewed'])
})
it('offers only unique, non-truncated observed references in feedback while the host still rejects a write as execution',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dawn-reference-guidance-'))
 try{
  const evidence=[{toolCallId:'exec',name:'bash',status:'done' as const,execution:'ran' as const,result:''},{toolCallId:'write',name:'write',status:'done' as const,execution:'not_observed' as const,result:''},{toolCallId:'duplicate',name:'read',status:'done' as const,result:''},{toolCallId:'duplicate',name:'read',status:'done' as const,result:''}]
  const submission=new TaskSubmission(TaskContractSchema.parse({submission:'tool'}),dir,()=>evidence)
  const result=await submission.submit({summary:'s',blockers:[],deliverables:[],execution:{state:'completed',note:'n',toolCallIds:['write']},verification:{state:'unreviewed',note:'n'}})
  expect(result.isError).toBe(true)
  const f=JSON.parse(result.content[0]!.text)
  expect(f.referenceChoices).toEqual({executionCompleted:['exec'],verificationReviewed:['exec']})
  expect(submission.result()).toBeUndefined()
 }finally{rmSync(dir,{recursive:true,force:true})}
})
it('advertises the exact frozen review paths and rejects extra, duplicate or missing paths before execution',async()=>{
 const {validateToolArguments}=await import('@earendil-works/pi-ai/utils/validation')
 const contract=TaskContractSchema.parse({resultType:'review',inputs:['result.json','report.md']})
 const schema=taskResultParameters(contract) as any
 const tool={name:'submit_task_result',description:'submit',parameters:schema}
 const args={summary:'Reviewed declared files',blockers:[],deliverables:[],execution:{state:'not_run',note:'read only'},verification:{state:'unreviewed',note:'schema test'},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:['report.md','result.json']}}
 const validate=(paths?:string[])=>validateToolArguments(tool,{type:'toolCall',id:'submit',name:'submit_task_result',arguments:{...args,data:{kind:args.data.kind,verdict:args.data.verdict,findings:[],...(paths===undefined?{}:{reviewedPaths:paths})}}})
 expect(()=>validate(['report.md','result.json'])).not.toThrow()
 expect(()=>validate(['report.md','result.json','input.csv'])).toThrow()
 expect(()=>validate(['result.json','result.json'])).toThrow()
 expect(()=>validate(['result.json'])).toThrow()
 expect(()=>validate()).toThrow()
 const empty=taskResultParameters(TaskContractSchema.parse({resultType:'review'})) as any
 expect(empty.properties.data.properties.reviewedPaths.maxItems).toBe(0)
})
it('keeps the advertised files and acceptance contract frozen after caller mutation',async()=>{
 const {writeFileSync}=await import('node:fs')
 const dir=mkdtempSync(join(tmpdir(),'dawn-contract-alias-'))
 try{
  writeFileSync(join(dir,'in.csv'),'x\n1\n')
  const contract=TaskContractSchema.parse({submission:'tool',resultType:'review',inputs:['in.csv'],requireReview:true})
  const evidence=[{toolCallId:'read',name:'read',status:'done' as const,input:{path:'in.csv'},result:'x\n1\n'}]
  const submission=new TaskSubmission(contract,dir,()=>evidence)
  contract.inputs.push('never-reviewed.csv')
  expect((submission.tool().parameters as any).properties.data.properties.reviewedPaths.items.enum).toEqual(['in.csv'])
  const result=await submission.submit({summary:'reviewed',blockers:[],deliverables:[],execution:{state:'not_run',note:'read only'},verification:{state:'reviewed',note:'read in.csv',toolCallIds:['read']},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:['in.csv']}})
  expect(result.isError).not.toBe(true);expect(submission.receipt()?.state).toBe('accepted')
 }finally{rmSync(dir,{recursive:true,force:true})}
})
it('rejects duplicate reviewed paths at the host boundary as well as in the tool schema',async()=>{
 const {writeFileSync}=await import('node:fs')
 const dir=mkdtempSync(join(tmpdir(),'dawn-review-set-'))
 try{
  writeFileSync(join(dir,'in.csv'),'x\n1\n')
  const submission=new TaskSubmission(TaskContractSchema.parse({resultType:'review',inputs:['in.csv'],requireReview:true}),dir,()=>[{toolCallId:'read',name:'read',status:'done',input:{path:'in.csv'},result:'x\n1\n'}])
  const value={summary:'reviewed',blockers:[],deliverables:[],execution:{state:'not_run',note:'read only'},verification:{state:'reviewed',note:'read in.csv',toolCallIds:['read']},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:['in.csv','in.csv']}}
  expect((await submission.submit(value)).isError).toBe(true)
  expect(submission.result()).toBeUndefined()
  expect((await submission.submit({...value,data:{...value.data,reviewedPaths:['in.csv']}})).isError).not.toBe(true)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
it('seals exactly the evidence that was checked across asynchronous version validation',async()=>{
 const {writeFileSync}=await import('node:fs'),{captureFileVersions}=await import('../../src/artifacts/task-versions.js')
 const dir=mkdtempSync(join(tmpdir(),'dawn-evidence-snapshot-'))
 try{
  writeFileSync(join(dir,'in.csv'),'x\n1\n')
  const versions={version:1 as const,inputs:await captureFileVersions(dir,['in.csv'])}
  const evidence=[{toolCallId:'read',name:'read',status:'done' as const,input:{path:'in.csv'},result:'x\n1\n'}]
  const submission=new TaskSubmission(TaskContractSchema.parse({resultType:'review',inputs:['in.csv'],requireReview:true}),dir,()=>evidence,versions)
  const pending=submission.submit({summary:'reviewed',blockers:[],deliverables:[],execution:{state:'not_run',note:'read only'},verification:{state:'reviewed',note:'read in.csv',toolCallIds:['read']},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:['in.csv']}})
  evidence[0]!.input.path='other.csv';evidence.length=0
  expect((await pending).isError).not.toBe(true)
  expect(submission.receipt()?.state).toBe('accepted')
  expect(submission.sealedEvidence()).toMatchObject([{toolCallId:'read',input:{path:'in.csv'}}])
 }finally{rmSync(dir,{recursive:true,force:true})}
})
it('retains the original input version binding if the caller later mutates its settings',async()=>{
 const {writeFileSync}=await import('node:fs'),{captureFileVersions}=await import('../../src/artifacts/task-versions.js')
 const dir=mkdtempSync(join(tmpdir(),'dawn-version-snapshot-'))
 try{
  writeFileSync(join(dir,'in.csv'),'x\n1\n')
  const versions={version:1 as const,inputs:await captureFileVersions(dir,['in.csv'])},expected=structuredClone(versions.inputs)
  const submission=new TaskSubmission(TaskContractSchema.parse({inputs:['in.csv']}),dir,()=>[],versions)
  versions.inputs.length=0
  expect((await submission.submit({summary:'observed',blockers:[],deliverables:[],execution:{state:'not_run',note:'read only'},verification:{state:'unreviewed',note:'no claim'}})).isError).not.toBe(true)
  expect(submission.receipt()?.versions?.inputs).toEqual(expected)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
