import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { installedFiles, readInstalledFile, manifestTags, normalizeSkillTags } from '../../src/skills/installed.js'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dawn-installed-')); dirs.push(root)
  const pkg = join(root, 'demo'); mkdirSync(join(pkg, 'references'), { recursive: true })
  writeFileSync(join(pkg, 'SKILL.md'), '---\nname: demo\ndescription: Demo\n---\n# Instructions')
  writeFileSync(join(pkg, 'references', 'method.md'), '# Method\n\nNo execution.')
  return { root, pkg, manifest: join(pkg, 'SKILL.md') }
}
describe('installed Skill packages', () => {
  it.skipIf(process.platform === 'win32')('rejects FIFO resources without blocking the desktop main process', () => {
    const { pkg, manifest } = fixture()
    execFileSync('mkfifo', [join(pkg, 'pipe')])
    const module = new URL('../../src/skills/installed.ts', import.meta.url).href
    const code = `import {readInstalledFile} from ${JSON.stringify(module)}; try {readInstalledFile(${JSON.stringify(manifest)}, 'pipe'); process.exit(2)} catch(error) {process.exit(/普通文件/.test(error.message) ? 0 : 3)}`
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { timeout: 5000, killSignal: 'SIGKILL' })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
  })
  it('lists nested resources and reads text without executing scripts', () => {
    const { manifest, pkg } = fixture()
    writeFileSync(join(pkg, 'run.py'), 'raise RuntimeError("never execute")')
    writeFileSync(join(pkg, '.private'), 'hidden')
    expect(installedFiles(manifest).files.map(f => f.path)).toEqual(['references/method.md', 'run.py', 'SKILL.md'])
    expect(readInstalledFile(manifest, 'references/method.md')).toMatchObject({ text: '# Method\n\nNo execution.' })
  })
  it('rejects traversal and package/file symlinks and omits links from inventory', () => {
    const { root, pkg, manifest } = fixture()
    writeFileSync(join(root, 'secret'), 'outside')
    symlinkSync(join(root, 'secret'), join(pkg, 'linked'))
    symlinkSync(root, join(pkg, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    expect(installedFiles(manifest).files.map(f => f.path)).not.toContain('linked')
    for (const path of ['../secret', '/secret', 'references/../../secret', 'escape/secret', 'linked', 'references\\method.md']) {
      expect(() => readInstalledFile(manifest, path)).toThrow()
    }
    symlinkSync(pkg, join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => installedFiles(join(root, 'alias', 'SKILL.md'))).toThrow()
  })
  it('explains binary, non-UTF8 and oversized resources without loading them as text', () => {
    const { pkg, manifest } = fixture()
    writeFileSync(join(pkg, 'binary'), Buffer.from([0, 1, 2]))
    writeFileSync(join(pkg, 'bad-utf8'), Buffer.from([0xff, 0xfe]))
    writeFileSync(join(pkg, 'large.txt'), Buffer.alloc(1024 * 1024 + 1, 65))
    for (const file of ['binary', 'bad-utf8', 'large.txt']) {
      const result = readInstalledFile(manifest, file)
      expect(result.text).toBeUndefined(); expect(result.notice).toBeTruthy()
    }
  })
  it('normalizes package tags from both supported shapes without rewriting the manifest', () => {
    expect(manifestTags('---\ntags: [ Soil, soil, 科研 ]\n---\nBody')).toEqual(['Soil', '科研'])
    expect(manifestTags('---\nmetadata:\n  dawn:\n    tags: [可复现, 数据科学]\n---\nBody')).toEqual(['可复现', '数据科学'])
    expect(normalizeSkillTags([' A ', '', 'a', ' B '])).toEqual(['A', 'B'])
  })
})
