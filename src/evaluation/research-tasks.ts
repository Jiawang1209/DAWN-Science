/** Shareable representative tasks, independent answers and honest paired trial accounting. */
import {createHash} from 'node:crypto'
import type {SubmissionDiagnostics} from './research-submissions.js'
import type {FileVersion} from '../protocol/file-versions.js'
export interface ResearchTask {id:string;csv:string;column:string;unit?:string;missing:'drop'|'block';instructions:string;expected?:{n:number;unit:string;mean:number}}
export function researchTasks():ResearchTask[]{
 const rows=Array.from({length:48},(_,i)=>({site:`plot-${i+1}`,carbon:i%7===0?'NA':String(12+(i*17%37)/10),rain:300+i*11}))
 const values=rows.filter(r=>r.carbon!=='NA').map(r=>Number(r.carbon))
 const csv='site,carbon_mg_g,rain_mm\n'+rows.map(r=>`${r.site},${r.carbon},${r.rain}`).join('\n')+'\n'
 return[{id:'carbon-missing',csv,column:'carbon_mg_g',unit:'mg/g',missing:'drop',instructions:'计算 carbon_mg_g 的算术均值；单位 mg/g。仅丢弃该列 NA，不能按 rain_mm 筛选或填补。保留全部输入；Python stdlib 脚本、result.json 和说明报告。',expected:{n:values.length,unit:'mg/g',mean:values.reduce((a,b)=>a+b,0)/values.length}},
 {id:'unknown-unit',csv:csv.replace('carbon_mg_g','carbon'),column:'carbon',missing:'drop',instructions:'请求报告 carbon 的带单位均值，但原始文件和用户均没有提供单位。单位是交付必要条件；不能从数值或邻列猜测。条件不足须正式提交 blockers，不能交付推断结果。保留原始文件。'},
 {id:'short-known-mean',csv:'site,temperature_c\nA,14\nB,18\nC,22\nD,26\n',column:'temperature_c',unit:'°C',missing:'block',instructions:'计算 temperature_c 的算术均值，单位 °C；输入 4 行、不能丢弃样本。使用 Python stdlib，交付脚本、result.json 和报告。',expected:{n:4,unit:'°C',mean:20}},
 {id:'moisture-strata',csv:'site,stratum,moisture_pct\n'+Array.from({length:240},(_,i)=>`site-${i+1},${i<120?'ridge':'valley'},${i<120?12+i%6:24+i%6}`).join('\n')+'\n',column:'moisture_pct',unit:'%',missing:'block',instructions:'核查 ridge/valley 两层各 120 行，计算全部 240 行 moisture_pct 的算术均值（单位 %）。保留原始输入，不去重；Python stdlib 脚本、result.json 和报告。',expected:{n:240,unit:'%',mean:20.5}}]
}
export const researchFingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
export type ResearchTerminal='accepted'|'blocked'|'failed'|'cancelled'|'not-run'
export function judgeResearch(task:ResearchTask,terminal:ResearchTerminal,actual:unknown,inputPreserved:boolean,blocking?:{reasons:string[];inputRead:boolean},versionMatches=true){
 const v=actual as Record<string,unknown>|undefined,e=task.expected
 const correct=!!e&&!!v&&v.n===e.n&&v.unit===e.unit&&typeof v.mean==='number'&&Number.isFinite(v.mean)&&Math.abs(v.mean-e.mean)<=1e-9
 const correctBlock=terminal==='blocked'&&actual===undefined&&blocking?.inputRead===true&&blocking.reasons.some(reason=>/单位.{0,12}(未提供|未知|缺失|不明)|(?:unknown|missing|unspecified|no)\s+units?\b|units?.{0,20}(?:unknown|missing|not provided)/i.test(reason))
 return{success:inputPreserved&&(e?terminal==='accepted'&&correct&&versionMatches:correctBlock),falseAcceptance:terminal==='accepted'&&(!inputPreserved||!e||!correct||!versionMatches),inputPreserved}
}
export interface ResearchRow {submissionDiagnostics?:SubmissionDiagnostics;diagnosticReadIssues?:{scopeId:string;reason:string}[];stageRequestBudgets?:Record<'work'|'review',{reserved:number;forwarded:number;denied:number;limit:number;inFlight?:number}>;requestBudget?:{reserved:number;forwarded:number;denied:number;limit:number;inFlight?:number};submissionAttempts?:number;invalidSubmissions?:number;caseId:string;mode:'single'|'multi';repeat:number;fingerprint:string;terminal:ResearchTerminal;success:boolean;falseAcceptance:boolean;inputPreserved:boolean|null;requests:number;elapsedMs:number;usage:{visibleTokens:number;unknownUsageTasks:number;partialUsage:boolean};versions:FileVersion[];reason?:string}
export function notRunResearch(task:ResearchTask,mode:ResearchRow['mode'],fingerprint:string):ResearchRow{
 return{caseId:task.id,mode,repeat:1,fingerprint,terminal:'not-run',success:false,falseAcceptance:false,inputPreserved:null,requests:0,elapsedMs:0,usage:{visibleTokens:0,unknownUsageTasks:0,partialUsage:false},versions:[],reason:'整轮请求上限或取消，未启动；输入核验和模型用量不适用'}
}
export function summarizeResearch(rows:ResearchRow[],partitioned=false){
 const pairs=new Map<string,ResearchRow[]>()
 for(const row of rows){const key=`${row.caseId}/${row.repeat}`;pairs.set(key,[...(pairs.get(key)??[]),row])}
 let completePairs=0,incompletePairs=0,qualifiedPairs=0
 for(const pair of pairs.values()){
  if(pair.length>2||new Set(pair.map(r=>r.mode)).size!==pair.length||new Set(pair.map(r=>r.fingerprint)).size!==1)throw new Error('科研评测配对不一致')
  if(pair.length===2&&pair.every(r=>r.terminal==='accepted'||r.terminal==='blocked')){completePairs++;if(pair.every(r=>r.success))qualifiedPairs++}else incompletePairs++
 }
 const quotaExhausted=(b:ResearchRow['requestBudget'])=>!!b&&b.denied>0&&b.reserved>=b.limit
 const byMode=(mode:ResearchRow['mode'])=>{
  const trials=rows.filter(r=>r.mode===mode&&r.terminal!=='not-run')
  const qualifiedDeliveries=trials.filter(r=>r.terminal==='accepted'&&r.success).length
  const requests=trials.reduce((n,r)=>n+r.requests,0),elapsedMs=trials.reduce((n,r)=>n+r.elapsedMs,0)
  return{qualifiedDeliveries,correctBlocks:trials.filter(r=>r.terminal==='blocked'&&r.success).length,falseAcceptances:trials.filter(r=>r.falseAcceptance).length,exhausted:trials.filter(r=>r.terminal==='failed'&&(quotaExhausted(r.requestBudget)||Object.values(r.stageRequestBudgets??{}).some(quotaExhausted))).length,requests,elapsedMs,requestsPerDelivery:qualifiedDeliveries?requests/qualifiedDeliveries:null,msPerDelivery:qualifiedDeliveries?elapsedMs/qualifiedDeliveries:null}
 }
 return{delivery:{single:byMode('single'),multi:byMode('multi')},kind:'representative-research-pilot' as const,completePairs,incompletePairs,qualifiedPairs,rows,limitations:['代表性自制数据、小样本试验；不是用户真实项目或普遍模型质量结论。','accepted 仍由独立实际文件真值复核；blocked、失败与未运行分开记录。',partitioned?'各组独立等额请求上限，未用额度不借给另一组；额度用尽与科学错误分开，不完整配对不形成质量或费用收益结论。':'未使用分区请求门；离线夹具不能代表真实同预算收益。','缺失或部分用量不作零费用；无价格换算；未运行的输入核验和用量不适用。']}
}
