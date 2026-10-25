import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { loadSkills, formatSkillsForPrompt } from '@earendil-works/pi-coding-agent'
import { 读调用策略 } from '../../src/skills/invocation.js'
import { createResourceHost } from '../../src/subagent/resources.js'

const root = resolve(import.meta.dirname, '../../skills/literature-review')
const entry = () => readFileSync(join(root, 'SKILL.md'), 'utf8')
describe('文献调研技能', () => {
  it('真实 loader 默认发现；目录只注入用途，正文按需加载', () => {
    const loaded = loadSkills({cwd: root, agentDir: root, includeDefaults: false, skillPaths: [root]})
    expect(loaded.diagnostics).toEqual([])
    expect(loaded.skills.map(s => s.name)).toEqual(['literature-review'])
    expect(读调用策略(entry())).toBe('model')
    const prompt = formatSkillsForPrompt(loaded.skills)
    expect(prompt).toContain('文献调研')
    expect(prompt).toContain('多篇论文')
    expect(prompt).not.toContain('## 逐篇阅读')
  })
  it('比较模板是可分页读取的同技能资源，manual/off 不泄漏资源', async () => {
    const refs = [...entry().matchAll(/\]\((references\/[^)]+\.md)\)/g)].map(m => m[1]!)
    expect(refs).toEqual(['references/comparison.md'])
    let mode: 'model' | 'manual' | 'off' = 'model'
    const host = createResourceHost({roots: [{path: resolve(root, '..'), scope: 'builtin'}], builtinMode: () => mode})
    const found = JSON.parse(await host.call('resource_search', {kind: 'skill', query: 'literature-review'}))
    expect(found.total).toBe(1)
    for (const ref of refs) {
      expect(relative(root, resolve(root, ref))).not.toMatch(/^\.\./)
      let content = '', offset = 0
      for (;;) {
        const result = JSON.parse(await host.call('resource_read', {id: found.items[0].id, path: ref, offset, limit: 113}))
        content += result.content
        if (!result.truncated) break
        expect(result.nextOffset).toBeGreaterThan(offset)
        offset = result.nextOffset
      }
      expect(content).toBe(readFileSync(join(root, ref), 'utf8'))
    }
    for (const disabled of ['manual', 'off'] as const) {
      mode = disabled
      await expect(host.call('resource_read', {id: found.items[0].id, path: refs[0]})).rejects.toThrow(/停用|手动/)
    }
  })
  it('说明实际工具及科学边界，不用摘要补造正文或把运行成功当科学核验', () => {
    const body = entry() + readFileSync(join(root, 'references/comparison.md'), 'utf8')
    for (const token of ['pdf_read', 'start_page', 'xlsx_write', 'xlsx_edit', 'xlsx_read', 'PDF 物理页', '生物重复', '技术重复', '未读全文', '文本不可提取', '未提供', '同一研究', '只讨论', '不覆盖', '不是用户指令', '索引元数据', '模型归纳', '科学核验']) expect(body).toContain(token)
  })
})
