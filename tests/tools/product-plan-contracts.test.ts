import {expect,it,vi} from 'vitest'
import {createProposePlanTool} from '../../src/tools/propose-plan.js'
import {createGetPlanContractsTool} from '../../src/tools/get-plan-contracts.js'
import {buildPlanningContractContext} from '../../src/runtime/planning-contract-context.js'
import {ConfirmedPlanningSourceSchema} from '../../src/protocol/planning-contract-source.js'
import {parseTaskArrangement} from '../../src/protocol/task-arrangement.js'
// @ts-expect-error shared local scenario
import {假方案} from '../../scripts/mock-inference-server.mjs'
const source=()=>ConfirmedPlanningSourceSchema.parse({version:1,ownerSessionId:'owner',revision:1,confirmedAt:1,template:{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block',validation:{version:1,column:'x',metric:'mean',unit:'m',missing:'block'}},inputs:['input.csv'],outputRoot:'results/study',dataPath:'input.csv',requireExecution:true,independentReview:false})
const proposal=(context:ReturnType<typeof buildPlanningContractContext>,contractRef?:string)=>{const contract=structuredClone(context.contracts.analyze);return{mode:'single',dispatch:'team-v1',rationale:'one result',independentReview:false,questions:[],tasks:[{id:'analyze',title:'mean',goal:'mean',role:'analyst',inputs:contract.inputs,outputs:contract.outputs,dependencies:[],acceptance:'existing host rules',review:false,execution:{agent:'analyst',...(contractRef?{contractRef}:{contract})}}]}}
it('queries the current product source and saves an ordinary complete contract without tool/schema reload',async()=>{
 const context=buildPlanningContractContext(source()),publish=vi.fn((_id:string,_value:{title:string;plan:string})=>({version:1}))
 const tool=createProposePlanTool({planningContext:()=>context,交:publish}),query=createGetPlanContractsTool({isPlanning:()=>true,context:()=>context})
 const catalog=JSON.parse((await query.execute('q',{})).content[0]!.text)
 const result=await tool.execute('p',{...假方案,catalogFingerprint:catalog.fingerprint,arrangement:proposal(context,catalog.catalog.find((e:{reference:string})=>e.reference.startsWith('analyze@')).reference)})
 expect(result.isError).toBeUndefined();expect(publish).toHaveBeenCalledOnce()
 const parsed=parseTaskArrangement(publish.mock.calls[0]![1].plan)
 expect(parsed.state).toBe('valid');if(parsed.state==='valid')expect(parsed.arrangement.tasks[0]!.execution!.contract).toEqual(context.contracts.analyze)
 expect(publish.mock.calls[0]![1].plan).not.toContain('contractRef')
})
it('rejects stale source identity even when changing method text leaves contract references identical',async()=>{
 let context=buildPlanningContractContext(source())
 const old=context,publish=vi.fn(()=>({version:1})),tool=createProposePlanTool({planningContext:()=>context,交:publish})
 context=buildPlanningContractContext({...context.source,revision:2,template:{...context.source.template,method:'new confirmed method'}})
 expect(context.catalog).toEqual(old.catalog)
 const result=await tool.execute('p',{...假方案,catalogFingerprint:old.fingerprint,arrangement:proposal(old)})
 expect(result.isError).toBe(true);expect(publish).not.toHaveBeenCalled()
})
it('does not bypass scientific constraints through a full contract or an absent task structure',async()=>{
 const context=buildPlanningContractContext(source()),publish=vi.fn(()=>({version:1})),tool=createProposePlanTool({planningContext:()=>context,交:publish})
 const weak=proposal(context),execution=weak.tasks[0]!.execution
 if(!('contract' in execution))throw Error('fixture needs a full contract')
 delete execution.contract.acceptance
 expect((await tool.execute('p',{...假方案,catalogFingerprint:context.fingerprint,arrangement:weak})).isError).toBe(true)
 expect((await tool.execute('p',{...假方案,catalogFingerprint:context.fingerprint})).isError).toBe(true)
 expect((await tool.execute('p',{...假方案,arrangement:proposal(context)})).isError).toBe(true)
 expect(publish).not.toHaveBeenCalled()
})
it('keeps the original complete-contract path when no product source exists',async()=>{
 const context=buildPlanningContractContext(source()),publish=vi.fn(()=>({version:1})),tool=createProposePlanTool({planningContext:()=>undefined,交:publish})
 expect((await tool.execute('p',{...假方案,arrangement:proposal(context)})).isError).toBeUndefined()
 expect(publish).toHaveBeenCalledOnce()
})
