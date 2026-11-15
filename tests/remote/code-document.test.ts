import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, realpath, lstat, rename, unlink, readdir, rm, symlink, chmod, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import * as documents from '../../src/remote/code-document.js'
import { CodeDocumentConflict } from '../../src/files/code-document.js'
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dawn-remote-code-'))); roots.push(root)
  const executor = {
    realpath,
    async lstat(path: string) { const st = await lstat(path); return { kind: st.isFile() ? 'file' : st.isDirectory() ? 'directory' : 'other', size: st.size, mtime: st.mtimeMs, mode: st.mode } },
    readFileBounded: vi.fn(async (path: string, max: number) => (await readFile(path)).subarray(0, max + 1)),
    writeFileExclusive: vi.fn(async (path: string, data: Buffer, mode?: number) => { const handle = await open(path, 'wx', 0o600); try { await handle.chmod(mode ?? 0o600); await handle.writeFile(data) } finally { await handle.close() } }),
    replaceFileAtomic: vi.fn(rename),
    rename: vi.fn(async (from: string, to: string) => { try { await lstat(to) } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return rename(from, to); throw e }; throw Object.assign(new Error('exists'), { code: 'EEXIST' }) }),
    unlink: vi.fn(unlink),
  }
  return { root, executor }
}
describe('remote human code documents', () => {
  it('reads complete canonical text, validates bytes and rejects special/oversized files before downloading', async () => {
    const { root, executor } = await fixture(); const file = join(root, 'x.py'); const text = '你好\n' + 'x'.repeat(700_000); await writeFile(file, text)
    expect(await documents.readRemoteCodeDocument(executor, file)).toEqual({ path: file, text, version: hash(text) })
    await writeFile(file, Buffer.from([0xff])); await expect(documents.readRemoteCodeDocument(executor, file)).rejects.toThrow(/UTF/)
    executor.readFileBounded.mockClear(); await writeFile(file, Buffer.alloc(1024 * 1024 + 1)); await expect(documents.readRemoteCodeDocument(executor, file)).rejects.toThrow(/1 MiB/)
    await expect(documents.readRemoteCodeDocument(executor, root)).rejects.toThrow(/普通文件/)
    expect(executor.readFileBounded).not.toHaveBeenCalled()
  })
  it('creates and atomically replaces with versions, keeps a concurrent winner and cleans temp files', async () => {
    const { root, executor } = await fixture(); const file = join(root, 'new.py')
    expect(await documents.saveRemoteCodeDocument('c', executor, file, 'old', null)).toEqual({ path: file, version: hash('old'), bytes: 3 })
    await expect(documents.saveRemoteCodeDocument('c', executor, file, 'clobber', null)).rejects.toThrow(/冲突/)
    const results = await Promise.allSettled(['one', 'two'].map(text => documents.saveRemoteCodeDocument('c', executor, file, text, hash('old'))))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
    expect(executor.replaceFileAtomic).toHaveBeenCalledTimes(1)
    expect(await readdir(root)).toEqual(['new.py'])
  })
  it('preserves executable permission bits when replacing a remote script', async () => {
    const { root, executor } = await fixture(); const file = join(root, 'run.py')
    await writeFile(file, 'old', { mode: 0o755 })
    await documents.saveRemoteCodeDocument('c', executor, file, 'new', hash('old'))
    expect((await lstat(file)).mode & 0o777).toBe(0o755)
  })
  it('preserves permission bits masked by the process umask when replacing a remote script', async () => {
    const { root, executor } = await fixture(); const file = join(root, 'shared.py')
    await writeFile(file, 'old'); await chmod(file, 0o666)
    await documents.saveRemoteCodeDocument('c', executor, file, 'new', hash('old'))
    expect((await lstat(file)).mode & 0o777).toBe(0o666)
  })
  it('refuses relative remote paths and symlink replacement and detects writes during upload', async () => {
    const { root, executor } = await fixture(); const file = join(root, 'x.py'); await writeFile(file, 'old'); await symlink(file, join(root, 'link.py'))
    await expect(documents.saveRemoteCodeDocument('c', executor, 'draft.py', 'x', null)).rejects.toThrow(/绝对路径/)
    await expect(documents.saveRemoteCodeDocument('c', executor, join(root, 'link.py'), 'x', hash('old'))).rejects.toThrow(/冲突|符号链接/)
    executor.writeFileExclusive.mockImplementationOnce(async (temp, data) => { await writeFile(temp, data, { flag: 'wx' }); await writeFile(file, 'external') })
    await expect(documents.saveRemoteCodeDocument('c', executor, file, 'mine', hash('old'))).rejects.toThrow(/冲突/)
    expect(await readFile(file, 'utf8')).toBe('external')
    expect(executor.replaceFileAtomic).not.toHaveBeenCalled()
    expect((await readdir(root)).sort()).toEqual(['link.py', 'x.py'])
  })
  it('reports a removed or symlink-substituted versioned target as a conflict', async () => {
    const { root, executor } = await fixture(); const file = join(root, 'x.py')
    await expect(documents.saveRemoteCodeDocument('c', executor, file, 'mine', hash('old'))).rejects.toBeInstanceOf(CodeDocumentConflict)
    await writeFile(file, 'old'); await symlink(file, join(root, 'link.py'))
    await expect(documents.saveRemoteCodeDocument('c', executor, join(root, 'link.py'), 'mine', hash('old'))).rejects.toBeInstanceOf(CodeDocumentConflict)
  })
  it('never removes an existing temporary name when exclusive creation refuses it', async () => {
    const { root, executor } = await fixture(); const file = join(root, 'x.py'); await writeFile(file, 'old')
    let collision = ''
    executor.writeFileExclusive.mockImplementationOnce(async path => {
      collision = path
      await writeFile(path, 'existing temporary owner')
      throw Object.assign(new Error('already exists'), { code: 'EEXIST' })
    })
    await expect(documents.saveRemoteCodeDocument('c', executor, file, 'mine', hash('old'))).rejects.toThrow(/already exists/)
    expect(await readFile(collision, 'utf8')).toBe('existing temporary owner')
    expect(executor.unlink).not.toHaveBeenCalled()
  })
  it('surfaces unsupported safe replacement and cleanup failures without deleting the original', async () => {
    const { root, executor } = await fixture(); const file = join(root, 'x.py'); await writeFile(file, 'old')
    executor.replaceFileAtomic.mockRejectedValueOnce(new Error('SSH server lacks posix-rename@openssh.com'))
    await expect(documents.saveRemoteCodeDocument('c', executor, file, 'mine', hash('old'))).rejects.toThrow(/posix-rename/)
    expect(await readFile(file, 'utf8')).toBe('old'); expect(await readdir(root)).toEqual(['x.py'])
    executor.replaceFileAtomic.mockRejectedValueOnce(new Error('permission denied'))
    executor.unlink.mockRejectedValueOnce(new Error('cleanup denied'))
    await expect(documents.saveRemoteCodeDocument('c', executor, file, 'mine', hash('old'))).rejects.toThrow(/permission denied.*cleanup denied/)
  })
})
