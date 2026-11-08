import {expect,it} from 'vitest'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {runResearchFixtureEvaluation} from '../../scripts/evaluate-research-fixture.js'
it('writes real same-budget automatic-plan fixture evidence with planning included in usage',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-fixture-'))
 try{
  const report=await runResearchFixtureEvaluation(join(root,'out'),{taskIds:['short-known-mean','negative-zero-mean'],repeats:1,perArmLimit:25})
  expect(report.inference).toBe('fixture');expect(report.completePairs).toBe(2);expect(report.qualifiedPairs).toBe(2)
  expect(report.rows.every(r=>r.success)).toBe(true)
  for(const row of report.rows.filter(r=>r.mode==='multi')){
   expect(row.phaseUsage?.planning.visibleTokens).toBeGreaterThan(0)
   expect(row.totalUsage?.visibleTokens).toBe(row.usage.visibleTokens+row.phaseUsage!.planning.visibleTokens!)
   expect(row.requestBudget?.inFlight).toBe(0)
  }
  expect(readFileSync(join(root,'out/research.md'),'utf8')).toContain('分阶段用量')
 }finally{rmSync(root,{recursive:true,force:true})}
},60000)
