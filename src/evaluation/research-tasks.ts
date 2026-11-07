/** Shareable representative tasks, independent answers and honest paired trial accounting. */
import {createHash} from 'node:crypto'
import type {FileVersion} from '../protocol/file-versions.js'
export interface ResearchTask {id:string;csv:string;column:string;unit?:string;missing:'drop'|'block';instructions:string;expected?:{n:number;unit:string;mean:number}}
export function researchTasks():ResearchTask[]{
 const rows=Array.from({length:48},(_,i)=>({site:`plot-${i+1}`,carbon:i%7===0?'NA':String(12+(i*17%37)/10),rain:300+i*11}))
 const values=rows.filter(r=>r.carbon!=='NA').map(r=>Number(r.carbon))
 const csv='site,carbon_mg_g,rain_mm\n'+rows.map(r=>`${r.site},${r.carbon},${r.rain}`).join('\n')+'\n'
 return[{id:'carbon-missing',csv,column:'carbon_mg_g',unit:'mg/g',missing:'drop',instructions:'计算 carbon_mg_g 的算术均值；单位 mg/g。仅丢弃该列 NA，不能按 rain_mm 筛选或填补。保留全部输入；Python stdlib 脚本、result.json 和说明报告。',expected:{n:values.length,unit:'mg/g',mean:values.reduce((a,b)=>a+b,0)/values.length}},
 {id:'unknown-unit',csv:csv.replace('carbon_mg_g','carbon'),column:'carbon',missing:'drop',instructions:'请求报告 carbon 的带单位均值，但原始文件和用户均没有提供单位。单位是交付必要条件；不能从数值或邻列猜测。条件不足须正式提交 blockers，不能交付推断结果。保留原始文件。'}]
}
export const researchFingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
export type ResearchTerminal='accepted'|'blocked'|'failed'|'cancelled'|'not-run'
export function judgeResearch(task:ResearchTask,terminal:ResearchTerminal,actual:unknown,inputPreserved:boolean,blocking?:{reasons:string[];inputRead:boolean}){
 const v=actual as Record<string,unknown>|undefined,e=task.expected
 const correct=!!e&&!!v&&v.n===e.n&&v.unit===e.unit&&typeof v.mean==='number'&&Number.isFinite(v.mean)&&Math.abs(v.mean-e.mean)<=1e-9
 const correctBlock=terminal==='blocked'&&blocking?.inputRead===true&&blocking.reasons.some(reason=>/单位|unit/i.test(reason))
 return{success:inputPreserved&&(e?terminal==='accepted'&&correct:correctBlock),falseAcceptance:terminal==='accepted'&&(!e||!correct),inputPreserved}
}
export interface ResearchRow {requestBudget?:{reserved:number;forwarded:number;denied:number;limit:number};submissionAttempts?:number;invalidSubmissions?:number;caseId:string;mode:'single'|'multi';repeat:number;fingerprint:string;terminal:ResearchTerminal;success:boolean;falseAcceptance:boolean;inputPreserved:boolean|null;requests:number;elapsedMs:number;usage:{visibleTokens:number;unknownUsageTasks:number;partialUsage:boolean};versions:FileVersion[];reason?:string}
export function notRunResearch(task:ResearchTask,mode:ResearchRow['mode'],fingerprint:string):ResearchRow{
 return{caseId:task.id,mode,repeat:1,fingerprint,terminal:'not-run',success:false,falseAcceptance:false,inputPreserved:null,requests:0,elapsedMs:0,usage:{visibleTokens:0,unknownUsageTasks:0,partialUsage:false},versions:[],reason:'整轮请求上限或取消，未启动；输入核验和模型用量不适用'}
}
export function summarizeResearch(rows:ResearchRow[],partitioned=false){
 const pairs=new Map<string,ResearchRow[]>()
 for(const row of rows){const key=`${row.caseId}/${row.repeat}`;pairs.set(key,[...(pairs.get(key)??[]),row])}
 let completePairs=0,incompletePairs=0
 for(const pair of pairs.values()){
  if(pair.length>2||new Set(pair.map(r=>r.mode)).size!==pair.length||new Set(pair.map(r=>r.fingerprint)).size!==1)throw new Error('科研评测配对不一致')
  if(pair.length===2&&pair.every(r=>r.terminal==='accepted'||r.terminal==='blocked'))completePairs++;else incompletePairs++
 }
 return{kind:'representative-research-pilot' as const,completePairs,incompletePairs,rows,limitations:['代表性自制数据、小样本试验；不是用户真实项目或普遍模型质量结论。','accepted 仍由独立实际文件真值复核；blocked、失败与未运行分开记录。',partitioned?'各组独立等额请求上限，未用额度不借给另一组；额度用尽与科学错误分开，不完整配对不形成质量或费用收益结论。':'未使用分区请求门；离线夹具不能代表真实同预算收益。','缺失或部分用量不作零费用；无价格换算；未运行的输入核验和用量不适用。']}
}
