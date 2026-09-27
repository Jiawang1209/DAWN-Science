/**
 * native 运行时的「接着问子 agent」（2026-09-27，spec §2.3）。
 *
 * **真起 pi 会话、真起子进程**（子进程是一段只会睡的假入口）：要证明的是「关会话时正在答的那一问整组杀掉」，
 * 替身演不出进程组。
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { AgentEvent, SessionSpec } from "../../src/runtime/types.js"
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai"

const fakeCredentials = (): CredentialStore => ({
  async read(providerId): Promise<Credential | undefined> {
    return providerId === "deepseek" ? { type: "api_key", key: "sk-offline" } : undefined
  },
  async list(): Promise<readonly CredentialInfo[]> {
    return [{ providerId: "deepseek", type: "api_key" }]
  },
  async modify() {
    return undefined
  },
  async delete() {},
})

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function 造() {
  const dir = mkdtempSync(join(tmpdir(), "dawn-subask-"))
  dirs.push(dir)
  const pid文件 = join(dir, "child.pid")
  // 假子进程：记下自己的 pid，然后一直睡——等着被杀
  const entry = join(dir, "fake-child.cjs")
  writeFileSync(entry, `require("fs").writeFileSync(${JSON.stringify(pid文件)}, String(process.pid)); setInterval(() => {}, 1000)\n`)
  const spec: SessionSpec = { sessionId: "n1", workspace: dir, sessionDir: join(dir, ".dawn"), native: { provider: "deepseek", model: "deepseek-flash" } }
  return { dir, pid文件, entry, spec }
}

const 活着 = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function 等(条件: () => boolean, ms = 5000) {
  const 止 = Date.now() + ms
  while (!条件()) {
    if (Date.now() > 止) throw new Error("等超时了")
    await new Promise((r) => setTimeout(r, 20))
  }
}

describe("NativeRuntime.askSubagent", () => {
  it("没装子 agent（没有子进程入口）：出声地拒", async () => {
    const { spec } = 造()
    const rt = new NativeRuntime({ credentials: fakeCredentials() })
    await rt.start(spec)
    await expect(rt.askSubagent("n1", "c1", 0, "data-auditor", "再说")).rejects.toThrow(/没有装子 agent/)
    await rt.stop("n1")
  })

  it("起一轮就返回；关会话时正在答的那一问被杀掉，并以一条 followUp 的 settled 收尾", async () => {
    const { spec, entry, pid文件 } = 造()
    const rt = new NativeRuntime({
      credentials: fakeCredentials(),
      subagentChildEntry: entry,
      subagents: { 自带目录: resolve("agents") },
    })
    await rt.start(spec)
    const 收到: AgentEvent[] = []
    rt.attach("n1", (e) => 收到.push(e))
    await rt.askSubagent("n1", "c1", 0, "data-auditor", "再说一句")
    await 等(() => existsSync(pid文件))
    const pid = Number(readFileSync(pid文件, "utf8"))
    expect(活着(pid)).toBe(true)
    await rt.stop("n1")
    await 等(() => !活着(pid))
    await 等(() => 收到.some((e) => e.kind === "subagent_event" && e.event.kind === "settled"))
    const 收尾 = 收到.find((e) => e.kind === "subagent_event" && e.event.kind === "settled")
    expect(收尾).toMatchObject({ toolCallId: "c1", index: 0, event: { kind: "settled", ok: false, followUp: true } })
    // chip 与账本的那两种一条都不能有：续问不是主 agent 的行动
    expect(收到.some((e) => e.kind === "subagent_start" || e.kind === "subagent_end")).toBe(false)
  })
})
