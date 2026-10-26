import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { Client } from 'ssh2'
import { RemoteExecutor } from '../../src/remote/ssh.js'
import { startLoopbackSsh } from '../helpers/loopback-ssh.js'

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
