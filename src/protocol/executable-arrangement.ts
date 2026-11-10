/** Pure declaration checks shared by proposal admission and execution approval.
 * Filesystem aliases, current permissions and content versions still require approval checks. */
import {TaskArrangementSchema,type TaskArrangement} from './task-arrangement.js'
export function validateExecutableArrangement(value:TaskArrangement):TaskArrangement['tasks']{
 const plan=TaskArrangementSchema.parse(value)
 if(!plan.dispatch)return plan.tasks
 if(plan.tasks.length>8)throw Error('现有团队最多支持 8 个执行成员，请调整安排后再批准')
 const ordered:TaskArrangement['tasks']=[],remaining=[...plan.tasks]
 while(remaining.length){const i=remaining.findIndex(t=>t.dependencies.every(d=>ordered.some(a=>a.id===d)));if(i<0)throw Error('任务依赖存在环');ordered.push(remaining.splice(i,1)[0]!)}
 const ancestors=(id:string):Set<string>=>new Set(ordered.find(t=>t.id===id)!.dependencies.flatMap(d=>[d,...ancestors(d)]))
 if(plan.independentReview&&ordered.filter(t=>!t.review).some(t=>!ordered.some(r=>r.review&&ancestors(r.id).has(t.id))))throw Error('独立审阅必须覆盖全部执行任务的依赖链')
 const owners=new Map<string,string>(),nested=(a:string,b:string)=>a.startsWith(b+'/')||b.startsWith(a+'/')
 for(const task of ordered){
  const contract=task.execution!.contract
  const same=(a:string[],b:string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort())
  if(contract.submission!=='tool')throw Error(`任务 ${task.id} 必须正式 submit_task_result 提交`)
  if(!same(task.inputs,contract.inputs)||!same(task.outputs,contract.outputs))throw Error(`任务 ${task.id} 文件声明与执行契约不一致`)
  if(task.review&&(contract.access!=='read-only'||contract.resultType!=='review'||contract.outputs.length))throw Error(`任务 ${task.id} 独立审阅须采用只读 review 契约`)
  if(task.review&&task.dependencies.flatMap(d=>ordered.find(t=>t.id===d)!.outputs).some(path=>!task.inputs.includes(path)))throw Error(`审阅任务 ${task.id} 须声明读取直接前置任务的全部产物`)
  for(const path of task.outputs){
   if([...owners.keys()].some(other=>path===other||nested(path,other)))throw Error(`任务 ${task.id} 不能共用或嵌套写入目标：${path}`)
   if(path==='data/raw'||path.startsWith('data/raw/'))throw Error('不允许覆盖原始数据')
   owners.set(path,task.id)
  }
 }
 for(const task of ordered)for(const path of task.inputs){
  if([...owners.keys()].some(other=>nested(path,other)))throw Error(`任务 ${task.id} 输入与产物路径不能嵌套：${path}`)
  const producer=owners.get(path)
  if(producer&&!ancestors(task.id).has(producer))throw Error(`任务 ${task.id} 读取产物 ${path} 必须声明生产任务 ${producer} 的前置依赖`)
 }
 return ordered
}
