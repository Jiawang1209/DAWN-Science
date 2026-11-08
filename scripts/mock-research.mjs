/** Explicit deterministic inference for offline runner validation. Never a live-model score. */
export function researchScenario(tasks){
 const text=v=>typeof v==='string'?v:Array.isArray(v)?v.map(b=>b.text??'').join(''):''
 const choose=body=>{
  const ms=body.messages??[];let start=-1;for(let i=ms.length-1;i>=0;i--)if(ms[i].role==='user'){start=i;break}
  const prompt=text(ms[start]?.content)
  if(prompt.includes('[research_automatic_arrangement]')){
   if(ms.slice(start+1).some(m=>m.role==='tool'))return
   const match=/冻结科学契约：(\{[^\n]+\})/.exec(prompt);if(!match)return
   const contracts=JSON.parse(match[1]),task=tasks.find(t=>prompt.includes(t.instructions));if(!task)return
   const stages=task.expected?['analyze','review']:['check','analyze','review']
   const blocks=stages.map((stage,index)=>({id:stage,title:stage,goal:'按冻结科学契约完成当前阶段',role:stage,inputs:contracts[stage].inputs,outputs:contracts[stage].outputs,dependencies:index?[stages[index-1]]:[],acceptance:'既有宿主证据与版本验收',review:stage==='review',execution:{agent:stage,contract:contracts[stage]}}))
   return{toolName:'propose_plan',usage:{prompt_tokens:7,completion_tokens:3,total_tokens:10},args:{title:'Offline automatic scientific arrangement',plan:'## 问题与假设\n自制科学任务\n## 数据与切分\ninput.csv\n## 统计检验与模型\n按原方法\n## 图\n未生成\n## 产物\n'+contracts.analyze.outputs.map(p=>'`'+p+'`').join('\n'),arrangement:{dispatch:'team-v1',mode:'science',rationale:'保留独立审阅；单位不明时先核查，其他任务仅保留所需分析与审阅。',independentReview:true,questions:[],tasks:blocks}}}
  }
  const raw=/任务契约（范围已冻结）：([^\n]+)/.exec(prompt)?.[1];if(!raw)return
  const c=JSON.parse(raw),calls=ms.slice(start+1).flatMap(m=>m.role==='assistant'?m.tool_calls??[]:[]),named=name=>calls.filter(c=>c.function?.name===name)
  if(named('submit_task_result').length)return
  const reads=named('read'),paths=reads.map(c=>JSON.parse(c.function.arguments).path),next=c.inputs.find(p=>!paths.includes(p))
  if(next)return{toolName:'read',args:{path:next}}
  const task=tasks.find(t=>prompt.includes(t.instructions));if(!task)return
  const {expected}=task,unknown=!expected,base={summary:'offline representative fixture',blockers:unknown?['单位未提供，必须先确认']:[],deliverables:[],execution:{state:'not_run',note:'fixture'},verification:{state:'reviewed',note:'read files',toolCallIds:reads.map(c=>c.id)}}
  if(c.resultType==='data-summary')return{toolName:'submit_task_result',args:{...base,data:{kind:'data-summary',rows:task.csv.trim().split('\n').length-1,columns:[{name:task.column}],issues:unknown?['单位未提供']:[]}}}
  if(unknown)return{toolName:'submit_task_result',args:{...base,data:{kind:'model-metrics',method:'arithmetic mean',metrics:{},caveats:['unit unknown']}}}
  if(c.resultType==='review')return{toolName:'submit_task_result',args:{...base,data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:c.inputs}}}
  const script=c.outputs.find(p=>p.endsWith('.py')),result=c.outputs.find(p=>p.endsWith('.json')),report=c.outputs.find(p=>p.endsWith('.md'))
  const code=`import csv,json,pathlib\nxs=[float(r[${JSON.stringify(task.column)}]) for r in csv.DictReader(open('input.csv')) if r[${JSON.stringify(task.column)}]!='NA']\npathlib.Path(${JSON.stringify(result)}).write_text(json.dumps({'n':len(xs),'mean':sum(xs)/len(xs),'unit':${JSON.stringify(task.unit)}}))\npathlib.Path(${JSON.stringify(report)}).write_text(${JSON.stringify("Arithmetic mean; unit "+task.unit+"; missing policy "+task.missing+"; input preserved.")})\n`
  if(!named('write').length)return{toolName:'write',args:{path:script,content:code}}
  const executed=named('bash')[0];if(!executed)return{toolName:'bash',args:{command:'python3 -I '+script}}
  return{toolName:'submit_task_result',args:{...base,deliverables:c.outputs.map(path=>({path})),execution:{state:'completed',note:'actual Python',toolCallIds:[executed.id]},verification:{state:'unreviewed',note:'independent review pending'},data:{kind:'model-metrics',method:'arithmetic mean',metrics:{mean:expected.mean},sampleCount:expected.n,caveats:[]}}}
 };return{toolCall(body){const call=choose(body);return call?{...call,usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}}:undefined},reply(){return 'offline trial complete'}}
}
