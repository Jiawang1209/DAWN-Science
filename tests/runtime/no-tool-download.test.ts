/**
 * pi 的 grep / find 不许自己去 GitHub 下 rg / fd（2026-09-28）。
 *
 * 做法：PATH 换成一个空目录、agent 目录换成一个空目录（pi 与我们都找不到 rg / fd），`fetch` 换成一个记账的桩——
 * 谁要是去下，桩就记下一笔。两道闸分开验：我们的包装（说人话、根本不进 pi），与 pi 自己的 `PI_OFFLINE`（子 agent 靠它）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createFindToolDefinition, createGrepToolDefinition } from "@earendil-works/pi-coding-agent"
import { 关掉pi自己下载, 不自己下载, 找得到 } from "../../src/runtime/no-tool-download.js"
import { NativeRuntime } from "../../src/runtime/native.js"

const 存 = { PATH: process.env.PATH, PI_OFFLINE: process.env.PI_OFFLINE, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR }
const dirs: string[] = []
let 下载: string[]

beforeEach(() => {
  const 空 = mkdtempSync(join(tmpdir(), "dawn-nopath-"))
  const agent = mkdtempSync(join(tmpdir(), "dawn-noagent-"))
  dirs.push(空, agent)
  process.env.PATH = 空
  process.env.PI_CODING_AGENT_DIR = agent
  delete process.env.PI_OFFLINE
  下载 = []
  vi.stubGlobal("fetch", async (u: unknown) => {
    下载.push(String(u))
    throw new Error("测试里不许联网")
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const [k, v] of Object.entries(存)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const 跑 = (d: { execute: (...a: never[]) => unknown }, params: Record<string, unknown>) =>
  (d.execute as (...a: unknown[]) => Promise<{ content: { text: string }[]; isError?: boolean }>)("c1", params, undefined, undefined, undefined)

describe("不自己下载（我们的包装）", () => {
  it("PATH 上没有 rg：grep 回一条说人话的错，不进 pi、不联网", async () => {
    expect(找得到("rg")).toBe(false)
    const r = await 跑(不自己下载(createGrepToolDefinition(tmpdir()), "rg"), { pattern: "x" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toBe("这台机器没有装 rg，grep 用不了；可以用 ls / read，或把这一步写进方案")
    expect(下载).toEqual([])
  })

  it("PATH 上没有 fd：find 同样", async () => {
    const r = await 跑(不自己下载(createFindToolDefinition(tmpdir()), "fd"), { pattern: "*.csv" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("这台机器没有装 fd，find 用不了")
    expect(下载).toEqual([])
  })

  it("名字、说明、参数原样（模型看到的还是 pi 那件）", () => {
    const 原 = createGrepToolDefinition(tmpdir())
    const 包 = 不自己下载(原, "rg")
    expect(包.name).toBe(原.name)
    expect(包.description).toBe(原.description)
    expect(包.parameters).toBe(原.parameters)
  })
})

/**
 * pi 原装的 grep / find（子 agent 用的就是它）：另起一个 node 进程——pi 的 bin 目录在**模块加载时**就定了，
 * 这台机器的 `~/.pi/agent/bin` 里可能已经躺着一份早先被悄悄下下来的 rg（作者机器上就有，2026-08-22 那天下的）。
 * 子进程里 HOME / agent 目录 / PATH 全是空目录，`fetch` 换成记账的桩。
 */
function 在干净进程里跑原装的(env: Record<string, string>): { 结果: string[]; 下载: string[] } {
  const 家 = mkdtempSync(join(tmpdir(), "dawn-nohome-"))
  dirs.push(家)
  const 脚本 = `
    const 下载 = []
    globalThis.fetch = async (u) => { 下载.push(String(u)); throw new Error("测试里不许联网") }
    const pi = await import("@earendil-works/pi-coding-agent")
    const 结果 = []
    for (const [造, 参] of [[pi.createGrepToolDefinition, { pattern: "x" }], [pi.createFindToolDefinition, { pattern: "*.csv" }]]) {
      try { await 造(${JSON.stringify(家)}).execute("c1", 参, undefined, undefined, undefined); 结果.push("ok") }
      catch (e) { 结果.push(String(e && e.message)) }
    }
    console.log(JSON.stringify({ 结果, 下载 }))
  `
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", 脚本], {
    cwd: process.cwd(),
    env: { HOME: 家, USERPROFILE: 家, PATH: 家, PI_CODING_AGENT_DIR: join(家, "agent"), ...env },
    encoding: "utf8",
    timeout: 30_000,
  })
  const 行 = r.stdout.trim().split("\n").at(-1) ?? ""
  if (!行.startsWith("{")) throw new Error(`子进程没给结果：${r.stderr}`)
  return JSON.parse(行) as { 结果: string[]; 下载: string[] }
}

describe("PI_OFFLINE（pi 自己的开关；子 agent 用原装 grep 靠它）", () => {
  it("基线：不设 PI_OFFLINE，pi 原装 grep 缺 rg 时真的会去下（这条绿，下面那条才有意义）", () => {
    const { 下载 } = 在干净进程里跑原装的({})
    expect(下载.some((u) => u.includes("github.com"))).toBe(true)
  })

  it("设了 PI_OFFLINE=1：grep / find 报「不可用」，一次都不联网", () => {
    const { 结果, 下载 } = 在干净进程里跑原装的({ PI_OFFLINE: "1" })
    expect(结果[0]).toMatch(/ripgrep \(rg\) is not available/)
    expect(结果[1]).toMatch(/fd is not available/)
    expect(下载).toEqual([])
  })

  it("建 NativeRuntime 就设上；用户自己设过就不动", () => {
    new NativeRuntime()
    expect(process.env.PI_OFFLINE).toBe("1")
    process.env.PI_OFFLINE = "yes"
    关掉pi自己下载()
    expect(process.env.PI_OFFLINE).toBe("yes")
  })
})
