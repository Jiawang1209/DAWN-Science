import {afterEach, expect, it} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {TaskContractSchema, acceptTaskResult,taskPrompt,TaskResultParameters} from '../../src/orchestration/task-contract.js'
const roots: string[] = []
afterEach(() => {for (const p of roots.splice(0)) rmSync(p, {recursive:true, force:true})})
const root = () => {const p=mkdtempSync(join(tmpdir(),'dawn-contract-'));roots.push(p);return p}
const result = (extra={}) => JSON.stringify({summary:'checked', blockers:[], deliverables:[], execution:{state:'not_run',note:'read only'}, verification:{state:'unreviewed',note:'no scientific review'},...extra})
it('explains host evidence labels and the bounds of submission feedback',()=>{
 const prompt=taskPrompt('inspect',TaskContractSchema.parse({submission:'tool'}))
 expect(prompt).toContain('[task_tool_evidence]');expect(prompt).toContain('evidenceCatalog');expect(prompt).toContain('截断')
})
it('rejects paths and contracts that cannot match their execution scope', () => {
  expect(TaskContractSchema.safeParse({inputs:['../raw.csv']}).success).toBe(false)
  expect(TaskContractSchema.safeParse({outputs:['result.csv']}).success).toBe(false)
  expect(TaskContractSchema.safeParse({access:'workspace-write'}).success).toBe(false)
  expect(TaskContractSchema.parse({inputs:['raw.csv']}).access).toBe('read-only')
})
it('does not accept claimed scientific execution or review without actual tool evidence', () => {
  const contract=TaskContractSchema.parse({})
  expect(acceptTaskResult(contract,result({execution:{state:'completed',note:'trust me',toolCallIds:['fake']}}),[],root()).state).toBe('invalid')
  expect(acceptTaskResult(contract,result({verification:{state:'reviewed',note:'trust me'}}),[],root()).state).toBe('invalid')
})
it('reuses route evidence and keeps file existence distinct from observed production', () => {
  const workspace=root();writeFileSync(join(workspace,'out.csv'),'x\n1')
  const contract=TaskContractSchema.parse({access:'workspace-write',outputs:['out.csv']})
  const text=result({deliverables:[{path:'out.csv'}],verification:{state:'reviewed',note:'read artifact',toolCallIds:['read-1']}})
  const receipt=acceptTaskResult(contract,text,[{toolCallId:'read-1',name:'read',status:'done',result:'x\n1'}],workspace)
  expect(receipt.state).toBe('accepted');expect(receipt.deliverables[0]?.state).toBe('exists')
  expect(acceptTaskResult(contract,text,[],workspace).state).toBe('invalid')
  rmSync(join(workspace,'out.csv'));expect(acceptTaskResult(contract,text,[{toolCallId:'read-1',name:'read',status:'done',result:'x\n1'}],workspace).state).toBe('invalid')
})
it('rejects undeclared deliverables and remote local-path checks and preserves blockers', () => {
  const contract=TaskContractSchema.parse({})
  expect(acceptTaskResult(contract,result({deliverables:[{path:'secret.txt'}]}),[],root()).state).toBe('invalid')
  expect(acceptTaskResult(contract,result(),[],root(),true).state).toBe('invalid')
  expect(acceptTaskResult(contract,result({blockers:['need units']}),[],root()).state).toBe('blocked')
})

it('rejects persisted settings whose execution scope contradicts the frozen contract',async()=>{
 const {TaskSettingsSchema}=await import('../../src/orchestration/task-contract.js')
 const contract=TaskContractSchema.parse({})
 expect(TaskSettingsSchema.safeParse({contract,scope:{version:1,tier:'allow-all',access:'workspace-exec',tools:['*'],inputs:[],outputs:[]}}).success).toBe(false)
})

it('does not release downstream work when the structured result reports a real execution failure',()=>{
 const contract=TaskContractSchema.parse({})
 const receipt=acceptTaskResult(contract,result({execution:{state:'failed',note:'actual command failed',toolCallIds:['b1']}}),[{toolCallId:'b1',name:'bash',status:'error',execution:'failed',result:'exit 1'}],root())
 expect(receipt.state).toBe('blocked')
})

it('enforces caller-required execution and review rather than accepting an unrun script as analysis',()=>{
 const needsRun=TaskContractSchema.parse({access:'workspace-exec',requireExecution:true})
 expect(acceptTaskResult(needsRun,result(),[],root()).state).toBe('blocked')
 const needsReview=TaskContractSchema.parse({requireReview:true})
 expect(acceptTaskResult(needsReview,result(),[],root()).state).toBe('blocked')
})

it('does not accept a task whose declared input file is unavailable',()=>{
 const contract=TaskContractSchema.parse({inputs:['missing.csv']})
 expect(acceptTaskResult(contract,result(),[],root()).state).not.toBe('accepted')
})
it('explains that issues are blocking findings, while informational notes belong in summary',()=>{
 const contract=TaskContractSchema.parse({resultType:'data-summary'})
 expect(taskPrompt('check',contract)).toContain('issues=[]')
 expect(JSON.stringify(TaskResultParameters)).toContain('blocking')
 const data={kind:'data-summary',rows:48,columns:[],issues:['method excludes these rows']}
 expect(acceptTaskResult(contract,result({data}),[],root()).state).toBe('blocked')
 expect(acceptTaskResult(contract,result({data:{...data,issues:[]}}),[],root()).state).toBe('accepted')
})
it('rejects ambiguous reused proof IDs even when both matching tool records succeeded',()=>{
 const cwd=root();writeFileSync(join(cwd,'in.csv'),'x\n1\n')
 const contract=TaskContractSchema.parse({resultType:'review',inputs:['in.csv'],requireReview:true})
 const body=result({verification:{state:'reviewed',note:'review',toolCallIds:['reused']},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:['in.csv']}})
 const proof={toolCallId:'reused',name:'read',status:'done' as const,input:{path:'in.csv'},result:'x\n1\n'}
 expect(acceptTaskResult(contract,body,[proof,{...proof}],cwd).state).toBe('invalid')
 expect(acceptTaskResult(contract,body,[proof],cwd).state).toBe('accepted')
})
