import {expect,it,vi} from 'vitest'
import {createProposePlanTool} from '../../src/tools/propose-plan.js'
import {createGetPlanContractsTool} from '../../src/tools/get-plan-contracts.js'
import {autoArrangementPrompt,type TaskArrangement} from '../../src/protocol/task-arrangement.js'
import {TaskContractSchema} from '../../src/protocol/task-contract.js'
import {buildPlanningContractContext} from '../../src/runtime/planning-contract-context.js'
import {ConfirmedPlanningSourceSchema} from '../../src/protocol/planning-contract-source.js'
const plan='## 问题与假设\nmean\n## 数据与切分\nx\n## 统计检验与模型\nmean\n## 图\nnone\n## 产物\n`out.csv`'
function arrangement():TaskArrangement{
 const task=(id:string,inputs:string[],outputs:string[],dependencies:string[])=>({id,title:id,goal:id,role:id,inputs,outputs,dependencies,acceptance:'host checks',review:false,execution:{agent:'worker',contract:TaskContractSchema.parse({submission:'tool',inputs,outputs,access:outputs.length?'workspace-write':'read-only'})}})
 return{dispatch:'team-v1',mode:'chain',rationale:'produce then consume',independentReview:false,questions:[],tasks:[task('make',['in.csv'],['out.csv'],[]),task('use',['out.csv'],[],['make'])]}
}
it.each(['dependency','contract','nested'] as const)('rejects %s before saving a proposal, then accepts its corrected version',async kind=>{
 const store=vi.fn((_id:string,_p:{title:string;plan:string})=>({version:1})),tool=createProposePlanTool({交:store}),a=arrangement()
 if(kind==='dependency')a.tasks[1]!.dependencies=[]
 if(kind==='contract')a.tasks[1]!.inputs=['in.csv']
 if(kind==='nested'){a.tasks[1]!.outputs=['out.csv/inside'];a.tasks[1]!.execution!.contract=TaskContractSchema.parse({submission:'tool',inputs:['in.csv'],outputs:['out.csv/inside'],access:'workspace-write'});a.tasks[1]!.inputs=['in.csv']}
 const bad=await tool.execute('bad',{title:'test',plan,arrangement:a})
 expect(bad.isError).toBe(true);expect(bad.terminate).toBeUndefined();expect(store).not.toHaveBeenCalled()
 const good=await tool.execute('good',{title:'test',plan,arrangement:arrangement()})
 expect(good.terminate).toBe(true);expect(store).toHaveBeenCalledTimes(1)
})
it('keeps genuine questions pending rather than removing them or authorizing an incomplete proposal',async()=>{
 const store=vi.fn((_id:string,_p:{title:string;plan:string})=>({version:1})),a=arrangement();a.questions=['输入数据与批准方法存在真实冲突，如何处理？'];a.tasks[1]!.dependencies=[]
 const r=await createProposePlanTool({交:store}).execute('q',{title:'question',plan,arrangement:a})
 expect(r.terminate).toBe(true);expect(store.mock.calls[0]![1].plan).toContain(a.questions[0])
})
it('grounds clarification in current missing information and confirmed facts across both entry points',()=>{
 for(const text of [autoArrangementPrompt('mean'),createProposePlanTool({交:()=>({version:1})}).promptGuidelines.join('\n')]){
  expect(text).toContain('已确认');expect(text).toContain('假设性');expect(text).toContain('冲突')
 }
})
it('reports confirmed requirements explicitly without making them execution approval',async()=>{
 const c=buildPlanningContractContext(ConfirmedPlanningSourceSchema.parse({version:1,ownerSessionId:'owner',revision:1,confirmedAt:1,template:{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'mg/g',missingValues:'drop NA'},inputs:['in.csv'],outputRoot:'results',requireExecution:true,independentReview:true}))
 const r=await createGetPlanContractsTool({isPlanning:()=>true,context:()=>c}).execute('query',{})
 const facts=JSON.parse(r.content[0]!.text)
 expect(facts.confirmedFacts).toMatchObject({method:'mean',units:'mg/g',missingValues:'drop NA',inputs:['in.csv'],outputRoot:'results'})
 expect(facts.missingFacts).toEqual([]);expect(facts.instruction).toContain('不是任务数或执行批准')
})
