/** Deterministic local acceptance scenario; actual tools, files and host receipts still execute. */
export function sciencePipelineScenario(mode='pass'){
 let interruptedOnce=false
 const content=value=>typeof value==='string'?value:Array.isArray(value)?value.map(v=>v.text??'').join(''):JSON.stringify(value??'')
 const messages=body=>body.messages??[]
 const calls=ms=>ms.flatMap(m=>m.role==='assistant'?m.tool_calls??[]:[])
 const name=call=>call.function?.name
 const lastUser=ms=>{for(let i=ms.length-1;i>=0;i--)if(ms[i].role==='user')return i;return -1}
 const route={title:'合成数据科研流程',goal:'核查合成数据，按已确认方法交付并审阅',dataContext:['确定性合成数据，仅验证软件流程，不支持科研推断'],steps:[{id:'analysis',title:'合成数据分析',purpose:'按用户确认的方法生成合成统计交付',inputs:['in.csv'],outputs:['results/pipeline.csv'],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'尚未执行'},verification:{state:'unreviewed',note:'尚未审阅'},needsReview:true,notes:[]}]}
 return{
  choose(body){
   const ms=messages(body),index=lastUser(ms),prompt=content(ms[index]?.content),current=ms.slice(index+1),history=calls(current),last=history.at(-1)
   const stage=/阶段 (check|analyze|review)，/.exec(prompt)?.[1]
   if(stage){
    const round=Number(/修正轮次 (\d+)\//.exec(prompt)?.[1]??0)
    if(stage==='check'||stage==='review'){
     const read=history.find(c=>name(c)==='read')
     if(!read)return{toolName:'read',args:{path:stage==='check'?'in.csv':'results/pipeline.csv'},say:stage==='check'?'核查声明输入。':'读取实际交付进行审阅。'}
     const submissions=history.filter(c=>name(c)==='submit_task_result')
     const invalid=submissions.length===0&&stage==='check'
     const verdict=mode==='revise'&&round===0?'revise':'pass'
     const value={summary:stage==='check'?'已核查合成数据':'已审阅合成交付',blockers:[],deliverables:[],execution:{state:'not_run',note:'只读检查'},verification:{state:stage==='review'&&verdict==='revise'?'issues':'reviewed',note:'实际读取声明文件，仅作为软件验收',toolCallIds:[invalid?'unobserved-read-id':read.id]},data:stage==='check'?{kind:'data-summary',rows:5,columns:[{name:'x',type:'number'}],issues:mode==='blocked'?['缺少单位，须用户确认']:[]}:{kind:'review',verdict,findings:verdict==='revise'?['请补齐合成交付中的单位说明']:[],reviewedPaths:['results/pipeline.csv'],...(verdict==='revise'?{revisionInstructions:'补充单位说明后再提交审阅'}:{})}}
     if(submissions.length>=2||submissions.length===1&&stage==='review')return undefined
     return{toolName:'submit_task_result',args:value}
    }
    const execution=history.find(c=>name(c)==='bash')
    if(!execution){const slow=mode==='interrupt'&&!interruptedOnce;interruptedOnce=true;return{toolName:'bash',args:{command:(slow?'sleep 20; ':'')+"mkdir -p results; printf 'metric,value,unit\\nn,5,synthetic\\n' > results/pipeline.csv"},say:'执行受控合成分析，不修改输入。'}}
    if(last&&name(last)==='submit_task_result')return undefined
    return{toolName:'submit_task_result',args:{summary:'已执行并交付合成结果',blockers:[],deliverables:[{path:'results/pipeline.csv'}],execution:{state:'completed',note:'实际命令已退出',toolCallIds:[execution.id]},verification:{state:'unreviewed',note:'等待独立审阅'},data:{kind:'model-metrics',method:'用户确认的合成统计示例',metrics:{n:5},sampleCount:5,caveats:['仅验证软件流程，不构成科研结论']}}}
   }
   if(!prompt.includes('科研流水线验收'))return undefined
   if(!history.length)return{toolName:'update_analysis_route',args:{expectedRevision:0,route}}
   if(name(last)==='update_analysis_route'){
    const result=[...ms].reverse().find(m=>m.role==='tool')
    let saved;try{saved=JSON.parse(content(result?.content))}catch{return undefined}
    return{toolName:'start_science_pipeline',args:{routeId:saved.routeId,revision:saved.revision,stepId:'analysis',inputs:['in.csv'],outputs:['results/pipeline.csv'],executors:{check:{agent:'pipeline-check'},analyze:{agent:'pipeline-analyze'},review:{agent:'pipeline-review'}},instructions:'按已确认方法执行合成数据流程，保留输入并交付文件',requireExecution:true,maxRevisions:1}}
   }
   if(mode==='revise'){
    if(name(last)==='start_science_pipeline'||name(last)==='team_wait')return{toolName:'science_pipeline_status',args:{}}
    if(name(last)==='science_pipeline_status'){
     let state;try{state=JSON.parse(content([...ms].reverse().find(m=>m.role==='tool')?.content))}catch{return undefined}
     if(state.status==='running')return{toolName:'team_wait',args:{timeoutSec:20}}
    }
   }
   return undefined
  },
  toolCall(body){const call=this.choose(body);return call?{...call,usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}}:undefined},
  reply(){return'科研流程状态与回执已记录；交付以宿主验收和实际文件为准，合成数据不支持科研推断。'},
 }
}
