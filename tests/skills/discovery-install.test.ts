import { afterEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { publishSkillPackage } from '../../src/skills/discovery-install'
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'discovery-publish-'))
  roots.push(root)
  const stage = join(root, 'stage'),
    dest = join(root, 'dest')
  mkdirSync(stage)
  writeFileSync(join(stage, 'SKILL.md'), 'complete')
  return { stage, dest }
}
describe('platform package publication contract', () => {
  it('publishes on Windows without precreating the destination that native rename cannot replace', () => {
    const { stage, dest } = fixture()
    let called = false
    publishSkillPackage(stage, dest, 'win32', {
      mkdirSync,
      lstatSync,
      rmdirSync,
      renameSync: (from, to) => {
        called = true
        expect(existsSync(to)).toBe(false)
        renameSync(from, to)
      },
    })
    expect(called).toBe(true)
    expect(readFileSync(join(dest, 'SKILL.md'), 'utf8')).toBe('complete')
  })
  it('preserves a Windows destination created by another writer before native rename', () => {
    const { stage, dest } = fixture()
    mkdirSync(dest)
    writeFileSync(join(dest, 'mine'), 'keep')
    expect(() =>
      publishSkillPackage(stage, dest, 'win32', {
        mkdirSync,
        lstatSync,
        rmdirSync,
        renameSync: (from, to) => {
          if (existsSync(to))
            throw Object.assign(new Error('exists'), { code: 'EEXIST' })
          renameSync(from, to)
        },
      }),
    ).toThrow('exists')
    expect(readFileSync(join(dest, 'mine'), 'utf8')).toBe('keep')
    expect(existsSync(stage)).toBe(true)
  })
  it('reserves a POSIX destination and publishes the complete package atomically', () => {
    const { stage, dest } = fixture()
    publishSkillPackage(stage, dest, 'darwin')
    expect(readFileSync(join(dest, 'SKILL.md'), 'utf8')).toBe('complete')
    expect(existsSync(stage)).toBe(false)
  })
})
