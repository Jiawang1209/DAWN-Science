import {expect,it} from 'vitest'
// @ts-expect-error shared mock fixture
import {mockAutoArrangement} from '../../scripts/mock-auto-arrangement.mjs'
import {buildPlanningContractContext} from '../../src/runtime/planning-contract-context.js'
import {bindPlanContracts} from '../../src/tools/plan-contract-bindings.js'
import {assertPlanningArrangement} from '../../src/runtime/planning-contract-context.js'
const user={role:'user',content:'请为以下具体任务自动安排。\n计算 input.csv 均值'}
const tools=[{function:{name:'get_plan_contracts'}},{function:{name:'propose_plan'}}]
const context=buildPlanningContractContext({version:1,ownerSessionId:'a',revision:1,confirmedAt:1,template:{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},inputs:['input.csv'],outputRoot:'results/study',requireExecution:true,independentReview:true})
it('queries the live product catalog then copies the fingerprint and references without changing contracts',()=>{
 expect(mockAutoArrangement({messages:[user],tools},{}).toolName).toBe('get_plan_contracts')
 const output=mockAutoArrangement({messages:[user,{role:'assistant',tool_calls:[{id:'q',function:{name:'get_plan_contracts'}}]},{role:'tool',tool_call_id:'q',content:JSON.stringify({available:true,fingerprint:context.fingerprint,catalog:context.catalog,independentReview:true})}],tools},{})
 expect(output.args.catalogFingerprint).toBe(context.fingerprint)
 const arrangement=bindPlanContracts(output.args.arrangement,context.contracts);assertPlanningArrangement(context,arrangement)
 expect(arrangement.tasks).toHaveLength(2)
})
it('keeps unconfirmed legacy fixtures and never re-queries after proposing',()=>{
 const messages=[user,{role:'assistant',tool_calls:[{id:'q',function:{name:'get_plan_contracts'}}]},{role:'tool',tool_call_id:'q',content:JSON.stringify({available:false})}]
 expect(mockAutoArrangement({messages,tools},{}).args.arrangement.tasks).toHaveLength(1)
 expect(mockAutoArrangement({messages:[...messages,{role:'assistant',tool_calls:[{id:'p',function:{name:'propose_plan'}}]},{role:'tool',tool_call_id:'p',content:'ok'}],tools},{})).toBeUndefined()
})
