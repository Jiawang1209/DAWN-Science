import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { test, expect, 开一段临时会话 } from './fixtures.js'
import type { SessionSnapshot, TaskSummary } from '../src/protocol/index.js'

test.use({ dawnOptions: { realKernels: true } })
const spec = (name: string) => join(homedir(), 'Library/Jupyter/kernels', name, 'kernel.json')
test('真实双内核连续重启 R 三次不重复转发、保留旧结果提示并正常退出', async ({ dawn }) => {
  test.skip(!existsSync(spec('dawn-spike')) || !existsSync(spec('ir')), '需要本地 R/Python kernelspec')
  test.setTimeout(120_000)
  const { page } = dawn
  const python = JSON.parse(readFileSync(spec('dawn-spike'), 'utf8')).argv[0]
  const r = JSON.parse(readFileSync(spec('ir'), 'utf8')).argv[0]
  await page.evaluate(async paths => {
    for (const [language, path] of paths) {
      const reply = await window.dawn!.invoke('setInterpreter', { language, path })
      if (!reply.ok) throw new Error(JSON.stringify(reply))
    }
  }, [['python', python], ['R', r]])
  await 开一段临时会话(page)
  const sessionId = await page.evaluate(async () => {
    const r = await window.dawn!.invoke('listTasks', {})
    return (r.data as TaskSummary[])[0]!.sessionId!
  })
  for (const [language, code] of [['R', 'cat("R 核验 =", 6 * 7, "\\n")'], ['python', 'print("Python 核验 =", 6 * 7)']]) {
    const result = await page.evaluate(async args => window.dawn!.invoke('runInKernel', args), { sessionId, language, code })
    expect(result.ok).toBe(true)
  }
  const snapshot = await page.evaluate(async sessionId => (await window.dawn!.invoke('subscribeSession', { sessionId })).data as SessionSnapshot, sessionId)
  expect(snapshot.kernels).toHaveLength(2)
  for (const k of snapshot.kernels!) expect(k.kernelInstanceId).toBeTruthy()
  expect(snapshot.items.filter(x => x.type === 'kernelOutput').every(x => x.type !== 'kernelOutput' || !JSON.stringify(x.output).match(/[a-f0-9]{100,}/i))).toBe(true)
  await page.reload()
  await page.locator('.session-list .sess-item .row').first().click()
  await expect(page.locator('.turns')).toContainText('R 核验 = 42')
  await expect(page.locator('.turns')).toContainText('Python 核验 = 42')
  await expect(page.locator('.turns .kout-stale')).toHaveCount(0)

  const initialPython = snapshot.kernels!.find(k => k.language === 'python')!.kernelInstanceId
  let previousR = snapshot.kernels!.find(k => k.language === 'R')!.kernelInstanceId
  for (let round = 1; round <= 3; round++) {
    const parent = dawn.app.process().pid
    const ownedR = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,args='], { encoding: 'utf8' })
      .split('\n').map(line => /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line))
      .filter(m => m && Number(m[2]) === parent && m[3]!.includes('IRkernel::main'))
    expect(ownedR).toHaveLength(1)
    process.kill(Number(ownedR[0]![1]), 'SIGTERM')
    await expect.poll(async () => {
      const s = await page.evaluate(async sessionId => (await window.dawn!.invoke('subscribeSession', { sessionId })).data as SessionSnapshot, sessionId)
      return s.kernels?.find(k => k.language === 'R')?.state
    }).toBe('exited')
    const marker = `R_RESTART_${round} = 42`
    expect((await page.evaluate(async args => window.dawn!.invoke('runInKernel', args),
      { sessionId, language: 'R', code: `cat("${marker}\\n")` })).ok).toBe(true)
    const s = await page.evaluate(async sessionId => (await window.dawn!.invoke('subscribeSession', { sessionId })).data as SessionSnapshot, sessionId)
    const matches = s.items.filter(x => x.type === 'kernelOutput' && x.output.kind === 'stream' && x.output.text.trim() === marker)
    expect(matches).toHaveLength(1)
    expect(s.kernels!.find(k => k.language === 'R')!.kernelInstanceId).not.toBe(previousR)
    expect(s.kernels!.find(k => k.language === 'python')!.kernelInstanceId).toBe(initialPython)
    previousR = s.kernels!.find(k => k.language === 'R')!.kernelInstanceId
  }
  const result = await page.evaluate(async args => window.dawn!.invoke('runInKernel', args),
    { sessionId, language: 'python', code: 'print("PY_KEEP = 42")' })
  expect(result.ok).toBe(true)
  const after = await page.evaluate(async sessionId => (await window.dawn!.invoke('subscribeSession', { sessionId })).data as SessionSnapshot, sessionId)
  expect(after.items.filter(x => x.type === 'kernelOutput' && x.output.kind === 'stream' && x.output.text.trim() === 'PY_KEEP = 42')).toHaveLength(1)
  await expect(page.locator('.turns .kout-stale')).not.toHaveCount(0)
  const exited = new Promise<number | null>(resolve => dawn.app.process().once('exit', code => resolve(code)))
  await dawn.app.close()
  expect(await exited).toBe(0)
})
