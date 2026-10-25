import { lstatSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { LiteratureRecord, LiteratureReport } from './client.js'
export interface ObservedReference {
  recordId: string
  record: LiteratureRecord
  origin: Omit<LiteratureReport, 'records' | 'total' | 'returned' | 'warnings'>
}
const escape = (value: string) => value.replace(/[\r\n]+/g,' ').replace(/[\\`*_{}\[\]<>|]/g,'\\$&')
const link = (value: string) => value.replace(/[()[\]<>\\\s]/g, c=>'%'+c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0'))
/** Only a fresh directory below this workspace's literature outputs may be written. */
export function saveReferences(workspace: string, directory: string, records: readonly ObservedReference[], signal?: AbortSignal) {
  if(signal?.aborted)throw Error('文献保存已取消')
  if(typeof directory!=='string' || /[\x00-\x1f\x7f\\]/.test(directory))throw Error('保存目录格式无效')
  const parts=directory.split('/')
  if(parts[0]!=='outputs'||parts[1]!=='literature'||parts.some(p=>!p||p==='.'||p==='..')||parts.length>8)throw Error('只能保存在工作区 outputs/literature 下的新目录')
  const root=realpathSync(workspace)
  let parent=root
  for(const component of parts){
    parent=join(parent,component)
    try{const state=lstatSync(parent);if(state.isSymbolicLink()||!state.isDirectory())throw Error('保存目录不能经过符号链接或普通文件')}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;mkdirSync(parent)}
    const real=realpathSync(parent)
    if(real!==root&&!real.startsWith(root+sep))throw Error('保存目录在工作区之外')
  }
  if(signal?.aborted)throw Error('文献保存已取消')
  const destination=mkdtempSync(join(parent,'references-'))
  const savedAt=new Date().toISOString()
  const payload={format:'dawn-literature-v1',savedAt,records}
  const sources=[...new Set(records.map(item=>item.origin.source))].join('、')
  const lines=['# 文献清单','',`保存时间：${savedAt}`,'',`以下为 ${sources} 索引返回的元数据；未据此声称已阅读全文或科学结论已获验证。`,'']
  for(const [index,item] of records.entries()){
    const r=item.record
    lines.push(`## ${index+1}. ${escape(r.title)}`,'',`- 作者：${r.authors.length?r.authors.map(escape).join('；'):'未提供'}${r.authorsTruncated?'（仅列前 40 位）':''}`,`- 年份：${r.year??'未提供'}`,`- 期刊／来源：${r.journal?escape(r.journal):'未提供'}`,`- DOI：${r.doi?`[${escape(r.doi)}](${link(r.doi)})`:'未提供'}`,`- 索引记录：[${escape(r.id)}](${link(r.sourceUrl)})`,`- 查询时间：${item.origin.retrievedAt}`,`- 查询方式：${item.origin.query.kind==='doi'?'DOI 核对':'关键词检索'}`,`- 查询条件：${escape(JSON.stringify(item.origin.query))}`,`- 查询来源：[${item.origin.source} API](${link(item.origin.requestUrl)})`,'','### 摘要','',r.abstract?escape(r.abstract)+(r.abstractStatus==='truncated'?'\n\n（摘要超过预算，已截断）':''):r.abstractStatus==='invalid'?'来源摘要结构无效，未拼接。':'来源未提供摘要。','')
  }
  const files=[['references.json',JSON.stringify(payload,null,2)+'\n'],['文献清单.md',lines.join('\n')+'\n']] as const
  for(const [name,body] of files){if(signal?.aborted)throw Error('文献保存已取消');writeFileSync(join(destination,name),body,{flag:'wx',mode:0o600})}
  return {saved:records.length,paths:files.map(([name])=>relative(root,join(destination,name)).split(sep).join('/'))}
}
