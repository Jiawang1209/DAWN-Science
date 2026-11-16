import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalToolExecution, isLocalToolShimPath } from '../../src/env/local-tool-execution.js'
import { versionInvocation } from '../../src/env/local-tools.js'
import type { LocalToolPaths } from '../../src/protocol/local-tools.js'
import { NativeRuntime } from '../../src/runtime/native.js'
import { PtyRuntime } from '../../src/runtime/pty.js'

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'dawn-tool-execution-test-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const executable = (name: string, body: string) => { const path = join(directory, name); writeFileSync(path, `#!/bin/sh\n${body}\n`); chmodSync(path, 0o755); return path }
  let paths: LocalToolPaths = {}
  const execution = new LocalToolExecution(() => paths)
  cleanups.unshift(() => execution.dispose())
  return { directory, executable, execution, select: (next: LocalToolPaths) => { paths = next } }
}

describe('configured local tool execution', () => {
  it('executes the exact renamed path with spaces, forwards literal arguments and leaves global environment unchanged', () => {
    const fixture = setup(), before = { ...process.env }
    const selected = fixture.executable("custom uv ' $(ignored)", 'printf "selected:%s\\n" "$@"')
    fixture.select({ uv: selected })
    const env = fixture.execution.environment({ PATH: '/usr/bin:/bin' })
    const output = execFileSync('/bin/sh', ['-c', 'uv "hello world" "$(printf literal)"'], { env, encoding: 'utf8' })
    expect(output).toBe('selected:hello world\nselected:literal\n')
    expect(process.env).toEqual(before)
    expect(isLocalToolShimPath(join(env.PATH!.split(':')[0]!, 'uv'))).toBe(true)
  })
  it('uses current settings per launch, clear restores inherited PATH, and stale selected executables fail without fallback', () => {
    const fixture = setup(), fallback = fixture.executable('uv', 'echo FALLBACK'), one = fixture.executable('selected-one', 'echo ONE'), two = fixture.executable('selected-two', 'echo TWO')
    const source = { PATH: `${fixture.directory}:/usr/bin:/bin` }
    const run = () => execFileSync('/bin/sh', ['-c', 'uv'], { env: fixture.execution.environment(source), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    fixture.select({ uv: one }); expect(run()).toBe('ONE')
    fixture.select({ uv: two }); expect(run()).toBe('TWO')
    unlinkSync(two)
    expect(() => run()).toThrow()
    fixture.select({}); expect(fixture.execution.environment(source).PATH).toBe(source.PATH); expect(run()).toBe('FALLBACK')
    expect(fallback).toBeTruthy()
  })
  it('keeps npm env-node shebangs on the selected Node while internal ACP keeps its bundled runtime', () => {
    const fixture = setup(), node = fixture.executable('custom node', 'printf "selected-node:%s\\n" "$1"')
    const npm = join(fixture.directory, 'custom npm'); writeFileSync(npm, '#!/usr/bin/env node\nconsole.log("unused")\n'); chmodSync(npm, 0o755)
    fixture.select({ node, npm })
    const output = execFileSync('/bin/sh', ['-c', 'npm --version'], { env: fixture.execution.environment(process.env), encoding: 'utf8' })
    expect(output).toContain(`selected-node:${npm}`)
  })
  it('applies dynamic selected paths to the real NativeRuntime bash tool without a model call', async () => {
    const fixture = setup(), chosen = fixture.executable('AI chosen tool', 'echo ACTUAL_CHILD_EXECUTED')
    const runtime = new NativeRuntime({ provenance: false, localToolEnvironment: env => fixture.execution.environment(env) })
    const tools = (runtime as unknown as { gatedTools(cwd: string, sessionId: string): { name: string; execute(...args: unknown[]): Promise<{ content: { text: string }[] }> }[] }).gatedTools(fixture.directory, 'local-tools-test')
    const bash = tools.find(tool => tool.name === 'bash')!
    fixture.select({ uv: chosen })
    const result = await bash.execute('test-invocation', { command: 'uv --version' })
    expect(result.content.map(part => part.text).join('\n')).toContain('ACTUAL_CHILD_EXECUTED')
  })
  it('routes Windows batch probes through cmd with a singly expanded executable variable', () => {
    const selected = 'C:\\Tools with spaces\\odd & 100% tool.cmd'
    const invocation = versionInvocation(selected, 'win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' })
    expect(invocation.command).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(invocation.env.DAWN_TOOL_VERSION_EXECUTABLE).toBe(selected)
    expect(invocation.args).toEqual(['/d', '/v:off', '/s', '/c', '""%DAWN_TOOL_VERSION_EXECUTABLE%" --version"'])
  })
  it('starts a real local PTY with the selected executable and keeps its environment snapshot', async () => {
    const fixture = setup(), selected = fixture.executable('terminal selected uv', 'echo PTY_SELECTED_EXECUTABLE')
    fixture.select({ uv: selected })
    const runtime = new PtyRuntime({ command: '/bin/sh', args: ['-c', 'uv --version'], localToolEnvironment: env => fixture.execution.environment(env) })
    let output = '', exited = false
    runtime.attach('local-tools-pty', event => { if (event.kind === 'output') output += event.data; if (event.kind === 'exited') exited = true })
    try {
      await runtime.start({ sessionId: 'local-tools-pty', workspace: fixture.directory, sessionDir: fixture.directory })
      await vi.waitFor(() => expect(exited).toBe(true), { timeout: 5000 })
      expect(output).toContain('PTY_SELECTED_EXECUTABLE')
    } finally { await runtime.stop('local-tools-pty') }
  })
  it('rejects selecting an app executable alias rather than recursively invoking itself', () => {
    const fixture = setup(), selected = fixture.executable('original uv', 'echo ORIGINAL')
    fixture.select({ uv: selected })
    const env = fixture.execution.environment({ PATH: '/usr/bin:/bin' })
    fixture.select({ uv: join(env.PATH!.split(':')[0]!, 'uv') })
    expect(() => fixture.execution.environment(process.env)).toThrow(/original executable/)
  })
  it('creates Windows cmd and Git Bash wrappers that preserve the exact selected path', () => {
    const fixture = setup(), selected = 'C:\\Tools with spaces\\odd & 100% tool.cmd'
    const execution = new LocalToolExecution(() => ({ npm: selected }), 'win32')
    cleanups.unshift(() => execution.dispose())
    const env = execution.environment({ Path: 'C:\\Windows\\System32', ComSpec: 'C:\\Windows\\System32\\cmd.exe' })
    const directory = env.Path!.split(';')[0]!
    expect(readFileSync(join(directory, 'npm.cmd'), 'utf8')).toContain('%DAWN_LOCAL_TOOL_NPM%')
    expect(readFileSync(join(directory, 'npm'), 'utf8')).toContain('"$DAWN_LOCAL_TOOL_NPM" "$@"')
    expect(env.DAWN_LOCAL_TOOL_NPM).toBe(selected)
    expect(env.PATH).toBeUndefined()
  })
})
