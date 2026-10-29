import { afterEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  existsSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SkillDiscoveryService } from '../../src/skills/discovery'
const sha = 'a'.repeat(40)
const body =
  '---\nname: sample\ndescription: Scientific sample workflow\ncompatibility: Requires Python 3\nlicense: MIT\n---\n# Sample\nRun scripts/main.py\n'
const roots: string[] = []
function root() {
  const dir = mkdtempSync(join(tmpdir(), 'discovery-test-'))
  roots.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of roots.splice(0))
    rmSync(dir, { recursive: true, force: true })
})
async function fixture(
  files: Record<string, string | Buffer> = {
    'skills/sample/SKILL.md': body,
    'skills/sample/scripts/main.py': 'print("sample")',
    'skills/sample/requirements.txt': 'numpy>=2\n',
    'skills/other/SKILL.md': body.replaceAll('sample', 'other'),
  },
  adjust?: (zip: JSZip) => void,
) {
  const zip = new JSZip()
  for (const [path, text] of Object.entries(files))
    zip.file(`repo-${sha}/${path}`, text)
  adjust?.(zip)
  const bytes = await zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
  })
  const calls: string[] = []
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    expect(init?.redirect).toBe('error')
    if (url === 'https://api.github.com/repos/acme/repo')
      return Response.json({ default_branch: 'main' })
    if (url.startsWith('https://api.github.com/repos/acme/repo/commits/'))
      return Response.json({ sha })
    if (url === `https://codeload.github.com/acme/repo/zip/${sha}`)
      return new Response(new Uint8Array(bytes))
    return new Response('missing', { status: 404 })
  }
  return {
    service: new SkillDiscoveryService({
      fetch: fetcher as typeof fetch,
      sources: [
        { id: 'test', label: 'Test', url: 'https://github.com/acme/repo' },
      ],
    }),
    calls,
    fetcher,
  }
}
describe('pinned Skill discovery', () => {
  it('inspects repo, tree and SKILL.md links using complete commit archives', async () => {
    const { service, calls } = await fixture()
    for (const url of [
      'https://github.com/acme/repo',
      'https://github.com/acme/repo/tree/main/skills/sample',
      'https://github.com/acme/repo/blob/main/skills/sample/SKILL.md',
    ]) {
      const result = await service.inspect(url)
      expect(result.problems).toEqual([])
      expect(result.skills[0]).toMatchObject({
        name: expect.any(String),
        commit: sha,
        format: 'valid',
        runtimeVerification: 'not_verified',
      })
    }
    expect(
      calls.every(
        (url) =>
          url.startsWith('https://api.github.com/') ||
          url.startsWith('https://codeload.github.com/'),
      ),
    ).toBe(true)
  })
  it('preserves selected package and installs only pinned preview files without fetching', async () => {
    const { service, calls } = await fixture()
    const preview = await service.preview(
      'https://github.com/acme/repo',
      undefined,
      'skills/sample',
    )
    expect(preview.files.map((f) => f.path)).toEqual([
      'SKILL.md',
      'requirements.txt',
      'scripts/main.py',
    ])
    expect(preview.skill.dependencies.join(' ')).toContain('Python 3')
    expect(preview.skill.dependencies.join(' ')).toContain('numpy>=2')
    expect(preview.skill.license).toBe('MIT')
    expect(
      service.readFile(preview.previewId, 'scripts/main.py'),
    ).toMatchObject({ text: 'print("sample")' })
    const before = calls.length
    const dest = root()
    const installed = await service.install(preview.previewId, dest, [])
    expect(calls).toHaveLength(before)
    expect(readFileSync(join(installed.dest, 'scripts/main.py'), 'utf8')).toBe(
      'print("sample")',
    )
    expect(service.origin(join(installed.dest, 'SKILL.md'))).toEqual(
      installed.origin,
    )
    expect(installed.origin.packageSha256).toBe(preview.packageSha256)
  })
  it('resolves explicit slash refs and rejects ambiguous or invalid links', async () => {
    const { service, calls } = await fixture()
    await service.inspect(
      'https://github.com/acme/repo/tree/feature/science/skills/sample',
      'feature/science',
    )
    expect(calls).toContain(
      'https://api.github.com/repos/acme/repo/commits/feature%2Fscience',
    )
    for (const url of [
      'https://evil.example/acme/repo',
      'http://github.com/acme/repo',
      'https://github.com/acme/repo/issues/2',
      'https://github.com/acme/repo/tree/feature/science/skills/sample',
    ])
      await expect(service.inspect(url)).rejects.toThrow()
  })
  it('reports malformed manifests and refuses installation', async () => {
    const { service } = await fixture({
      'broken/SKILL.md': '---\nname: broken\n---\nMissing description',
    })
    const catalog = await service.inspect('https://github.com/acme/repo')
    expect(catalog.skills[0]!.format).toBe('invalid')
    const preview = await service.preview(
      'https://github.com/acme/repo',
      undefined,
      'broken',
    )
    await expect(
      service.install(preview.previewId, root(), []),
    ).rejects.toThrow(/format|invalid/i)
  })
  it('enforces preview lifetime, discard and selected-file boundaries', async () => {
    let now = 1000
    const { fetcher } = await fixture()
    const service = new SkillDiscoveryService({
      fetch: fetcher as typeof fetch,
      now: () => now,
    })
    const p = await service.preview(
      'https://github.com/acme/repo',
      undefined,
      'skills/sample',
    )
    for (const path of [
      '../other/SKILL.md',
      '/SKILL.md',
      'scripts/../../SKILL.md',
      'missing',
    ])
      expect(() => service.readFile(p.previewId, path)).toThrow()
    now += 16 * 60 * 1000
    expect(() => service.readFile(p.previewId, 'SKILL.md')).toThrow(/expir/i)
    const second = await service.preview(
      'https://github.com/acme/repo',
      undefined,
      'skills/sample',
    )
    service.discard(second.previewId)
    expect(() => service.readFile(second.previewId, 'SKILL.md')).toThrow()
  })
  it('refuses runtime name collisions and any existing destination including symlinks', async () => {
    const { service } = await fixture()
    const p = await service.preview(
      'https://github.com/acme/repo',
      undefined,
      'skills/sample',
    )
    const dest = root()
    await expect(
      service.install(p.previewId, dest, ['sample']),
    ).rejects.toThrow(/exist|conflict|collision/i)
    mkdirSync(join(dest, 'sample'))
    writeFileSync(join(dest, 'sample', 'mine'), 'keep')
    await expect(service.install(p.previewId, dest, [])).rejects.toThrow()
    expect(readFileSync(join(dest, 'sample', 'mine'), 'utf8')).toBe('keep')
    rmSync(join(dest, 'sample'), { recursive: true })
    symlinkSync(root(), join(dest, 'sample'))
    await expect(service.install(p.previewId, dest, [])).rejects.toThrow()
  })
  it('returns bounded binary notices and validates origin metadata without following links', async () => {
    const { service } = await fixture({
      'sample/SKILL.md': body,
      'sample/assets/data.bin': Buffer.from([0, 255, 3]),
    })
    const p = await service.preview(
      'https://github.com/acme/repo',
      undefined,
      'sample',
    )
    expect(service.readFile(p.previewId, 'assets/data.bin')).toMatchObject({
      notice: expect.stringMatching(/binary/i),
    })
    const dest = root()
    const installed = await service.install(p.previewId, dest, [])
    const meta = join(installed.dest, '.dawn-source.json')
    writeFileSync(meta, '{}')
    expect(service.origin(join(installed.dest, 'SKILL.md'))).toBeUndefined()
    rmSync(meta)
    const elsewhere = join(root(), 'source.json')
    writeFileSync(elsewhere, JSON.stringify(installed.origin))
    symlinkSync(elsewhere, meta)
    expect(service.origin(join(installed.dest, 'SKILL.md'))).toBeUndefined()
  })
  it('searches name and description with source errors visible and cache refresh', async () => {
    const { service, calls } = await fixture()
    expect((await service.search('scientific')).skills).toHaveLength(2)
    const before = calls.length
    expect((await service.search('sample', 'test')).skills).toHaveLength(1)
    expect(calls).toHaveLength(before)
    const failing = new SkillDiscoveryService({
      fetch: (async () =>
        new Response('rate limit', { status: 403 })) as typeof fetch,
      sources: [
        { id: 'test', label: 'Broken', url: 'https://github.com/acme/repo' },
      ],
    })
    expect((await failing.search('')).problems.join(' ')).toMatch(/403|rate/i)
  })
  it('rejects traversal, links, reserved origin files, submodules and oversized manifests', async () => {
    for (const [name, text, adjust] of [
      ['sample/../bad/SKILL.md', body, undefined],
      ['sample/.dawn-source.json', '{}', undefined],
      ['.gitmodules', '[submodule "x"]', undefined],
      ['sample/SKILL.md', 'x'.repeat(256 * 1024 + 1), undefined],
      [
        'sample/SKILL.md',
        body,
        (zip: JSZip) =>
          zip.file(`repo-${sha}/sample/link`, '../outside', {
            unixPermissions: 0o120777,
          }),
      ],
    ] as const) {
      const { service } = await fixture({ [name]: text }, adjust)
      await expect(
        service.inspect('https://github.com/acme/repo'),
      ).rejects.toThrow()
    }
  })
})

describe('discovery storage and retrieval limits', () => {
  it('keeps pinned bytes immutable when callers edit preview objects and evicts older previews', async () => {
    const { service } = await fixture()
    const preview = await service.preview(
      'https://github.com/acme/repo',
      undefined,
      'skills/sample',
    )
    preview.skill.name = 'changed'
    preview.files[0]!.path = '../changed'
    preview.body = 'changed'
    const installed = await service.install(preview.previewId, root(), [])
    expect(installed.name).toBe('sample')
    expect(readFileSync(join(installed.dest, 'SKILL.md'), 'utf8')).toBe(body)
    for (let i = 0; i < 12; i++)
      await service.preview(
        'https://github.com/acme/repo',
        undefined,
        'skills/sample',
      )
    expect(() => service.readFile(preview.previewId, 'SKILL.md')).toThrow(
      /expir|discard/i,
    )
  })
  it('returns partial source results, isolates cache responses and refreshes after five minutes', async () => {
    let now = 0
    const { fetcher, calls } = await fixture()
    const service = new SkillDiscoveryService({
      fetch: fetcher as typeof fetch,
      now: () => now,
      sources: [
        { id: 'good', label: 'Good', url: 'https://github.com/acme/repo' },
        { id: 'bad', label: 'Bad', url: 'https://github.com/no/repo' },
      ],
    })
    const result = await service.search('')
    expect(result.skills).toHaveLength(2)
    expect(result.problems.join('')).toMatch(/Bad.*404/)
    result.skills[0]!.name = 'changed'
    const before = calls.length
    expect((await service.search('changed', 'good')).skills).toHaveLength(0)
    expect(calls).toHaveLength(before)
    now += 6 * 60 * 1000
    await service.search('', 'good')
    expect(calls.length).toBeGreaterThan(before)
  })
  it('bounds text previews and selected package bytes without executing any imported file', async () => {
    const { service } = await fixture({
      'sample/SKILL.md': body,
      'sample/large.txt': 'x'.repeat(256 * 1024 + 1),
      'sample/scripts/do-not-run.js': 'throw new Error("must not execute")',
    })
    const preview = await service.preview(
      'https://github.com/acme/repo',
      undefined,
      'sample',
    )
    expect(service.readFile(preview.previewId, 'large.txt')).toMatchObject({
      notice: expect.stringMatching(/limit/),
    })
    expect(
      service.readFile(preview.previewId, 'scripts/do-not-run.js').text,
    ).toContain('must not execute')
    const huge = await fixture({
      'sample/SKILL.md': body,
      'sample/a': 'a'.repeat(6 * 1024 * 1024),
      'sample/b': 'b'.repeat(6 * 1024 * 1024),
      'sample/c': 'c'.repeat(6 * 1024 * 1024),
    })
    await expect(
      huge.service.preview('https://github.com/acme/repo', undefined, 'sample'),
    ).rejects.toThrow(/package size/i)
  })
  it('bounds metadata and archive download streams and rejects incomplete commit identifiers', async () => {
    const oversized = new SkillDiscoveryService({
      fetch: (async () =>
        new Response('metadata', {
          headers: { 'content-length': String(1024 * 1024 + 1) },
        })) as typeof fetch,
    })
    await expect(
      oversized.inspect('https://github.com/acme/repo'),
    ).rejects.toThrow(/size limit/i)
    const invalid = new SkillDiscoveryService({
      fetch: (async (input) =>
        String(input).endsWith('/commits/main')
          ? Response.json({ sha: 'abc' })
          : Response.json({ default_branch: 'main' })) as typeof fetch,
    })
    await expect(
      invalid.inspect('https://github.com/acme/repo'),
    ).rejects.toThrow(/complete commit/i)
    const stream = new SkillDiscoveryService({
      fetch: (async () =>
        new Response(new Uint8Array(1024 * 1024 + 1))) as typeof fetch,
    })
    await expect(
      stream.inspect('https://github.com/acme/repo'),
    ).rejects.toThrow(/size limit/i)
  })
  it('rejects expired installs, root symlinks and oversized origin sidecars', async () => {
    let now = 0
    const { fetcher } = await fixture()
    const service = new SkillDiscoveryService({
      fetch: fetcher as typeof fetch,
      now: () => now,
    })
    const preview = await service.preview(
      'https://github.com/acme/repo',
      undefined,
      'skills/sample',
    )
    const dest = root()
    const installed = await service.install(preview.previewId, dest, [])
    writeFileSync(join(installed.dest, '.dawn-source.json'), 'x'.repeat(16385))
    expect(service.origin(join(installed.dest, 'SKILL.md'))).toBeUndefined()
    const link = join(root(), 'link')
    symlinkSync(root(), link)
    await expect(service.install(preview.previewId, link, [])).rejects.toThrow(
      /symbolic link/i,
    )
    now += 16 * 60 * 1000
    const empty = root()
    await expect(service.install(preview.previewId, empty, [])).rejects.toThrow(
      /expired/i,
    )
    expect(existsSync(join(empty, 'sample'))).toBe(false)
  })
  it('refuses malformed YAML and pi name diagnostics instead of implying runtime validity', async () => {
    for (const manifest of [
      '---\nname: [\ndescription: broken\n---\ntext',
      body.replace('name: sample', 'name: Invalid_Name'),
    ]) {
      const { service } = await fixture({ 'sample/SKILL.md': manifest })
      const result = await service.inspect('https://github.com/acme/repo')
      expect(result.skills[0]).toMatchObject({
        format: 'invalid',
        runtimeVerification: 'not_verified',
      })
      expect(result.skills[0]!.issues.length).toBeGreaterThan(0)
    }
  })
})

describe('concurrent retrieval resource budgets', () => {
  it('serializes bounded repository retrievals so parallel requests cannot inflate unbounded archives', async () => {
    const { fetcher } = await fixture()
    let active = 0,
      maximum = 0
    const service = new SkillDiscoveryService({
      fetch: (async (input, init) => {
        active++
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        try {
          return await fetcher(input, init)
        } finally {
          active--
        }
      }) as typeof fetch,
    })
    const results = await Promise.all([
      service.inspect('https://github.com/acme/repo'),
      service.inspect('https://github.com/acme/repo'),
      service.inspect('https://github.com/acme/repo'),
    ])
    expect(results.every((result) => result.skills.length === 2)).toBe(true)
    expect(maximum).toBe(1)
  })
})

describe('catalog to preview commit pinning', () => {
  it('previews the selected catalog commit after the upstream branch moves and retains source ref', async () => {
    const { fetcher, calls } = await fixture()
    let moved = false
    const service = new SkillDiscoveryService({
      sources: [
        { id: 'test', label: 'Test', url: 'https://github.com/acme/repo' },
      ],
      fetch: (async (input, init) =>
        moved && String(input).endsWith('/commits/main')
          ? Response.json({ sha: 'b'.repeat(40) })
          : fetcher(input, init)) as typeof fetch,
    })
    const selected = (await service.search('sample')).skills[0]!
    moved = true
    const preview = await service.preview(
      selected.url,
      selected.ref,
      selected.path,
      selected.commit,
    )
    expect(preview.skill).toMatchObject({
      commit: sha,
      ref: 'main',
      url: 'https://github.com/acme/repo',
    })
    expect(calls).toContain(
      `https://api.github.com/repos/acme/repo/commits/${sha}`,
    )
    const installed = await service.install(preview.previewId, root(), [])
    expect(installed.origin).toMatchObject({
      sourceUrl: selected.url,
      ref: 'main',
      commit: sha,
    })
  })
  it('rejects requested/returned pinned commit mismatches', async () => {
    const { service } = await fixture()
    await expect(
      service.preview(
        'https://github.com/acme/repo',
        'main',
        'skills/sample',
        'b'.repeat(40),
      ),
    ).rejects.toThrow(/commit.*match|mismatch/i)
  })
})

describe('bounded catalog metadata', () => {
  it('bounds dependency excerpts and reports truncation instead of retaining unbounded manifests', async () => {
    const files: Record<string, string> = {
      'sample/SKILL.md': body.replace('Requires Python 3', 'x'.repeat(10000)),
    }
    for (let i = 0; i < 40; i++)
      files[`sample/requirements-${i}.txt`] = 'x'.repeat(5000)
    const { service } = await fixture(files)
    const skill = (await service.inspect('https://github.com/acme/repo'))
      .skills[0]!
    expect(skill.dependencies.length).toBeLessThanOrEqual(17)
    expect(skill.dependencies.join('').length).toBeLessThan(70 * 1024)
    expect(skill.dependencies.join('')).toContain('truncated')
  })
})

describe('reported discovery scope', () => {
  it('reports only attempted sources while retaining all available source choices', async () => {
    const { fetcher } = await fixture()
    const sources = [
      { id: 'good', label: 'Good', url: 'https://github.com/acme/repo' },
      { id: 'bad', label: 'Bad', url: 'https://github.com/no/repo' },
    ]
    const service = new SkillDiscoveryService({
      fetch: fetcher as typeof fetch,
      sources,
    })
    const filtered = await service.search('', 'good')
    expect(filtered.sources).toEqual(sources)
    expect(filtered.searchedSources).toEqual([sources[0]])
    const failed = await service.search('', 'bad')
    expect(failed.searchedSources).toEqual([sources[1]])
    expect(failed.problems).toHaveLength(1)
    expect((await service.search('')).searchedSources).toEqual(sources)
  })
  it('reports an arbitrary inspected link as the sole attempted repository', async () => {
    const { service } = await fixture()
    const url = 'https://github.com/acme/repo/tree/main/skills/sample'
    const catalog = await service.inspect(url)
    expect(catalog.searchedSources).toEqual([
      { id: 'acme/repo', label: 'acme/repo', url },
    ])
    expect(catalog.sources).toEqual([
      { id: 'test', label: 'Test', url: 'https://github.com/acme/repo' },
    ])
  })
})

describe('actionable GitHub failures', () => {
  it('formats rate limit reset timestamps and gives retry guidance for network failures', async () => {
    const reset = 1800000000
    const limited = new SkillDiscoveryService({
      fetch: (async () =>
        new Response('limited', {
          status: 429,
          headers: { 'x-ratelimit-reset': String(reset) },
        })) as typeof fetch,
    })
    await expect(
      limited.inspect('https://github.com/acme/repo'),
    ).rejects.toThrow(
      new RegExp(`retry.*${new Date(reset * 1000).toISOString()}`, 'i'),
    )
    const offline = new SkillDiscoveryService({
      fetch: (async () => {
        throw new Error('offline')
      }) as typeof fetch,
    })
    await expect(
      offline.inspect('https://github.com/acme/repo'),
    ).rejects.toThrow(/network.*retry/i)
  })
  it('does not present an expired cached catalog as fresh after a failed refresh', async () => {
    let now = 0
    let failed = false
    const { fetcher } = await fixture()
    const service = new SkillDiscoveryService({
      now: () => now,
      sources: [
        { id: 'test', label: 'Test', url: 'https://github.com/acme/repo' },
      ],
      fetch: (async (input, init) =>
        failed
          ? new Response('denied', { status: 403 })
          : fetcher(input, init)) as typeof fetch,
    })
    expect((await service.search('')).skills).toHaveLength(2)
    now += 6 * 60 * 1000
    failed = true
    const result = await service.search('')
    expect(result.skills).toEqual([])
    expect(result.problems.join(' ')).toMatch(/access.*retry|retry.*access/i)
  })
})

describe('package permissions and normalized frontmatter', () => {
  it('preserves declared executable scripts with owner-only safe permissions and includes mode in the pinned hash', async () => {
    const files = {
      'sample/SKILL.md': body,
      'sample/scripts/run.sh': '#!/bin/sh\nprintf "must not run"\n',
    }
    const executable = await fixture(files, (zip) => {
      zip.file(
        `repo-${sha}/sample/scripts/run.sh`,
        files['sample/scripts/run.sh'],
        { unixPermissions: 0o107755 },
      )
    })
    const ordinary = await fixture(files)
    const preview = await executable.service.preview(
      'https://github.com/acme/repo',
      undefined,
      'sample',
    )
    const plain = await ordinary.service.preview(
      'https://github.com/acme/repo',
      undefined,
      'sample',
    )
    expect(preview.packageSha256).not.toBe(plain.packageSha256)
    const installed = await executable.service.install(
      preview.previewId,
      root(),
      [],
    )
    if (process.platform !== 'win32') {
      expect(
        statSync(join(installed.dest, 'scripts/run.sh')).mode & 0o7777,
      ).toBe(0o700)
      expect(statSync(join(installed.dest, 'SKILL.md')).mode & 0o7777).toBe(
        0o600,
      )
    }
    expect(readFileSync(join(installed.dest, 'scripts/run.sh'), 'utf8')).toBe(
      files['sample/scripts/run.sh'],
    )
  })
  it('retains compatibility and license metadata for BOM and CR-only manifests accepted by pi', async () => {
    const manifest = '\uFEFF' + body.replaceAll('\n', '\r')
    const { service } = await fixture({ 'sample/SKILL.md': manifest })
    const skill = (await service.inspect('https://github.com/acme/repo'))
      .skills[0]!
    expect(skill.format).toBe('valid')
    expect(skill.dependencies.join(' ')).toContain('Requires Python 3')
    expect(skill.license).toBe('MIT')
  })
})
