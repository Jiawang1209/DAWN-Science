/** Optional local tools: bounded discovery only; never installs or selects a tool. */
import { access, stat } from 'node:fs/promises'
import { existsSync, constants } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, win32 } from 'node:path'
import { LOCAL_TOOLS, type LocalToolCandidate, type LocalToolId, type LocalToolPaths, type LocalToolState } from '../protocol/local-tools.js'
import { LocalToolExecution } from './local-tool-execution.js'
import { killOwnedProcessTree } from '../runtime/process-tree.js'

export interface LocalToolProbeOptions {
  paths: LocalToolPaths
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  home?: string
  timeoutMs?: number
  signal?: AbortSignal
}
export const LOCAL_TOOL_TIMEOUT_MS = 3000
const MAX_CANDIDATES = 12
const CONCURRENCY = 4
const MAX_VERSION_OUTPUT = 32 * 1024
const executableNames = (id: LocalToolId, platform: NodeJS.Platform) => platform === 'win32' ? [`${id}.exe`, `${id}.cmd`, `${id}.bat`, id] : [id]

export function commonToolPaths(id: LocalToolId, options: { platform: NodeJS.Platform; home: string; env: NodeJS.ProcessEnv }): string[] {
  const { platform, home, env } = options
  const path = platform === 'win32' ? win32 : { join }
  const directories = platform === 'win32' ? [
    path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'), path.join(home, '.pixi', 'bin'),
    ...['miniconda3', 'anaconda3', 'mambaforge', 'miniforge3'].flatMap(name => [path.join(home, name, 'Scripts'), path.join(home, name, 'condabin'), path.join(home, name, 'Library', 'bin')]),
    path.join(env.ProgramFiles ?? 'C:\\Program Files', 'nodejs'), path.join(env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'cmd'),
    ...(env.APPDATA ? [path.join(env.APPDATA, 'npm')] : []),
    ...(env.LOCALAPPDATA ? [path.join(env.LOCALAPPDATA, 'Programs', 'nodejs'), path.join(env.LOCALAPPDATA, 'Programs', 'Git', 'cmd')] : []),
  ] : [
    path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'), path.join(home, '.pixi', 'bin'),
    ...['miniconda3', 'anaconda3', 'mambaforge', 'miniforge3'].flatMap(name => [path.join(home, name, 'bin'), path.join(home, name, 'condabin')]),
    '/usr/local/bin', '/usr/bin', ...(platform === 'darwin' ? ['/opt/homebrew/bin', '/opt/miniconda3/bin', '/opt/anaconda3/bin'] : ['/opt/conda/bin']),
  ]
  return directories.flatMap(directory => executableNames(id, platform).map(name => path.join(directory, name)))
}

/** Static validation happens before persistence. Never invokes a shell or resolves a relative command. */
export async function validateLocalToolPath(path: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  if (!(platform === 'win32' ? win32.isAbsolute(path) : isAbsolute(path)) || /[\0\r\n]/.test(path)) throw new Error('Tool path must be an absolute executable path')
  const information = await stat(path)
  if (!information.isFile()) throw new Error('Tool path must point to a file')
  if (platform === 'win32' && !/\.(exe|com|cmd|bat)$/i.test(path)) throw new Error('Windows tool must be an .exe, .com, .cmd or .bat file')
  await access(path, platform === 'win32' ? constants.F_OK : constants.X_OK)
}

/** Windows batch files require cmd.exe. Expand the path from an environment variable once,
 * keeping percent signs and shell metacharacters inside the quoted executable path. */
export function versionInvocation(path: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): { command: string; args: string[]; env: NodeJS.ProcessEnv; windowsVerbatimArguments?: boolean } {
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(path)) return {
    command: env.ComSpec ?? env.COMSPEC ?? 'cmd.exe', args: ['/d', '/v:off', '/s', '/c', '""%DAWN_TOOL_VERSION_EXECUTABLE%" --version"'],
    env: { ...env, DAWN_TOOL_VERSION_EXECUTABLE: path }, windowsVerbatimArguments: true,
  }
  return { command: path, args: ['--version'], env }
}

async function version(path: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv, timeoutMs: number, signal?: AbortSignal): Promise<{ version?: string; problem?: string }> {
  if (signal?.aborted) return { problem: 'Version check cancelled' }
  try { await validateLocalToolPath(path, platform) } catch (error) { return { problem: error instanceof Error ? error.message : String(error) } }
  // Filesystem validation yields: shutdown may have started before it finished.
  if (signal?.aborted) return { problem: 'Version check cancelled' }
  const invocation = versionInvocation(path, platform, env)
  return new Promise(resolve => {
    // Own the deadline/output budget rather than execFile's direct-child-only kills.
    // POSIX children get a private process group; Windows cleanup uses taskkill /T.
    const child = spawn(invocation.command, invocation.args, {
      env: invocation.env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true, ...(invocation.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    })
    let settled = false, bytes = 0
    const stdout: Buffer[] = [], stderr: Buffer[] = []
    const finish = (result: { version?: string; problem?: string }) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      signal?.removeEventListener('abort', cancel)
      // Snapshot/kill descendants while the timed-out or overflowing root is still
      // alive. Resolving first would lose ancestry and let children run after probe.
      killOwnedProcessTree(child)
      child.stdout.destroy(); child.stderr.destroy()
      resolve(result)
    }
    const deadline = setTimeout(() => finish({ problem: `Version check timed out after ${timeoutMs} ms` }), timeoutMs)
    const cancel = () => finish({ problem: 'Version check cancelled' })
    const collect = (target: Buffer[]) => (data: Buffer) => {
      if (settled) return
      bytes += data.length
      if (bytes > MAX_VERSION_OUTPUT) finish({ problem: `Version output exceeded the ${MAX_VERSION_OUTPUT}-byte output limit` })
      else target.push(data)
    }
    child.stdout.on('data', collect(stdout)); child.stderr.on('data', collect(stderr))
    child.on('error', error => finish({ problem: error.message.slice(0, 500) }))
    child.on('close', (code, signal) => {
      if (settled) return
      const out = Buffer.concat(stdout).toString('utf8'), err = Buffer.concat(stderr).toString('utf8')
      if (code !== 0) finish({ problem: err.trim().slice(0, 500) || `Version command exited with ${signal ?? `code ${code}`}` })
      else {
        const text = (out || err).trim().split(/\r?\n/)[0]?.slice(0, 500)
        finish(text ? { version: text } : { problem: 'Version command returned no output' })
      }
    })
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) cancel()
  })
}

export async function probeLocalTools(options: LocalToolProbeOptions): Promise<LocalToolState> {
  if (options.signal?.aborted) throw new DOMException('Local tool probing cancelled', 'AbortError')
  const env = options.env ?? process.env, platform = options.platform ?? process.platform, home = options.home ?? homedir()
  const paths = { ...options.paths }
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
  const pathDirectories = (env[pathKey] ?? '').split(platform === 'win32' ? ';' : delimiter).filter(Boolean)
  const pathJoin = platform === 'win32' ? win32.join : join
  const tools = LOCAL_TOOLS.map(({ id }) => {
    const candidates: LocalToolCandidate[] = [], seen = new Set<string>()
    const add = (path: string, source: LocalToolCandidate['source']) => {
      const key = platform === 'win32' ? path.toLowerCase() : path
      if (seen.has(key) || candidates.length >= MAX_CANDIDATES || (source !== 'settings' && !existsSync(path))) return
      seen.add(key); candidates.push({ path, source })
    }
    if (paths[id]) add(paths[id], 'settings')
    for (const directory of pathDirectories) for (const name of executableNames(id, platform)) add(pathJoin(directory, name), 'PATH')
    for (const path of commonToolPaths(id, { platform, home, env })) add(path, 'common')
    return { id, candidates }
  })
  const candidates = tools.flatMap(tool => tool.candidates)
  let cursor = 0
  // Enumeration above uses the unmodified PATH. Execution below mirrors local command
  // launches, so e.g. npm's env-node shebang can use an explicitly selected Node.
  const execution = new LocalToolExecution(() => paths, platform)
  try {
    const effectiveEnv = execution.environment(env)
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, async () => {
      while (cursor < candidates.length && !options.signal?.aborted) {
        const candidate = candidates[cursor++]!
        Object.assign(candidate, await version(candidate.path, platform, effectiveEnv, options.timeoutMs ?? LOCAL_TOOL_TIMEOUT_MS, options.signal))
      }
    }))
    if (options.signal?.aborted) throw new DOMException('Local tool probing cancelled', 'AbortError')
  } finally { execution.dispose() }
  return { paths, tools }
}
