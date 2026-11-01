/** Read-only package inspection. Callers must first authorize the discovered manifest. */
import { constants, closeSync, fstatSync, lstatSync, openSync, readdirSync, readSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseFrontmatter } from '@earendil-works/pi-coding-agent'

export const SKILL_TEXT_LIMIT = 1024 * 1024
const ENTRY_LIMIT = 2000, DEPTH_LIMIT = 32

export function normalizeSkillTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  return tags.map(tag => tag.normalize('NFKC').trim()).filter(tag => {
    const key = tag.toLocaleLowerCase()
    if (!tag || seen.has(key)) return false
    seen.add(key); return true
  })
}

export function manifestTags(text: string): string[] {
  try {
    const { frontmatter } = parseFrontmatter<{ tags?: unknown; metadata?: { dawn?: { tags?: unknown } } }>(text)
    const tags = frontmatter.tags ?? frontmatter.metadata?.dawn?.tags
    return normalizeSkillTags(Array.isArray(tags) ? tags.filter((x): x is string => typeof x === 'string') : typeof tags === 'string' ? tags.split(/[,，]/) : [])
  } catch { return [] }
}

function packageRoot(manifest: string): string {
  const path = resolve(manifest), root = dirname(path)
  if (basename(path) !== 'SKILL.md' || lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory() || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) {
    throw new Error('技能目录或 SKILL.md 不是普通文件路径')
  }
  return root
}

function packageFile(root: string, path: string): string {
  // Use portable relative paths on all platforms. Hidden metadata is not package content.
  const parts = path.split('/')
  if (isAbsolute(path) || path.includes('\\') || path.includes('\0') || parts.some(x => !x || x === '..' || x.startsWith('.') || x.includes(':'))) {
    throw new Error('只能读取技能包内的相对文件路径')
  }
  let target = root
  for (const part of parts) {
    target = join(target, part)
    if (lstatSync(target).isSymbolicLink()) throw new Error('技能文件浏览不读取符号链接')
  }
  const rel = relative(realpathSync(root), realpathSync(target))
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('文件不在技能包内')
  return target
}

export function installedFiles(manifest: string): { files: { path: string; bytes: number }[]; notices: string[] } {
  const root = packageRoot(manifest), files: { path: string; bytes: number }[] = [], notices: string[] = []
  let count = 0
  const visit = (directory: string, prefix: string, depth: number) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (++count > ENTRY_LIMIT) { if (!notices.includes('目录条目超过 2000 项，仅显示前面的文件')) notices.push('目录条目超过 2000 项，仅显示前面的文件'); return }
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      const path = prefix + entry.name
      if (entry.isDirectory()) {
        if (depth >= DEPTH_LIMIT) { notices.push(`目录超过 32 层，已省略：${path}`); continue }
        visit(packageFile(root, path), `${path}/`, depth + 1)
      } else if (entry.isFile()) {
        const target = packageFile(root, path)
        files.push({ path, bytes: lstatSync(target).size })
      }
      if (count > ENTRY_LIMIT) return
    }
  }
  visit(root, '', 0)
  return { files: files.sort((a, b) => a.path.localeCompare(b.path, 'en')), notices }
}

export function readInstalledFile(manifest: string, path: string): { path: string; bytes: number; text?: string; notice?: string } {
  const target = packageFile(packageRoot(manifest), path)
  if (!lstatSync(target).isFile()) throw new Error('只能预览普通文件')
  // Nonblocking protects against replacement with a FIFO between lstat and open.
  const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw new Error('只能预览普通文件')
    const result = { path, bytes: stat.size }
    if (stat.size > SKILL_TEXT_LIMIT) return { ...result, notice: '文本超过 1 MiB 预览上限' }
    // A bounded buffer also protects against a file growing between stat and read.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, SKILL_TEXT_LIMIT + 1))
    // readFileSync(fd) could allocate an unbounded buffer for a concurrently growing file.
    const bytes = readSyncBounded(fd, buffer)
    if (bytes > SKILL_TEXT_LIMIT || bytes > stat.size) return { ...result, notice: '文件正在变化，请刷新后重试' }
    const content = buffer.subarray(0, bytes)
    if (content.includes(0)) return { ...result, notice: '二进制文件不提供文本预览' }
    try { return { ...result, text: new TextDecoder('utf-8', { fatal: true }).decode(content) } }
    catch { return { ...result, notice: '文件不是 UTF-8 文本，无法预览' } }
  } finally { closeSync(fd) }
}

function readSyncBounded(fd: number, buffer: Buffer): number {
  let total = 0
  while (total < buffer.length) {
    const got = readSync(fd, buffer, total, buffer.length - total, null)
    if (!got) break
    total += got
  }
  return total
}
