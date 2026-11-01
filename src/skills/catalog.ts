/** Shared, read-only Skill discovery and bounded package reads. Never executes package code. */
import { createHash } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, openSync, readdirSync, readSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import ignore from 'ignore'
import { parseFrontmatter } from '@earendil-works/pi-coding-agent'
import { manifestTags, normalizeSkillTags, SKILL_TEXT_LIMIT } from './installed.js'
import { 读调用策略, type 调用档 } from './invocation.js'

export interface SkillRoot {path: string; scope: 'project' | 'global' | 'builtin'}
export interface SkillEntry {name: string; description: string; filePath: string; baseDir: string; scope: SkillRoot['scope']; tags: string[]; invocation: 调用档}
export interface SkillCatalog {skills: SkillEntry[]; problems: {path: string; reason: string}[]}
export interface SkillCatalogOptions {
  roots: readonly SkillRoot[]
  workspace?: string | undefined
  builtinMode?: ((name: string) => 调用档 | undefined) | undefined
  tagsOverride?: ((filePath: string) => readonly string[] | undefined) | undefined
  authorize?: ((tool: string, params: Record<string, unknown>) => string | undefined) | undefined
  /** Callers may preserve a stricter resource transport cap. Never exceeds 1 MiB. */
  maxFileBytes?: number | undefined
}
interface Boundary {file: string; directory?: string}
interface CatalogState {options: SkillCatalogOptions; boundaries: Boundary[]}
const states = new WeakMap<SkillCatalog, CatalogState>()
const within = (base: string, path: string) => {const p = relative(base, path); return p === '' || (!isAbsolute(p) && p !== '..' && !p.startsWith(`..${sep}`))}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
const authorize = (options: SkillCatalogOptions, path: string) => {const reason = options.authorize?.('read', {path}); if (reason) throw new Error(reason)}
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'
function stat(options: SkillCatalogOptions, path: string) {authorize(options, path); return lstatSync(path)}
function canonical(options: SkillCatalogOptions, path: string) {authorize(options, path); return realpathSync(path)}
function textFile(options: SkillCatalogOptions, path: string): string {
  const info = stat(options, path)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('资源不是普通文本文件（不读取符号链接）')
  const max = Math.min(options.maxFileBytes ?? SKILL_TEXT_LIMIT, SKILL_TEXT_LIMIT)
  if (!Number.isSafeInteger(max) || max < 1) throw new Error('无效的文件字节上限')
  if (info.size > max) throw new Error(`资源超过 ${max} 字节上限`)
  authorize(options, path)
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    const current = fstatSync(fd)
    if (!current.isFile()) throw new Error('资源不是普通文本文件')
    if (current.size > max) throw new Error(`资源超过 ${max} 字节上限`)
    const buffer = Buffer.alloc(max + 1)
    let count = 0
    while (count < buffer.length) {const read = readSync(fd, buffer, count, buffer.length - count, null); if (!read) break; count += read}
    if (count > max) throw new Error('资源读取期间增大，超过字节上限')
    const bytes = buffer.subarray(0, count)
    if (bytes.includes(0)) throw new Error('二进制资源不支持文本读取')
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes)
  } finally {closeSync(fd)}
}
function definition(text: string, file: string): {name: string; description: string} | undefined {
  const {frontmatter} = parseFrontmatter<{name?: unknown; description?: unknown}>(text)
  const description = typeof frontmatter.description === 'string' ? frontmatter.description.trim() : ''
  if (!description) return undefined
  return {name: typeof frontmatter.name === 'string' && frontmatter.name ? frontmatter.name : basename(dirname(file)), description}
}

export function loadSkillCatalog(options: SkillCatalogOptions): SkillCatalog {
  const catalog: SkillCatalog = {skills: [], problems: []}
  const boundaries: Boundary[] = [], seen = new Set<string>()
  const problem = (path: string, error: unknown) => catalog.problems.push({path, reason: errorText(error)})
  const priority = {project: 0, global: 1, builtin: 2}
  const roots = [...options.roots].sort((a,b) => priority[a.scope] - priority[b.scope])
  for (const root of roots) {
    if (root.scope === 'project' && !options.workspace) continue
    const rootPath = resolve(root.path)
    // Root denial is a hard failure; per-file failures become diagnostics.
    authorize(options, rootPath)
    try {
      const info = stat(options, rootPath)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('技能根目录不是普通目录')
      const base = canonical(options, rootPath)
      let visited = 0
      const ignored = ignore()
      const add = (file: string) => {
        try {
          const realFile = canonical(options, file)
          if (!within(base, realFile)) throw new Error('技能清单越界')
          if (basename(file) === 'SKILL.md') boundaries.push({file:realFile,directory:dirname(realFile)})
          const text = textFile(options, file), parsed = definition(text, file)
          if (!parsed) {if (basename(file) === 'SKILL.md') problem(file,'description is required'); return}
          if (parsed.description.length > 1024) problem(file,`description exceeds 1024 characters (${parsed.description.length})`)
          if (parsed.name.length > 64) problem(file,`name exceeds 64 characters (${parsed.name.length})`)
          if (!/^[a-z0-9-]+$/.test(parsed.name)) problem(file,'name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)')
          if (parsed.name.startsWith('-') || parsed.name.endsWith('-')) problem(file,'name must not start or end with a hyphen')
          if (parsed.name.includes('--')) problem(file,'name must not contain consecutive hyphens')
          if (basename(file) !== 'SKILL.md') boundaries.push({file:realFile})
          if (seen.has(parsed.name)) return
          seen.add(parsed.name)
          catalog.skills.push({...parsed, filePath: file, baseDir: dirname(file), scope: root.scope,
            tags: normalizeSkillTags(options.tagsOverride?.(file) ?? manifestTags(text)),
            invocation: (root.scope === 'builtin' ? options.builtinMode?.(parsed.name) : undefined) ?? 读调用策略(text)})
        } catch (error) {problem(file, error)}
      }
      const visit = (directory: string, top: boolean, depth: number) => {
        authorize(options, directory)
        if (stat(options, directory).isSymbolicLink()) throw new Error('技能目录不读取符号链接')
        const entries = readdirSync(directory, {withFileTypes: true}).sort((a,b) => a.name.localeCompare(b.name, 'en'))
        const prefix = relative(rootPath,directory).split(sep).join('/')
        for (const name of ['.gitignore','.ignore','.fdignore']) {
          const path = join(directory,name)
          try {
            stat(options,path)
            const patterns = textFile(options,path).split(/\r?\n/).map(line => {
              if (!line.trim() || line.trim().startsWith('#')) return ''
              const negate = line.startsWith('!'), pattern = (negate ? line.slice(1) : line).replace(/^\//,'')
              return `${negate ? '!' : ''}${prefix ? `${prefix}/` : ''}${pattern}`
            }).filter(Boolean)
            ignored.add(patterns)
          } catch (error) {if (!missing(error)) problem(path,error)}
        }
        const isIgnored = (path: string, directory = false) => ignored.ignores(`${relative(rootPath,path).split(sep).join('/')}${directory ? '/' : ''}`)
        const manifest = entries.find(e => e.name === 'SKILL.md' && e.isFile() && !isIgnored(join(directory,e.name)))
        if (manifest) {add(join(directory, manifest.name)); return}
        for (const entry of entries) {
          if (++visited > 2000) {problem(directory, '目录条目超过 2000 项，已停止发现'); return}
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue
          const path = join(directory, entry.name)
          if (isIgnored(path,entry.isDirectory())) continue
          if (entry.isDirectory()) {
            if (depth >= 32) {problem(path, '目录超过 32 层'); continue}
            try {visit(path, false, depth + 1)} catch (error) {problem(path, error)}
          } else if (top && entry.isFile() && entry.name.endsWith('.md')) add(path)
        }
      }
      visit(rootPath, true, 0)
    } catch (error) {if (!missing(error)) problem(rootPath, error)}
  }
  states.set(catalog, {options, boundaries})
  return catalog
}

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim()
const segmenter = new Intl.Segmenter('zh', {granularity: 'word'})
const stop = new Set(['相关','关于','查询','检索','记忆','请问','一下','进行','帮我','需要','分析','处理','结果','展示','查看','任务','数据','研究','科学','请','做','一次','the','and','or','of','for','to','in','with','please','find','search','help','create','make','use','data','analysis','analyze','scientific','task','review','run','perform','check','generate','write','build','implement','审查','检查','一个','这套','这种','这个','这些','以后','怎么','以及','用户','我们','你们','它们'])
const synonyms = [
  ['eda','exploratory data analysis','data exploration','数据初探','探索性数据分析'],
  ['reproducibility','reproducible','可复现','可重复','复现'],
  ['literature','文献'], ['visualization','visualisation','plotting','绘图','可视化'],
  ['statistical review','科研审查','统计审查','统计审核'],
  ['analysis delivery','handoff','交付','分析交付'],
  ['reusable skill','skill authoring','writing skills','编写技能','技能'],
] as const
function integer(value: number | undefined, fallback: number, max: number, name: string) {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < (name === 'offset' ? 0 : 1) || result > max) throw new Error(`${name} 必须是允许范围内的整数（最大 ${max}）`)
  return result
}
function literalTerms(text: string) {
  return [...segmenter.segment(normalize(text))].filter(p => p.isWordLike).map(p => p.segment).filter(t => Array.from(t).length > 1 && !stop.has(t))
}
const contains = (text: string, term: string) => /\p{Script=Han}/u.test(term) ? text.includes(term) : (` ${text} `).includes(` ${term} `)
/** Conservative task-query guard: a definition alone does not request a workflow.
 * Bare names/topics still search normally. This is lexical intent handling, not a model classifier.
 */
function explanationOnly(query: string): boolean {
  const text = query.normalize('NFKC').toLowerCase()
  if (!/\b(?:explain|define|definition|meaning)\b|\bwhat\s+(?:is|are|does)\b|解释|定义|概念|什么意思|什么是|是什么|指什么|(?:讲讲|说说|聊聊).{0,80}术语/u.test(text)) return false
  const positive = text.replace(/\b(?:without|do not|don't|no need to)\b[^,.;!?]*/gu,'').replace(/(?:不要|无需|不必|不)[^，。；,;?!]*/gu,'')
  const englishAction = /(?:^\s*(?:(?:next|then|also)[,\s]*)?|\b(?:and(?:\s+then)?|then|also)\s+)(?:please\s+)?(?:help\s+me\s+)?(?:inspect|read|edit|write|generate|produce|run|perform|analy[sz]e|review|plan|package|save|create|plot|prepare)\b/u
  const chineseAction = /(?:^\s*(?:请)?|然后|随后|接着|之后|并且|还要|同时|并|再)(?:进行|执行|检查|读取|编辑|编写|生成|运行|分析|审查|整理|保存|绘图|数据初探)/u
  const clauses = positive.split(/[;.!?。；！？]/u)
  return !clauses.some(clause => englishAction.test(clause) || chineseAction.test(clause))
}
export function searchSkills(skills: readonly SkillEntry[], query: string, options: {offset?: number; limit?: number} = {}) {
  const offset = integer(options.offset, 0, Number.MAX_SAFE_INTEGER, 'offset'), limit = integer(options.limit, 5, 20, 'limit')
  if (explanationOnly(query)) return {items:[],total:0,offset,truncated:false}
  const phrase = normalize(query), terms = new Set(literalTerms(query))
  const groups = synonyms.filter(group => group.some(alias => contains(phrase, normalize(alias))))
  const exactNames = skills.filter(skill => phrase && normalize(skill.name) === phrase)
  const ranked = (exactNames.length ? exactNames : skills).filter(skill => skill.invocation === 'model').map((skill,index) => {
    if (exactNames.length) return {skill,index,score:1000,match:{fields:['name'],terms:[skill.name.normalize('NFKC').toLowerCase()]}}
    const fields = [{name:'name', value:skill.name, weight:12}, {name:'description', value:skill.description, weight:5}, {name:'tags', value:skill.tags.join(' '), weight:8}]
    const matchedFields: string[] = [], matchedTerms = new Set<string>(); let score = 0
    for (const field of fields) {
      const text = normalize(field.value)
      const hits = new Set([...terms].filter(term => contains(text, normalize(term))))
      for (const group of groups) for (const alias of group) if (contains(text, normalize(alias))) {
        // Reasons name only terms literally present in this candidate field.
        for (const term of literalTerms(alias)) if (field.value.normalize('NFKC').toLowerCase().includes(term)) hits.add(term)
      }
      if (hits.size) {matchedFields.push(field.name); hits.forEach(term => matchedTerms.add(term)); score += field.weight * hits.size}
      if (hits.size && phrase && text === phrase) score += field.weight * 10
    }
    return {skill,index,score,match:{fields:matchedFields,terms:[...matchedTerms]}}
  }).filter(row => !phrase || row.score > 0).sort((a,b) => b.score - a.score || a.index - b.index)
  const items = ranked.slice(offset, offset + limit).map(({skill,match}) => {
    const clip = (text: string, limit: number) => Array.from(text).slice(0,limit).join('')
    const name = clip(skill.name,512), description = clip(skill.description,1200), tags = skill.tags.slice(0,20).map(t => clip(t,64))
    const boundedMatch = {fields:match.fields.slice(0,3),terms:match.terms.slice(0,20).map(t => clip(t,64))}
    const metadataTruncated = name !== skill.name || description !== skill.description || skill.tags.length > tags.length || tags.some((t,i) => t !== skill.tags[i]) || match.terms.length > boundedMatch.terms.length || boundedMatch.terms.some((t,i) => t !== match.terms[i])
    return {name,description,filePath:skill.filePath,scope:skill.scope,tags,match:boundedMatch,...(metadataTruncated ? {metadataTruncated:true} : {})}
  })
  const nextOffset = offset + items.length < ranked.length ? offset + items.length : undefined
  return {items,total:ranked.length,offset,truncated:nextOffset !== undefined,...(nextOffset !== undefined ? {nextOffset} : {})}
}

function stateFor(catalog: SkillCatalog) {const state = states.get(catalog); if (!state) throw new Error('未知 Skill catalog'); return state}
function assertAnchor(state: CatalogState, skill: SkillEntry) {
  const root = state.options.roots.find(r => r.scope === skill.scope && within(resolve(r.path),skill.filePath))
  if (!root) throw new Error('技能清单越界')
  let target = resolve(root.path)
  for (const part of ['', ...relative(target,skill.filePath).split(sep)]) {
    if (part) target = join(target,part)
    if (stat(state.options,target).isSymbolicLink()) throw new Error('技能路径符号链接越界或不安全')
  }
}
function safeResource(state: CatalogState, skill: SkillEntry, path: string): {absolute: string; resourcePath: string} {
  const {options} = state
  assertAnchor(state,skill)
  const parts = path.split('/')
  if (!path || isAbsolute(path) || path.includes('\\') || path.includes('\0') || parts.some(p => !p || p === '..' || p.startsWith('.') || p.includes(':'))) throw new Error('技能参考路径必须是目录内的相对路径，不能越界')
  const base = canonical(options, skill.baseDir), own = canonical(options, skill.filePath)
  let target = skill.baseDir
  for (const part of parts) {
    target = join(target, part)
    const info = stat(options, target)
    if (info.isSymbolicLink()) throw new Error('技能参考符号链接越界或不安全')
  }
  const absolute = canonical(options, target)
  if (!within(base, absolute)) throw new Error('技能参考路径越界')
  if (state.boundaries.some(b => b.file !== own && (b.file === absolute || (b.directory && b.directory !== base && within(b.directory, absolute))))) throw new Error('不能借参考路径读取其他技能')
  // Also catch packages installed after catalog discovery, including nested packages.
  let directory = dirname(target)
  while (within(skill.baseDir, directory)) {
    if (directory !== skill.baseDir) {
      const manifest = join(directory, 'SKILL.md')
      try {stat(options, manifest); throw new Error('不能借参考路径读取其他技能')} catch (error) {if (!missing(error)) throw error}
    }
    if (directory === skill.baseDir) break
    directory = dirname(directory)
  }
  if (basename(target) === 'SKILL.md' && absolute !== own) throw new Error('不能借参考路径读取其他技能')
  if (absolute !== own && target.endsWith('.md') && options.roots.some(root => resolve(root.path) === dirname(target))) {
    if (definition(textFile(options,target),target)) throw new Error('不能借参考路径读取其他技能')
  }
  return {absolute, resourcePath: relative(skill.baseDir, target).split(sep).join('/')}
}
export function readSkill(catalog: SkillCatalog, request: {name: string; path?: string; offset?: number; limit?: number; allowManual?: boolean}) {
  const state = stateFor(catalog), skill = catalog.skills.find(s => s.name === request.name)
  if (!skill) throw new Error('未知或不可见的技能名称')
  const offset = integer(request.offset,0,Number.MAX_SAFE_INTEGER,'offset'), limit = integer(request.limit,3000,4000,'limit')
  assertAnchor(state,skill)
  const definitionText = textFile(state.options, skill.filePath), parsed = definition(definitionText,skill.filePath)
  if (!parsed || parsed.name !== request.name) throw new Error('技能名称已改变，请重新检索')
  const currentCatalog = loadSkillCatalog(state.options)
  const current = currentCatalog.skills.find(s => s.name === request.name)
  if (!current || current.filePath !== skill.filePath) throw new Error('技能已被覆盖或不可见，请重新检索')
  const mode = (skill.scope === 'builtin' ? state.options.builtinMode?.(skill.name) : undefined) ?? 读调用策略(definitionText)
  if (mode === 'off') throw new Error('技能已停用（off）')
  if (mode === 'manual' && !request.allowManual) throw new Error('技能仅供手动调用（manual）')
  const target = safeResource(stateFor(currentCatalog),skill,request.path ?? basename(skill.filePath))
  const text = target.absolute === canonical(state.options,skill.filePath) ? definitionText : textFile(state.options,target.absolute)
  const points = Array.from(text), content = points.slice(offset,offset+limit).join('')
  const nextOffset = offset + Array.from(content).length < points.length ? offset + Array.from(content).length : undefined
  return {name:skill.name,manifestPath:skill.filePath,resourcePath:target.resourcePath,scope:skill.scope,content,contentSha256:createHash('sha256').update(content).digest('hex'),
    partial:offset > 0 || nextOffset !== undefined,offset,totalChars:points.length,truncated:nextOffset !== undefined,...(nextOffset !== undefined ? {nextOffset} : {})}
}
export function skillForPath(catalog: SkillCatalog, path: string): {skill: SkillEntry; resourcePath: string} | undefined {
  const state = stateFor(catalog), absolute = resolve(path)
  for (const skill of catalog.skills) {
    if (!within(skill.baseDir,absolute)) continue
    try {
      const target = safeResource(state,skill,relative(skill.baseDir,absolute).split(sep).join('/'))
      const text = textFile(state.options,skill.filePath), parsed = definition(text,skill.filePath)
      if (!parsed || parsed.name !== skill.name || ((skill.scope === 'builtin' ? state.options.builtinMode?.(skill.name) : undefined) ?? 读调用策略(text)) === 'off') continue
      return {skill,resourcePath:target.resourcePath}
    } catch { /* Observation never authorizes an out-of-package read. */ }
  }
  return undefined
}

/** Gate generic reads before they open a path. Unlisted files under Skill roots are denied. */
export function guardSkillPath(catalog: SkillCatalog, path: string, allowManual?: (skill: SkillEntry) => boolean): {skill: SkillEntry; resourcePath: string} | undefined {
  const state = stateFor(catalog), absolute = resolve(path)
  const roots = state.options.roots.filter(root => root.scope !== 'project' || !!state.options.workspace)
  if (!roots.length) return undefined
  let real: string | undefined
  try {real = canonical(state.options,absolute)} catch (error) {if (!missing(error)) throw error}
  const inside = roots.some(root => {
    if (within(resolve(root.path),absolute)) return true
    try {return real !== undefined && within(canonical(state.options,root.path),real)} catch (error) {if (!missing(error)) throw error; return false}
  })
  if (!inside) return undefined
  const current = loadSkillCatalog(state.options)
  for (const skill of current.skills) {
    const base = canonical(state.options,skill.baseDir), file = canonical(state.options,skill.filePath)
    const own = real ?? absolute
    // Legacy root Markdown is a single-file Skill, never an owner of its siblings.
    if (basename(skill.filePath) === 'SKILL.md' ? !within(base,own) : own !== file) continue
    const resourcePath = relative(base,own).split(sep).join('/')
    readSkill(current,{name:skill.name,path:resourcePath,limit:1,allowManual:allowManual?.(skill) ?? false})
    return {skill,resourcePath}
  }
  throw new Error('技能路径属于不可见、被覆盖或无效的技能包，不可直接读取')
}
