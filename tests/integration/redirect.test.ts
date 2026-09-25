/**
 * 调整方向的**真实链路**（2026-09-25，spec `2026-09-25-调整方向-design.md` §4.2）。
 *
 * 真 pi、真 bash、真 `SessionTranscripts`；只有模型是假的——走 mock 的「慢慢跑」分支（dev:mock 里人按的也是它）。
 * 单元测试里的假 pi 证不了的三件事，这里证：
 *   ① pi 的 `abort()` 真把一条在跑的 bash 停下（不是等它 20 秒跑完），停下期间结束的那一步标 `interrupted`；
 *   ② 停下之后那句真起了新的一轮，模型收到的最后一句用户话就是那句；
 *   ③ 排着的那句没丢、id 不变，在那句之后才送到。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import type { AgentEvent } from "../../src/runtime/types.js"
// @ts-expect-error -- .mjs 脚本，无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer, mockModelsJson } from "../../scripts/mock-inference-server.mjs"

let server: { url: string; requests: { body: { messages?: { role?: string; content?: unknown }[] } }[]; close: () => Promise<void> }
let dir: string
let workspace: string
let modelsPath: string

beforeAll(async () => {
  server = await startMockInferenceServer()
  dir = mkdtempSync(join(tmpdir(), "dawn-redirect-"))
  workspace = join(dir, "workspace")
  mkdirSync(workspace, { recursive: true })
  modelsPath = join(dir, "models.json")
  writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url), null, 2))
})
afterAll(async () => {
  await server?.close()
})

const 文本 = (c: unknown) =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((x: { text?: string }) => x?.text ?? "").join("") : ""

describe("调整方向 · 真 pi", () => {
  it("忙着 → 调整方向 → 那一步已中断、那句起新一轮、其余照排", { timeout: 60_000 }, async () => {
    const runtime = new NativeRuntime({ modelsPath })
    const transcripts = new SessionTranscripts({ terminalMaxChars: 10_000 })
    const sessionId = "s-redirect"
    const 事件: AgentEvent[] = []
    transcripts.track(sessionId, "native")
    runtime.attach(sessionId, (e) => {
      事件.push(e)
      transcripts.ingest(sessionId, e)
    })
    await runtime.start({
      sessionId,
      workspace,
      sessionDir: join(dir, "session"),
      native: { provider: "deepseek", model: "deepseek-flash" },
    })
    const 送到 = () => 事件.flatMap((e) => (e.kind === "queue_delivered" ? [e.id] : []))
    const 最后待发单 = () => {
      const q = [...事件].reverse().find((e) => e.kind === "queue")
      return q && q.kind === "queue" ? q.items.map((x) => x.id) : undefined
    }
    try {
      runtime.write(sessionId, "慢慢跑一下")
      await vi.waitFor(() => expect(事件.some((e) => e.kind === "tool_start" && e.toolName === "bash")).toBe(true), {
        timeout: 20_000,
      })
      runtime.write(sessionId, "顺便画个图", "followUp", "q-rest")
      await vi.waitFor(() => expect(最后待发单()).toEqual(["q-rest"]), { timeout: 5_000 })

      const 起 = Date.now()
      expect(await runtime.redirect(sessionId, { queueId: "q-now", data: "改成只打偶数" })).toEqual([])
      expect(Date.now() - 起, "sleep 20 被停下了，不是等它跑完").toBeLessThan(10_000)

      // ① 那一步标了已中断——事件上与转录上都是
      expect(事件.find((e) => e.kind === "tool_end" && e.toolName === "bash")).toMatchObject({ interrupted: true })
      expect(transcripts.subscribe(sessionId).items.find((i) => i.type === "tool")).toMatchObject({
        status: "error",
        interrupted: true,
      })
      // ② 那句开了新一轮；③ 其余那句还排着、id 不变
      expect(送到()).toContain("q-now")
      expect(最后待发单()).toEqual(["q-rest"])
      /**
       * 每次请求里模型收到的最后一句用户话。**不看 `requests.at(-1)`**：mock 答得快，
       * 那句的新一轮一眨眼就答完、q-rest 紧跟着开下一轮，轮询时最后一次请求早已是 q-rest 的（2026-09-25 实测）。
       */
      const 最后一句们 = () =>
        server.requests.map((q) => 文本(q.body.messages?.filter((m) => m.role === "user").at(-1)?.content))
      await vi.waitFor(() => expect(最后一句们()).toContain("改成只打偶数"), { timeout: 20_000 })
      // 新一轮完了，排着的那句才送到——在那句之后；模型也是先收到那句、再收到这句
      await vi.waitFor(() => expect(送到()).toContain("q-rest"), { timeout: 30_000 })
      expect(送到().indexOf("q-now")).toBeLessThan(送到().indexOf("q-rest"))
      /**
       * q-rest 是**从 pi 的 followUp 单子上**送到的（`newTurn: false`），不是挂在 #5 那条缝里、等收尾再各开一轮（审查 09-25 I-1）：
       * 调整方向等 pi 真起跑（`preflightResult`）才把其余交出去。
       */
      expect(事件.find((e) => e.kind === "queue_delivered" && e.id === "q-rest")).toMatchObject({ newTurn: false })
      // 中止时 pi 那一声「模型调用失败：This operation was aborted」不出声（审查 09-25 M-1）
      expect(事件.filter((e) => e.kind === "notice" && e.text.includes("模型调用失败"))).toEqual([])
      await vi.waitFor(() => expect(最后一句们()).toContain("顺便画个图"), { timeout: 20_000 })
      expect(最后一句们().indexOf("改成只打偶数")).toBeLessThan(最后一句们().indexOf("顺便画个图"))
    } finally {
      await runtime.stop(sessionId)
    }
  })
})
