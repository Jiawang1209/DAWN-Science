import {expect,it} from 'vitest'
import {evaluateArrangementCases} from '../../src/evaluation/auto-arrangement.js'
// @ts-expect-error shared deterministic fixture
import {mockAutoArrangement} from '../../scripts/mock-auto-arrangement.mjs'
const goals=['只计算 input.csv 的均值','分别统计 east.csv 与 west.csv','清洗、建模并独立审阅 input.csv','清洗、建模并独立审阅 input.csv\n合并前两步，保留独立审阅']
it('records 1/2/3/2 proposal counts and exact roundtrips without treating fixtures as model benefit',()=>{
 const rows=goals.map((goal,i)=>({id:'case'+i,expectedCount:[1,2,3,2][i]!,proposal:mockAutoArrangement({messages:[{role:'user',content:'请为以下具体任务自动安排。\n'+goal}]},{plan:'plan',title:'fixture'}).args.arrangement}))
 const report=evaluateArrangementCases(rows);expect(report.rows.every(row=>row.passed)).toBe(true);expect(report.modelRequests).toBe(0)
})
it('fails mismatched counts and missing structure instead of reporting a successful comparison',()=>{
 const proposal=mockAutoArrangement({messages:[{role:'user',content:'请为以下具体任务自动安排。\n只计算 input.csv 的均值'}]},{plan:'plan',title:'fixture'}).args.arrangement
 expect(evaluateArrangementCases([{id:'wrong',expectedCount:3,proposal}]).rows[0]!.passed).toBe(false)
 expect(evaluateArrangementCases([{id:'missing',expectedCount:1,proposal:{}}]).rows[0]!.passed).toBe(false)
})
