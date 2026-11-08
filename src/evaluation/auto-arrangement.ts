import {TaskArrangementSchema,serializeTaskArrangement,parseTaskArrangement,type TaskArrangement} from '../protocol/task-arrangement.js'
export function evaluateArrangementCases(cases:{id:string;expectedCount:number;proposal:unknown}[]){
 const rows=cases.map(c=>{
  const parsed=TaskArrangementSchema.safeParse(c.proposal)
  if(!parsed.success)return{id:c.id,expectedCount:c.expectedCount,valid:false,passed:false,reason:parsed.error.message}
  const restored=parseTaskArrangement(serializeTaskArrangement(parsed.data))
  return{id:c.id,expectedCount:c.expectedCount,actualCount:parsed.data.tasks.length,mode:parsed.data.mode,valid:true,roundtrip:restored.state==='valid'&&JSON.stringify(restored.arrangement)===JSON.stringify(parsed.data),independentReview:parsed.data.independentReview,passed:restored.state==='valid'&&restored.arrangement.tasks.length===c.expectedCount&&JSON.stringify(restored.arrangement)===JSON.stringify(parsed.data)}
 })
 return{version:1,rows,modelRequests:0,limitations:['Deterministic fixture coverage of model-tool-to-plan data flow, not a paid-model quality or performance comparison.','Task counts are proposal results. They do not indicate started agents or accepted scientific results.']}
}
