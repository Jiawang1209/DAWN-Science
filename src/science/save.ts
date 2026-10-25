import {lstatSync,mkdirSync,mkdtempSync,realpathSync,writeFileSync} from 'node:fs'
import {join,relative,sep} from 'node:path'
import {ScienceError,type ScienceRecord,type ScienceReport} from './model.js'
export interface ObservedScienceRecord {recordId:string;record:ScienceRecord;origin:Omit<ScienceReport,'records'|'total'|'returned'>}
const escape=(s:string)=>s.replace(/[\r\n]+/g,' ').replace(/[\\`*_{}\[\]<>|]/g,'\\$&')
const link=(s:string)=>s.replace(/[()[\]<>\\\s]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0'))
export function saveScienceRecords(workspace:string,directory:string,records:readonly ObservedScienceRecord[],signal?:AbortSignal){
  if(signal?.aborted)throw new ScienceError('cancelled','科研清单保存已取消')
  if(typeof directory!=='string'||/[\x00-\x1f\x7f\\]/.test(directory))throw new ScienceError('invalid_input','保存目录格式无效')
  const parts=directory.split('/')
  if(parts[0]!=='outputs'||parts[1]!=='datasets'||parts.some(p=>!p||p==='.'||p==='..')||parts.length>8)throw new ScienceError('invalid_input','只能保存到工作区 outputs/datasets 下的新目录')
  const root=realpathSync(workspace);let parent=root
  for(const component of parts){
    parent=join(parent,component)
    try{const state=lstatSync(parent);if(state.isSymbolicLink()||!state.isDirectory())throw new ScienceError('invalid_input','保存目录不能经过符号链接或文件')}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;mkdirSync(parent)}
    const real=realpathSync(parent)
    if(real!==root&&!real.startsWith(root+sep))throw new ScienceError('invalid_input','保存目录在工作区外')
  }
  if(signal?.aborted)throw new ScienceError('cancelled','科研清单保存已取消')
  const dest=mkdtempSync(join(parent,'records-')),savedAt=new Date().toISOString()
  const lines=['# 科研数据清单','',`保存时间：${savedAt}`,'','以下为数据库实际返回的元数据；缺失值为“未提供”。未下载原始数据，也未据此验证实验结论。','']
  for(const [i,item] of records.entries()){
    const r=item.record
    lines.push(`## ${i+1}. ${escape(r.title)}`,'',`- 编号：[${escape(r.accession)}](${link(r.sourceUrl)})`,`- 数据源：${item.origin.source}`,`- 查询时间：${item.origin.retrievedAt}`,`- 查询条件：${escape(JSON.stringify(item.origin.query))}`)
    for(const [key,value] of Object.entries(r.fields))lines.push(`- ${escape(key)}：${value==null||Array.isArray(value)&&!value.length?'未提供':Array.isArray(value)?value.map(escape).join('；'):escape(String(value))}`)
    if(r.runs){lines.push('','### 测序运行（Run）','',...r.runs.map(run=>`- ${escape(run.accession)} · spots: ${run.spots??'未提供'} · bases: ${run.bases??'未提供'} · ${run.public===true?'公开':run.public===false?'受限':'公开状态未提供'}`),'')}
    lines.push('','### 查询来源','',...item.origin.requestUrls.map(url=>`- [API](${link(url)})`),'',...item.origin.warnings.map(w=>`- 提示：${escape(w)}`),'')
  }
  const files=[['records.json',JSON.stringify({format:'dawn-science-records-v1',savedAt,records},null,2)+'\n'],['数据清单.md',lines.join('\n')+'\n']] as const
  for(const [name,body] of files){if(signal?.aborted)throw new ScienceError('cancelled','科研清单保存已取消');writeFileSync(join(dest,name),body,{flag:'wx',mode:0o600})}
  return {saved:records.length,paths:files.map(([name])=>relative(root,join(dest,name)).split(sep).join('/'))}
}
