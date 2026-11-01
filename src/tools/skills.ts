import { Type } from 'typebox'
import { readSkill, searchSkills, type SkillCatalog } from '../skills/catalog.js'
import type { SkillReadReceipt } from '../protocol/skill-reads.js'
import { MCP只读标记 } from './mcp-tool.js'

export function createSkillTools(opts: { catalog(): SkillCatalog; allowManual?: (name: string) => boolean }) {
  type Result = { content: { type: 'text'; text: string }[]; details?: { skillRead?: SkillReadReceipt }; isError?: boolean }
  const result = (value: unknown, skillRead?: SkillReadReceipt): Result => ({ content: [{ type: 'text', text: JSON.stringify(value) }], ...(skillRead ? { details: { skillRead } } : {}) })
  const fail = (error: unknown): Result => ({ content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true })
  return [{
    name: 'search_skills', label: 'search_skills', [MCP只读标记]: true,
    description: 'Search installed workflow names, descriptions and personal/package tags with concrete task terms. Returns bounded candidates and literal match reasons, not instructions or execution permission. Manual/off Skills are excluded. Ordinary concept explanations do not need a Skill.',
    parameters: Type.Object({ query: Type.String({ maxLength: 500 }), offset: Type.Optional(Type.Integer({ minimum: 0 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })) }, { additionalProperties: false }),
    async execute(_id: string, params: { query?: string; offset?: number; limit?: number; name?: string; path?: string }) {
      try { const catalog = opts.catalog(); return result({ ...searchSkills(catalog.skills, params.query ?? '', params), problems: catalog.problems.slice(0, 20).map(problem => ({ path: problem.path.slice(0, 2048), reason: problem.reason.slice(0, 512) })), problemsTotal: catalog.problems.length, problemsTruncated: catalog.problems.length > 20 || catalog.problems.some(problem => problem.path.length > 2048 || problem.reason.length > 512) }) }
      catch (error) { return fail(error) }
    },
  }, {
    name: 'use_skill', label: 'use_skill', [MCP只读标记]: true,
    description: 'Read one installed Skill or a relative reference file using an exact name returned by search_skills. Text is paged by characters. This does not execute scripts, change permissions or validate a scientific result.',
    parameters: Type.Object({ name: Type.String({ minLength: 1 }), path: Type.Optional(Type.String({ maxLength: 4000 })), offset: Type.Optional(Type.Integer({ minimum: 0 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 4000 })) }, { additionalProperties: false }),
    async execute(_id: string, params: { query?: string; offset?: number; limit?: number; name?: string; path?: string }) {
      try {
        if (!params.name) throw new Error('name 必须来自技能检索结果')
        const read = readSkill(opts.catalog(), { ...params, name: params.name, allowManual: opts.allowManual?.(params.name) ?? false })
        const receipt: SkillReadReceipt = { name: read.name, manifestPath: read.manifestPath, resourcePath: read.resourcePath, scope: read.scope, via: 'use_skill', contentSha256: read.contentSha256, partial: read.partial }
        return result(read, receipt)
      } catch (error) { return fail(error) }
    },
  }]
}
