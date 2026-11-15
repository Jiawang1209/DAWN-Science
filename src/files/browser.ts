/** Human-operated filesystem browsing. Agent/workspace APIs retain their own path guard. */
import { realpathSync, statSync, readFileSync, openSync, readSync, closeSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { UserFacingError } from '../errors.js'
import { listDirectory, 分类预览 } from './access.js'
import { 搜文件名 } from './search.js'

const wirePath = (path: string) => path.split(sep).join('/')

function canonicalPath(workspace: string, path: string): string {
  try { return realpathSync(resolve(workspace, path || '.')) }
  catch { throw new UserFacingError(`找不到或读不了：${path || workspace}`) }
}

export function resolveLocalBrowserFile(workspace: string, path: string): string {
  const file = canonicalPath(workspace, path)
  if (!statSync(file).isFile()) throw new UserFacingError(`${path} 不是普通文件`)
  return file
}

function localDirectory(workspace: string, path: string): string {
  const dir = canonicalPath(workspace, path)
  if (!statSync(dir).isDirectory()) throw new UserFacingError(`${path} 不是目录`)
  return dir
}

export function browseLocalDirectory(workspace: string, path = '') {
  const dir = localDirectory(workspace, path)
  const projectPath = localDirectory(workspace, '')
  const listing = listDirectory(dir)
  const parent = dirname(dir)
  return { ...listing, path: wirePath(dir), parentPath: parent === dir ? null : wirePath(parent), projectPath: wirePath(projectPath) }
}

export function readLocalBrowserFile(workspace: string, path: string) {
  const file = resolveLocalBrowserFile(workspace, path)
  // Browser paths are canonical filesystem locations, including files directly under a root.
  // Share classification and its byte caps without repurposing a parent directory as a workspace.
  return 分类预览(file, statSync(file).size, maxBytes => {
    if (maxBytes === undefined) return readFileSync(file)
    const fd = openSync(file, 'r')
    try {
      const buffer = Buffer.alloc(maxBytes)
      const count = readSync(fd, buffer, 0, maxBytes, 0)
      return buffer.subarray(0, count)
    } finally { closeSync(fd) }
  })
}

export async function searchLocalBrowserFiles(workspace: string, path: string, query: string) {
  const root = wirePath(localDirectory(workspace, path))
  return 搜文件名(async dir => {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.map(entry => ({ name: entry.name, kind: entry.isDirectory() ? 'dir' as const : 'file' as const, symlink: entry.isSymbolicLink() }))
  }, root, query)
}
