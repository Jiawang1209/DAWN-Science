import {afterEach,expect,it} from 'vitest'
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {freezeApprovedPlan,materializeApprovedTeam,approvedTaskSettings} from '../../src/team/approved-plan.js'
import {serializeTaskArrangement,parseTaskArrangement,validateArrangementEdit,type TaskArrangement} from '../../src/protocol/task-arrangement.js'
import {TaskContractSchema} from '../../src/protocol/task-contract.js'
import {转派,加任务,加成员,发消息} from '../../src/team/state.js'
const roots:string[]=[]
afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
const definition={name:'worker',description:'worker',systemPrompt:'original role',filePath:'/fixture/worker.md',tools:['read','write']}
const contract=(inputs:string[],outputs:string[])=>TaskContractSchema.parse({inputs,outputs,access:outputs.length?'workspace-write':'read-only',submission:'tool'})
const plan=():TaskArrangement=>({dispatch:'team-v1',mode:'chain',rationale:'Produce then check',independentReview:false,questions:[],tasks:[
 {id:'make',title:'Produce',goal:'Produce a small file',role:'writer',inputs:['input.csv'],outputs:['result.csv'],dependencies:[],acceptance:'File exists',review:false,execution:{agent:'worker',contract:contract(['input.csv'],['result.csv'])}},
 {id:'check',title:'Check',goal:'Check the result',role:'checker',inputs:['result.csv'],outputs:[],dependencies:['make'],acceptance:'Read all declared inputs',review:false,execution:{agent:'worker',contract:contract(['result.csv'],[])}}
]})
async function freeze(arrangement=plan(),context=''){
 const workspace=await mkdtemp(join(tmpdir(),'dawn-approved-'));roots.push(workspace);await writeFile(join(workspace,'input.csv'),'x\n1\n')
 const markdown=context+'\n'+serializeTaskArrangement(arrangement)
 const snapshot=await freezeApprovedPlan({workspace,owner:'owner',planId:'proposal',planVersion:2,markdown,definitions:[definition],tier:'ask-risky',model:{provider:'fixture',model:'local'}})
 return{workspace,markdown,snapshot}
}
it('roundtrips execution metadata and prevents silently dropping an executable binding',()=>{
 const arrangement=plan(),md=serializeTaskArrangement(arrangement),read=parseTaskArrangement(md)
 expect(read.state).toBe('valid');if(read.state==='valid')expect(read.arrangement).toEqual(arrangement)
 const legacy=structuredClone(arrangement);delete legacy.dispatch;for(const task of legacy.tasks)delete task.execution
 expect(()=>validateArrangementEdit(md,serializeTaskArrangement(legacy))).toThrow(/执行/)
})
it('freezes the selected definitions, scope and input bytes and materializes an exact DAG',async()=>{
 const{snapshot}=await freeze();definition.systemPrompt='edited later'
 try{
  const team=materializeApprovedTeam(snapshot,'owner')
  expect(team.tasks).toHaveLength(2);expect(team.tasks[1]!.dependencies).toEqual([team.tasks[0]!.id])
  expect(team.members[0]!.frozenAgentDefinition!.systemPrompt).toBe('original role')
  expect(team.approvedPlan!.tasks.map(t=>t.planTaskId)).toEqual(['make','check'])
  expect(approvedTaskSettings(team,team.tasks[0]!).versions!.inputs[0]!.path).toBe('input.csv')
  expect(()=>materializeApprovedTeam(snapshot,'other')).toThrow(/会话/)
 }finally{definition.systemPrompt='original role'}
})
it('rejects missing agents, inconsistent contracts and unordered access to another task output',async()=>{
 for(const mutate of [
  (p:TaskArrangement)=>{p.tasks[0]!.execution!.agent='missing'},
  (p:TaskArrangement)=>{p.tasks[0]!.execution!.contract.outputs=['elsewhere.csv']},
  (p:TaskArrangement)=>{p.tasks[1]!.dependencies=[]},
 ]){const p=plan();mutate(p);await expect(freeze(p)).rejects.toThrow()}
})
it('binds downstream input to an accepted predecessor version, never the newest file by name',async()=>{
 const{snapshot}=await freeze(),team=materializeApprovedTeam(snapshot,'owner'),[first,next]=team.tasks
 expect(()=>approvedTaskSettings(team,next!)).toThrow(/前置/)
 first!.status='completed';first!.receipt={version:1,state:'accepted',summary:'ok',deliverables:[],versions:{version:1,inputs:[],outputs:[{path:'result.csv',sha256:'a'.repeat(64),bytes:4}]}}
 expect(approvedTaskSettings(team,next!).versions!.inputs).toEqual(first!.receipt.versions!.outputs)
 first!.receipt.state='blocked';expect(()=>approvedTaskSettings(team,next!)).toThrow(/前置/)
})
it('rejects independent review with executable access or a non-review contract',async()=>{
 const p=plan();p.independentReview=true;p.tasks[1]!.review=true
 await expect(freeze(p)).rejects.toThrow(/审阅/)
 p.tasks[1]!.execution!.contract.resultType='review'
 await expect(freeze(p)).resolves.toBeTruthy()
})
it('does not let old team mutations change a frozen assignment or extend its DAG',async()=>{
 const{snapshot}=await freeze(),team=materializeApprovedTeam(snapshot,'owner')
 expect(()=>转派(team,team.tasks[0]!.id,'captain')).toThrow(/批准/)
 expect(()=>加任务(team,{subject:'unapproved extra'})).toThrow(/批准/)
 expect(()=>加成员(team,{name:'extra',agent:'worker'})).toThrow(/批准/)
 expect(()=>发消息(team,{from:'captain',to:team.members[0]!.name,content:'Run another unapproved turn'})).toThrow(/冻结/)
})
it('hands off the approved method and units outside the arrangement section to each executor',async()=>{
 const{snapshot}=await freeze(plan(),'## 统计检验与模型\n仅统计 dry_mass，单位 g，不按 rainfall 筛选。')
 expect(snapshot.frozenTasks.every(t=>t.description.includes('单位 g，不按 rainfall 筛选'))).toBe(true)
})
it('rejects a contracted write if the selected executor has no write capability',async()=>{
 const before=definition.tools;definition.tools=['read']
 try{await expect(freeze()).rejects.toThrow(/工具/)}finally{definition.tools=before}
})
it('cannot approve output paths that escape through a workspace symlink',async()=>{
 const{workspace}=await freeze(),outside=await mkdtemp(join(tmpdir(),'dawn-plan-outside-'));roots.push(outside)
 await symlink(outside,join(workspace,'alias'))
 const p=plan();p.tasks[0]!.outputs=['alias/result.csv'];p.tasks[0]!.execution!.contract.outputs=['alias/result.csv'];p.tasks.pop();p.mode='single'
 await expect(freezeApprovedPlan({workspace,owner:'owner',planId:'p',planVersion:1,markdown:serializeTaskArrangement(p),definitions:[definition],tier:'ask-risky',model:{provider:'p',model:'m'}})).rejects.toThrow(/工作/)
})
