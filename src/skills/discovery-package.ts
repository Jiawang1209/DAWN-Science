import JSZip from 'jszip'
import { Readable } from 'node:stream'

export const DISCOVERY_LIMITS = {
  archive: 24 * 1024 * 1024,
  unpacked: 64 * 1024 * 1024,
  file: 8 * 1024 * 1024,
  files: 10000,
  manifest: 256 * 1024,
  package: 16 * 1024 * 1024,
  packageFiles: 1000,
  text: 256 * 1024,
  metadata: 1024 * 1024,
  previewBytes: 64 * 1024 * 1024,
  previews: 12,
  ttl: 15 * 60 * 1000,
} as const
export function safePackagePath(path: string, allowEmpty = false): string {
  if (allowEmpty && path === '') return path
  if (
    !path ||
    path.length > 1000 ||
    path.includes('\\') ||
    /[\x00-\x1f\x7f:]/.test(path) ||
    path.startsWith('/') ||
    path
      .split('/')
      .some(
        (p) =>
          !p ||
          p === '.' ||
          p === '..' ||
          p.endsWith('.') ||
          p.endsWith(' ') ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
      )
  )
    throw new Error('Unsafe package path')
  return path
}
// Inspect the central directory before inflation: JSZip otherwise normalizes traversal,
// collapses duplicate names, and may allocate arbitrarily large decompressed buffers.
export type ArchiveFiles = Map<string, Buffer> & {
  readonly executablePaths: ReadonlySet<string>
}

export async function readArchive(bytes: Buffer): Promise<ArchiveFiles> {
  if (bytes.length > DISCOVERY_LIMITS.archive)
    throw new Error('Archive compressed size limit exceeded')
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('Invalid ZIP directory')
  const count = bytes.readUInt16LE(eocd + 10),
    size = bytes.readUInt32LE(eocd + 12),
    offset = bytes.readUInt32LE(eocd + 16)
  if (
    bytes.readUInt16LE(eocd + 4) ||
    bytes.readUInt16LE(eocd + 6) ||
    count === 65535 ||
    count > DISCOVERY_LIMITS.files ||
    size > 2 * DISCOVERY_LIMITS.metadata ||
    offset + size !== eocd
  )
    throw new Error('Unsupported or oversized ZIP directory')
  const entries = new Map<
    string,
    { size: number; dir: boolean; executable: boolean }
  >()
  const portableNames = new Set<string>()
  let pos = offset,
    total = 0
  for (let i = 0; i < count; i++) {
    if (pos + 46 > eocd || bytes.readUInt32LE(pos) !== 0x02014b50)
      throw new Error('Invalid ZIP entry')
    const flags = bytes.readUInt16LE(pos + 8),
      method = bytes.readUInt16LE(pos + 10),
      packed = bytes.readUInt32LE(pos + 20),
      length = bytes.readUInt32LE(pos + 24),
      nameLen = bytes.readUInt16LE(pos + 28),
      extraLen = bytes.readUInt16LE(pos + 30),
      commentLen = bytes.readUInt16LE(pos + 32),
      attrs = bytes.readUInt32LE(pos + 38),
      local = bytes.readUInt32LE(pos + 42)
    if (pos + 46 + nameLen + extraLen + commentLen > eocd)
      throw new Error('Invalid ZIP entry bounds')
    const raw = bytes.subarray(pos + 46, pos + 46 + nameLen).toString('utf8'),
      dir = raw.endsWith('/'),
      name = safePackagePath(dir ? raw.slice(0, -1) : raw),
      type = (attrs >>> 16) & 0o170000
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      (type && type !== (dir ? 0o040000 : 0o100000)) ||
      attrs & 0x400 ||
      length > DISCOVERY_LIMITS.file ||
      packed > DISCOVERY_LIMITS.archive ||
      local + 30 > offset ||
      bytes.readUInt32LE(local) !== 0x04034b50
    )
      throw new Error('Unsupported ZIP link/type or file size')
    const localNameLen = bytes.readUInt16LE(local + 26),
      localExtra = bytes.readUInt16LE(local + 28)
    if (
      bytes.subarray(local + 30, local + 30 + localNameLen).toString('utf8') !==
        raw ||
      local + 30 + localNameLen + localExtra + packed > offset
    )
      throw new Error('ZIP local entry mismatch')
    const portable = name.normalize('NFC').toLowerCase()
    if (portableNames.has(portable))
      throw new Error('Duplicate normalized ZIP path')
    portableNames.add(portable)
    entries.set(raw, {
      size: length,
      dir,
      executable:
        bytes.readUInt16LE(pos + 4) >>> 8 === 3 &&
        Boolean((attrs >>> 16) & 0o111),
    })
    total += length
    if (total > DISCOVERY_LIMITS.unpacked)
      throw new Error('Archive uncompressed size limit exceeded')
    pos += 46 + nameLen + extraLen + commentLen
  }
  if (pos !== eocd) throw new Error('Invalid ZIP directory size')
  const fileNames = new Set(
    [...entries]
      .filter(([, entry]) => !entry.dir)
      .map(([name]) => name.normalize('NFC').toLowerCase()),
  )
  for (const name of entries.keys()) {
    const parts = name.replace(/\/$/, '').split('/')
    for (let i = 1; i < parts.length; i++)
      if (
        fileNames.has(
          parts.slice(0, i).join('/').normalize('NFC').toLowerCase(),
        )
      )
        throw new Error('ZIP file/ancestor directory conflict')
  }
  const zip = await JSZip.loadAsync(bytes),
    executablePaths = new Set<string>(),
    out: ArchiveFiles = Object.assign(new Map<string, Buffer>(), {
      executablePaths,
    })
  let prefix: string | undefined
  for (const [name, entry] of Object.entries(zip.files)) {
    const declared = entries.get(name)
    if (!declared || (!entry.dir && entry.unsafeOriginalName !== name))
      throw new Error('Unsafe normalized ZIP path')
    const parts = name.split('/')
    prefix ??= parts[0]
    if (parts[0] !== prefix)
      throw new Error('Archive requires a single repository root')
    if (entry.dir) continue
    const path = safePackagePath(parts.slice(1).join('/'))
    if (path.split('/').includes('.dawn-source.json'))
      throw new Error('Reserved origin metadata in source')
    if (path === '.gitmodules' || path.endsWith('/.gitmodules'))
      throw new Error('Submodules are unsupported')
    if (path.endsWith('SKILL.md') && declared.size > DISCOVERY_LIMITS.manifest)
      throw new Error('SKILL.md size limit exceeded')
    const stream = new Readable().wrap(entry.nodeStream('nodebuffer')),
      chunks: Buffer[] = []
    let actual = 0
    for await (const chunk of stream) {
      const data = Buffer.from(chunk)
      actual += data.length
      if (actual > declared.size || actual > DISCOVERY_LIMITS.file)
        throw new Error('ZIP decompressed size limit exceeded')
      chunks.push(data)
    }
    if (actual !== declared.size)
      throw new Error('ZIP decompressed size mismatch')
    out.set(path, Buffer.concat(chunks, actual))
    if (declared.executable) executablePaths.add(path)
  }
  return out
}
