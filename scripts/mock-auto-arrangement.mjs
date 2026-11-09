/** Deterministic local fixtures only. Production task decomposition is performed by the session model. */
export function mockAutoArrangement(body,basePlan){
 const text=[...body.messages??[]].reverse().find(m=>m.role==='user')?.content
 const message=typeof text==='string'?text:Array.isArray(text)?text.filter(x=>x.type==='text').map(x=>x.text).join('\n'):''
 if(!message.includes('请为以下具体任务自动安排。'))return undefined
 const messages=body.messages??[],last=messages.at(-1)
 const queryAvailable=(body.tools??[]).some(tool=>(tool.function?.name??tool.name)==='get_plan_contracts')
 const lastCall=messages.findLast(m=>m.role==='assistant'&&m.tool_calls?.length)?.tool_calls?.find(c=>c.id===last?.tool_call_id)?.function?.name
 if(queryAvailable&&last?.role==='user')return{toolName:'get_plan_contracts',args:{},say:'先查看本会话已确认的科研约束。'}
 if(last?.role==='tool'){
  if(lastCall!=='get_plan_contracts')return undefined
  let catalog
  try{catalog=JSON.parse(String(last.content).split('\n[task_tool_evidence]')[0].trim())}catch{return undefined}
  if(catalog.available){
   const analyze=catalog.catalog.find(entry=>entry.contract.resultType==='model-metrics'),review=catalog.catalog.find(entry=>entry.contract.resultType==='review')
   if(!analyze||catalog.independentReview&&!review)return undefined
   const node=(id,title,entry,dependencies,reviewer=false)=>({id,title,goal:title+'（本地科研契约夹具）',role:reviewer?'独立审阅员':'统计分析员',inputs:entry.contract.inputs,outputs:entry.contract.outputs,dependencies,acceptance:'遵守已确认的科学合同，提交原始证据和版本供宿主验收',review:reviewer,execution:{agent:reviewer?'reviewer-two':'data-engineer',contractRef:entry.reference}})
   const tasks=[node('analyze','按确认约束完成分析',analyze,[])]
   if(catalog.independentReview)tasks.push(node('review','独立审阅分析与证据',review,['analyze'],true))
   return{toolName:'propose_plan',args:{...basePlan,title:'按科研约束自动安排',plan:'## 问题与假设\n按本会话已确认的科学约束分析。\n## 数据与切分\n保留声明输入。\n## 统计检验与模型\n严格沿用宿主合同。\n## 图\n不额外增加图形任务。\n## 产物\n交付合同声明的脚本、结果和报告。',catalogFingerprint:catalog.fingerprint,arrangement:{mode:catalog.independentReview?'science':'single',dispatch:'team-v1',rationale:'使用当前已确认契约，按需独立审阅。',independentReview:catalog.independentReview,tasks,questions:[]}},say:'已引用当前约束；等待你采纳后才执行。'}
  }
 }
 const task=(id,title,role,inputs,outputs,dependencies=[],review=false)=>({id,title,role,goal:title,inputs,outputs,dependencies,acceptance:'输入保留、结果可核对，并提供实际依据',review})
 let arrangement
 if(message.includes('清洗、建模并独立审阅 input.csv')){
  const combined=message.includes('合并前两步')
  const tasks=combined?[task('analyze','清洗并完成建模','分析执行者',['input.csv'],['model.csv'])]:[task('clean','核查并清洗数据','数据核查员',['input.csv'],['clean.csv']),task('model','根据清洗结果建模','统计分析员',['clean.csv'],['model.csv'],['clean'])]
  tasks.push(task('review','独立审阅模型与证据','独立审阅员',['input.csv','model.csv'],['review.md'],[combined?'analyze':'model'],true))
  arrangement={mode:'science',rationale:combined?'按用户要求合并清洗与建模，保留独立审阅。':'后一步依赖前一步的产物，审阅使用独立角色。',independentReview:true,tasks,questions:[]}
 }else if(message.includes('单位未提供')&&!message.includes('[plan_clarification]')){
  arrangement={mode:'single',rationale:'先确认输入单位，避免猜测。',independentReview:false,tasks:[task('inspect','确认数据口径','数据核查员',['input.csv'],[])],questions:['input.csv 中 x 的单位是什么？']}
 }else if(message.includes('分别统计 east.csv 与 west.csv')){
  arrangement={mode:'parallel',rationale:'两个数据集可独立统计，并写入不同结果文件。',independentReview:false,tasks:[task('east','汇总东部数据','东部统计员',['east.csv'],['east-summary.csv']),task('west','汇总西部数据','西部统计员',['west.csv'],['west-summary.csv'])],questions:[]}
 }else{
  arrangement={mode:'single',rationale:'只需要完成一个明确的均值计算，不增加交接。',independentReview:false,tasks:[task('mean','计算指定数据的均值','统计执行者',['input.csv'],['mean.csv'])],questions:[]}
 }
 arrangement.dispatch='team-v1'
 for(const task of arrangement.tasks){
  task.goal+='（本地自动安排夹具）'
  if(task.review)task.outputs=[]
  task.execution={agent:task.review?'reviewer-two':'data-engineer',contract:{version:1,inputs:task.inputs,outputs:task.outputs,access:task.review||!task.outputs.length?'read-only':'workspace-write',submission:'tool',requireExecution:false,requireReview:false,...(task.review?{resultType:'review'}:{})}}
 }
 return{toolName:'propose_plan',args:{...basePlan,title:'自动安排：完成当前数据任务',plan:['## 问题与假设','按用户目标安排任务，先规划、不执行。','## 数据与切分',...new Set(arrangement.tasks.flatMap(t=>t.inputs)),'## 统计检验与模型',arrangement.rationale,'## 图','按用户需要决定，不自动增加图形任务。','## 产物',...arrangement.tasks.flatMap(t=>t.outputs).map(p=>'`'+p+'`')].join('\n'),arrangement},say:'先提出任务划分，等待你调整或采纳。'}
}
