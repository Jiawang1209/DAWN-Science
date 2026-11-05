import {scienceTemplateScenario} from './mock-science-template.mjs'
/** Desktop fixture wrapper: creates route/batch via real model-facing tools. */
export function scienceBatchScenario(mode='pass'){
 const incremental=mode==='incremental',parallel=mode==='parallel',independent=incremental||parallel,wrong=incremental?['other.csv']:[]
 const numeric=mode==='numeric-error'||independent,basicWrong=mode==='basic-error'
 const validation={version:1,column:'x',metric:'mean',unit:'m',missing:'block',absoluteTolerance:1e-9}
 const child=scienceTemplateScenario({mode:mode==='numeric-error'||basicWrong?'wrong-numeric':'pass',wrongInputs:wrong}),text=v=>typeof v==='string'?v:Array.isArray(v)?v.map(x=>x.text??'').join(''):JSON.stringify(v??'')
 const startArgs=route=>({routeId:route.routeId,revision:route.revision,stepId:'s',executors:{check:{agent:'pipeline-check'},analyze:{agent:'pipeline-analyze'},review:{agent:'pipeline-review'}},instructions:'approved mean',template:{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block',...(numeric?{validation}:{})},items:[{id:'a',label:'样地 A',inputs:['in.csv'],...(numeric?{dataPath:'in.csv'}:{})},{id:'b',label:'样地 B',inputs:[independent?'other.csv':'in.csv'],...(numeric?{dataPath:independent?'other.csv':'in.csv'}:{})}],outputRoot:'results',maxRevisions:1,...(parallel?{concurrency:2}:{})})
 return{toolCall(body){const delegated=child.toolCall(body);if(delegated)return delegated
 const ms=body.messages??[],user=ms.findLastIndex(m=>m.role==='user'),prompt=text(ms[user]?.content),calls=ms.slice(user+1).flatMap(m=>m.role==='assistant'?m.tool_calls??[]:[]),last=calls.at(-1)
 if(incremental&&prompt.includes('局部重跑')){wrong.splice(0);if(!calls.length)return{toolName:'science_batch_status',args:{}};if(last?.function?.name==='science_batch_status'){let source;try{source=JSON.parse(text(ms.findLast(m=>m.role==='tool')?.content))}catch{return undefined};return{toolName:'start_science_batch',args:{...startArgs(source.route),reuseFrom:{teamId:source.teamId,stateRevision:source.batch.stateRevision}}}};return undefined}
 if(!prompt.includes('科研批量验收'))return undefined
 if(!calls.length)return{toolName:'update_analysis_route',args:{expectedRevision:0,route:{title:'合成数据批量',goal:'approved mean',dataContext:['deterministic software test'],steps:[{id:'s',title:'mean',purpose:'approved mean',inputs:['in.csv'],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]}}}
 if(last?.function?.name==='update_analysis_route'){let route;try{route=JSON.parse(text(ms.findLast(m=>m.role==='tool')?.content))}catch{return undefined};return{toolName:'start_science_batch',args:startArgs(route)}}
 return undefined},reply(){return'批量状态与产物以宿主回执为准；本次为合成软件验收。'}}
}
