import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {loadSkills,formatSkillsForPrompt} from '@earendil-works/pi-coding-agent'

describe('default analysis delivery skill',()=>{
  it('is discoverable for complete reports and specifies script references instead of source embedding',()=>{
    const root=resolve('skills'), loaded=loadSkills({cwd:root,agentDir:root,includeDefaults:false,skillPaths:[root]})
    const skill=loaded.skills.find(s=>s.name==='analysis-delivery')!
    expect(formatSkillsForPrompt([skill])).toContain('完整分析报告')
    const body=readFileSync(resolve(root,'analysis-delivery/SKILL.md'),'utf8')
    expect(body).toContain('分析报告.md')
    expect(body).toContain('不嵌入脚本全文')
    expect(body).toContain('建议调用方式')
    expect(body).toContain('实际执行记录')
    expect(body).toContain('普通探索')
  })
})
