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
import { SessionTranscripts } from "../../src/workbench/events.js"
import { 子转录id } from "../../src/protocol/subagent-id.js"

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

describe("NativeRuntime 续问（2026-09-27 审查）", () => {
  it("abortSubagentFollowUp：只停点名的那一问（toolCallId 按盘上那一段认），别的照跑；没有就回 false", async () => {
    const { spec, entry, pid文件 } = 造()
    const rt = new NativeRuntime({ credentials: fakeCredentials(), subagentChildEntry: entry, subagents: { 自带目录: resolve("agents") } })
    await rt.start(spec)
    const 收到: AgentEvent[] = []
    rt.attach("n1", (e) => 收到.push(e))
    await rt.askSubagent("n1", "call.1", 0, "data-auditor", "再说一句")
    await 等(() => existsSync(pid文件))
    const pid = Number(readFileSync(pid文件, "utf8"))
    expect(rt.abortSubagentFollowUp("n1", "c-别的", 0)).toBe(false)
    expect(rt.abortSubagentFollowUp("n1", "call_1", 1)).toBe(false)
    expect(活着(pid)).toBe(true)
    expect(rt.abortSubagentFollowUp("n1", "call_1", 0)).toBe(true)
    await 等(() => !活着(pid))
    await 等(() => 收到.some((e) => e.kind === "subagent_event" && e.event.kind === "settled"))
    expect(收到.find((e) => e.kind === "subagent_event" && e.event.kind === "settled")).toMatchObject({ event: { ok: false, followUp: true } })
    await rt.stop("n1")
  })

  it("续问一个定义已被删掉的子 agent：失败出声（那一格里一条说清原因的 notice），又能接着问了", async () => {
    const { spec, entry } = 造()
    const rt = new NativeRuntime({ credentials: fakeCredentials(), subagentChildEntry: entry, subagents: { 自带目录: resolve("agents") } })
    await rt.start(spec)
    const h = new SessionTranscripts({ terminalMaxChars: 1000 })
    h.track("n1", "native")
    h.ingest("n1", { kind: "subagent_start", sessionId: "n1", toolCallId: "c1", index: 0, agent: "已删掉的", task: "t" })
    h.ingest("n1", { kind: "subagent_event", sessionId: "n1", toolCallId: "c1", index: 0, event: { kind: "settled", ok: true, result: { text: "原结论" } } })
    const 子 = 子转录id("n1", "c1", 0)
    expect(h.子agent续问开始(子, "再说")).toBe(true)
    rt.attach("n1", (e) => h.ingest("n1", e))
    await rt.askSubagent("n1", "c1", 0, "已删掉的", "再说")
    await 等(() => h.peek(子)?.subagent?.asking !== true)
    const snap = h.peek(子)!
    expect(snap.subagent).toMatchObject({ canAsk: true, status: "ok", result: { text: "原结论" } })
    expect(snap.subagent?.asking).toBeUndefined()
    expect(snap.items.some((i) => i.type === "notice" && /已删掉的.*定义被删了或停用了/.test(i.text))).toBe(true)
    await rt.stop("n1")
  })
})
