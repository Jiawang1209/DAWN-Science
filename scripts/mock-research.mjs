/** Explicit deterministic inference for offline runner validation. Never a live-model score. */
export function researchScenario(expected){
 const text=v=>typeof v==='string'?v:Array.isArray(v)?v.map(b=>b.text??'').join(''):''
 const choose=body=>{
  const ms=body.messages??[];let start=-1;for(let i=ms.length-1;i>=0;i--)if(ms[i].role==='user'){start=i;break}
  const prompt=text(ms[start]?.content),raw=/任务契约（范围已冻结）：([^\n]+)/.exec(prompt)?.[1];if(!raw)return
  const c=JSON.parse(raw),calls=ms.slice(start+1).flatMap(m=>m.role==='assistant'?m.tool_calls??[]:[]),named=name=>calls.filter(c=>c.function?.name===name)
  if(named('submit_task_result').length)return
  const reads=named('read'),paths=reads.map(c=>JSON.parse(c.function.arguments).path),next=c.inputs.find(p=>!paths.includes(p))
  if(next)return{toolName:'read',args:{path:next}}
  const unknown=prompt.includes('单位是交付必要条件'),base={summary:'offline representative fixture',blockers:unknown?['单位未提供，必须先确认']:[],deliverables:[],execution:{state:'not_run',note:'fixture'},verification:{state:'reviewed',note:'read files',toolCallIds:reads.map(c=>c.id)}}
  if(c.resultType==='data-summary')return{toolName:'submit_task_result',args:{...base,data:{kind:'data-summary',rows:48,columns:[{name:'carbon'}],issues:unknown?['单位未提供']:[]}}}
  if(unknown)return{toolName:'submit_task_result',args:{...base,data:{kind:'model-metrics',method:'arithmetic mean',metrics:{},caveats:['unit unknown']}}}
  if(c.resultType==='review')return{toolName:'submit_task_result',args:{...base,data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:c.inputs}}}
  const script=c.outputs.find(p=>p.endsWith('.py')),result=c.outputs.find(p=>p.endsWith('.json')),report=c.outputs.find(p=>p.endsWith('.md'))
  const code=`import csv,json,pathlib\nxs=[float(r['carbon_mg_g']) for r in csv.DictReader(open('input.csv')) if r['carbon_mg_g']!='NA']\npathlib.Path(${JSON.stringify(result)}).write_text(json.dumps({'n':len(xs),'mean':sum(xs)/len(xs),'unit':'mg/g'}))\npathlib.Path(${JSON.stringify(report)}).write_text('Arithmetic mean; mg/g; missing target values dropped; input preserved.')\n`
  if(!named('write').length)return{toolName:'write',args:{path:script,content:code}}
  const executed=named('bash')[0];if(!executed)return{toolName:'bash',args:{command:'python3 -I '+script}}
  return{toolName:'submit_task_result',args:{...base,deliverables:c.outputs.map(path=>({path})),execution:{state:'completed',note:'actual Python',toolCallIds:[executed.id]},verification:{state:'unreviewed',note:'independent review pending'},data:{kind:'model-metrics',method:'arithmetic mean',metrics:{mean:expected.mean},sampleCount:expected.n,caveats:[]}}}
 };return{toolCall(body){const call=choose(body);return call?{...call,usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}}:undefined},reply(){return 'offline trial complete'}}
}
