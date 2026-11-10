import {scienceCheckLabel} from '../protocol/science-check-label.js'
/** Bounded independent host checks over actual declared bytes, under the caller's reservation. */
import {probeScienceEnvironment,boundScriptExecution} from './science-environment.js'
import type {RouteToolEvidence} from '../runtime/analysis-route-evidence.js'
import {createHash} from 'node:crypto'
import {DOMParser} from '@xmldom/xmldom'
import {fileIdentity} from '../artifacts/blobs.js'
import {读成表} from '../files/table.js'
import type {TaskContract,TaskReceipt} from '../protocol/task-contract.js'
import {ScienceAcceptanceSchema,ScienceAcceptanceReceiptSchema,scienceReadinessIssue,type ScienceAcceptanceReceipt,type ScienceAcceptance} from '../protocol/science-acceptance.js'
export const ACCEPTANCE_LIMITS={tableBytes:8*1024*1024,fileBytes:2*1024*1024,totalBytes:16*1024*1024,rows:100000,physicalLines:200000}
export const scienceAcceptanceHash=(spec:ScienceAcceptance)=>createHash('sha256').update(JSON.stringify(ScienceAcceptanceSchema.parse(spec))).digest('hex')
export async function validateScienceAcceptance(contract:TaskContract|undefined,receipt:TaskReceipt,workspace:string,signal?:AbortSignal,evidence:readonly RouteToolEvidence[]=[]):Promise<TaskReceipt>{
 if(!contract?.acceptance||receipt.state!=='accepted')return receipt
 const readiness=scienceReadinessIssue(contract.acceptance);if(readiness)return{version:1,state:'blocked',summary:'科研任务信息尚未就绪',reason:readiness,deliverables:[]}
 const spec=ScienceAcceptanceSchema.parse(contract.acceptance),checks:ScienceAcceptanceReceipt['checks']=[],files:ScienceAcceptanceReceipt['files']=[];let environment:ScienceAcceptanceReceipt['environment'];let numericChecked=false,bytes=0
 const stopped=()=>{if(signal?.aborted)throw new Error('验收已取消')}
 const add=(id:string,ok:boolean,expected?:unknown,actual?:unknown)=>{checks.push({id,state:ok?'passed':'blocked',...(expected!==undefined?{expected:String(expected).slice(0,2000)}:{}),...(actual!==undefined?{actual:String(actual).slice(0,2000)}:{})})}
 const read=async(path:string,maxBytes=ACCEPTANCE_LIMITS.fileBytes)=>{
  stopped();const file=await fileIdentity(workspace,path,{maxBytes:Math.min(maxBytes,ACCEPTANCE_LIMITS.totalBytes-bytes),timeoutMs:5000,readBytes:true,...(signal?{signal}:{})});stopped();bytes+=file.bytes
  files.push({path,sha256:file.sha256,bytes:file.bytes});return new TextDecoder('utf-8',{fatal:true}).decode(file.content)
 }
 try{
  if(spec.environment){const current=await probeScienceEnvironment(spec.environment.language,workspace,signal);environment={...current,executionBound:false};if(spec.environment.state==='known')add('environment.stable',current.state==='known'&&current.fingerprint===spec.environment.fingerprint,spec.environment.fingerprint,current.fingerprint??'环境未知')}
  const script=await read(spec.scriptPath),report=await read(spec.reportPath),output=await read(spec.resultPath)
  if(environment)environment.executionBound=boundScriptExecution(environment.language,spec.scriptPath,evidence,files.find(f=>f.path===spec.scriptPath),environment.fingerprint)
  if(environment&&!environment.executionBound){environment.reason=environment.language==='r'?'R 沿普通执行和验收；依赖及生命周期未完整核实，不签发复用证明':'执行方式、未声明依赖或生命周期未完整核实，不签发复用证明';checks.push({id:'environment.bound',state:'not_configured',reason:environment.reason})}
  add('script.nonempty',!!script.trim(),'非空脚本',script.trim()?'非空':'空');add('report.nonempty',!!report.trim(),'非空报告',report.trim()?'非空':'空')
  if(spec.kind==='tabular-ecology'){
   const raw:unknown=JSON.parse(output);if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('result.json 必须为结果对象')
   const value=raw as Record<string,unknown>
   if(Object.keys(value).length>66||Object.keys(value).some(k=>!k.length||k.length>100))throw new Error('结果超过 64 个指标或指标名上限')
   for(const [key,metric] of Object.entries(value))if(!['n','unit'].includes(key)&&(typeof metric!=='number'||!Number.isFinite(metric)))throw new Error('结果指标必须为有限数值：'+key)
   add('result.sample-count',typeof value.n==='number'&&Number.isSafeInteger(value.n)&&value.n>0,'正整数 n',value.n)
   const declared=receipt.result?.data
   if(declared?.kind!=='model-metrics')throw new Error('缺少 model-metrics 结果载荷')
   add('result.unit',typeof value.unit==='string'&&!!value.unit.trim(),'非空单位（无量纲可写 1）',value.unit)
   for(const [key,reported] of Object.entries(declared.metrics)){const actual=value[key];add('result.declared-metric.'+key,typeof actual==='number'&&Number.isFinite(actual)&&Math.abs(actual-reported)<=(spec.numeric?.absoluteTolerance??0),actual,reported)}
   if(declared.sampleCount!==undefined)add('result.declared-sample-count',declared.sampleCount===value.n,value.n,declared.sampleCount)
   if(declared.metrics.n!==undefined)add('result.declared-n',declared.metrics.n===value.n,value.n,declared.metrics.n)
   for(const [key,metric] of Object.entries(value))if(key!=='n'&&key!=='unit'&&typeof metric==='number')add('result.finite.'+key,Number.isFinite(metric),'有限数值',metric)
   if(spec.numeric){
    const rule=spec.numeric,csv=await read(rule.dataPath,ACCEPTANCE_LIMITS.tableBytes)
    let quotes=0,lines=1;for(let i=0;i<csv.length;i++){if((csv[i]==='\n'||csv[i]==='\r'&&csv[i+1]!=='\n')&&++lines>ACCEPTANCE_LIMITS.physicalLines)throw new Error('CSV 超过物理行数预算');if(csv[i]==='"'){if(csv[i+1]==='"'){i++;continue}quotes++}}
    if(quotes%2)throw new Error('输入 CSV 的引号未闭合')
    const table=读成表(csv,true,ACCEPTANCE_LIMITS.rows)
    assertStrictCsvQuotes(csv,table.delimiter)
    if(table.truncated||table.totalRows!==table.rowsRead)throw new Error('输入表格超过完整核验行数上限，未使用预览代替完整数据')
    const names=table.columns.map(c=>c.name);if(new Set(names).size!==names.length||!names.includes(rule.column)||table.rows.some(row=>row.length!==names.length))throw new Error('输入表格列缺失、重复或列数不齐')
    const index=names.indexOf(rule.column),values:number[]=[]
    for(const row of table.rows){const cell=row[index]!.trim();if(!cell||/^(?:na|nan|null|none|n\/a)$/i.test(cell)){if(rule.missing==='block')throw new Error('输入含缺失值，按约定阻塞');continue}const n=Number(cell);if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(cell)||!Number.isFinite(n))throw new Error('输入含非数值或非有限值');values.push(n)}
    if(!values.length)throw new Error('数值核验没有有效样本')
    const stableSum=(mean:boolean)=>{let sum=0,correction=0;for(const raw of values){const v=mean?raw/values.length:raw,t=sum+v;correction+=Math.abs(sum)>=Math.abs(v)?(sum-t)+v:(v-t)+sum;sum=t}return sum+correction}
    const expected=rule.metric==='mean'?stableSum(true):rule.metric==='sum'?stableSum(false):values.reduce((n,v)=>rule.metric==='min'?Math.min(n,v):Math.max(n,v),values[0]!)
    if(!Number.isFinite(expected))throw new Error('参考统计量不是有限数值')
    numericChecked=true;add('numeric.sample-count',value.n===values.length,values.length,value.n);add('numeric.unit',value.unit===rule.unit,rule.unit,value.unit)
    const actual=value[rule.metric];add('numeric.'+rule.metric,typeof actual==='number'&&Number.isFinite(actual)&&Math.abs(actual-expected)<=rule.absoluteTolerance,expected,actual)
    const reported=declared.metrics[rule.metric];add('numeric.declared-'+rule.metric,typeof reported==='number'&&Math.abs(reported-expected)<=rule.absoluteTolerance,expected,reported)
   }else checks.push({id:'numeric',state:'not_configured',reason:'数值核验未配置；基础结构验收不证明统计值正确'})
  }else{
   if(/<!DOCTYPE|<!ENTITY/i.test(output)||output.split('<').length>10000)throw new Error('SVG 含声明实体或超过节点预算')
   let invalid=false;const doc=new DOMParser({errorHandler:()=>{invalid=true}}).parseFromString(output,'application/xml'),root=doc.documentElement
   if(invalid||!root||root.localName!=='svg'||root.namespaceURI!=='http://www.w3.org/2000/svg')throw new Error('图表不是有效 SVG')
   const number=(v:string|null)=>v!==null&&/^\d+(?:\.\d+)?(?:px)?$/.test(v)?Number(v.replace(/px$/,'')):NaN
   const box=(root.getAttribute('viewBox')??'').trim().split(/[\s,]+/).map(Number)
   const width=number(root.getAttribute('width')),height=number(root.getAttribute('height'))
   add('figure.dimensions',root.hasAttribute('viewBox')?box.length===4&&box.every(Number.isFinite)&&box[2]!>0&&box[3]!>0:Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0,'正尺寸或有效 viewBox',root.getAttribute('viewBox')||`${root.getAttribute('width')}x${root.getAttribute('height')}`)
   let safe=true;const pending:Node[]=[doc];while(pending.length){const node=pending.pop()!;if(node.nodeType===7&&node.nodeName.toLowerCase()!=='xml')safe=false;if(node.childNodes)for(let i=0;i<node.childNodes.length;i++)pending.push(node.childNodes.item(i)!)}
   const elements=[root,...Array.from(root.getElementsByTagName('*'))]
   const unsafeCss=(value:string)=>value.includes('\\')||value.includes('/*')||/@import|javascript\s*:|expression\s*\(|behavior\s*:/i.test(value)||[...value.matchAll(/url\s*\(([^)]*)\)/gi)].some(m=>!m[1]!.trim().replace(/^(['"])(.*)\1$/,'$2').startsWith('#'))
   for(const node of elements){if(['script','foreignobject','iframe','object','embed','set','animate','animatemotion','animatetransform','audio','video'].includes(node.localName.toLowerCase()))safe=false;if(node.localName.toLowerCase()==='style'&&unsafeCss(node.textContent??''))safe=false;for(let i=0;i<node.attributes.length;i++){const a=node.attributes.item(i)!;if(a.name==='xml:base'||a.localName==='base'&&a.namespaceURI==='http://www.w3.org/XML/1998/namespace'||/^on/i.test(a.name)||/href$/i.test(a.name)&&!a.value.startsWith('#')||unsafeCss(a.value))safe=false}}
   add('figure.inert',safe,'无脚本、事件或外链',safe?'通过':'发现活动或外链内容')
   for(const [key,value] of [['citation',spec.citation!],['page',spec.page!],['target',spec.targetFigure!]] as const)add('report.'+key,report.includes(value),value,report.includes(value)?'已引用':'缺少引用')
  }
 }catch(error){stopped();checks.push({id:'host.read-or-parse',state:'blocked',reason:(error instanceof Error?error.message:String(error)).slice(0,2000)})}
 stopped();const acceptance=ScienceAcceptanceReceiptSchema.parse({version:1,ruleVersion:1,specHash:scienceAcceptanceHash(spec),state:checks.some(c=>c.state==='blocked')?'blocked':'passed',numericChecked,...(environment?{environment}:{}),checks,files})
 return acceptance.state==='passed'?{...receipt,acceptance}:{...receipt,state:'blocked',reason:'宿主可执行验收未通过：'+checks.filter(c=>c.state==='blocked').map(c=>`${scienceCheckLabel(c.id)}${c.reason?' '+c.reason:` 期望 ${c.expected??''}，实际 ${c.actual??''}`}`).join('；').slice(0,7900),acceptance}
}
export function validateAcceptanceReceipt(contract:TaskContract|undefined,receipt:TaskReceipt):TaskReceipt {
 if(!contract?.acceptance||receipt.state!=='accepted')return receipt
 const readiness=scienceReadinessIssue(contract.acceptance);if(readiness)return{version:1,state:'blocked',summary:'科研任务信息尚未就绪',reason:readiness,deliverables:[]}
 const result=ScienceAcceptanceReceiptSchema.safeParse(receipt.acceptance)
 const paths=[contract.acceptance.scriptPath,contract.acceptance.reportPath,contract.acceptance.resultPath,...(contract.acceptance.numeric?[contract.acceptance.numeric.dataPath]:[])]
 if(!result.success||result.data.files.length!==paths.length||paths.some(path=>!result.data.files.some(f=>f.path===path))||result.data.checks.some(c=>c.state==='blocked')||result.data.specHash!==scienceAcceptanceHash(contract.acceptance)||result.data.state!=='passed'||contract.acceptance.environment?.state==='known'&&(result.data.environment?.state!=='known'||result.data.environment.fingerprint!==contract.acceptance.environment.fingerprint)||contract.acceptance.numeric&&!result.data.numericChecked)return{version:1,state:'blocked',summary:'宿主验收证明缺失或不匹配',reason:'后端未提供当前冻结规则的可执行验收证明',deliverables:[]}
 return receipt
}

/** Full validation is stricter than the intentionally forgiving preview reader. */
function assertStrictCsvQuotes(csv:string,delimiter:string):void {
 let state:'start'|'plain'|'quoted'|'closed'='start'
 for(const c of csv.replace(/^\uFEFF/,'')){
  if(state==='quoted'){if(c==='"')state='closed';continue}
  if(state==='closed'){if(c==='"'){state='quoted';continue}if(c===delimiter||c==='\n'||c==='\r'){state='start';continue}throw new Error('CSV 闭引号后存在非法字符')}
  if(c==='"'){if(state!=='start')throw new Error('CSV 引号只能出现在字段开头');state='quoted'}else if(c===delimiter||c==='\n'||c==='\r')state='start';else state='plain'
 }
 if(state==='quoted')throw new Error('CSV 引号未闭合')
}
