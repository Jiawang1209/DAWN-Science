import { expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

it('the actual dawn command exposes help without opening a model or a desktop window', async () => {
  const child = spawn(resolve('bin/dawn'), ['--help'], { env: { ...process.env, DAWN_CLI_HOME: '/unused-cli-help' } })
  let output = ''
  child.stdout.on('data', b => { output += b })
  child.stderr.on('data', b => { output += b })
  const result = await new Promise<number | null>((done, reject) => { child.on('error', reject); child.on('exit', done) })
  expect(result).toBe(0)
  expect(output).toContain('/exit')
  expect(output).toContain('DAWN Science')
})

import { afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { stripVTControlCharacters } from 'node:util'
import * as pty from 'node-pty'
// @ts-expect-error shared deterministic inference fixture
import { startMockInferenceServer } from '../../scripts/mock-inference-server.mjs'
const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function fixture(serverOptions: Record<string, unknown> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dawn-cli-test-'))), workspace = join(root, 'project with spaces'), home = join(root, 'cli')
  mkdirSync(workspace)
  const server = await startMockInferenceServer({ ...serverOptions, scenario: {
    toolCall(body: any) {
      const i = body.messages.findLastIndex((m: any) => m.role === 'user')
      const content = body.messages[i]?.content
      const user = typeof content === 'string' ? content : (content ?? []).map((part: any) => part.text ?? '').join('\n')
      if (body.messages.slice(i + 1).some((m: any) => m.role === 'tool')) return undefined
      if (user.includes('CLI写文件')) return { toolName: 'bash', args: { command: 'printf "%s|%s" "$PWD" "$DAWN_CLI_SAMPLE" > cli-result.txt; printf CLI_TOOL_OK' } }
      if (user.includes('CLI权限')) return { toolName: 'bash', args: { command: 'curl -s --max-time 1 http://127.0.0.1:9/ || true; printf allowed > cli-permission.txt' } }
      if (user.includes('CLI慢任务')) return { toolName: 'bash', args: { command: 'printf started > cli-slow-start.txt; sleep 15; printf done > cli-slow.txt' } }
      if (user.includes('CLI提问')) return { toolName: 'ask_user_question', args: { questions: [{ id: 'range', question: '选择分析范围？', options: [{ label: '全部' }, { label: '部分' }] }] } }
      return undefined
    },
    reply: (body: any) => { const content = body.messages.findLast((m: any) => m.role === 'user')?.content; const last = typeof content === 'string' ? content : (content ?? []).map((p: any) => p.text ?? '').join('\n'); return last.includes('MULTILINE_TOP') ? (last === 'MULTILINE_TOP\nMULTILINE_BOTTOM' ? 'MULTILINE_JOINED_OK' : 'MULTILINE_WRONG') : 'CLI_REPLY_OK：这是隔离的固定模型回复。' },
  } })
  expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:/)
  const config = join(root, 'providers.yaml')
  writeFileSync(config, JSON.stringify({ providers: { 'cli-test': { baseUrl: server.url, api: 'openai-completions', models: ['deepseek-flash'] } }, agents: { chat: { kind: 'native', provider: 'cli-test', model: 'deepseek-flash', capabilities: ['chat', 'fs_write', 'exec'] } } }))
  const desktopDb = join(root, 'desktop.db'); writeFileSync(desktopDb, 'untouched-desktop')
  const env = { ...process.env, DAWN_CLI_HOME: home, DAWN_CONFIG: config, DAWN_DB: desktopDb, DAWN_API_KEY: 'isolated-cli-test-key', DAWN_CLI_SAMPLE: '41', NO_COLOR: '1', BASH_SILENCE_DEPRECATION_WARNING: '1', PATH: resolve('bin') + ':' + process.env.PATH }
  cleanups.push(async () => { await server.close(); rmSync(root, { recursive: true, force: true }) })
  return { root, workspace, home, env, desktopDb }
}
async function piped(input: string, f: Awaited<ReturnType<typeof fixture>>) {
  const child = spawn(resolve('bin/dawn'), [], { cwd: f.workspace, env: f.env })
  let output = ''; child.stdout.on('data', b => { output += b }); child.stderr.on('data', b => { output += b })
  cleanups.push(() => { child.kill('SIGKILL') })
  child.stdin.end(input)
  const code = await new Promise<number | null>((done, reject) => { child.on('error', reject); child.on('close', done) })
  return { code, output }
}
async function shell(f: Awaited<ReturnType<typeof fixture>>) {
  const terminal = pty.spawn('/bin/bash', ['--noprofile', '--norc', '-i'], { cwd: f.workspace, env: f.env, name: 'xterm-256color', cols: 100, rows: 32 })
  let output = ''; terminal.onData(b => { output += b })
  cleanups.push(() => { try { terminal.kill() } catch {} })
  const wait = async (text: string, offset = 0) => { await import('vitest').then(({ vi }) => vi.waitFor(() => expect(stripVTControlCharacters(output.slice(offset))).toContain(text), { timeout: 15000 })) }
  return { terminal, wait, output: () => stripVTControlCharacters(output), mark: () => output.length }
}
it('pipe input waits for real tool execution and EOF closes the CLI without touching desktop storage', async () => {
  const f = await fixture(), result = await piped('CLI写文件\n你好\n', f)
  expect(result.output, String(result.code)).toContain('CLI_TOOL_OK')
  expect(result.code).toBe(0)
  expect(readFileSync(join(f.workspace, 'cli-result.txt'), 'utf8')).toBe(`${f.workspace}|41`)
  expect(result.output.match(/CLI_REPLY_OK/g)).toHaveLength(2)
  expect(readFileSync(f.desktopDb, 'utf8')).toBe('untouched-desktop')
}, 30000)
it('noninteractive permission is denied instead of hanging or running the command', async () => {
  const f = await fixture(), result = await piped('CLI权限\n', f)
  expect(result.output).toContain('非交互输入无法确认权限')
  expect(result.code).toBe(1)
  expect(existsSync(join(f.workspace, 'cli-permission.txt'))).toBe(false)
}, 30000)
it('/permissions changes the actual native gate without consuming a model turn or setting the desktop default', async () => {
  const allowed = await fixture(), a = await piped('/permissions allow-all\nCLI权限\n', allowed)
  expect(a.output).toContain('当前权限：完全访问权限')
  expect(a.output).not.toContain('非交互输入无法确认权限')
  expect(readFileSync(join(allowed.workspace, 'cli-permission.txt'), 'utf8')).toBe('allowed')
  expect(a.code).toBe(0)
  const blocked = await fixture(), b = await piped('/permissions deny-risky\nCLI权限\n', blocked)
  expect(b.output).toContain('当前权限：自动拦截')
  expect(existsSync(join(blocked.workspace, 'cli-permission.txt'))).toBe(false)
  expect(readFileSync(blocked.desktopDb, 'utf8')).toBe('untouched-desktop')
}, 30000)
it('actual shell launches dawn and receives the same PID, cwd, env and terminal settings after /exit', async () => {
  const f = await fixture(), s = await shell(f)
  s.terminal.write('stty -g > tty-before.txt; printf "%s|%s|%s" "$$" "$PWD" "$DAWN_CLI_SAMPLE" > shell-before.txt; dawn\r')
  await s.wait('> DAWN')
  s.terminal.write('CLI写文件\r'); await s.wait('CLI_REPLY_OK')
  s.terminal.write('/exit\r'); await s.wait('已退出 Agent，返回 Shell。')
  s.terminal.write('stty -g > tty-after.txt; printf "%s|%s|%s" "$$" "$PWD" "$DAWN_CLI_SAMPLE" > shell-after.txt\r')
  const { vi } = await import('vitest')
  await vi.waitFor(() => expect(existsSync(join(f.workspace, 'shell-after.txt'))).toBe(true))
  expect(readFileSync(join(f.workspace, 'shell-after.txt'), 'utf8')).toBe(readFileSync(join(f.workspace, 'shell-before.txt'), 'utf8'))
  expect(readFileSync(join(f.workspace, 'tty-after.txt'), 'utf8')).toBe(readFileSync(join(f.workspace, 'tty-before.txt'), 'utf8'))
}, 30000)
it('interactive permission and question replies use existing DAWN operations', async () => {
  const f = await fixture(), s = await shell(f)
  s.terminal.write('dawn\r'); await s.wait('> DAWN')
  s.terminal.write('CLI权限\r'); await s.wait('输入编号，或 y / n。')
  s.terminal.write('y\r'); await s.wait('CLI_REPLY_OK')
  expect(readFileSync(join(f.workspace, 'cli-permission.txt'), 'utf8')).toBe('allowed')
  const offset = s.mark()
  s.terminal.write('CLI提问\r'); await s.wait('选择分析范围？', offset)
  s.terminal.write('1\r'); await s.wait('CLI_REPLY_OK', offset)
  s.terminal.write('/exit\r'); await s.wait('已退出 Agent，返回 Shell。')
}, 30000)
it('Ctrl-C stops a running task and leaves the Agent ready for another question', async () => {
  const f = await fixture(), s = await shell(f)
  s.terminal.write('dawn\r'); await s.wait('> DAWN')
  s.terminal.write('CLI慢任务\r'); await s.wait('sleep 15')
  const { vi } = await import('vitest')
  await vi.waitFor(() => expect(existsSync(join(f.workspace, 'cli-slow-start.txt'))).toBe(true))
  s.terminal.write('\x03'); await s.wait('本轮已停止。')
  s.terminal.write('你好\r'); await s.wait('CLI_REPLY_OK')
  expect(existsSync(join(f.workspace, 'cli-slow.txt'))).toBe(false)
  s.terminal.write('/exit\r'); await s.wait('已退出 Agent，返回 Shell。')
}, 30000)
it('missing CLI credentials fails clearly before entering Agent', async () => {
  const f = await fixture(); f.env.DAWN_API_KEY = ''
  const result = await piped('你好\n', f)
  expect(result.code).toBe(1)
  expect(result.output).toContain('尚未配置 cli-test 的 CLI 凭证')
  expect(result.output).not.toContain('> DAWN')
})
it('simultaneous CLI hosts have independent databases', async () => {
  const f = await fixture()
  const results = await Promise.all([piped('你好\n', f), piped('你好\n', f)])
  expect(results.map(r => r.code)).toEqual([0, 0])
  const { readdirSync } = await import('node:fs')
  expect(readdirSync(join(f.home, 'sessions'))).toHaveLength(2)
}, 30000)
it('/exit while waiting for permission returns to Shell without approving the action', async () => {
  const f = await fixture(), s = await shell(f)
  s.terminal.write('dawn\r'); await s.wait('> DAWN')
  s.terminal.write('CLI权限\r'); await s.wait('输入编号，或 y / n。')
  s.terminal.write('/exit\r'); await s.wait('已退出 Agent，返回 Shell。')
  s.terminal.write('printf returned > permission-shell.txt\r')
  const { vi } = await import('vitest')
  await vi.waitFor(() => expect(existsSync(join(f.workspace, 'permission-shell.txt'))).toBe(true))
  expect(existsSync(join(f.workspace, 'cli-permission.txt'))).toBe(false)
}, 30000)
it('model errors are visible and piped requests exit with failure', async () => {
  const f = await fixture({ failStatus: 503, failMessage: 'isolated-model-error' })
  const result = await piped('你好\n', f)
  expect(result.code).toBe(1)
  expect(result.output).toContain('模型调用失败')
  expect(result.output).toContain('isolated-model-error')
}, 30000)
it('SIGTERM during a real tool run closes the CLI and does not finish the interrupted task', async () => {
  const f = await fixture(), child = spawn(resolve('bin/dawn'), [], { cwd: f.workspace, env: f.env })
  child.stdout.resume(); child.stderr.resume()
  cleanups.push(() => { child.kill('SIGKILL') })
  child.stdin.write('CLI慢任务\n')
  const { vi } = await import('vitest')
  await vi.waitFor(() => expect(existsSync(join(f.workspace, 'cli-slow-start.txt'))).toBe(true), { timeout: 15000 })
  const exited = new Promise<number | null>(resolve => child.once('close', resolve))
  child.kill('SIGTERM')
  expect(await exited).toBe(0)
  expect(existsSync(join(f.workspace, 'cli-slow.txt'))).toBe(false)
}, 30000)

it('interactive CLI uses the multiline editor and sends both lines in a single model request', async () => {
  const f = await fixture(), s = await shell(f)
  s.terminal.write('dawn\r'); await s.wait('输入问题')
  s.terminal.write('MULTILINE_TOP\x1b[13;2uMULTILINE_BOTTOM\r')
  await s.wait('MULTILINE_JOINED_OK')
  s.terminal.write('/exit\r'); await s.wait('已退出 Agent，返回 Shell。')
}, 30000)
