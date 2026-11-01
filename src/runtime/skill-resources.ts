import { createHash } from 'node:crypto'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import { createReadToolDefinition, detectSupportedImageMimeTypeFromFile } from '@earendil-works/pi-coding-agent'
import { loadSkillCatalog, readSkill, guardSkillPath, type SkillCatalogOptions, type SkillEntry } from '../skills/catalog.js'
import type { SkillReadReceipt } from '../protocol/skill-reads.js'

/** Host-side Skill access and observations. Receipts describe delivered text, never execution. */
export class NativeSkillResources {
  catalog: ReturnType<typeof loadSkillCatalog>
  private readonly manual = new Set<string>()
  private loadError: string | undefined
  private readonly reads = new AsyncLocalStorage<{ owned?: ReturnType<typeof guardSkillPath> }>()
  constructor(private readonly options: SkillCatalogOptions) { this.catalog = this.load() }
  private load() {
    try { const catalog = loadSkillCatalog(this.options); this.loadError = undefined; return catalog }
    catch (error) {
      const catalog = loadSkillCatalog({ ...this.options, roots: [] })
      this.loadError = error instanceof Error ? error.message : String(error)
      catalog.problems.push({ path: '', reason: this.loadError })
      return catalog
    }
  }
  refresh() { this.catalog = this.load(); this.manual.clear() }
  allowManual = (name: string) => this.manual.has(name)

  prepareManual(input: string): void {
    const name = /^\/skill:([^\s]+)(?:\s|$)/u.exec(input)?.[1]
    if (name && this.catalog.skills.some(skill => skill.name === name)) readSkill(this.catalog, { name, allowManual: true, limit: 1 })
  }

  observeManual(input: string | undefined, expanded: string): SkillReadReceipt | undefined {
    this.manual.clear()
    const name = input && /^\/skill:([^\s]+)(?:\s|$)/u.exec(input)?.[1]
    const skill = name ? this.catalog.skills.find(skill => skill.name === name) : undefined
    if (!skill || !expanded.startsWith(`<skill name="${skill.name}" location="${skill.filePath}">\n`)) return undefined
    const end = expanded.indexOf('\n</skill>')
    if (end < 0) return undefined
    this.manual.add(skill.name)
    return this.receipt(skill, basename(skill.filePath), expanded.slice(0, end + '\n</skill>'.length), 'manual', false)
  }

  /** Guard the actual path chosen by the SDK, including @, file URLs and cwd overrides. */
  createReadTool(cwd: string) {
    const observe = (path: string) => {
      if (this.loadError && this.options.roots.some(root => {
        const part = relative(resolve(root.path), path)
        return !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`)
      })) throw new Error(this.loadError)
      const owned = guardSkillPath(this.catalog, path, skill => this.allowManual(skill.name))
      const call = this.reads.getStore()
      if (call) call.owned = owned
    }
    return createReadToolDefinition(cwd, { operations: {
      access: async path => { observe(path); await access(path, constants.R_OK) },
      detectImageMimeType: async path => { observe(path); return detectSupportedImageMimeTypeFromFile(path) },
      readFile: async path => { observe(path); return readFile(path) },
    } })
  }

  wrapRead(definition: Record<string, unknown>): Record<string, unknown> {
    if (definition.name !== 'read') return definition
    type Result = { isError?: boolean; content?: { type?: string; text?: unknown }[]; details?: { truncation?: { truncated?: boolean }; fullOutputPath?: unknown; [key: string]: unknown } }
    const execute = (definition.execute as (...args: unknown[]) => Promise<Result>).bind(definition)
    return { ...definition, execute: async (id: string, params: Record<string, unknown>, ...args: unknown[]) => {
      const call: { owned?: ReturnType<typeof guardSkillPath> } = {}
      return this.reads.run(call, async () => {
        const result = await execute(id, params, ...args)
        const owned = call.owned
        if (!owned || result?.isError || !Array.isArray(result?.content)) return result
        const text = result.content.filter((block): block is { type: 'text'; text: string } => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n')
        if (!text) return result
        const partial = params.offset !== undefined || params.limit !== undefined || Boolean(result.details?.truncation?.truncated || result.details?.fullOutputPath)
        return { ...result, details: { ...result.details, skillRead: this.receipt(owned.skill, owned.resourcePath, text, 'read', partial) } }
      })
    } }
  }

  private receipt(skill: SkillEntry, resourcePath: string, content: string, via: 'read' | 'manual', partial: boolean): SkillReadReceipt {
    return { name: skill.name, manifestPath: skill.filePath, resourcePath, scope: skill.scope, via, contentSha256: createHash('sha256').update(content).digest('hex'), partial }
  }
}
