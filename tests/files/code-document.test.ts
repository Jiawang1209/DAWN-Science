import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, symlinkSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import * as browser from '../../src/files/code-document.js'
vi.mock('node:crypto', async original => ({ ...await original<typeof import('node:crypto')>(), randomUUID: () => 'test-exclusive-temp' }))
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() { const root = realpathSync(mkdtempSync(join(tmpdir(), 'dawn-code-'))); roots.push(root); const workspace = join(root, 'workspace'); mkdirSync(workspace); return { root, workspace } }
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

describe('human code documents', () => {
  it('reads complete canonical UTF8 documents beyond preview limit including opened absolute paths', async () => {
    const { root, workspace } = fixture(); const file = join(root, 'opened.py'); const text = '# 你好\r\n' + 'a'.repeat(700_000)
    writeFileSync(file, text); symlinkSync(file, join(workspace, 'alias.py'))
    expect(await browser.readLocalCodeDocument(workspace, 'alias.py')).toEqual({ path: file, text, version: hash(text) })
    expect(await browser.readLocalCodeDocument(workspace, file)).toEqual({ path: file, text, version: hash(text) })
  })
  it('rejects binary, invalid UTF8, oversized and non-file reads without truncation', async () => {
    const { workspace } = fixture(); const file = join(workspace, 'x')
    for (const content of [Buffer.from([0, 1]), Buffer.from([0xff]), Buffer.alloc(1024 * 1024 + 1, 97)]) {
      writeFileSync(file, content); await expect(browser.readLocalCodeDocument(workspace, file)).rejects.toThrow(/UTF|二进制|1 MiB/)
    }
    await expect(browser.readLocalCodeDocument(workspace, workspace)).rejects.toThrow(/普通文件/)
  })
  it('creates workspace drafts only when absent and saves existing opened files by expected hash', async () => {
    const { root, workspace } = fixture(); const text = 'print("你好")\n'
    const first = await browser.saveLocalCodeDocument(workspace, 'new.py', text, null)
    expect(first).toEqual({ path: join(workspace, 'new.py'), version: hash(text), bytes: Buffer.byteLength(text) })
    await expect(browser.saveLocalCodeDocument(workspace, 'new.py', 'overwrite', null)).rejects.toThrow(/冲突/)
    const file = join(root, 'opened.py'); writeFileSync(file, 'old')
    expect(await browser.saveLocalCodeDocument(workspace, file, 'new', hash('old'))).toEqual({ path: file, version: hash('new'), bytes: 3 })
    expect(readFileSync(file, 'utf8')).toBe('new')
    await expect(browser.saveLocalCodeDocument(workspace, file, 'stale', hash('old'))).rejects.toThrow(/冲突/)
    expect(readFileSync(file, 'utf8')).toBe('new')
    expect(readdirSync(root).filter(name => name.includes('.dawn-code-'))).toEqual([])
  })
  it('confines create-only paths, validates existing parent and refuses symlink substitution', async () => {
    const { root, workspace } = fixture(); mkdirSync(join(root, 'outside')); symlinkSync(join(root, 'outside'), join(workspace, 'escape'))
    for (const path of ['../escape.py', join(root, 'absolute.py'), 'escape/x.py', 'missing/x.py']) await expect(browser.saveLocalCodeDocument(workspace, path, 'x', null)).rejects.toThrow()
    const target = join(root, 'target.py'); writeFileSync(target, 'old'); symlinkSync(target, join(workspace, 'link.py'))
    await expect(browser.saveLocalCodeDocument(workspace, 'link.py', 'new', hash('old'))).rejects.toThrow(/符号链接|冲突/)
    expect(readFileSync(target, 'utf8')).toBe('old')
  })
  it('does not unlink an existing sibling when exclusive temporary creation fails', async () => {
    const { workspace } = fixture(); const file = join(workspace, 'x.py'); const collision = join(workspace, '.x.py.dawn-code-test-exclusive-temp')
    writeFileSync(file, 'old'); writeFileSync(collision, 'preserve collision')
    await expect(browser.saveLocalCodeDocument(workspace, file, 'new', hash('old'))).rejects.toThrow()
    expect(readFileSync(collision, 'utf8')).toBe('preserve collision')
    expect(readFileSync(file, 'utf8')).toBe('old')
  })
  it('reports a removed versioned target as a conflict requiring a fresh read', async () => {
    const { workspace } = fixture()
    await expect(browser.saveLocalCodeDocument(workspace, 'gone.py', 'new', hash('old'))).rejects.toBeInstanceOf(browser.CodeDocumentConflict)
  })
  it('serializes competing saves and refuses invalid/oversized text', async () => {
    const { workspace } = fixture(); const file = join(workspace, 'x.py'); writeFileSync(file, 'old')
    const results = await Promise.allSettled(['one', 'two'].map(text => browser.saveLocalCodeDocument(workspace, file, text, hash('old'))))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
    for (const text of ['a'.repeat(1024 * 1024 + 1), '\0', '\ud800']) await expect(browser.saveLocalCodeDocument(workspace, 'invalid.py', text, null)).rejects.toThrow()
  })
})
