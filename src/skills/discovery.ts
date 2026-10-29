import { createHash, randomUUID } from 'node:crypto'
import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { parse } from 'yaml'
import { loadSkills } from '@earendil-works/pi-coding-agent'
import {
  SkillOriginSchema,
  type SkillSource,
  type SkillCatalog,
  type SkillCandidate,
  type SkillPreview,
  type SkillPreviewFile,
  type SkillInstall,
  type SkillOrigin,
} from '../protocol/skill-discovery.js'
import {
  DISCOVERY_LIMITS as limits,
  readArchive,
  safePackagePath,
  type ArchiveFiles,
} from './discovery-package.js'
import { publishSkillPackage } from './discovery-install.js'
const DEFAULT_SOURCES: SkillSource[] = [
  {
    id: 'anthropic',
    label: 'Anthropic Skills',
    url: 'https://github.com/anthropics/skills/tree/main/skills',
  },
  {
    id: 'openai',
    label: 'OpenAI curated Skills',
    url: 'https://github.com/openai/skills/tree/main/skills/.curated',
  },
]
type Repository = {
  repository: string
  ref: string
  commit: string
  path: string
  originalUrl: string
  files: ArchiveFiles
}
type PreviewState = {
  view: SkillPreview
  files: Map<string, Buffer>
  executablePaths: ReadonlySet<string>
  bytes: number
  expires: number
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
function clone<T>(value: T): T {
  return structuredClone(value)
}
export class SkillDiscoveryService {
  private readonly fetcher: typeof fetch
  private readonly sources: SkillSource[]
  private readonly now: () => number
  private retrievalTail: Promise<void> = Promise.resolve()
  private pendingRetrievals = 0
  private readonly previews = new Map<string, PreviewState>()
  private readonly cache = new Map<
    string,
    { expires: number; catalog: SkillCatalog }
  >()
  constructor(
    options: {
      fetch?: typeof fetch
      sources?: SkillSource[]
      now?: () => number
    } = {},
  ) {
    this.fetcher = options.fetch ?? fetch
    this.sources = clone(options.sources ?? DEFAULT_SOURCES)
    this.now = options.now ?? Date.now
  }
  private async request(url: string, max: number): Promise<Buffer> {
    const target = new URL(url)
    if (
      target.protocol !== 'https:' ||
      !['api.github.com', 'codeload.github.com'].includes(target.hostname) ||
      target.username ||
      target.password ||
      target.port
    )
      throw new Error('Unsupported fetch destination')
    let response: Response
    try {
      response = await this.fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          Accept:
            target.hostname === 'api.github.com'
              ? 'application/vnd.github+json'
              : 'application/zip',
        },
      })
    } catch (error) {
      throw new Error(
        `GitHub network error: ${errorMessage(error)}. Check your connection and retry.`,
      )
    }
    if (!response.ok) {
      await response.body?.cancel()
      const limited = response.status === 403 || response.status === 429
      const resetHeader = response.headers.get('x-ratelimit-reset')
      const resetSeconds =
        resetHeader && /^\d+$/.test(resetHeader) ? Number(resetHeader) : NaN
      const reset = new Date(resetSeconds * 1000)
      const guidance = limited
        ? Number.isFinite(reset.getTime())
          ? `Retry after the rate limit reset at ${reset.toISOString()}; check repository access if restrictions persist.`
          : 'Check repository access and retry after rate limits or access restrictions are resolved.'
        : response.status === 404
          ? 'Verify that the public repository and ref exist, then retry.'
          : 'Retry shortly; check GitHub availability if the failure persists.'
      throw new Error(
        `GitHub ${response.status}${limited ? ' rate limit or access denied' : ''}. ${guidance}`,
      )
    }
    if (Number(response.headers.get('content-length')) > max) {
      await response.body?.cancel()
      throw new Error('Download size limit exceeded')
    }
    if (!response.body) throw new Error('Empty GitHub response')
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.length
        if (size > max) throw new Error('Download size limit exceeded')
        chunks.push(chunk.value)
      }
    } finally {
      await reader.cancel().catch(() => {})
    }
    return Buffer.concat(chunks, size)
  }
  private async json(url: string): Promise<Record<string, unknown>> {
    const data = JSON.parse(
      (await this.request(url, limits.metadata)).toString('utf8'),
    )
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Invalid GitHub metadata')
    return data
  }
  private async repository(
    url: string,
    explicitRef?: string,
    pinnedCommit?: string,
  ): Promise<Repository> {
    if (this.pendingRetrievals >= 8)
      throw new Error(
        'Too many GitHub retrievals; retry after current requests finish',
      )
    this.pendingRetrievals++
    const prior = this.retrievalTail
    let release!: () => void
    this.retrievalTail = new Promise<void>((done) => {
      release = done
    })
    await prior
    try {
      return await this.retrieveRepository(url, explicitRef, pinnedCommit)
    } finally {
      this.pendingRetrievals--
      release()
    }
  }
  private async retrieveRepository(
    url: string,
    explicitRef?: string,
    pinnedCommit?: string,
  ): Promise<Repository> {
    let link: URL
    try {
      link = new URL(url)
    } catch {
      throw new Error('Invalid GitHub URL')
    }
    if (
      link.protocol !== 'https:' ||
      link.hostname !== 'github.com' ||
      link.port ||
      link.username ||
      link.password ||
      link.search ||
      link.hash
    )
      throw new Error(
        'Only HTTPS github.com repository/tree/SKILL.md URLs are supported',
      )
    const components = link.pathname
      .replace(/\/$/, '')
      .split('/')
      .slice(1)
      .map((p) => decodeURIComponent(p))
    const [owner, rawRepo, kind, ...tail] = components
    const repo = rawRepo?.replace(/\.git$/, '')
    if (
      !owner ||
      !repo ||
      ![owner, repo].every(
        (v) => /^[A-Za-z0-9_.-]+$/.test(v) && v !== '.' && v !== '..',
      ) ||
      (kind && kind !== 'tree' && kind !== 'blob')
    )
      throw new Error('Invalid GitHub repository URL')
    const repository = `${owner}/${repo}`,
      api = `https://api.github.com/repos/${repository}`,
      metadata = await this.json(api)
    if (typeof metadata.default_branch !== 'string' || !metadata.default_branch)
      throw new Error('Missing GitHub default branch')
    let ref = explicitRef ?? metadata.default_branch,
      path = ''
    if (
      explicitRef &&
      (!explicitRef.trim() ||
        explicitRef.length > 200 ||
        /[\x00-\x1f\x7f]/.test(explicitRef))
    )
      throw new Error('Invalid explicit ref')
    if (kind) {
      const rest = tail.join('/')
      if (!rest) throw new Error('Missing GitHub ref')
      if (explicitRef) {
        if (rest === explicitRef) path = ''
        else if (rest.startsWith(`${explicitRef}/`))
          path = rest.slice(explicitRef.length + 1)
        else
          throw new Error(
            'Explicit ref does not match URL; use a repository URL and package path',
          )
      } else if (
        rest === metadata.default_branch ||
        rest.startsWith(`${metadata.default_branch}/`)
      ) {
        ref = metadata.default_branch
        path = rest.slice(ref.length).replace(/^\//, '')
      } else if (/^[a-fA-F0-9]{40}(?:\/|$)/.test(rest)) {
        ref = rest.slice(0, 40).toLowerCase()
        path = rest.slice(40).replace(/^\//, '')
      } else
        throw new Error(
          'Ambiguous ref/path: provide an explicit ref (required for non-default refs)',
        )
      if (kind === 'blob') {
        if (!path.endsWith('/SKILL.md') && path !== 'SKILL.md')
          throw new Error('Blob URL must point to SKILL.md')
        path = path === 'SKILL.md' ? '' : path.slice(0, -9)
      }
    }
    safePackagePath(path, true)
    if (pinnedCommit !== undefined && !/^[a-f0-9]{40}$/.test(pinnedCommit))
      throw new Error('Invalid pinned commit')
    const pinned = await this.json(
        `${api}/commits/${encodeURIComponent(pinnedCommit ?? ref)}`,
      ),
      commit = pinned.sha
    if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit))
      throw new Error('GitHub did not return a complete commit SHA')
    if (pinnedCommit !== undefined && commit !== pinnedCommit)
      throw new Error('Pinned commit mismatch in GitHub response')
    const files = await readArchive(
      await this.request(
        `https://codeload.github.com/${repository}/zip/${commit}`,
        limits.archive,
      ),
    )
    return { repository, ref, commit, path, originalUrl: url, files }
  }
  private candidate(
    repo: Repository,
    path: string,
    label: string,
  ): SkillCandidate {
    const manifest = repo.files.get(path ? `${path}/SKILL.md` : 'SKILL.md')
    if (!manifest) throw new Error('Selected package has no SKILL.md')
    const body = manifest.toString('utf8'),
      fallback = basename(path || repo.repository),
      temp = mkdtempSync(join(tmpdir(), 'dawn-skill-check-'))
    let name = fallback,
      description = '',
      issues: string[] = [],
      front: Record<string, unknown> = {}
    try {
      const dir = join(temp, fallback)
      mkdirSync(dir)
      const file = join(dir, 'SKILL.md')
      writeFileSync(file, manifest)
      const loaded = loadSkills({
        cwd: temp,
        agentDir: temp,
        skillPaths: [file],
        includeDefaults: false,
      })
      issues = loaded.diagnostics.map((d) => d.message)
      if (loaded.skills[0]) {
        name = loaded.skills[0].name
        description = loaded.skills[0].description
      } else if (!issues.length)
        issues.push('Invalid SKILL.md format: pi could not load it')
      const normalizedBody = body.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
      const match = normalizedBody.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
      if (match) {
        const parsed: unknown = parse(match[1]!, { maxAliasCount: 0 })
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          front = parsed as Record<string, unknown>
      }
    } catch (error) {
      issues.push(`Invalid frontmatter: ${errorMessage(error)}`)
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64)
      issues.push('Skill name is not a safe installation name')
    const prefix = path ? `${path}/` : '',
      dependencies: string[] = []
    for (const field of ['compatibility', 'dependencies', 'requirements'])
      if (front[field] !== undefined)
        dependencies.push(
          `Declared ${field} (not verified): ${(typeof front[field] === 'string' ? front[field] : JSON.stringify(front[field])).slice(0, 4096)}`,
        )
    for (const [file, data] of repo.files)
      if (
        file.startsWith(prefix) &&
        /(^|\/)(requirements[^/]*\.txt|pyproject\.toml|package\.json|environment\.ya?ml|Cargo\.toml|renv\.lock|DESCRIPTION|Gemfile|go\.mod)$/i.test(
          file.slice(prefix.length),
        )
      ) {
        if (dependencies.length >= 16) {
          dependencies.push(
            'Additional dependency files truncated; dependencies remain unverified',
          )
          break
        }
        const text = data.subarray(0, 4096).toString('utf8')
        dependencies.push(
          `Dependency file ${file.slice(prefix.length)} (not verified): ${text.slice(0, 4096)}${data.length > 4096 ? '\n[truncated]' : ''}`,
        )
      }
    if (!dependencies.length)
      dependencies.push(
        'Unknown: no declared dependency metadata found; runtime not verified',
      )
    const licenseEntry =
      [...repo.files].find(
        ([file]) =>
          file.startsWith(prefix) &&
          /^(license|licence|copying)(\.[^/]*)?$/i.test(
            file.slice(prefix.length),
          ),
      ) ??
      [...repo.files].find(([file]) =>
        /^(license|licence|copying)(\.[^/]*)?$/i.test(file),
      )
    const license =
      typeof front.license === 'string'
        ? front.license.slice(0, 4096)
        : licenseEntry
          ? `${licenseEntry[0]}: ${licenseEntry[1].subarray(0, 4096).toString('utf8')}`
          : 'Unknown: no license metadata found'
    return {
      key: `${repo.repository}@${repo.commit}:${path}`,
      name,
      description,
      sourceLabel: label,
      url: repo.originalUrl,
      repository: repo.repository,
      ref: repo.ref,
      commit: repo.commit,
      path,
      format: issues.length ? 'invalid' : 'valid',
      issues,
      dependencies,
      license,
      runtimeVerification: 'not_verified',
    }
  }
  private catalog(repo: Repository, label: string): SkillCatalog {
    const paths = [...repo.files.keys()]
      .filter((f) => f === 'SKILL.md' || f.endsWith('/SKILL.md'))
      .map((f) => (f === 'SKILL.md' ? '' : f.slice(0, -9)))
      .filter(
        (path) =>
          !repo.path || path === repo.path || path.startsWith(`${repo.path}/`),
      )
      .sort()
    if (paths.length > 1000) throw new Error('Too many Skill manifests')
    const skills: SkillCandidate[] = []
    let metadataBytes = 0
    for (const path of paths) {
      const skill = this.candidate(repo, path, label)
      metadataBytes += Buffer.byteLength(JSON.stringify(skill))
      if (metadataBytes > limits.metadata)
        throw new Error('Skill catalog metadata size limit exceeded')
      skills.push(skill)
    }
    return {
      sources: clone(this.sources),
      searchedSources: [
        { id: repo.repository, label: repo.repository, url: repo.originalUrl },
      ],
      skills,
      problems: [],
    }
  }
  async inspect(url: string, ref?: string): Promise<SkillCatalog> {
    return this.catalog(await this.repository(url, ref), 'GitHub')
  }
  async search(query: string, source?: string): Promise<SkillCatalog> {
    const selected = source
      ? this.sources.filter((s) => s.id === source)
      : this.sources
    if (!selected.length) throw new Error('Unknown Skill source')
    const skills: SkillCandidate[] = [],
      problems: string[] = []
    for (const item of selected) {
      try {
        let cached = this.cache.get(item.id)
        if (!cached || cached.expires <= this.now()) {
          const catalog = this.catalog(
            await this.repository(item.url),
            item.label,
          )
          cached = { catalog, expires: this.now() + 5 * 60 * 1000 }
          this.cache.set(item.id, cached)
          while (this.cache.size > 8)
            this.cache.delete(this.cache.keys().next().value!)
        }
        skills.push(...cached.catalog.skills)
      } catch (error) {
        problems.push(`${item.label}: ${errorMessage(error)}`)
      }
    }
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
    return clone({
      sources: this.sources,
      searchedSources: selected,
      skills: skills.filter((skill) =>
        words.every((word) =>
          `${skill.name} ${skill.description}`.toLowerCase().includes(word),
        ),
      ),
      problems,
    })
  }
  async preview(
    url: string,
    ref?: string,
    path?: string,
    commit?: string,
  ): Promise<SkillPreview> {
    const repo = await this.repository(url, ref, commit)
    let selected = path === undefined ? repo.path : safePackagePath(path, true)
    if (selected.endsWith('/SKILL.md')) selected = selected.slice(0, -9)
    if (!repo.files.has(selected ? `${selected}/SKILL.md` : 'SKILL.md')) {
      if (path !== undefined || repo.path)
        throw new Error('Selected package has no SKILL.md')
      const found = [...repo.files.keys()].filter(
        (f) => f === 'SKILL.md' || f.endsWith('/SKILL.md'),
      )
      if (found.length !== 1) throw new Error('Select a Skill package path')
      selected = found[0] === 'SKILL.md' ? '' : found[0]!.slice(0, -9)
    }
    const skill = this.candidate(repo, selected, 'GitHub'),
      files = new Map<string, Buffer>(),
      prefix = selected ? `${selected}/` : ''
    let bytes = 0
    for (const [file, data] of [...repo.files].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      if (!file.startsWith(prefix)) continue
      const relative = file.slice(prefix.length)
      files.set(relative, data)
      bytes += data.length
    }
    if (bytes > limits.package || files.size > limits.packageFiles)
      throw new Error('Selected package size/file count limit exceeded')
    const executablePaths = new Set(
      [...repo.files.executablePaths]
        .filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length)),
    )
    const digest = createHash('sha256')
    for (const [file, data] of files) {
      digest.update(
        JSON.stringify([
          file,
          data.length,
          executablePaths.has(file) ? 0o700 : 0o600,
        ]),
      )
      digest.update('\0')
      digest.update(data)
    }
    const expires = this.now() + limits.ttl,
      view: SkillPreview = {
        previewId: randomUUID(),
        skill,
        body: files.get('SKILL.md')!.toString('utf8'),
        files: [...files].map(([path, data]) => ({ path, bytes: data.length })),
        packageSha256: digest.digest('hex'),
        expiresAt: new Date(expires).toISOString(),
      }
    this.prune()
    while (
      this.previews.size >= limits.previews ||
      [...this.previews.values()].reduce((sum, p) => sum + p.bytes, 0) + bytes >
        limits.previewBytes
    )
      this.previews.delete(this.previews.keys().next().value!)
    this.previews.set(view.previewId, {
      view,
      files,
      executablePaths,
      bytes,
      expires,
    })
    return clone(view)
  }
  private prune() {
    for (const [id, item] of this.previews)
      if (item.expires <= this.now()) this.previews.delete(id)
  }
  private pinned(id: string): PreviewState {
    this.prune()
    const state = this.previews.get(id)
    if (!state)
      throw new Error('Preview expired or discarded; preview the Skill again')
    return state
  }
  readFile(previewId: string, path: string): SkillPreviewFile {
    safePackagePath(path)
    const bytes = this.pinned(previewId).files.get(path)
    if (!bytes)
      throw new Error('File is outside the selected package or does not exist')
    if (bytes.length > limits.text)
      return {
        path,
        bytes: bytes.length,
        notice: 'File exceeds text preview size limit',
      }
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      return {
        path,
        bytes: bytes.length,
        notice: 'Binary file; text preview unavailable',
      }
    }
    if (text.includes('\0'))
      return {
        path,
        bytes: bytes.length,
        notice: 'Binary file; text preview unavailable',
      }
    return { path, bytes: bytes.length, text }
  }
  discard(previewId: string): void {
    this.previews.delete(previewId)
  }
  async install(
    previewId: string,
    root: string,
    existingNames: readonly string[],
  ): Promise<SkillInstall> {
    const state = this.pinned(previewId),
      { skill } = state.view,
      name = skill.name
    if (skill.format !== 'valid')
      throw new Error('Invalid Skill format; installation refused')
    if (
      existingNames.some(
        (value) => value.normalize('NFC').toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error('Skill name collision: already exists')
    const requested = resolve(root)
    mkdirSync(requested, { recursive: true })
    if (lstatSync(requested).isSymbolicLink())
      throw new Error('Skill root must not be a symbolic link')
    const base = realpathSync(requested)
    const dest = join(base, name)
    if (existsSync(dest)) {
      throw new Error('Skill destination already exists')
    }
    try {
      lstatSync(dest)
      throw new Error('Skill destination already exists')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const origin: SkillOrigin = {
      provider: 'github',
      repository: skill.repository,
      sourceUrl: skill.url,
      ref: skill.ref,
      commit: skill.commit,
      path: skill.path,
      packageSha256: state.view.packageSha256,
      installedAt: new Date(this.now()).toISOString(),
      runtimeVerification: 'not_verified',
    }
    const stage = mkdtempSync(join(dirname(base), '.dawn-skill-stage-')),
      packageDir = join(stage, name)
    try {
      mkdirSync(packageDir)
      for (const [file, bytes] of state.files) {
        const target = join(packageDir, file)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, bytes, {
          flag: 'wx',
          mode: state.executablePaths.has(file) ? 0o700 : 0o600,
        })
      }
      writeFileSync(
        join(packageDir, '.dawn-source.json'),
        JSON.stringify(origin, null, 2) + '\n',
        { flag: 'wx', mode: 0o600 },
      )
      publishSkillPackage(packageDir, dest)
      return { name, dest, origin }
    } finally {
      rmSync(stage, { recursive: true, force: true })
    }
  }
  origin(filePath: string): SkillOrigin | undefined {
    try {
      const target = resolve(filePath)
      if (
        basename(target) !== 'SKILL.md' ||
        lstatSync(target).isSymbolicLink() ||
        lstatSync(dirname(target)).isSymbolicLink()
      )
        return undefined
      const file = join(dirname(target), '.dawn-source.json')
      if (!lstatSync(file).isFile()) return undefined
      const fd = openSync(
        file,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      )
      try {
        const stat = fstatSync(fd)
        if (!stat.isFile() || stat.size > 16384) return undefined
        // Read at most one byte past the budget, even if another process grows the file.
        const bytes = Buffer.alloc(16385)
        let size = 0
        while (size < bytes.length) {
          const count = readSync(fd, bytes, size, bytes.length - size, null)
          if (count === 0) break
          size += count
        }
        if (size > 16384) return undefined
        const raw: unknown = JSON.parse(
          bytes.subarray(0, size).toString('utf8'),
        )
        const parsed = SkillOriginSchema.safeParse(raw)
        return parsed.success ? parsed.data : undefined
      } finally {
        closeSync(fd)
      }
    } catch {
      return undefined
    }
  }
}
