import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  DISCOVERY_LIMITS,
  readArchive,
} from '../../src/skills/discovery-package'
async function zipBytes(
  files: Record<string, string>,
  adjust?: (zip: JSZip) => void,
) {
  const zip = new JSZip()
  for (const [name, text] of Object.entries(files))
    zip.file(`repo/${name}`, text)
  adjust?.(zip)
  return zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
  })
}
function centralEntries(bytes: Buffer) {
  const entries: number[] = []
  for (let pos = 0; pos + 46 < bytes.length; pos++)
    if (bytes.readUInt32LE(pos) === 0x02014b50) entries.push(pos)
  return entries
}
describe('bounded ZIP package decoder', () => {
  it('rejects duplicate central names before JSZip can overwrite them', async () => {
    const bytes = await zipBytes({ 'a.txt': 'one', 'b.txt': 'two' })
    const b = centralEntries(bytes).find(
      (pos) =>
        bytes
          .subarray(pos + 46, pos + 46 + bytes.readUInt16LE(pos + 28))
          .toString() === 'repo/b.txt',
    )!
    const local = bytes.readUInt32LE(b + 42)
    bytes.write('repo/a.txt', b + 46)
    bytes.write('repo/a.txt', local + 30)
    await expect(readArchive(bytes)).rejects.toThrow(/duplicate/i)
  })
  it('rejects oversized declared inflation and excessive metadata before decoding', async () => {
    const bytes = await zipBytes({ 'data.txt': 'small' })
    const pos = centralEntries(bytes).find(
      (pos) => bytes.readUInt32LE(pos + 24) > 0,
    )!
    bytes.writeUInt32LE(DISCOVERY_LIMITS.file + 1, pos + 24)
    await expect(readArchive(bytes)).rejects.toThrow(/size/i)
    await expect(
      readArchive(Buffer.alloc(DISCOVERY_LIMITS.archive + 1)),
    ).rejects.toThrow(/compressed/i)
  })
  it('rejects file/ancestor conflicts instead of preparing an impossible package', async () => {
    const bytes = await zipBytes(
      { 'sample/scripts': 'file', 'sample/SKILL.md': 'body' },
      (zip) =>
        zip.file('repo/sample/scripts/run.py', 'code', {
          createFolders: false,
        }),
    )
    await expect(readArchive(bytes)).rejects.toThrow(
      /ancestor|directory|conflict/i,
    )
  })
  it('rejects unsafe paths on case-insensitive and Windows filesystems', async () => {
    for (const path of [
      'Sample.txt',
      'sample.txt',
      'a/NUL.txt',
      'a/file:stream',
      'a/space /x',
    ]) {
      if (path === 'Sample.txt') continue
      const bytes = await zipBytes({ 'Sample.txt': 'one', [path]: 'two' })
      await expect(readArchive(bytes)).rejects.toThrow()
    }
  })
  it('does not trust falsely small decompressed sizes in ZIP metadata', async () => {
    const bytes = await zipBytes({ 'data.txt': 'x'.repeat(1024 * 1024) })
    const pos = centralEntries(bytes).find(
      (pos) => bytes.readUInt32LE(pos + 24) > 0,
    )!
    bytes.writeUInt32LE(1, pos + 24)
    await expect(readArchive(bytes)).rejects.toThrow(/size|length|content/i)
  })
})
