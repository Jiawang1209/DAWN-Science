/** Verify the primary PE icon against the approved ICO, without executing Windows binaries. */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit'

const root = resolve(import.meta.dirname, '..')
const expected = Data.IconFile.from(readFileSync(join(root, 'packaging', 'icon.ico')))
const hashes = items => items.map(item => createHash('sha256')
  .update(Buffer.from(item.isRaw() ? item.bin : item.generate())).digest('hex')).sort()
const reference = JSON.stringify(hashes(expected.icons.map(icon => icon.data)))
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const files = process.argv.slice(2)
if (files.length === 0) files.push(
  join(root, 'release', 'win-unpacked', 'DAWN Science.exe'),
  join(root, 'release', `DAWN-Science-${version}-win-${process.arch}.exe`),
  join(root, 'release', `DAWN-Science-${version}-win-${process.arch}-portable.exe`),
)
for (const file of files) {
  const executable = NtExecutable.from(readFileSync(file), { ignoreCert: true })
  const resource = NtExecutableResource.from(executable)
  const group = Resource.IconGroupEntry.fromEntries(resource.entries)[0]
  if (!group || JSON.stringify(hashes(group.getIconItemsFromEntries(resource.entries))) !== reference)
    throw new Error(`RP icon mismatch: ${file}`)
  console.log(`[windows-icon] verified ${expected.icons.length} RP frames: ${file}`)
}
