/** 父侧只读资源目录。子进程只拿到工具，不拿存储目录或全量正文。 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { parseEntryBranches, stripEntryId, type MemoryStore } from '../memory/store.js'
import { loadSkillCatalog, readSkill, searchSkills, type SkillCatalog, type SkillCatalogOptions, type SkillEntry } from '../skills/catalog.js'
import type { SkillReadReceipt } from '../protocol/skill-reads.js'
import { resourceMatchesPhrase, searchResources } from './resource-search.js'

export const RESOURCE_TOOLS = ['resource_search', 'resource_read'] as const
export type ResourceMethod = typeof RESOURCE_TOOLS[number]
export interface ResourceHost {call(name: string, params: unknown): Promise<string>}
export interface ResourceHostOptions extends Pick<SkillCatalogOptions, 'workspace' | 'roots' | 'builtinMode' | 'tagsOverride' | 'authorize'> {
  memory?: {store: Pick<MemoryStore, 'entries'>; enabled: boolean; branch?: string | undefined} | undefined
}
type Kind = 'skill' | 'memory'
interface Resource {
  id: string; kind: Kind; name: string; description: string; source: string
  skill?: SkillEntry
  content?: string
  match?: {fields: string[]; terms: string[]}
  boundedTags?: string[]
  metadataTruncated?: boolean
}
const idFor = (kind: Kind, key: string) => `${kind}:${createHash('sha256').update(key).digest('hex').slice(0,20)}`
const chars = (s: string, n: number) => Array.from(s).slice(0,n).join('')
function argsFor(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('资源参数必须是对象')
  const args = value as Record<string,unknown>
  for (const key of Object.keys(args)) if (!allowed.includes(key)) throw new Error(`不支持的资源参数：${key}`)
  return args
}
function numberArg(args: Record<string,unknown>, key: string, fallback: number, max: number): number {
  const value = args[key] ?? fallback
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (key === 'offset' ? 0 : 1) || value > max) throw new Error(`${key} 必须是允许范围内的整数（最大 ${max}）`)
  return value
}
export function createResourceHost(opts: ResourceHostOptions): ResourceHost {
  const entries = new Map<string,Resource>(), loaded = new Set<Kind>()
  const warnings: string[] = []
  let catalog: SkillCatalog | undefined
  const authorize = (tool: string,args: Record<string,unknown>) => {const reason=opts.authorize?.(tool,args); if(reason) throw new Error(reason)}
  const load = (kind: Kind) => {
    if (loaded.has(kind)) return
    if (kind === 'skill') {
      catalog = loadSkillCatalog({...opts,maxFileBytes:256 * 1024})
      warnings.push(...catalog.problems.map(p => `${p.path}：${p.reason}`))
      for (const skill of catalog.skills) {
        if (skill.invocation !== 'model') continue
        const id=idFor('skill',skill.filePath)
        entries.set(id,{id,kind,name:skill.name,description:chars(skill.description,240),source:skill.filePath,skill})
      }
    } else if (opts.memory?.enabled) {
      authorize('memory_list',{})
      for (const target of ['user','memory',...(opts.workspace ? ['key' as const] : [])] as const) {
        const rows=opts.memory.store.entries(target,target==='key'?{workspace:opts.workspace!}:undefined)
        for (const [index,content] of rows.entries()) {
          if (target==='key') {const branches=parseEntryBranches(content); if(branches && (!opts.memory.branch || !branches.includes(opts.memory.branch))) continue}
          const source=target==='key'?`${opts.workspace}/.dawn/memory/KEY.md`:`${target==='user'?'USER':'MEMORY'}.md（全局）`
          const text=stripEntryId(content),id=idFor('memory',`${source}:${index}:${content}`)
          entries.set(id,{id,kind,name:`${target} · ${index+1}`,description:chars(text,160),source,content:text})
        }
      }
    }
    loaded.add(kind)
  }
  return {async call(name,value) {
    if (name==='resource_search') {
      const args=argsFor(value,['kind','query','offset','limit']),kind=args.kind??'all'
      if (kind!=='all' && kind!=='skill' && kind!=='memory') throw new Error('kind 必须为 all / skill / memory')
      if (args.query!==undefined && (typeof args.query!=='string' || args.query.length>500)) throw new Error('query 必须是最多 500 字符的文本')
      const offset=numberArg(args,'offset',0,Number.MAX_SAFE_INTEGER),limit=numberArg(args,'limit',5,20),query=String(args.query??'')
      if (kind!=='memory') load('skill')
      if (kind!=='skill') load('memory')
      const found: Resource[]=[]
      if (kind!=='memory' && catalog) {
        let page=searchSkills(catalog.skills,query,{limit:20})
        while (true) {
          for(const item of page.items) {
            const entry=entries.get(idFor('skill',item.filePath))
            if(entry) found.push({...entry,name:item.name,description:chars(item.description,240),boundedTags:item.tags,match:item.match,...(item.metadataTruncated || Array.from(item.description).length>240 ? {metadataTruncated:true} : {})})
          }
          if(page.nextOffset===undefined) break
          page=searchSkills(catalog.skills,query,{limit:20,offset:page.nextOffset})
        }
      }
      if(kind!=='skill') found.push(...searchResources([...entries.values()].filter(e=>e.kind==='memory'),query))
      if(kind==='all') {
        const exact = (entry: Resource) => resourceMatchesPhrase({...entry,...(entry.skill ? {searchText:entry.skill.description} : {})},query)
        const skills=found.filter(entry=>entry.kind==='skill'), memories=found.filter(entry=>entry.kind==='memory')
        const firstSemantic=skills.findIndex(entry=>!exact(entry)), split=firstSemantic<0?skills.length:firstSemantic
        const exactMemories=memories.filter(exact), otherMemories=memories.filter(entry=>!exact(entry))
        found.splice(0,found.length,...skills.slice(0,split),...exactMemories,...skills.slice(split),...otherMemories)
      }
      const page=found.slice(offset,offset+limit),nextOffset=offset+page.length<found.length?offset+page.length:undefined
      return JSON.stringify({available:kind!=='memory'||!!opts.memory?.enabled,...(kind==='memory'&&!opts.memory?.enabled?{reason:'记忆读取未启用'}:{}),
        items:page.map(({id,kind,name,description,source,skill,match,boundedTags,metadataTruncated})=>({id,kind,name,description,source,...(skill?{scope:skill.scope,tags:boundedTags??[],match,...(metadataTruncated?{metadataTruncated:true}:{})}: {})})),
        total:found.length,offset,truncated:nextOffset!==undefined,...(nextOffset!==undefined?{nextOffset}:{}),
        ...(warnings.length?{warnings:warnings.slice(0,5).map(w=>chars(w,500)),warningsTotal:warnings.length,warningsTruncated:warnings.length>5||warnings.some(w=>Array.from(w).length>500)}:{})})
    }
    if(name!=='resource_read') throw new Error(`只读资源不支持方法：${name}`)
    const args=argsFor(value,['id','path','offset','limit'])
    if(typeof args.id!=='string') throw new Error('id 必须来自 resource_search 返回的资源目录')
    const entry=entries.get(args.id)
    if(!entry) throw new Error('未知或不可见的资源 ID；请先 resource_search')
    const offset=numberArg(args,'offset',0,Number.MAX_SAFE_INTEGER),limit=numberArg(args,'limit',3000,4000)
    if(entry.skill) {
      if(args.path!==undefined&&typeof args.path!=='string') throw new Error('技能参考路径必须是目录内的相对路径')
      const read=readSkill(catalog!,{name:entry.name,...(args.path!==undefined?{path:args.path as string}:{}),offset,limit})
      const {name,manifestPath,resourcePath,scope,contentSha256,partial}=read
      const skillRead: SkillReadReceipt={name,manifestPath,resourcePath,scope,via:'resource',contentSha256,partial}
      return JSON.stringify({id:entry.id,kind:entry.kind,name:entry.name,source:join(entry.skill.baseDir,resourcePath),content:read.content,offset:read.offset,totalChars:read.totalChars,
        truncated:read.truncated,...(read.nextOffset!==undefined?{nextOffset:read.nextOffset}:{}),skillRead})
    }
    if(args.path!==undefined) throw new Error('记忆资源不接受 path 参数')
    authorize('memory_list',{})
    const points=Array.from(entry.content!),part=points.slice(offset,offset+limit),nextOffset=offset+part.length<points.length?offset+part.length:undefined
    return JSON.stringify({id:entry.id,kind:entry.kind,name:entry.name,source:entry.source,content:part.join(''),offset,totalChars:points.length,truncated:nextOffset!==undefined,...(nextOffset!==undefined?{nextOffset}:{})})
  }}
}
