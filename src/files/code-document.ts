/** Complete human-operated UTF8 documents; never used by agent tool registries. */
import { createHash, randomUUID } from 'node:crypto'
import { constants, type Stats } from 'node:fs'
import { open, realpath, lstat, link, rename, unlink } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { UserFacingError } from '../errors.js'

export const CODE_DOCUMENT_MAX_BYTES = 1024 * 1024
export const codeVersion = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
export function codeText(bytes: Buffer): string {
  if (bytes.length > CODE_DOCUMENT_MAX_BYTES) throw new UserFacingError('代码文件超过 1 MiB，未读取或保存')
  if (bytes.some(byte => byte === 0 || (byte < 32 && ![9, 10, 12, 13].includes(byte)))) throw new UserFacingError('二进制文件不能作为代码编辑')
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { throw new UserFacingError('代码文件必须是有效 UTF-8 文本') }
}
export function codeBytes(text: string): Buffer {
  const bytes = Buffer.from(text, 'utf8')
  if (codeText(bytes) !== text) throw new UserFacingError('代码必须是有效 UTF-8 文本')
  return bytes
}
export class CodeDocumentConflict extends UserFacingError {}
const conflict = () => new CodeDocumentConflict('保存冲突：文件已改变、被替换或已经存在，请重新打开后再保存')
const sameFile = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
const queues = new Map<string, Promise<unknown>>()
/** One queue per canonical target, shared across owners/backend instances. */
export async function serializeCodeSave<T>(key: string, save: () => Promise<T>): Promise<T> {
  const prior = queues.get(key) ?? Promise.resolve()
  const next = prior.catch(() => {}).then(save)
  queues.set(key, next)
  try { return await next } finally { if (queues.get(key) === next) queues.delete(key) }
}
async function localSnapshot(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await handle.stat()
    if (!before.isFile()) throw new UserFacingError(`${path} 不是普通文件`)
    if (before.size > CODE_DOCUMENT_MAX_BYTES) throw new UserFacingError('代码文件超过 1 MiB，未读取或保存')
    const buffer = Buffer.alloc(CODE_DOCUMENT_MAX_BYTES + 1)
    let count = 0
    while (count < buffer.length) {
      const read = await handle.read(buffer, count, buffer.length - count, count)
      if (!read.bytesRead) break
      count += read.bytesRead
    }
    const bytes = buffer.subarray(0, count)
    const text = codeText(bytes)
    const after = await handle.stat()
    if (!sameFile(before, after) || !sameFile(after, await lstat(path))) throw conflict()
    return { text, version: codeVersion(bytes), stat: after }
  } finally { await handle.close() }
}
async function versionedLocalSnapshot(path: string) {
  try {
    if (!(await lstat(path)).isFile()) throw conflict()
    return await localSnapshot(path)
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '')) throw conflict()
    throw error
  }
}
export async function readLocalCodeDocument(workspace: string, path: string) {
  const canonical = await realpath(resolve(workspace, path))
  const snapshot = await localSnapshot(canonical)
  return { path: canonical.split(sep).join('/'), text: snapshot.text, version: snapshot.version }
}
export async function saveLocalCodeDocument(workspace: string, path: string, text: string, expectedVersion: string | null) {
  const bytes = codeBytes(text)
  const target = resolve(workspace, path)
  const parent = await realpath(dirname(target))
  if (expectedVersion === null) {
    const root = await realpath(workspace)
    const child = relative(root, join(parent, basename(target)))
    if (isAbsolute(path) || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) throw new UserFacingError('新代码文件必须保存在工作区内的相对路径，父目录须已存在')
  }
  const canonical = join(parent, basename(target))
  return serializeCodeSave(`local:${canonical}`, async () => {
    const parentStat = await lstat(parent)
    let original: Awaited<ReturnType<typeof localSnapshot>> | undefined
    if (expectedVersion === null) {
      try { await lstat(canonical); throw conflict() } catch (error) { if (!missing(error)) throw error }
    } else {
      original = await versionedLocalSnapshot(canonical)
      if (original.version !== expectedVersion) throw conflict()
    }
    const temp = join(parent, `.${basename(canonical)}.dawn-code-${randomUUID()}`)
    let tempCreated = false
    try {
      const handle = await open(temp, 'wx', original ? original.stat.mode & 0o777 : 0o600)
      tempCreated = true
      try { if (original) await handle.chmod(original.stat.mode & 0o777); await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
      // Directory timestamps change when creating our temp; identity and realpath must remain stable.
      const afterTempParent = await lstat(parent)
      if (parentStat.dev !== afterTempParent.dev || parentStat.ino !== afterTempParent.ino || await realpath(dirname(target)) !== parent) throw conflict()
      if (original) {
        const current = await versionedLocalSnapshot(canonical)
        if (current.version !== expectedVersion || !sameFile(original.stat, current.stat)) throw conflict()
        await rename(temp, canonical)
      } else {
        // link is atomic create-only; unlike rename it never replaces a concurrent creator.
        try { await link(temp, canonical) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw conflict(); throw error }
      }
      return { path: canonical.split(sep).join('/'), version: codeVersion(bytes), bytes: bytes.length }
    } finally { if (tempCreated) await unlink(temp).catch(error => { if (!missing(error)) throw error }) }
  })
}
