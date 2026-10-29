import { afterEach, expect, it } from 'vitest'
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture(kind: 'approved' | 'missing' | 'wrong-primary') {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-pe-icon-')); roots.push(dir)
  const exe = NtExecutable.createEmpty(false, false), resources = NtExecutableResource.from(exe)
  const icons = Data.IconFile.from(readFileSync(resolve('packaging/icon.ico'))).icons.map(icon => icon.data)
  if (kind === 'approved') Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 1, 1033, icons)
  if (kind === 'wrong-primary') {
    const changed = Buffer.from((icons[0] as Data.RawIconItem).bin); changed[changed.length - 1]! ^= 1
    Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 1, 1033, [Data.RawIconItem.from(changed, 16, 16, 32)])
    Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 2, 1033, icons)
  }
  resources.outputResource(exe)
  const file = join(dir, 'DAWN Science.exe'); writeFileSync(file, Buffer.from(exe.generate()))
  return spawnSync(process.execPath, [resolve('scripts/verify-windows-icon.mjs'), file], { encoding: 'utf8', timeout: 10000 })
}
it('accepts the exact RP frames embedded in a Windows executable', () => {
  const result = fixture('approved')
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('[windows-icon] verified')
})
it('rejects an executable without icon resources', () => {
  const result = fixture('missing')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('RP icon mismatch')
})
it('rejects the wrong primary icon even when an additional group contains RP', () => {
  const result = fixture('wrong-primary')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('RP icon mismatch')
})
