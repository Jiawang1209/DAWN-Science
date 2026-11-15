import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, parse } from 'node:path'
import * as browser from '../../src/files/browser.js'
import { readFileForPreview, resolveInWorkspace, TEXT_MAX_BYTES } from '../../src/files/access.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'dawn-browser-'))
  roots.push(base)
  const project = join(base, 'project'), sibling = join(base, 'sibling')
  mkdirSync(project); mkdirSync(sibling)
  writeFileSync(join(sibling, 'result.txt'), 'outside result')
  return { base: realpathSync(base), project: realpathSync(project), sibling: realpathSync(sibling) }
}

describe('user file browser', () => {
  it('browses a sibling with canonical location, parent and authoritative project identity', () => {
    const { project, sibling } = fixture()
    const result = browser.browseLocalDirectory(project, '../sibling')
    expect(result).toMatchObject({ path: sibling, parentPath: dirname(sibling), projectPath: project, ignored: 0, omitted: 0 })
    expect(result.entries).toEqual([expect.objectContaining({ name: 'result.txt', kind: 'file', size: 14 })])
    expect(browser.browseLocalDirectory(project, sibling).path).toBe(sibling)
    expect(browser.browseLocalDirectory(project).path).toBe(project)
  })
  it('previews outside files with existing byte bounds while legacy workspace guards still reject them', () => {
    const { project, sibling } = fixture()
    const file = join(sibling, 'result.txt')
    expect(browser.readLocalBrowserFile(project, file)).toMatchObject({ kind: 'text', text: 'outside result' })
    writeFileSync(file, 'a'.repeat(TEXT_MAX_BYTES + 100))
    expect(browser.readLocalBrowserFile(project, file)).toMatchObject({ kind: 'text', truncated: { originalBytes: TEXT_MAX_BYTES + 100, keptBytes: TEXT_MAX_BYTES } })
    expect(() => resolveInWorkspace(project, '../sibling/result.txt')).toThrow(/工作区之外/)
    expect(() => readFileForPreview(project, file)).toThrow(/绝对路径/)
  })
  it('searches from a canonical sibling without following symlink directory loops', async () => {
    const { project, sibling } = fixture()
    mkdirSync(join(sibling, 'nested'))
    writeFileSync(join(sibling, 'nested', 'result-deep.txt'), 'deep')
    symlinkSync(sibling, join(sibling, 'nested', 'loop'))
    const result = await browser.searchLocalBrowserFiles(project, sibling, 'result')
    expect(result.matches.map(x => x.path).sort()).toEqual([join(sibling, 'nested', 'result-deep.txt'), join(sibling, 'result.txt')].sort())
    expect(result.visited).toBe(4)
    expect(result.truncated).toBeUndefined()
  })
  it('reports missing/non-directory paths and refuses nonregular files before reading', () => {
    const { project, sibling } = fixture()
    expect(() => browser.browseLocalDirectory(project, join(sibling, 'missing'))).toThrow()
    expect(() => browser.browseLocalDirectory(project, join(sibling, 'result.txt'))).toThrow(/目录/)
    expect(() => browser.readLocalBrowserFile(project, sibling)).toThrow(/文件/)
    if (process.platform !== 'win32') {
      const fifo = join(sibling, 'named-pipe.txt')
      execFileSync('mkfifo', [fifo])
      expect(() => browser.readLocalBrowserFile(project, fifo)).toThrow(/普通文件/)
    }
  })
  it('canonicalizes symlinks and preserves filesystem root identity', () => {
    const { base, project, sibling } = fixture()
    symlinkSync(sibling, join(base, 'alias'))
    expect(browser.browseLocalDirectory(project, join(base, 'alias')).path).toBe(sibling)
    const root = parse(project).root
    expect(browser.browseLocalDirectory(project, root)).toMatchObject({ path: root, parentPath: null, projectPath: project })
  })
})
