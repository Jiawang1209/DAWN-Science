/** Human editor operations over the existing SFTP connection, with no remote runtime dependency. */
import { posix } from 'node:path'
import { randomUUID } from 'node:crypto'
import { UserFacingError } from '../errors.js'
import { CODE_DOCUMENT_MAX_BYTES, CodeDocumentConflict, codeBytes, codeText, codeVersion, serializeCodeSave } from '../files/code-document.js'
import { missingFile } from './transfer-io.js'

type RemoteStat = { kind: string; size: number; mtime: number; mode?: number }
export interface CodeDocumentExecutor {
  realpath(path: string): Promise<string>
  lstat(path: string): Promise<RemoteStat>
  readFileBounded(path: string, maxBytes: number): Promise<Buffer>
  /** Own the exclusive temporary file; restore exact mode despite umask or fail and clean it up. */
  writeFileExclusive(path: string, data: Buffer, mode?: number): Promise<void>
  replaceFileAtomic(from: string, to: string): Promise<void>
  /** SFTP v3 rename refuses an existing destination. */
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
}
const conflict = () => new CodeDocumentConflict('保存冲突：远端文件已改变、被替换或已经存在，请重新打开后再保存')
const same = (a: RemoteStat, b: RemoteStat) => a.kind === b.kind && a.size === b.size && a.mtime === b.mtime
function absolute(path: string) {
  if (!posix.isAbsolute(path)) throw new UserFacingError('远端代码文件需要绝对路径；请使用当前会话工作目录，不能猜测 SSH 主目录')
  return posix.normalize(path)
}
async function snapshot(executor: CodeDocumentExecutor, path: string) {
  const before = await executor.lstat(path)
  if (before.kind !== 'file') throw new UserFacingError(`${path} 不是普通文件（或路径已被符号链接替换）`)
  if (before.size > CODE_DOCUMENT_MAX_BYTES) throw new UserFacingError('代码文件超过 1 MiB，未读取或保存')
  const bytes = await executor.readFileBounded(path, CODE_DOCUMENT_MAX_BYTES)
  const text = codeText(bytes)
  if (!same(before, await executor.lstat(path)) || await executor.realpath(path) !== path) throw conflict()
  return { text, version: codeVersion(bytes), stat: before }
}
async function versionedSnapshot(executor: CodeDocumentExecutor, path: string) {
  try {
    if ((await executor.lstat(path)).kind !== 'file') throw conflict()
    return await snapshot(executor, path)
  } catch (error) {
    if (missingFile(error)) throw conflict()
    throw error
  }
}
export async function readRemoteCodeDocument(executor: CodeDocumentExecutor, path: string) {
  const canonical = posix.normalize(await executor.realpath(absolute(path)))
  const read = await snapshot(executor, canonical)
  return { path: canonical, text: read.text, version: read.version }
}
export async function saveRemoteCodeDocument(connectionId: string, executor: CodeDocumentExecutor, path: string, text: string, expectedVersion: string | null) {
  const bytes = codeBytes(text)
  const target = absolute(path)
  const parent = posix.normalize(await executor.realpath(posix.dirname(target)))
  const canonical = posix.join(parent, posix.basename(target))
  return serializeCodeSave(`remote:${connectionId}:${canonical}`, async () => {
    if ((await executor.lstat(parent)).kind !== 'directory') throw new UserFacingError('保存代码的父目录不存在或不是目录')
    let original: Awaited<ReturnType<typeof snapshot>> | undefined
    if (expectedVersion === null) {
      try { await executor.lstat(canonical); throw conflict() } catch (error) { if (!missingFile(error)) throw error }
    } else {
      original = await versionedSnapshot(executor, canonical)
      if (original.version !== expectedVersion) throw conflict()
    }
    const temp = posix.join(parent, `.${posix.basename(canonical)}.dawn-code-${randomUUID()}`)
    let tempCreated = false
    try {
      // Exclusive create prevents an existing symlink/file at the temporary name from being followed.
      await executor.writeFileExclusive(temp, bytes, original?.stat.mode === undefined ? 0o600 : original.stat.mode & 0o777)
      tempCreated = true
      if ((await executor.lstat(temp)).size !== bytes.length) throw new UserFacingError('远端临时文件大小与保存内容不一致，未提交')
      if (await executor.realpath(posix.dirname(target)) !== parent || (await executor.lstat(parent)).kind !== 'directory') throw conflict()
      if (original) {
        const current = await versionedSnapshot(executor, canonical)
        if (current.version !== expectedVersion || !same(original.stat, current.stat)) throw conflict()
        // Requires the OpenSSH atomic replacement extension; never unlink the old file as fallback.
        await executor.replaceFileAtomic(temp, canonical)
      } else {
        try { await executor.lstat(canonical); throw conflict() } catch (error) { if (!missingFile(error)) throw error }
        await executor.rename(temp, canonical)
      }
      tempCreated = false
      return { path: canonical, version: codeVersion(bytes), bytes: bytes.length }
    } catch (error) {
      if (tempCreated) {
        try { await executor.unlink(temp) } catch (cleanup) {
          if (!missingFile(cleanup)) throw new UserFacingError(`${String(error)}；临时文件清理失败：${temp}：${String(cleanup)}`)
        }
      }
      throw error
    }
  })
}
