import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { test, expect, 在项目里开会话 } from "./fixtures.js"

const specPath = join(homedir(), "Library/Jupyter/kernels/dawn-spike/kernel.json")
test.use({ dawnOptions: { realKernels: true } })

test("真实 Python 内核启动期间停止会话，晚到实例回收且旧代码不执行", async ({ dawn }) => {
  test.skip(!existsSync(specPath), "Needs local dawn-spike ipykernel")
  const python = (JSON.parse(readFileSync(specPath, "utf8")) as { argv: string[] }).argv[0]!
  const { page, workspace } = dawn
  const wrapper = join(workspace, "slow-python"), pidFile = join(workspace, "starting-kernel.pid")
  const marker = join(workspace, "must-not-run.txt")
  const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'"
  // 真实解释器仅延迟启动；PID 经 exec 保持不变，用于核对回收而非只看状态。
  writeFileSync(wrapper, `#!/bin/sh\nprintf '%s' "$$" > ${quote(pidFile)}\nsleep 2\nexec ${quote(python)} "$@"\n`)
  chmodSync(wrapper, 0o755)
  await page.evaluate(async path => {
    const r = await window.dawn!.invoke("setInterpreter", { language: "python", path })
    if (!r.ok) throw new Error(JSON.stringify(r.error))
  }, wrapper)
  await 在项目里开会话(page)
  const sessionId = await page.evaluate(async () => {
    const r = await window.dawn!.invoke("listTasks", {})
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    return (r.data as { sessionId: string }[])[0]!.sessionId
  })
  await page.evaluate(({ sessionId, marker }) => {
    ;(window as any).pendingKernel = window.dawn!.invoke("runInKernel", { sessionId, language: "python", code: `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text('must not run')` })
  }, { sessionId, marker })
  await expect.poll(() => existsSync(pidFile)).toBe(true)
  const pid = Number(readFileSync(pidFile, "utf8"))
  expect(pid).toBeGreaterThan(1)
  const result = await page.evaluate(async sessionId => {
    const stopped = await window.dawn!.invoke("stopSession", { sessionId })
    if (!stopped.ok) throw new Error(JSON.stringify(stopped.error))
    return await (window as any).pendingKernel
  }, sessionId)
  expect(result.ok).toBe(false)
  expect(result.error.message).toMatch(/收掉|停止|清理/)
  expect(existsSync(marker)).toBe(false)
  await expect.poll(() => { try { process.kill(pid, 0); return true } catch { return false } }).toBe(false)
})
