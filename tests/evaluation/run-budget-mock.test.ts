import {expect,it} from 'vitest'
// @ts-expect-error shared mock fixture
import {budgetDelegationTool} from '../../scripts/mock-run-budget.mjs'
it('uses the real delegation tool for the explicit demo and never changes limits from model output',()=>{
 const tools=[{function:{name:'subagent'}}]
 expect(budgetDelegationTool({tools,messages:[{role:'user',content:'演示委派预算'}]})).toMatchObject({toolName:'subagent',args:{agent:'scout'}})
 expect(budgetDelegationTool({tools,messages:[{role:'user',content:[{type:'text',text:'演示委派预算'}]}]})).toMatchObject({toolName:'subagent',args:{agent:'scout'}})
 expect(budgetDelegationTool({tools,messages:[{role:'tool',content:'演示委派预算'}]})).toBeUndefined()
 expect(budgetDelegationTool({tools:[],messages:[{role:'user',content:'演示委派预算'}]})).toBeUndefined()
})
