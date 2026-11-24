import { afterEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LOCAL_TOOLS, LocalToolStateSchema } from '../../src/protocol/local-tools.js'
import { OPERATIONS } from '../../src/protocol/operations.js'
import { commonToolPaths, probeLocalTools, validateLocalToolPath } from '../../src/env/local-tools.js'
import { LocalToolExecution } from '../../src/env/local-tool-execution.js'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
export function fixture() { const root = mkdtempSync(join(tmpdir(), 'dawn-local-tools-')); directories.push(root); return root }
export function executable(root: string, name: string, body = 'echo fake-1.2.3') { const path = join(root, name); writeFileSync(path, `#!/bin/sh\n${body}\n`); chmodSync(path, 0o755); return path }
// Discovery/result assertions need headroom for macOS dyld starting fresh scripts.
// Deadline, cancellation and process-cleanup scenarios set their own budgets below.
const probeFixtures = (options: Parameters<typeof probeLocalTools>[0]) => probeLocalTools({ timeoutMs: 10000, ...options })

describe('local tool protocol', () => {
  it('defines the seven optional tools and strict read/probe/save operations', () => {
    expect(LOCAL_TOOLS.map(tool => tool.id)).toEqual(['uv', 'pixi', 'conda', 'mamba', 'node', 'npm', 'git'])
    expect(LOCAL_TOOLS.every(tool => tool.description && ['environment', 'development'].includes(tool.group))).toBe(true)
    expect(OPERATIONS.getLocalTools.mutating).toBe(false)
    expect(OPERATIONS.probeLocalTools.mutating).toBe(false)
    expect(OPERATIONS.setLocalTool.mutating).toBe(true)
    expect(OPERATIONS.setLocalTool.request.safeParse({ tool: 'python', path: '' }).success).toBe(false)
    expect(LocalToolStateSchema.parse({ paths: {}, tools: [{ id: 'uv', candidates: [] }] })).toEqual({ paths: {}, tools: [{ id: 'uv', candidates: [] }] })
  })
})

describe('local tool discovery and validation', () => {
  it('keeps saved candidates first, deduplicates PATH/common and does not alter selected paths', async () => {
    const root = fixture(), saved = executable(root, 'chosen uv'), path = executable(root, 'uv')
    const paths = { uv: saved }
    const result = await probeFixtures({ paths, env: { PATH: root }, home: root, platform: 'linux' })
    expect(result.paths).toEqual(paths)
    expect(result.tools.find(tool => tool.id === 'uv')?.candidates).toEqual([
      { path: saved, source: 'settings', version: 'fake-1.2.3' }, { path, source: 'PATH', version: 'fake-1.2.3' },
    ])
    expect(result.tools).toHaveLength(7)
    expect(paths).toEqual({ uv: saved })
  })
  it('retains missing saved paths with a problem and reports truly missing optional tools as empty', async () => {
    const root = fixture(), missing = join(root, 'missing')
    const result = await probeFixtures({ paths: { git: missing }, env: { PATH: root }, home: root, platform: 'linux' })
    expect(result.tools.find(tool => tool.id === 'git')?.candidates[0]).toMatchObject({ path: missing, source: 'settings', problem: expect.any(String) })
    expect(result.tools.find(tool => tool.id === 'uv')?.candidates).toEqual([])
  })
  it('bounds version execution with the requested deadline', async () => {
    const root = fixture(), slow = executable(root, 'uv', 'exec /bin/sleep 10')
    const start = Date.now()
    const result = await probeLocalTools({ paths: { uv: slow }, env: { PATH: root }, home: root, platform: 'linux', timeoutMs: 2500 })
    expect(Date.now() - start).toBeLessThan(5000)
    expect(result.tools.find(tool => tool.id === 'uv')?.candidates[0]?.problem).toMatch(/timed out/i)
  })
  it('reports failed tools without losing other results', async () => {
    const root = fixture()
    executable(root, 'git', 'echo broken >&2; exit 9')
    executable(root, 'node', 'echo v22.1')
    // macOS may hold a newly created script in dyld startup for seconds. Test
    // failure isolation separately from the short deadline asserted above.
    const result = await probeLocalTools({ paths: {}, env: { PATH: root }, home: root, platform: 'linux', timeoutMs: 10000 })
    expect(result.tools.find(tool => tool.id === 'git')?.candidates[0]?.problem).toMatch(/broken|9/)
    expect(result.tools.find(tool => tool.id === 'node')?.candidates[0]?.version).toBe('v22.1')
  })
  it('rejects relative, missing, directory and nonexecutable paths, accepting a renamed executable with spaces', async () => {
    const root = fixture(), plain = join(root, 'plain'); writeFileSync(plain, 'hello')
    for (const path of ['uv', join(root, 'missing'), root, plain]) await expect(validateLocalToolPath(path)).rejects.toThrow()
    await expect(validateLocalToolPath(executable(root, 'custom tool'))).resolves.toBeUndefined()
  })
  it('does not execute shell metacharacters in executable paths', async () => {
    const root = fixture(), path = executable(root, "uv $(touch hacked); ' special")
    const result = await probeFixtures({ paths: { uv: path }, env: { PATH: root }, home: root, platform: 'linux' })
    expect(result.tools.find(tool => tool.id === 'uv')?.candidates[0]).toMatchObject({ version: 'fake-1.2.3' })
  })
  it('checks saved npm using the saved Node while candidate discovery keeps the raw PATH', async () => {
    const root = fixture(), node = join(root, 'selected Node with spaces'), npm = join(root, 'selected npm')
    symlinkSync(process.execPath, node)
    writeFileSync(npm, '#!/usr/bin/env node\nconsole.log("npm-with-selected-node")\n', { mode: 0o755 })
    const env = { PATH: root }, paths = { node, npm }, before = { ...process.env }
    const result = await probeFixtures({ paths, env, home: root, platform: 'linux' })
    expect(result.tools.find(tool => tool.id === 'npm')?.candidates[0]).toEqual({ path: npm, source: 'settings', version: 'npm-with-selected-node' })
    expect(result.tools.find(tool => tool.id === 'node')?.candidates.some(candidate => candidate.source === 'PATH')).toBe(false)
    expect(result.tools.flatMap(tool => tool.candidates).every(candidate => !candidate.path.includes('dawn-local-tool-shims-'))).toBe(true)
    expect(result.paths).toEqual(paths)
    expect(env).toEqual({ PATH: root })
    expect(process.env).toEqual(before)
  })
  it('bounds probes even when a script starts a child that keeps stdout open', async () => {
    const root = fixture(), slow = executable(root, 'uv', '/bin/sleep 10')
    const started = Date.now()
    const result = await probeLocalTools({ paths: { uv: slow }, env: { PATH: root }, home: root, platform: 'linux', timeoutMs: 2500 })
    expect(Date.now() - started).toBeLessThan(5000)
    expect(result.tools[0]?.candidates[0]?.problem).toMatch(/timed out/i)
  })
  it('terminates the timed-out probe descendants before they can perform later side effects', async () => {
    const root = fixture(), marker = join(root, 'late-side-effect'), pidFile = join(root, 'child.pid')
    const selected = executable(root, 'uv', `/bin/sh -c '/bin/sleep 4; /usr/bin/touch "${marker}"' </dev/null >/dev/null 2>&1 &\necho $! > "${pidFile}"\nwait`)
    let childPid: number | undefined
    const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
    try {
      const result = await probeLocalTools({ paths: { uv: selected }, env: { PATH: root }, home: root, platform: 'linux', timeoutMs: 2000 })
      expect(result.tools[0]?.candidates[0]?.problem).toMatch(/timed out/i)
      childPid = Number(readFileSync(pidFile, 'utf8').trim())
      await vi.waitFor(() => expect(alive(childPid!)).toBe(false), { timeout: 1000 })
      await new Promise(resolve => setTimeout(resolve, 2500))
      expect(existsSync(marker)).toBe(false)
    } finally { if (childPid && alive(childPid)) try { process.kill(childPid, 'SIGKILL') } catch {} }
  })
  it('terminates descendants on output overflow and reports the output limit rather than a timeout', async () => {
    const root = fixture(), marker = join(root, 'overflow-side-effect'), pidFile = join(root, 'child.pid')
    const selected = executable(root, 'uv', `/bin/sh -c '/bin/sleep 4; /usr/bin/touch "${marker}"' </dev/null >/dev/null 2>&1 &\necho $! > "${pidFile}"\nwhile :; do printf '%s' 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; done`)
    let childPid: number | undefined
    const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
    try {
      const result = await probeLocalTools({ paths: { uv: selected }, env: { PATH: root }, home: root, platform: 'linux', timeoutMs: 10000 })
      childPid = Number(readFileSync(pidFile, 'utf8').trim())
      expect(result.tools[0]?.candidates[0]?.problem).toMatch(/output.*limit/i)
      await vi.waitFor(() => expect(alive(childPid!)).toBe(false), { timeout: 1000 })
      await new Promise(resolve => setTimeout(resolve, 4500))
      expect(existsSync(marker)).toBe(false)
    } finally { if (childPid && alive(childPid)) try { process.kill(childPid, 'SIGKILL') } catch {} }
  })
  it('cleans up descendants left behind by an otherwise successful version command', async () => {
    const root = fixture(), marker = join(root, 'success-side-effect'), pidFile = join(root, 'child.pid')
    const selected = executable(root, 'uv', `/bin/sh -c '/bin/sleep 4; /usr/bin/touch "${marker}"' </dev/null >/dev/null 2>&1 &\necho $! > "${pidFile}"\necho version-success`)
    let childPid: number | undefined
    const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
    try {
      const result = await probeFixtures({ paths: { uv: selected }, env: { PATH: root }, home: root, platform: 'linux' })
      childPid = Number(readFileSync(pidFile, 'utf8').trim())
      expect(result.tools[0]?.candidates[0]?.version).toBe('version-success')
      await vi.waitFor(() => expect(alive(childPid!)).toBe(false), { timeout: 1000 })
      await new Promise(resolve => setTimeout(resolve, 4500))
      expect(existsSync(marker)).toBe(false)
    } finally { if (childPid && alive(childPid)) try { process.kill(childPid, 'SIGKILL') } catch {} }
  })
  it('removes the temporary execution aliases after failed version probes', async () => {
    const root = fixture(), selected = executable(root, 'broken uv', 'exit 9')
    const environments = vi.spyOn(LocalToolExecution.prototype, 'environment')
    try {
      await probeFixtures({ paths: { uv: selected }, env: { PATH: root }, home: root, platform: 'linux' })
      const directory = environments.mock.results[0]?.value?.PATH?.split(':')[0]
      expect(directory).toContain('dawn-local-tool-shims-')
      expect(existsSync(directory!)).toBe(false)
    } finally { environments.mockRestore() }
  })
  it('cancels running probes and prevents queued candidates from launching', async () => {
    const root = fixture(), controller = new AbortController()
    const paths = Object.fromEntries(LOCAL_TOOLS.map(({ id }) => [id, executable(root, `selected-${id}`, `echo started > "${join(root, `started-${id}`)}"\nexec /bin/sleep 10`)]))
    // Exercise cancellation, not the race between four shell startups and the
    // normal version deadline. One running probe is enough to cancel the batch.
    const pending = probeLocalTools({ paths, env: { PATH: root }, home: root, platform: 'linux', timeoutMs: 10000, signal: controller.signal })
    try {
      await vi.waitFor(() => expect(existsSync(join(root, 'started-uv'))).toBe(true), { timeout: 5000 })
      controller.abort()
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      expect(['node', 'npm', 'git'].some(id => existsSync(join(root, `started-${id}`)))).toBe(false)
    } finally { controller.abort(); await pending.catch(() => {}) }
  })
  it('includes typical locations and Windows wrappers without a recursive filesystem scan', () => {
    expect(commonToolPaths('uv', { platform: 'darwin', home: '/home/me', env: {} })).toContain('/opt/homebrew/bin/uv')
    expect(commonToolPaths('pixi', { platform: 'linux', home: '/home/me', env: {} })).toContain('/home/me/.pixi/bin/pixi')
    expect(commonToolPaths('conda', { platform: 'win32', home: 'C:\\Users\\me', env: {} })).toContain('C:\\Users\\me\\miniconda3\\Scripts\\conda.exe')
    expect(commonToolPaths('npm', { platform: 'win32', home: 'C:\\Users\\me', env: { ProgramFiles: 'C:\\Program Files' } })).toContain('C:\\Program Files\\nodejs\\npm.cmd')
  })
})
