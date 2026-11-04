import {expect,it} from 'vitest'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os'
import {runScienceBaseline} from '../../scripts/evaluate-science-pipeline.js'
it('runs both actual Pi paths with independent host truth and comparable fingerprints for all five cases',async()=>{
 const root=mkdtempSync(join(tmpdir(),'science-baseline-report-'));try{const report=await runScienceBaseline(root);expect(report.rows).toHaveLength(10);expect(report.rows.every(r=>r.success&&!r.falseAcceptance)).toBe(true);expect(report.rows.filter(r=>r.scenario==='reviewer-repair').map(r=>r.rework)).toEqual([1,1]);expect(report.byMode.map(r=>r.successes)).toEqual([5,5]);expect(JSON.parse(readFileSync(join(root,'baseline.json'),'utf8')).sourceFingerprint).toHaveLength(64);expect(readFileSync(join(root,'baseline.md'),'utf8')).toContain('不支持真实模型') }finally{rmSync(root,{recursive:true,force:true})}
},60000)
