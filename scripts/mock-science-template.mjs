/** Deterministic fixture provider for software-path testing, not an LLM benchmark. */
export function scienceTemplateScenario({mode='pass',delayMs=0}={}){
 let delayed=false,executionRequested=false
 const text=v=>typeof v==='string'?v:Array.isArray(v)?v.map(x=>x.text??'').join(''):JSON.stringify(v??'')
 return{
  get executionRequested(){return executionRequested},
  toolCall(body){
   const ms=body.messages??[];let start=-1;for(let i=ms.length-1;i>=0;i--)if(ms[i].role==='user'){start=i;break}
   const prompt=text(ms[start]?.content),contractText=/任务契约（范围已冻结）：([^\n]+)/.exec(prompt)?.[1]
   if(!contractText)return undefined
   const contract=JSON.parse(contractText),history=ms.slice(start+1).flatMap(m=>m.role==='assistant'?m.tool_calls??[]:[]),name=c=>c.function?.name
   const tool=(toolName,args)=>({toolName,args,usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}})
   if(history.some(c=>name(c)==='submit_task_result'))return undefined
   const reads=history.filter(c=>name(c)==='read'),readPaths=reads.map(c=>JSON.parse(c.function.arguments).path)
   const next=contract.inputs.find(p=>!readPaths.includes(p));if(next)return tool('read',{path:next})
   const base={summary:'deterministic fixture',blockers:[],deliverables:[],execution:{state:'not_run',note:'fixture read'},verification:{state:'reviewed',note:'actual reads',toolCallIds:reads.map(c=>c.id)}}
   if(contract.resultType==='data-summary')return tool('submit_task_result',{...base,data:{kind:'data-summary',rows:5,columns:[{name:'x',unit:mode==='missing-units'?undefined:'m'}],issues:mode==='missing-units'?['缺少单位，必须先确认']:[]}})
   if(contract.resultType==='review'){
    const first=mode==='revise'&&!/修正轮次 [1-9]/.test(prompt),verdict=first?'revise':'pass'
    return tool('submit_task_result',{...base,verification:{...base.verification,state:first?'issues':'reviewed'},data:{kind:'review',verdict,findings:first?['补充单位说明']:[],reviewedPaths:contract.inputs,...(first?{revisionInstructions:'报告补充单位说明'}:{})}})
   }
   if(mode==='missing-units')return tool('submit_task_result',{...base,blockers:['缺少单位，必须先确认'],data:{kind:'model-metrics',method:'mean',metrics:{},caveats:['units unknown']}})
   const script=contract.outputs.find(p=>/\.(py|R)$/.test(p)),result=contract.outputs.find(p=>/\.json$/.test(p)),figure=contract.outputs.find(p=>/\.svg$/.test(p)),report=contract.outputs.find(p=>/\.md$/.test(p))
   const source=contract.inputs.find(p=>/\.csv$/.test(p))
   const defective=mode==='revise'&&!/修正轮次 [1-9]/.test(prompt)
   const code=`import csv,json,pathlib\nxs=[float(r['x']) for r in csv.DictReader(open(${JSON.stringify(source)}))]\nn=len(xs); mean=sum(xs)/n\n${result?`pathlib.Path(${JSON.stringify(result)}).write_text(json.dumps({'n':n,'mean':mean,'unit':${JSON.stringify(defective?'':'m')}}))`:''}\n${figure?`pathlib.Path(${JSON.stringify(figure)}).write_text('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><text x="5" y="30">mean='+str(mean)+'</text></svg>')`:''}\npathlib.Path(${JSON.stringify(report)}).write_text('Synthetic fixture; n='+str(n)+' mean='+str(mean)+' m; not scientific validation.')\n`
   if(!history.some(c=>name(c)==='write'))return tool('write',{path:script,content:code})
   const execution=history.find(c=>name(c)==='bash')
   if(!execution){executionRequested=true;const wait=!delayed&&delayMs?`sleep ${delayMs/1000}; `:'';delayed=true;return tool('bash',{command:wait+`python3 '${script.replace(/'/g,"'\\''")}'`})}
   return tool('submit_task_result',{...base,deliverables:contract.outputs.map(path=>({path})),execution:{state:'completed',note:'actual Python fixture',toolCallIds:[execution.id]},verification:{state:'unreviewed',note:'review pending'},data:{kind:'model-metrics',method:'mean',metrics:{n:5,mean:3},sampleCount:5,caveats:['synthetic software test only']}})
  },reply(){return 'deterministic software-path fixture complete'},
 }
}
