import {expect,it,vi} from 'vitest'
import {createGetPlanContractsTool} from '../../src/tools/get-plan-contracts.js'
import {ConfirmedPlanningSourceSchema} from '../../src/protocol/planning-contract-source.js'
import {buildPlanningContractContext} from '../../src/runtime/planning-contract-context.js'

const context=()=>buildPlanningContractContext(ConfirmedPlanningSourceSchema.parse({version:1,ownerSessionId:'owner',revision:1,confirmedAt:1,template:{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},inputs:['input.csv'],outputRoot:'results/study',requireExecution:true,independentReview:false}))
it('queries the current host catalog only during read-only planning without executing anything',async()=>{
 let current=context();const read=vi.fn(()=>current),tool=createGetPlanContractsTool({isPlanning:()=>true,context:read})
 let result=await tool.execute('one',{})
 const first=JSON.parse(result.content[0]!.text)
 expect(first).toMatchObject({available:true,revision:1,fingerprint:current.fingerprint,catalog:current.catalog})
 expect(JSON.stringify(first)).not.toContain('ownerSessionId')
 current=buildPlanningContractContext({...current.source,revision:2})
 result=await tool.execute('two',{});expect(JSON.parse(result.content[0]!.text).revision).toBe(2)
})
it('distinguishes missing context from invalid context, and fences cancelled or nonplanning calls',async()=>{
 const absent=createGetPlanContractsTool({isPlanning:()=>true,context:()=>undefined})
 expect(JSON.parse((await absent.execute('p',{})).content[0]!.text)).toMatchObject({available:false})
 const bad=createGetPlanContractsTool({isPlanning:()=>true,context:()=>{throw Error('来源损坏')}})
 expect((await bad.execute('p',{})).isError).toBe(true)
 const read=vi.fn(context),off=createGetPlanContractsTool({isPlanning:()=>false,context:read})
 expect((await off.execute('p',{})).isError).toBe(true);expect(read).not.toHaveBeenCalled()
 const controller=new AbortController();controller.abort()
 expect((await createGetPlanContractsTool({isPlanning:()=>true,context:read}).execute('p',{},controller.signal)).isError).toBe(true)
 expect(read).not.toHaveBeenCalled()
})
