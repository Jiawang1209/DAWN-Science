import {expect,it} from 'vitest'
import {evaluateModeAdvice} from '../../src/evaluation/mode-advice.js'
it('reports deterministic coverage, explicit conflicts, review preservation and limits',()=>{
 const report=evaluateModeAdvice();expect(report.rows.length).toBeGreaterThanOrEqual(10)
 expect(report.rows.every(row=>row.passed)).toBe(true)
 expect(report.rows.some(row=>row.reviewRequired)).toBe(true)
 expect(report.rows.some(row=>!row.valid)).toBe(true)
 expect(report.modelRequests).toBe(0);expect(report.limitations.length).toBeGreaterThan(0)
})
