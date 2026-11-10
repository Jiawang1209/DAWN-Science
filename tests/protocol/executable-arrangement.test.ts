import {expect,it} from 'vitest'
import {validateExecutableArrangement} from '../../src/protocol/executable-arrangement.js'
import {TaskContractSchema} from '../../src/protocol/task-contract.js'
import type {TaskArrangement} from '../../src/protocol/task-arrangement.js'
const block=(id:string,inputs:string[],outputs:string[],dependencies:string[])=>({id,title:id,goal:id,role:id,inputs,outputs,dependencies,acceptance:'check',review:false,execution:{agent:'worker',contract:TaskContractSchema.parse({submission:'tool',inputs,outputs,access:outputs.length?'workspace-write':'read-only'})}})
const plan=():TaskArrangement=>({dispatch:'team-v1',mode:'chain',rationale:'real dependency',independentReview:false,questions:[],tasks:[block('a',['input.csv'],['first.csv'],[]),block('b',['first.csv'],['second.csv'],['a']),block('c',['first.csv','second.csv'],[],['b'])]})
it('accepts transitive dependencies and orders a valid forward-declared DAG',()=>{
 const p=plan();p.tasks.reverse();expect(validateExecutableArrangement(p).map(t=>t.id)).toEqual(['a','b','c'])
})
it('rejects self-produced reads and a missing producer edge without guessing a repair',()=>{
 const p=plan();p.tasks[2]!.dependencies=[]
 expect(()=>validateExecutableArrangement(p)).toThrow(/c.*first.csv.*a/)
 expect(p.tasks[2]!.dependencies).toEqual([])
})
it('rejects a read-only reviewer whose inputs omit direct predecessor outputs',()=>{
 const p=plan();p.independentReview=true;p.tasks[2]!.review=true;p.tasks[2]!.inputs=['first.csv'];p.tasks[2]!.execution!.contract=TaskContractSchema.parse({submission:'tool',resultType:'review',inputs:['first.csv']})
 expect(()=>validateExecutableArrangement(p)).toThrow(/审阅.*全部产物/)
})
it('does not apply execution-only checks to a legacy descriptive arrangement',()=>{
 const p=plan();delete p.dispatch;for(const t of p.tasks)delete t.execution
 expect(validateExecutableArrangement(p)).toHaveLength(3)
})
