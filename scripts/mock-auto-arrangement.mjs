/** Deterministic local fixtures only. Production task decomposition is performed by the session model. */
export function mockAutoArrangement(body,basePlan){
 const text=[...body.messages??[]].reverse().find(m=>m.role==='user')?.content
 const message=typeof text==='string'?text:Array.isArray(text)?text.filter(x=>x.type==='text').map(x=>x.text).join('\n'):''
 if(!message.includes('请为以下具体任务自动安排。'))return undefined
 const task=(id,title,role,inputs,outputs,dependencies=[],review=false)=>({id,title,role,goal:title,inputs,outputs,dependencies,acceptance:'输入保留、结果可核对，并提供实际依据',review})
 let arrangement
 if(message.includes('清洗、建模并独立审阅 input.csv')){
  const combined=message.includes('合并前两步')
  const tasks=combined?[task('analyze','清洗并完成建模','分析执行者',['input.csv'],['model.csv'])]:[task('clean','核查并清洗数据','数据核查员',['input.csv'],['clean.csv']),task('model','根据清洗结果建模','统计分析员',['clean.csv'],['model.csv'],['clean'])]
  tasks.push(task('review','独立审阅模型与证据','独立审阅员',['input.csv','model.csv'],['review.md'],[combined?'analyze':'model'],true))
  arrangement={mode:'science',rationale:combined?'按用户要求合并清洗与建模，保留独立审阅。':'后一步依赖前一步的产物，审阅使用独立角色。',independentReview:true,tasks,questions:[]}
 }else if(message.includes('分别统计 east.csv 与 west.csv')){
  arrangement={mode:'parallel',rationale:'两个数据集可独立统计，并写入不同结果文件。',independentReview:false,tasks:[task('east','汇总东部数据','东部统计员',['east.csv'],['east-summary.csv']),task('west','汇总西部数据','西部统计员',['west.csv'],['west-summary.csv'])],questions:[]}
 }else{
  arrangement={mode:'single',rationale:'只需要完成一个明确的均值计算，不增加交接。',independentReview:false,tasks:[task('mean','计算指定数据的均值','统计执行者',['input.csv'],['mean.csv'])],questions:[]}
 }
 arrangement.dispatch='team-v1'
 for(const task of arrangement.tasks){
  task.goal+='（本地自动安排夹具）'
  if(task.review)task.outputs=[]
  task.execution={agent:task.review?'reviewer-two':'data-engineer',contract:{version:1,inputs:task.inputs,outputs:task.outputs,access:task.review?'read-only':'workspace-write',submission:'tool',requireExecution:false,requireReview:false,...(task.review?{resultType:'review'}:{})}}
 }
 return{toolName:'propose_plan',args:{...basePlan,title:'自动安排：完成当前数据任务',plan:['## 问题与假设','按用户目标安排任务，先规划、不执行。','## 数据与切分',...new Set(arrangement.tasks.flatMap(t=>t.inputs)),'## 统计检验与模型',arrangement.rationale,'## 图','按用户需要决定，不自动增加图形任务。','## 产物',...arrangement.tasks.flatMap(t=>t.outputs).map(p=>'`'+p+'`')].join('\n'),arrangement},say:'先提出任务划分，等待你调整或采纳。'}
}
