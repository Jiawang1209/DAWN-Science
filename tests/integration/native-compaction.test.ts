/**
 * 压缩的**真实链路**（2026-09-27，spec `2026-09-27-上下文用量与压缩-design.md` §7）。
 *
 * 真的 `ModelRuntime`、真的 pi agent loop 与压缩（`prepareCompaction` / 摘要调用 / `appendCompaction`）；
 * 只有模型回复是确定的——假模型认出 pi 的摘要请求回 `假摘要`，带「塞满上下文」的一句报 12 万输入 token。
 * `compaction: { keepRecentTokens: 1 }`：pi 默认要保留最近 2 万 token，两三句话的对话「没有可压缩的」。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { AgentEvent } from "../../src/runtime/types.js"
// @ts-expect-error -- .mjs 脚本，无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer, mockModelsJson } from "../../scripts/mock-inference-server.mjs"

let server: { url: string; requests: { body: unknown }[]; close: () => Promise<void> }
let dir: string
let workspace: string
let modelsPath: string

beforeAll(async () => {
  server = await startMockInferenceServer()
  dir = mkdtempSync(join(tmpdir(), "dawn-compaction-"))
  workspace = join(dir, "workspace")
  mkdirSync(workspace, { recursive: true })
  modelsPath = join(dir, "models.json")
  writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url), null, 2))
})
afterAll(async () => {
  await server?.close()
})

async function 起一段(id: string, resume = false) {
  const runtime = new NativeRuntime({ modelsPath, compaction: { keepRecentTokens: 1 } })
  const 事件: AgentEvent[] = []
  runtime.attach(id as never, (e) => 事件.push(e))
  await runtime.start({
    sessionId: id as never,
    workspace,
    sessionDir: join(dir, id),
    native: { provider: "deepseek", model: "deepseek-flash" },
    ...(resume ? { resume: true } : {}),
  })
  const 说 = async (话: string) => {
    runtime.write(id as never, 话)
    await runtime.waitForIdle(id as never)
  }
  return { runtime, 事件, 说 }
}

describe("真 pi · 压缩", () => {
  it("手动：两句之后压 → start / end 各一条、摘要是假模型写的；仪表说刚压过；再说一句仪表回来；续接时前后都在、中间一条压缩", { timeout: 60_000 }, async () => {
    const { runtime, 事件, 说 } = await 起一段("s-manual")
    await 说("第一句")
    await 说("第二句")
    expect(runtime.contextUsage("s-manual" as never)).toMatchObject({ usedTokens: 20, contextWindow: 128_000, compactAt: 128_000 - 16_384 })

    runtime.compact("s-manual" as never, "保留暗号")
    await runtime.waitForIdle("s-manual" as never)

    const 压 = 事件.filter((e) => e.kind === "compaction_start" || e.kind === "compaction_end")
    expect(压.map((e) => e.kind)).toEqual(["compaction_start", "compaction_end"])
    const 收 = 压[1] as Extract<AgentEvent, { kind: "compaction_end" }>
    expect(收.status, 收.error).toBe("done")
    expect(收.reason).toBe("manual")
    expect(收.summary).toContain("假摘要：用户在试压缩")
    // 我们给的要求真的进了摘要请求。**不是「最后一问」**：keepRecentTokens 1 会把最后一轮切开，
    // pi 先摘要切点之前的历史（带要求）、再单独摘要被切开那一轮的前半截（不带要求）——两问并发，最后一问是后者
    expect(server.requests.some((r) => JSON.stringify(r.body).includes("保留暗号"))).toBe(true)

    expect(runtime.contextUsage("s-manual" as never)).toMatchObject({ afterCompaction: true })
    expect(runtime.contextUsage("s-manual" as never)?.usedTokens).toBeUndefined()

    await 说("第三句")
    expect(runtime.contextUsage("s-manual" as never)?.usedTokens).toBe(20)
    // 压缩前那两次回复的用量没有被再报一次：一共三次回复、三次用量
    expect(事件.filter((e) => e.kind === "turn_usage")).toHaveLength(3)

    const 史 = await runtime.history("s-manual" as never)
    const 形 = 史.map((x) => (x.kind === "text" ? `${x.who}:${x.text}` : x.kind))
    expect(形.indexOf("user:第一句"), JSON.stringify(形)).toBeGreaterThanOrEqual(0)
    expect(形.indexOf("user:第一句")).toBeLessThan(形.indexOf("compaction"))
    expect(形.indexOf("compaction")).toBeLessThan(形.indexOf("user:第三句"))
    const 点 = 史.find((x) => x.kind === "compaction")
    expect(点 && 点.kind === "compaction" ? 点.summary : "").toContain("假摘要")
    await runtime.stop("s-manual" as never)

    // 真续接（换一个运行时、从记录里读回来）：压缩点与压缩前的来往都在；接着说一句只报这一句的用量
    const 续 = await 起一段("s-manual", true)
    const 续史 = await 续.runtime.history("s-manual" as never)
    const 续形 = 续史.map((x) => (x.kind === "text" ? `${x.who}:${x.text}` : x.kind))
    expect(续形, JSON.stringify(续形)).toEqual(形)
    await 续.说("第四句")
    expect(续.事件.filter((e) => e.kind === "turn_usage"), "续接前那条老回复不许被当成新用量再报一次").toHaveLength(1)
    await 续.runtime.stop("s-manual" as never)
  })

  it("自动：「塞满上下文」那一轮收尾时 pi 自己压 → 一条 threshold 的 end", { timeout: 60_000 }, async () => {
    const { 事件, 说 } = await 起一段("s-auto")
    await 说("你好")
    await 说("塞满上下文")
    const 收 = 事件.find((e) => e.kind === "compaction_end") as Extract<AgentEvent, { kind: "compaction_end" }> | undefined
    expect(收, "过线之后 pi 该自己压").toBeDefined()
    expect(收!.reason).toBe("threshold")
    expect(收!.status, 收!.error).toBe("done")
    expect(收!.tokensBefore).toBeGreaterThanOrEqual(120_000)
  })
})
