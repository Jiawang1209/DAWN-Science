/** Host-owned, content-bound plan contracts. References never enter persisted arrangements. */
import {createHash} from 'node:crypto'
import {TaskContractSchema,type TaskContract} from '../protocol/task-contract.js'
import {TaskArrangementInputSchema,TaskArrangementSchema} from '../protocol/task-arrangement.js'
export function planContractCatalog(contracts:Record<string,TaskContract>){
 return Object.entries(contracts).map(([name,value])=>{
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name))throw Error('宿主契约名称无效')
  const contract=TaskContractSchema.parse(value)
  const reference=name+'@'+createHash('sha256').update(JSON.stringify(contract)).digest('hex')
  return{reference,contract}
 })
}
export function bindPlanContracts(value:unknown,contracts:Record<string,TaskContract>){
 const parsed=TaskArrangementInputSchema.parse(value),catalog=planContractCatalog(contracts)
 return TaskArrangementSchema.parse({...parsed,tasks:parsed.tasks.map(task=>{
  const execution=task.execution;if(!execution)return task
  const contract=execution.contract??catalog.find(entry=>entry.reference===execution.contractRef)?.contract
  if(!contract)throw Error('宿主契约引用未知或版本已变化，请使用当前契约目录重新安排')
  return{...task,execution:{agent:execution.agent,contract:structuredClone(contract)}}
 })})
}
