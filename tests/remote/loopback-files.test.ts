import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile, chmod, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { Client } from 'ssh2'
import { RemoteExecutor } from '../../src/remote/ssh.js'
import { startLoopbackSsh } from '../helpers/loopback-ssh.js'
import { readRemoteCodeDocument, saveRemoteCodeDocument } from '../../src/remote/code-document.js'
import { createHash } from 'node:crypto'

it('reads and writes Chinese temporary paths over real loopback SFTP on the existing SSH connection', async () => {
  const fixture = await startLoopbackSsh()
  const executor = new RemoteExecutor({ config: fixture, createClient: () => new Client() })
  try {
    await executor.connect()
    await mkdir(join(fixture.workspace, '中文数据'))
    const path = join(fixture.workspace, '中文数据', '样本 结果.txt')
    const text = '共享上下文🌿\n'.repeat(12000)
    await executor.writeFile(path, text)
    expect(await readFile(path, 'utf8')).toBe(text)
    expect((await executor.readFile(path)).toString('utf8')).toBe(text)
    expect(await executor.stat(path)).toMatchObject({ directory: false, size: Buffer.byteLength(text) })
    expect(await executor.realpath('中文数据/样本 结果.txt')).toBe(path)
    await executor.writeFile(path, '截断后的新内容')
    expect((await executor.readFile(path)).toString('utf8')).toBe('截断后的新内容')
    expect(fixture.connections).toBe(1)
  } finally { executor.close(); await fixture.close() }
})

it('rejects absolute and parent escapes, sibling prefix paths and file/directory symlinks without changing external temporary files', async () => {
  const fixture = await startLoopbackSsh()
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'dawn-sftp-outside-')))
  const sibling = `${fixture.workspace}-sibling`
  const executor = new RemoteExecutor({ config: fixture, createClient: () => new Client() })
  try {
    await mkdir(sibling)
    const secret = join(outside, 'temporary-only.txt'), siblingFile = join(sibling, 'temporary-only.txt')
    await writeFile(secret, 'preserve outside fixture')
    await writeFile(siblingFile, 'preserve sibling fixture')
    await symlink(secret, join(fixture.workspace, 'file-link'))
    await symlink(outside, join(fixture.workspace, 'directory-link'))
    await symlink(join(outside, 'missing.txt'), join(fixture.workspace, 'dangling-link'))
    await executor.connect()
    for (const path of [secret, `../${outside.split('/').at(-1)}/temporary-only.txt`, siblingFile, 'file-link', 'directory-link/temporary-only.txt', 'dangling-link']) {
      await expect(executor.readFile(path)).rejects.toThrow()
      await expect(executor.writeFile(path, 'must not escape')).rejects.toThrow()
      await expect(executor.stat(path)).rejects.toThrow()
      await expect(executor.realpath(path)).rejects.toThrow()
    }
    expect(await readFile(secret, 'utf8')).toBe('preserve outside fixture')
    expect(await readFile(siblingFile, 'utf8')).toBe('preserve sibling fixture')
    await expect(readFile(join(outside, 'missing.txt'))).rejects.toThrow()
    await executor.writeFile('still-safe.txt', 'still connected')
    expect(await readFile(join(fixture.workspace, 'still-safe.txt'), 'utf8')).toBe('still connected')
  } finally { executor.close(); await fixture.close(); await rm(outside, { recursive: true, force: true }); await rm(sibling, { recursive: true, force: true }) }
})


it('bounds code reads, creates temps exclusively and reports missing safe replacement support on real SFTP', async () => {
  const fixture = await startLoopbackSsh()
  const executor = new RemoteExecutor({ config: fixture, createClient: () => new Client() })
  try {
    await executor.connect()
    const path = join(fixture.workspace, '代码.py')
    await executor.writeFileExclusive(path, Buffer.from('abcdef'))
    await expect(executor.writeFileExclusive(path, Buffer.from('clobber'))).rejects.toThrow()
    expect((await executor.readFileBounded(path, 3)).toString()).toBe('abcd')
    const temp = join(fixture.workspace, 'temp.py')
    await executor.writeFileExclusive(temp, Buffer.from('new'))
    await expect(executor.replaceFileAtomic(temp, path)).rejects.toThrow(/posix-rename@openssh.com/)
    expect(await readFile(path, 'utf8')).toBe('abcdef')
    expect(await readFile(temp, 'utf8')).toBe('new')
    expect(fixture.connections).toBe(1)
  } finally { executor.close(); await fixture.close() }
})


it('creates a full UTF8 code document over real SFTP and preserves it when atomic replacement is unsupported', async () => {
  const fixture = await startLoopbackSsh()
  const executor = new RemoteExecutor({ config: fixture, createClient: () => new Client() })
  try {
    await executor.connect()
    const path = join(fixture.workspace, '完整代码.py')
    const text = '# 中文🌿\n' + 'x'.repeat(700_000)
    const version = createHash('sha256').update(text).digest('hex')
    expect(await saveRemoteCodeDocument('loopback', executor, path, text, null)).toEqual({ path, bytes: Buffer.byteLength(text), version })
    expect(await readRemoteCodeDocument(executor, path)).toEqual({ path, text, version })
    await expect(saveRemoteCodeDocument('loopback', executor, path, 'new', version)).rejects.toThrow(/posix-rename@openssh.com/)
    expect(await readFile(path, 'utf8')).toBe(text)
    expect(await readdir(fixture.workspace)).toEqual(['完整代码.py'])
    expect(fixture.connections).toBe(1)
  } finally { executor.close(); await fixture.close() }
})


it('refuses an exclusive write when the server cannot restore masked permission bits and removes its temp', async () => {
  const fixture = await startLoopbackSsh({ fileModeChanges: false })
  const executor = new RemoteExecutor({ config: fixture, createClient: () => new Client() })
  try {
    await executor.connect()
    const path = join(fixture.workspace, 'shared.py')
    await writeFile(path, 'old'); await chmod(path, 0o666)
    const old = await readRemoteCodeDocument(executor, path)
    await expect(saveRemoteCodeDocument('mode-denied', executor, path, 'new', old.version)).rejects.toThrow(/权限|permission|unsupported|Unsupported/)
    expect(await readFile(path, 'utf8')).toBe('old')
    expect((await lstat(path)).mode & 0o777).toBe(0o666)
    expect(await readdir(fixture.workspace)).toEqual(['shared.py'])
  } finally { executor.close(); await fixture.close() }
})

it('times out stalled bounded SFTP reads, destroys the stream and releases a queued save', async () => {
  const fixture = await startLoopbackSsh()
  const client = new Client()
  const originalSftp = client.sftp.bind(client)
  const stalled = new PassThrough()
  client.sftp = callback => originalSftp((error, sftp) => {
    if (sftp) {
      const originalRead = sftp.createReadStream.bind(sftp)
      vi.spyOn(sftp, 'createReadStream').mockImplementationOnce(() => stalled as never).mockImplementation(originalRead)
    }
    callback(error, sftp)
  })
  // This deadline applies to the healthy queued read too. Five milliseconds can
  // expire during an ordinary loopback round trip under a full-suite CPU load.
  const executor = new RemoteExecutor({ config: fixture, createClient: () => client, idleTimeoutMs: 100 })
  try {
    await writeFile(join(fixture.workspace, 'queue.py'), 'old')
    await executor.connect()
    const path = join(fixture.workspace, 'queue.py')
    const version = createHash('sha256').update('old').digest('hex')
    const first = saveRemoteCodeDocument('stalled', executor, path, 'first', version).catch(error => error)
    const second = saveRemoteCodeDocument('stalled', executor, path, 'second', version).catch(error => error)
    const result = await Promise.race([first, new Promise(resolve => setTimeout(() => resolve('still pending'), 1000))])
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toMatch(/进展|超时/)
    expect(stalled.destroyed).toBe(true)
    // The fixture deliberately lacks atomic replacement, so a retried save must reach that bounded failure.
    expect((await second).message).toMatch(/posix-rename@openssh.com/)
    expect(await readFile(path, 'utf8')).toBe('old')
    expect(await readdir(fixture.workspace)).toEqual(['queue.py'])
  } finally { stalled.destroy(); executor.close(); await fixture.close() }
})


it('restores exact permission bits masked by umask on the exclusively opened SFTP handle', async () => {
  const fixture = await startLoopbackSsh()
  const executor = new RemoteExecutor({ config: fixture, createClient: () => new Client() })
  try {
    await executor.connect()
    const path = join(fixture.workspace, 'shared.py')
    await executor.writeFileExclusive(path, Buffer.from('shared'), 0o666)
    expect((await lstat(path)).mode & 0o777).toBe(0o666)
    expect(await readFile(path, 'utf8')).toBe('shared')
  } finally { executor.close(); await fixture.close() }
})


it('rejects an acknowledged but ineffective mode change before writing and cleans the owned SFTP file', async () => {
  const fixture = await startLoopbackSsh()
  const client = new Client(), originalSftp = client.sftp.bind(client)
  client.sftp = callback => originalSftp((error, sftp) => {
    if (sftp) sftp.fchmod = (_handle, _mode, done) => done()
    callback(error, sftp)
  })
  const executor = new RemoteExecutor({ config: fixture, createClient: () => client })
  try {
    await executor.connect()
    const path = join(fixture.workspace, 'mode-not-applied.py')
    await expect(executor.writeFileExclusive(path, Buffer.from('new'), 0o666)).rejects.toThrow(/权限.*不一致/)
    expect(await readdir(fixture.workspace)).toEqual([])
  } finally { executor.close(); await fixture.close() }
})


it.each(['OPEN', 'CLOSE'] as const)('bounds a real ssh2 read stalled in %s and releases a queued save before late stream cleanup', async event => {
  const fixture = await startLoopbackSsh({ stallNextFileRequests: event === 'CLOSE' ? ['READ', 'CLOSE'] : ['OPEN'] })
  const executor = new RemoteExecutor({ config: fixture, createClient: () => new Client(), idleTimeoutMs: 20 })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const path = join(fixture.workspace, 'protocol-stall.py')
    await writeFile(path, 'old')
    await executor.connect()
    const version = createHash('sha256').update('old').digest('hex')
    const first = saveRemoteCodeDocument(`protocol-${event}`, executor, path, 'first', version).catch(error => error)
    const second = saveRemoteCodeDocument(`protocol-${event}`, executor, path, 'second', version).catch(error => error)
    const result = await Promise.race([first, new Promise(resolve => { timer = setTimeout(() => resolve('still pending'), 500) })])
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toMatch(/进展|超时/)
    expect((await second).message).toMatch(/posix-rename@openssh.com/)
    expect(await readFile(path, 'utf8')).toBe('old')
    expect(await readdir(fixture.workspace)).toEqual(['protocol-stall.py'])
    fixture.releaseFileRequests()
    // Late OPEN/CLOSE completion must be consumed without changing the failed save result.
    expect((await readRemoteCodeDocument(executor, path)).text).toBe('old')
  } finally {
    clearTimeout(timer)
    fixture.releaseFileRequests()
    executor.close(); await fixture.close()
  }
})

it.each([false, true])('cleans a successful exclusive OPEN after its deadline without removing a pre-existing path (existing=%s)', async existing => {
  const fixture = await startLoopbackSsh({ stallNextFileRequests: ['OPEN'] })
  const client = new Client(), originalSftp = client.sftp.bind(client)
  const closedHandles: Buffer[] = []
  client.sftp = callback => originalSftp((error, sftp) => {
    if (sftp) {
      const originalClose = sftp.close.bind(sftp)
      sftp.close = (handle, done) => { closedHandles.push(handle); originalClose(handle, done) }
    }
    callback(error, sftp)
  })
  const executor = new RemoteExecutor({ config: fixture, createClient: () => client, metadataTimeoutMs: 20 })
  try {
    const path = join(fixture.workspace, '.script.py.dawn-code-owned-temp')
    if (existing) await writeFile(path, 'existing temporary owner')
    await executor.connect()
    await expect(executor.writeFileExclusive(path, Buffer.from('new'))).rejects.toThrow(/超时/)
    fixture.releaseFileRequests()
    if (existing) {
      // A following round trip ensures the late failed OPEN response was processed.
      expect((await executor.lstat(path)).kind).toBe('file')
      expect(await readFile(path, 'utf8')).toBe('existing temporary owner')
      expect(closedHandles).toHaveLength(0)
    } else {
      await expect.poll(() => closedHandles.length).toBe(1)
      await expect.poll(() => readdir(fixture.workspace)).toEqual([])
    }
  } finally { fixture.releaseFileRequests(); executor.close(); await fixture.close() }
})
