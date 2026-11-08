import {expect,it} from 'vitest'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {runArrangementScenarioEvaluation} from '../../scripts/evaluate-arrangement-scenarios.js'
it('uses actual propose_plan with the shared task-driven prompt for six offline cases, without starting tasks',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-arrangement-cases-'))
 try{
  const report=await runArrangementScenarioEvaluation(root)
  expect(report.inference).toBe('localhost-fixture')
  expect(report.rows).toHaveLength(6)
  expect(report.rows.every(r=>r.passed&&r.proposalRecorded&&r.tasksExecuted===0)).toBe(true)
  expect(report.rows.find(r=>r.scenarioId==='simple-result')?.mode).toBe('single')
  expect(report.rows.find(r=>r.scenarioId==='independent-inputs')?.mode).toBe('parallel')
  expect(report.rows.find(r=>r.scenarioId==='independent-review')?.taskCount).toBe(2)
  expect(report.rows.find(r=>r.scenarioId==='independent-review')).toMatchObject({reviewCovered:true})
  expect(report.rows.find(r=>r.scenarioId==='simple-result')).toMatchObject({reviewCovered:null})
  expect(readFileSync(join(root,'arrangement-scenarios.md'),'utf8')).toContain('| 审阅覆盖 |')
  expect(JSON.parse(readFileSync(join(root,'arrangement-scenarios.json'),'utf8')).paidModelRequests).toBe(0)
 }finally{rmSync(root,{recursive:true,force:true})}
},60000)
