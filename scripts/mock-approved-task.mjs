/** Local software-path fixture only; no production import and no model-quality claim. */
export function mockApprovedTask(body){
 const text=v=>typeof v==='string'?v:Array.isArray(v)?v.map(x=>x.text??'').join(''):''
 const ms=body.messages??[];let start=-1;for(let i=ms.length-1;i>=0;i--)if(ms[i].role==='user'){start=i;break}
 const prompt=text(ms[start]?.content)
 if(!prompt.includes('本地自动安排夹具'))return undefined
 const raw=/任务契约（范围已冻结）：([^\n]+)/.exec(prompt)?.[1];if(!raw)return undefined
 const contract=JSON.parse(raw),calls=ms.slice(start+1).flatMap(m=>m.role==='assistant'?m.tool_calls??[]:[])
 const named=name=>calls.filter(c=>c.function?.name===name),paths=name=>named(name).map(c=>JSON.parse(c.function.arguments).path)
 if(named('submit_task_result').length)return undefined
 const nextRead=contract.inputs.find(path=>!paths('read').includes(path));if(nextRead)return{toolName:'read',args:{path:nextRead}}
 const nextWrite=contract.outputs.find(path=>!paths('write').includes(path));if(nextWrite)return{toolName:'write',args:{path:nextWrite,content:'value\n2\n'}}
 return{toolName:'submit_task_result',args:{summary:'本地软件夹具完成文件交接；不代表真实模型或科研质量评测。',blockers:[],deliverables:contract.outputs.map(path=>({path})),execution:{state:'not_run',note:'fixture writes only; no code execution'},verification:{state:contract.resultType==='review'?'reviewed':'unreviewed',note:'fixture software path',toolCallIds:named('read').map(c=>c.id)},...(contract.resultType==='review'?{data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:contract.inputs}}:{})}}
}
