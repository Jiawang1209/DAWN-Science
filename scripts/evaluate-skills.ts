/** Reproducible OFFLINE metadata acceptance check. Does not run Skills or call a model. */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { formatSkillsForPrompt, type Skill } from '@earendil-works/pi-coding-agent'
import { loadSkillCatalog, searchSkills, type SkillEntry, type SkillRoot } from '../src/skills/catalog.js'
import { skillPromptEntries } from '../src/skills/prompt.js'

interface PositiveCase { id: string; query: string; acceptableSkills: string[]; basis: string }
interface NegativeCase { id: string; query: string; basis: string }
interface Fixture {
  version: number; scope: string; expectedBuiltinNames: string[]
  positiveCases: PositiveCase[]; negativeCases: NegativeCase[]; hardNegativeCases: NegativeCase[]
}
type BaselineEntry = Pick<SkillEntry, 'name' | 'description' | 'invocation'>
type Kind = 'positive' | 'negative' | 'hardNegative'
interface CaseResult {
  id: string; kind: Kind; query: string; acceptableSkills: string[]; basis: string
  baseline: { candidates: string[]; total: number; hitAt3: boolean; hitAt5: boolean }
  current: { candidates: string[]; total: number; hitAt3: boolean; hitAt5: boolean }
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = join(repo, 'tests/fixtures/skill-retrieval-evaluation.json')
const digest = (text: string) => createHash('sha256').update(text).digest('hex')

/** Prior src/subagent/resource-search.ts Skill branch: normalized whole-phrase substring. */
export function exactPhraseBaseline(skills: readonly BaselineEntry[], query: string): string[] {
  const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()
  const phrase = normalize(query)
  return skills.filter(s => s.invocation === 'model' && normalize(`${s.name}\n${s.description}\n`).includes(phrase)).map(s => s.name)
}

function hardConstraints() {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-skill-evaluation-'))
  try {
    const roots: SkillRoot[] = ['project', 'global', 'builtin'].map(scope => ({ path: join(dir, scope), scope: scope as SkillRoot['scope'] }))
    const manifest = (layer: number, name: string, flags = '') => {
      const base = join(roots[layer]!.path, name)
      mkdirSync(base, { recursive: true })
      writeFileSync(join(base, 'SKILL.md'), `---\nname: ${name}\ndescription: evaluationprobe\n${flags}---\nInstruction text; never executed.\n`)
    }
    roots.forEach(r => mkdirSync(r.path))
    manifest(2, 'visible')
    manifest(1, 'manual', 'disable-model-invocation: true\n')
    manifest(1, 'off', 'user-invocable: false\n')
    manifest(2, 'shadowed')
    manifest(0, 'shadowed', 'user-invocable: false\n')
    const catalog = loadSkillCatalog({ roots: [...roots].reverse(), workspace: dir })
    const names = searchSkills(catalog.skills, 'evaluationprobe').items.map(s => s.name)
    return [
      { id: 'manual-and-off-excluded', passed: names.includes('visible') && !names.includes('manual') && !names.includes('off'), visibleCandidates: names },
      { id: 'project-shadowing-before-filter', passed: catalog.skills.find(s => s.name === 'shadowed')?.scope === 'project' && !names.includes('shadowed') },
    ]
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

function promptSize(skills: readonly SkillEntry[]) {
  // Stable locations avoid machine-specific path length changing the comparison.
  const sdkEntries: Skill[] = skills.map(s => ({
    name: s.name, description: s.description,
    filePath: `/skills/${s.name}/SKILL.md`, baseDir: `/skills/${s.name}`,
    disableModelInvocation: s.invocation !== 'model',
    sourceInfo: { path: '/skills', source: 'offline-evaluation', scope: 'user', origin: 'top-level' },
  }))
  const measure = (text: string) => ({ chars: text.length, bytes: Buffer.byteLength(text, 'utf8') })
  const compare = (entries: Skill[]) => ({
    installed: entries.filter(s => !s.disableModelInvocation).length,
    before: measure(formatSkillsForPrompt(entries)),
    after: measure(formatSkillsForPrompt(skillPromptEntries(entries, entries.filter(s => !s.disableModelInvocation).length))),
  })
  const large = Array.from({ length: 200 }, (_, i): Skill => {
    const source = sdkEntries[i % sdkEntries.length]!
    const name = `synthetic-${String(i + 1).padStart(3, '0')}-${source.name}`
    return { ...source, name, filePath: `/skills/${name}/SKILL.md`, baseDir: `/skills/${name}` }
  })
  return {
    formatter: '@earendil-works/pi-coding-agent formatSkillsForPrompt',
    measure: 'JavaScript string length and UTF-8 bytes; no token or cost estimate',
    locations: 'Stable /skills/<name>/SKILL.md placeholders; descriptions are actual checked-in metadata',
    small: compare(sdkEntries), large: compare(large),
  }
}

export function evaluateSkills() {
  const fixtureText = readFileSync(fixturePath, 'utf8')
  const fixture = JSON.parse(fixtureText) as Fixture
  const catalog = loadSkillCatalog({ roots: [{ path: join(repo, 'skills'), scope: 'builtin' }] })
  const found = catalog.skills.map(s => s.name).sort()
  if (JSON.stringify(found) !== JSON.stringify([...fixture.expectedBuiltinNames].sort())) {
    throw new Error(`Fixture corpus mismatch: expected ${fixture.expectedBuiltinNames.join(', ')}, found ${found.join(', ')}`)
  }
  const cases: CaseResult[] = []
  const run = (item: PositiveCase | NegativeCase, kind: Kind) => {
    const acceptableSkills = 'acceptableSkills' in item ? item.acceptableSkills : []
    const baseline = exactPhraseBaseline(catalog.skills, item.query)
    const current = searchSkills(catalog.skills, item.query, { limit: 5 })
    const currentNames = current.items.map(s => s.name)
    const hit = (names: string[], k: number) => names.slice(0, k).some(name => acceptableSkills.includes(name))
    cases.push({
      ...item, kind, acceptableSkills,
      baseline: { candidates: baseline.slice(0, 5), total: baseline.length, hitAt3: hit(baseline, 3), hitAt5: hit(baseline, 5) },
      current: { candidates: currentNames, total: current.total, hitAt3: hit(currentNames, 3), hitAt5: hit(currentNames, 5) },
    })
  }
  fixture.positiveCases.forEach(item => run(item, 'positive'))
  fixture.negativeCases.forEach(item => run(item, 'negative'))
  fixture.hardNegativeCases.forEach(item => run(item, 'hardNegative'))
  const metrics = (engine: 'baseline' | 'current') => ({
    hitAt3: cases.filter(c => c.kind === 'positive' && c[engine].hitAt3).length,
    hitAt5: cases.filter(c => c.kind === 'positive' && c[engine].hitAt5).length,
    negativeMatchedCases: cases.filter(c => c.kind === 'negative' && c[engine].total > 0).length,
    negativeCandidateCount: cases.filter(c => c.kind === 'negative').reduce((n, c) => n + c[engine].total, 0),
    hardNegativeMatchedCases: cases.filter(c => c.kind === 'hardNegative' && c[engine].total > 0).length,
    hardNegativeCandidateCount: cases.filter(c => c.kind === 'hardNegative').reduce((n, c) => n + c[engine].total, 0),
  })
  const constraints = hardConstraints()
  const failures = cases.filter(c => c.kind === 'positive' ? !c.current.hitAt3 : c.current.total > 0).map(c => c.id)
  failures.push(...constraints.filter(c => !c.passed).map(c => c.id))
  if (catalog.problems.length) failures.push('builtin-discovery-problems')
  return {
    version: 1, scope: fixture.scope,
    corpus: {
      source: 'skills/*/SKILL.md', skills: catalog.skills.length, discoveryProblems: catalog.problems.length,
      metadataSha256: digest(JSON.stringify(catalog.skills.map(({ name, description, tags, invocation }) => ({ name, description, tags, invocation })))),
    },
    fixture: { version: fixture.version, sha256: digest(fixtureText), positive: fixture.positiveCases.length, negative: fixture.negativeCases.length, hardNegative: fixture.hardNegativeCases.length },
    limit: 5, acceptance: 'Every positive must hit@3; ordinary and hard negatives must return zero; all hard constraints must pass',
    metrics: { baseline: metrics('baseline'), current: metrics('current') }, cases,
    hardConstraints: constraints, promptSize: promptSize(catalog.skills), passed: failures.length === 0, failures,
    limitations: [
      'Fixed, hand-labeled metadata fixture; not an estimate of general retrieval accuracy.',
      'No real model selection, instruction following, real-provider behavior, analysis execution, or scientific correctness is evaluated.',
      'Prompt comparison measures only the SDK Skill metadata block, not the complete system prompt or tool schemas.',
    ],
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--json' || !args[1])) throw new Error('Usage: npx tsx scripts/evaluate-skills.ts [--json report.json]')
  const report = evaluateSkills()
  const json = `${JSON.stringify(report, null, 2)}\n`
  if (args[1]) writeFileSync(resolve(args[1]), json)
  process.stdout.write(`${JSON.stringify(report)}\n`)
  if (!report.passed) process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main() } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
