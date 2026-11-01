import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { evaluateSkills, exactPhraseBaseline } from '../../scripts/evaluate-skills.js'

describe('fixed offline Skill retrieval evaluation', () => {
  it('keeps an exact-phrase name/description baseline independent from synonym ranking', () => {
    const skills = [{ name: 'dataset-first-look', description: '初次检查数据集', invocation: 'model' as const }]
    expect(exactPhraseBaseline(skills, '数据集')).toEqual(['dataset-first-look'])
    expect(exactPhraseBaseline(skills, '请初次检查这个数据集')).toEqual([])
    expect(exactPhraseBaseline([{ ...skills[0]!, invocation: 'manual' }], '数据集')).toEqual([])
    expect(exactPhraseBaseline([{ name: 'EDA', description: 'first   look', invocation: 'model' }], 'ＥＤＡ  first look')).toEqual(['EDA'])
  })

  it('declares and reports every checked-in built-in without external sources or absolute paths', () => {
    const report = evaluateSkills()
    expect(report.corpus).toMatchObject({ source: 'skills/*/SKILL.md', skills: 9, discoveryProblems: 0 })
    expect(report.fixture).toMatchObject({ positive: 18, negative: 5, hardNegative: 5 })
    expect(report.cases).toHaveLength(28)
    expect(report.limit).toBe(5)
    expect(report.scope).toContain('Offline')
    expect(JSON.stringify(report)).not.toContain(process.cwd())
    const declared = JSON.parse(readFileSync(new URL('../fixtures/skill-retrieval-evaluation.json', import.meta.url), 'utf8'))
    expect(new Set(declared.positiveCases.flatMap((c: { acceptableSkills: string[] }) => c.acceptableSkills)).size).toBe(9)
  })

  it('requires every labeled task to hit at 3 and reports hit@5 plus the unchanged baseline', () => {
    const report = evaluateSkills()
    expect(report.cases.filter(c => c.kind === 'positive' && !c.current.hitAt3)).toEqual([])
    expect(report.metrics.current.hitAt3).toBe(18)
    expect(report.metrics.current.hitAt5).toBe(18)
    expect(report.metrics.baseline.hitAt3).toBeLessThan(report.metrics.current.hitAt3)
  })

  it('requires zero ordinary and hard false positives and records policy constraints separately', () => {
    const report = evaluateSkills()
    expect(report.cases.filter(c => c.kind !== 'positive' && c.current.total > 0)).toEqual([])
    expect(report.metrics.current.negativeCandidateCount).toBe(0)
    expect(report.metrics.current.hardNegativeCandidateCount).toBe(0)
    expect(report.hardConstraints.every(c => c.passed)).toBe(true)
    expect(report.hardConstraints.map(c => c.id)).toEqual(['manual-and-off-excluded', 'project-shadowing-before-filter'])
    expect(report.passed).toBe(true)
  })

  it('measures real SDK prompt output as chars and UTF-8 bytes for 9 and 200 installed Skills', () => {
    const { promptSize } = evaluateSkills()
    expect(promptSize.measure).toBe('JavaScript string length and UTF-8 bytes; no token or cost estimate')
    expect(promptSize.small).toMatchObject({ installed: 9, before: promptSize.small.after })
    expect(promptSize.large.installed).toBe(200)
    expect(promptSize.large.before.bytes).toBeGreaterThan(0)
    expect(promptSize.large.after).toEqual({ chars: 0, bytes: 0 })
  })
})
