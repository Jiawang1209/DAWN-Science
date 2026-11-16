import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, realpathSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from '../../src/store/schema.js'
import { ProjectStore } from '../../src/store/projects.js'
import { SessionStore } from '../../src/store/sessions.js'
import { RunStore } from '../../src/store/runs.js'
import { ProjectManager } from '../../src/project/manager.js'
import { 科研目录 } from '../../src/policy/science-layout.js'

describe('explicit project creation', () => {
  let parentDirectory: string, db: Database.Database, store: ProjectStore, manager: ProjectManager
  beforeEach(() => {
    parentDirectory = mkdtempSync(join(tmpdir(), 'dawn-create-project-'))
    db = new Database(':memory:'); migrate(db); store = new ProjectStore(db)
    manager = new ProjectManager({ projects: store, sessions: new SessionStore(db), runs: new RunStore(db) })
  })
  afterEach(() => { db.close(); rmSync(parentDirectory, { recursive: true, force: true }) })
  it('creates a named child, persists its display description and opens it idempotently', () => {
    const project = manager.create({ parentDirectory, name: '研究', description: 'Only for display' })
    expect(project.workspace).toBe(join(realpathSync(parentDirectory), '研究'))
    expect(readdirSync(project.workspace)).toEqual([])
    expect(manager.open(project.workspace).projectId).toBe(project.projectId)
    expect(manager.summary(project.projectId)).toMatchObject({ name: '研究', description: 'Only for display', totalSessionCount: 0 })
  })
  it('initializes the existing science layout and editable context without leaking the description', () => {
    const project = manager.create({ parentDirectory, name: 'analysis', description: 'PRIVATE DISPLAY', scienceLayout: true, agentContext: 'Use R. Keep manual comments.' })
    for (const directory of 科研目录) expect(existsSync(join(project.workspace, directory))).toBe(true)
    const context = readFileSync(join(project.workspace, 'AGENTS.md'), 'utf8')
    expect(context).toContain('Use R. Keep manual comments.')
    expect(context).toContain('analysis/scripts/')
    expect(context).not.toContain('PRIVATE DISPLAY')
  })
  it('writes context without creating science folders when layout is disabled', () => {
    const project = manager.create({ parentDirectory, name: 'plain', agentContext: 'Custom conventions.' })
    expect(readdirSync(project.workspace)).toEqual(['AGENTS.md'])
    expect(readFileSync(join(project.workspace, 'AGENTS.md'), 'utf8')).toContain('Custom conventions.')
  })
  it.each(['.', '..', '../escape', '/absolute', 'a/b', 'a\\b', 'CON', 'nul.txt', 'COM1', 'name.', 'a:b', '  ', 'a\nname'])('rejects unsafe folder name %j before creating files', name => {
    expect(() => manager.create({ parentDirectory, name })).toThrow()
    expect(readdirSync(parentDirectory)).toEqual([])
    expect(store.list()).toEqual([])
  })
  it('rejects an existing directory and leaves its files unchanged', () => {
    const target = join(parentDirectory, 'existing'); mkdirSync(target); writeFileSync(join(target, 'AGENTS.md'), 'user instructions')
    expect(() => manager.create({ parentDirectory, name: 'existing', scienceLayout: true, agentContext: 'replacement' })).toThrow(/已存在/)
    expect(readdirSync(target)).toEqual(['AGENTS.md'])
    expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).toBe('user instructions')
  })
  it('rejects an existing symlink and relative or missing parents', () => {
    symlinkSync(parentDirectory, join(parentDirectory, 'alias'), 'dir')
    expect(() => manager.create({ parentDirectory, name: 'alias' })).toThrow(/已存在/)
    expect(() => manager.create({ parentDirectory: 'relative', name: 'project' })).toThrow(/绝对路径/)
    expect(() => manager.create({ parentDirectory: join(parentDirectory, 'missing'), name: 'project' })).toThrow()
    expect(store.list()).toEqual([])
  })
  it('rolls back only this new folder when database insertion fails', () => {
    vi.spyOn(store, 'insert').mockImplementation(() => { throw new Error('database unavailable') })
    expect(() => manager.create({ parentDirectory, name: 'fail', scienceLayout: true, agentContext: 'test' })).toThrow(/database unavailable/)
    expect(readdirSync(parentDirectory)).toEqual([])
  })
  it('preserves unexpected files if rollback encounters concurrent additions', () => {
    vi.spyOn(store, 'insert').mockImplementation(() => { writeFileSync(join(parentDirectory, 'fail', 'keep.txt'), 'external'); throw new Error('database unavailable') })
    expect(() => manager.create({ parentDirectory, name: 'fail' })).toThrow(/残留/)
    expect(readFileSync(join(parentDirectory, 'fail', 'keep.txt'), 'utf8')).toBe('external')
  })
})
