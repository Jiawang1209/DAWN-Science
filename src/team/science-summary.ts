/** Fixed host aggregation: copies validated facts, computes no new scientific conclusions. */
import {acceptedBatchFacts} from './science-batch-facts.js'
import type {团队,成员轮结果} from './types.js'
import type {TaskSettings} from '../protocol/task-contract.js'
import {createTaskTools} from '../subagent/task-tools.js'
export function scienceSummary(team:团队){
 const b=team.scienceBatch;if(!b||b.items.some(i=>i.completed?.status!=='completed'))throw new Error('批量项尚未全部验收，不能汇总')
 const items=acceptedBatchFacts(team).map(({item,analysis,review})=>{
  return{id:item.id,label:item.label,analysisTaskId:analysis.id,reviewTaskId:review.id,data:analysis.receipt!.result!.data,deliverables:analysis.receipt!.result!.deliverables,versions:analysis.receipt!.versions!,review:review.receipt!.result?.data,execution:analysis.receipt!.result!.execution,verification:review.receipt!.result?.verification}
 })
 const report={version:1,kind:'host-accepted-facts',template:{id:b.template.id,version:b.template.version},items,limitations:['宿主仅汇集已验收事实；未重新计算统计量，也不代表独立科学认证。']}
 // Render untrusted labels/paths as escaped plain text, never executable Markdown links/HTML.
 const plain=(s:string)=>s.replace(/[\r\n]/g,' ').replace(/[<>&`*_\[\]\\]/g,c=>'\\'+c)
 const markdown=['# 批量科研结果',report.limitations[0]!,...items.flatMap(i=>[`\n## ${plain(i.label)} (${plain(i.id)})`,`分析任务：${plain(i.analysisTaskId)}；审阅任务：${plain(i.reviewTaskId)}`,`结果：${plain(JSON.stringify(i.data))}`,...i.versions.outputs.map(v=>`${plain(v.path)} — sha256:${v.sha256}；${v.bytes} bytes`)])].join('\n\n')
 return{json:JSON.stringify(report,null,2)+'\n',markdown:markdown+'\n'}
}
export async function runScienceSummary(team:团队,settings:TaskSettings,workspace:string,signal:AbortSignal):Promise<成员轮结果>{
 const started=Date.now(),summary=scienceSummary(team),tools=createTaskTools(workspace,settings),write=tools.tools.find(t=>t.name==='write')!
 for(const [n,path] of settings.scope.outputs.entries()){
  if(signal.aborted)throw new Error('汇总已停止')
  const result=await write.execute('summary-write-'+n,{path,content:n===0?summary.json:summary.markdown},signal)
  if(result.isError)throw new Error(result.content.map(c=>c.text??'').join('\n'))
 }
 const result={summary:'固定宿主汇总已验收项；未生成新科学结论',blockers:[],deliverables:settings.scope.outputs.map(path=>({path})),execution:{state:'not_run' as const,note:'固定宿主复制已验收事实，无模型及分析执行'},verification:{state:'unreviewed' as const,note:'逐项审阅见原阶段回执；汇总仅复制事实'}}
 const submitted=await tools.submission!.submit(result,signal)
 if(submitted.isError)throw new Error(submitted.content.map(c=>c.text??'').join('\n'))
 return{ok:tools.submission!.receipt()?.state==='accepted',output:JSON.stringify(result),evidence:tools.evidence(),...(tools.submission!.receipt()!.versions?{versions:tools.submission!.receipt()!.versions!}:{}),observation:{...tools.submission!.observation(),elapsedMs:Date.now()-started}}
}
