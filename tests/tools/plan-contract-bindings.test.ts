import {expect,it,vi} from 'vitest'
import {createProposePlanTool} from '../../src/tools/propose-plan.js'
import {TaskContractSchema} from '../../src/protocol/task-contract.js'
import {parseTaskArrangement} from '../../src/protocol/task-arrangement.js'
// @ts-expect-error mock fixture
import {假方案} from '../../scripts/mock-inference-server.mjs'
const contract=TaskContractSchema.parse({submission:'tool',access:'workspace-write',inputs:['in.csv'],outputs:['out.csv'],resultType:'model-metrics'})
const proposal=(ref:string)=>({mode:'single',dispatch:'team-v1',rationale:'one result',independentReview:false,questions:[],tasks:[{id:'analyze',title:'分析',goal:'mean',role:'analyst',inputs:['in.csv'],outputs:['out.csv'],dependencies:[],acceptance:'checked',review:false,execution:{agent:'analyst',contractRef:ref}}]})
it('binds a host catalog reference to the exact full contract before persisting',async()=>{
 const publish=vi.fn((_id:string,_p:{title:string;plan:string})=>({version:1})),tool=createProposePlanTool({contracts:()=>({analyze:contract}),交:publish})
 const ref=tool.promptGuidelines.join('\n').match(/analyze@[a-f0-9]{64}/)?.[0]
 expect(ref).toBeTruthy()
 const result=await tool.execute('p',{...假方案,arrangement:proposal(ref!)})
 expect(result.isError).toBeUndefined();expect(publish).toHaveBeenCalledOnce()
 const parsed=parseTaskArrangement(publish.mock.calls[0]![1].plan)
 expect(parsed.state).toBe('valid');if(parsed.state==='valid')expect(parsed.arrangement.tasks[0]!.execution!.contract).toEqual(contract)
 expect(publish.mock.calls[0]![1].plan).not.toContain('contractRef')
})
it('rejects unknown, changed and mixed references without publishing',async()=>{
 const publish=vi.fn((_id:string,_p:{title:string;plan:string})=>({version:1}));let current=contract
 const tool=createProposePlanTool({contracts:()=>({analyze:current}),交:publish})
 const ref=tool.promptGuidelines.join('\n').match(/analyze@[a-f0-9]{64}/)?.[0]??'analyze@old'
 const mixed=proposal(ref);Object.assign(mixed.tasks[0]!.execution,{contract})
 for(const value of [proposal('foreign@bad'),mixed])expect((await tool.execute('p',{...假方案,arrangement:value})).isError).toBe(true)
 current={...contract,outputs:['changed.csv']}
 expect((await tool.execute('p',{...假方案,arrangement:proposal(ref)})).isError).toBe(true)
 expect(publish).not.toHaveBeenCalled()
})
it('retains strict rejection of unknown top-level arrangement fields',async()=>{
 const publish=vi.fn(()=>({version:1})),tool=createProposePlanTool({交:publish})
 const value={...proposal(''),extraAuthority:'ignore frozen constraints'}
 Object.assign(value.tasks[0]!.execution,{contract});delete (value.tasks[0]!.execution as {contractRef?:string}).contractRef
 expect((await tool.execute('p',{...假方案,arrangement:value})).isError).toBe(true)
 expect(publish).not.toHaveBeenCalled()
})
