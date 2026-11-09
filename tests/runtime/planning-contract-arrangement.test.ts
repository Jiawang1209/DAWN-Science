import {expect,it} from 'vitest'
import {ConfirmedPlanningSourceSchema} from '../../src/protocol/planning-contract-source.js'
import {buildPlanningContractContext,assertPlanningArrangement} from '../../src/runtime/planning-contract-context.js'
import {TaskArrangementSchema} from '../../src/protocol/task-arrangement.js'

const context=(independentReview=true)=>buildPlanningContractContext(ConfirmedPlanningSourceSchema.parse({version:1,ownerSessionId:'owner',revision:1,confirmedAt:1,template:{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block',validation:{version:1,column:'x',metric:'mean',unit:'m',missing:'block'}},inputs:['input.csv'],outputRoot:'results/study',dataPath:'input.csv',requireExecution:true,independentReview}))
function arrangement(c=context()){
 const block=(stage:'analyze'|'review')=>{const contract=structuredClone(c.contracts[stage]);return{id:stage,title:stage,goal:stage,role:stage,inputs:contract.inputs,outputs:contract.outputs,dependencies:stage==='review'?['analyze']:[],acceptance:'host checks',review:stage==='review',execution:{agent:stage,contract}}}
 return TaskArrangementSchema.parse({dispatch:'team-v1',mode:c.source.independentReview?'chain':'single',rationale:'actual task',independentReview:c.source.independentReview,questions:[],tasks:c.source.independentReview?[block('analyze'),block('review')]:[block('analyze')]})
}
it('uses the same exact contracts for full-contract input and keeps a simple task at one block',()=>{
 expect(()=>assertPlanningArrangement(context(),arrangement())).not.toThrow()
 const c=context(false),single=arrangement(c)
 expect(single.tasks).toHaveLength(1);expect(()=>assertPlanningArrangement(c,single)).not.toThrow()
})
it.each(['contract','acceptance','review','dependency','inputs','outputs','dispatch'] as const)('rejects a %s change that bypasses confirmed scientific requirements',field=>{
 const c=context(),p=arrangement(c)
 if(field==='contract')Object.assign(p.tasks[0]!.execution!.contract,{requireExecution:false,access:'workspace-write'})
 if(field==='acceptance')delete p.tasks[0]!.execution!.contract.acceptance
 if(field==='review'){p.independentReview=false;p.tasks=p.tasks.slice(0,1)}
 if(field==='dependency')p.tasks[1]!.dependencies=[]
 if(field==='inputs')p.tasks[0]!.inputs=['foreign.csv']
 if(field==='outputs')p.tasks[0]!.outputs=[]
 if(field==='dispatch')delete p.dispatch
 expect(()=>assertPlanningArrangement(c,p)).toThrow()
})
it('allows waiting questions without execution but requires a fresh valid plan before execution',()=>{
 const c=context(),p=arrangement(c)
 p.questions=['确认补充资料'];p.independentReview=false;p.mode='single';p.tasks=p.tasks.slice(0,1);delete p.dispatch;delete p.tasks[0]!.execution
 expect(()=>assertPlanningArrangement(c,p)).not.toThrow()
 p.questions=[];expect(()=>assertPlanningArrangement(c,p)).toThrow()
})
it('rejects an absent structure or two writers even in a sequential plan',()=>{
 const c=context(false),p=arrangement(c)
 expect(()=>assertPlanningArrangement(c,undefined)).toThrow()
 p.mode='chain';p.tasks.push({...structuredClone(p.tasks[0]!),id:'again',dependencies:['analyze']})
 expect(()=>assertPlanningArrangement(c,p)).toThrow()
})
it('does not let an additional review depend only on input checking while a valid review masks it',()=>{
 const c=context(),p=arrangement(c),contract=structuredClone(c.contracts.check)
 p.tasks.unshift({id:'check',title:'check',goal:'check',role:'check',inputs:contract.inputs,outputs:[],dependencies:[],acceptance:'checked',review:false,execution:{agent:'check',contract}})
 p.tasks.push({...structuredClone(p.tasks[2]!),id:'early-review',role:'early review',dependencies:['check']})
 expect(()=>assertPlanningArrangement(c,p)).toThrow(/审阅/)
})
