import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const fake=vi.hoisted(()=>({value:{failed:true} as Record<string,unknown>}))
afterEach(()=>{fake.value={failed:true}})
vi.mock('../../scripts/evaluate-research.js',()=>({runResearchEvaluation:async(output:string)=>{
 mkdirSync(output,{recursive:true});writeFileSync(join(output,'research.json'),JSON.stringify(fake.value))
 return{qualifiedPairs:0,completePairs:0,...fake.value}
}}))
import {runResearchFixtureEvaluation} from '../../scripts/evaluate-research-fixture.js'
it('a failed fixture report is retained but rejects the command instead of reporting success',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-fixture-status-'))
 try{
  await expect(runResearchFixtureEvaluation(root,{taskIds:['short-known-mean'],repeats:1,perArmLimit:25})).rejects.toThrow(/未通过/)
  expect(JSON.parse(readFileSync(join(root,'research.json'),'utf8'))).toEqual({failed:true})
  expect(JSON.parse(readFileSync(join(root,'request-gate.json'),'utf8')).inFlight).toBe(0)
 }finally{rmSync(root,{recursive:true,force:true})}
})
it('does not accept an empty unknown-unit batch as successful preflight evidence',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-fixture-empty-'));fake.value={rows:[]}
 try{await expect(runResearchFixtureEvaluation(root,{taskIds:['unknown-unit'],repeats:1,perArmLimit:25})).rejects.toThrow(/未通过/)}
 finally{rmSync(root,{recursive:true,force:true})}
})
