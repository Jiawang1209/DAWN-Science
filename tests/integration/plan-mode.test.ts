/**
 * 先出方案的真实链路（2026-09-27）。只证单元测试证不了的几件：
 * ①**交完方案这一轮真的停了**——`terminate: true` 穿过我们套的几层包装（方案期门 → 开轮 → 授权 / 溯源 → 工具）一直到 pi 的 agent loop，
 *   模型没被再问一次；
 * ②D3 的轮基线（2026-09-28 定案）在**真的一轮**里：agent 这一轮改了已批准的方案 → 收尾恢复并出声；人两轮之间改的 → 留着、卡片记「你改过」；
 * ③方案期里压缩一次，方案期还在（阶段在方案簿里，不在对话里）。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { AgentEvent } from "../../src/runtime/types.js"
import { 执行那句 } from "../../src/protocol/plan.js"
// @ts-expect-error -- .mjs 脚本，无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer, mockModelsJson } from "../../scripts/mock-inference-server.mjs"

let server: { url: string; requests: unknown[]; close: () => Promise<void> }
let dir: string
let modelsPath: string
beforeAll(async () => {
  server = await startMockInferenceServer()
  dir = mkdtempSync(join(tmpdir(), "dawn-plan-it-"))
  modelsPath = join(dir, "models.json")
  writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url), null, 2))
})
afterAll(async () => {
  await server?.close()
})

async function 起一段(id: string, opts: ConstructorParameters<typeof NativeRuntime>[0] = {}) {
  const runtime = new NativeRuntime({ modelsPath, ...opts })
  const 事件: AgentEvent[] = []
  runtime.attach(id, (e) => 事件.push(e))
  const workspace = join(dir, id, "workspace")
  mkdirSync(workspace, { recursive: true })
  await runtime.start({ sessionId: id, workspace, sessionDir: join(dir, id, "session"), native: { provider: "deepseek", model: "deepseek-flash" } })
  const 说 = async (话: string) => {
    runtime.write(id, 话)
    await runtime.waitForIdle(id)
  }
  return { runtime, 事件, 说, workspace }
}
const 通知 = (事件: AgentEvent[]) => 事件.flatMap((e) => (e.kind === "notice" ? [e.text] : []))

describe("先出方案 · 真 pi", () => {
  it("方案期说一句 → 模型交方案 → 这一轮停下，只请求了一次", { timeout: 60_000 }, async () => {
    const { runtime, 事件 } = await 起一段("s-plan")
    try {
      await runtime.setConfigOption("s-plan", "dawn.plan", "1")
      const 之前 = server.requests.length
      runtime.write("s-plan", "分析一下吸烟和肺功能")
      await vi.waitFor(() => expect(事件.some((e) => e.kind === "plan")).toBe(true), { timeout: 20_000 })
      await runtime.waitForIdle("s-plan")
      expect(server.requests.length - 之前, "交完方案还又问了模型一次——terminate 没穿过包装").toBe(1)
      expect(事件.some((e) => e.kind === "tool_end" && e.toolName === "propose_plan" && !e.isError)).toBe(true)
      // 续接的卡片：history 里那次 propose_plan 换成了方案卡
      const 史 = await runtime.history("s-plan")
      expect(史.find((x) => x.kind === "plan")).toMatchObject({ plan: { version: 1, status: "proposed" } })
      expect(史.some((x) => x.kind === "tool" && x.name === "propose_plan")).toBe(false)
    } finally {
      await runtime.stop("s-plan")
    }
  })

  it("方案期「偷跑」→ write 被门拦下、文件不在", { timeout: 60_000 }, async () => {
    const { runtime, 事件, 说, workspace } = await 起一段("s-sneak")
    try {
      await runtime.setConfigOption("s-sneak", "dawn.plan", "1")
      await 说("偷跑一下")
      const 拦 = 事件.find((e) => e.kind === "tool_end" && e.toolName === "write")
      expect(拦).toMatchObject({ isError: true })
      expect(() => readFileSync(join(workspace, "results/tables/偷跑.csv"))).toThrow()
    } finally {
      await runtime.stop("s-sneak")
    }
  })

  it("批准之后：agent 这一轮改了方案 → 收尾恢复并出声；人两轮之间改的 → 留着、不出声、卡片记「你改过」", { timeout: 60_000 }, async () => {
    const { runtime, 事件, 说, workspace } = await 起一段("s-d3")
    try {
      await runtime.setConfigOption("s-d3", "dawn.plan", "1")
      await 说("分析一下吸烟和肺功能")
      const 卡 = 事件.find((e) => e.kind === "plan") as Extract<AgentEvent, { kind: "plan" }>
      const { savedPath } = await runtime.answerPlan("s-d3", 卡.plan.planId, "approve")
      const 文件 = join(workspace, savedPath!)
      const 原文 = readFileSync(文件, "utf8")

      // 第一轮：模型照方案写第一项产物；**在这一轮里**（那件工具做完、这一轮还没收尾）方案文件被改——门看不见的写法
      let 改了 = false
      runtime.attach("s-d3", (e) => {
        if (!改了 && e.kind === "tool_end" && e.toolName === "write") {
          改了 = true
          writeFileSync(文件, "这一轮里被偷偷改了")
        }
      })
      await 说(执行那句(savedPath!, false))
      expect(改了).toBe(true)
      expect(readFileSync(join(workspace, "results/tables/mock_summary.csv"), "utf8")).toContain("smoker")
      expect(readFileSync(文件, "utf8")).toBe(原文)
      expect(通知(事件).filter((t) => t.includes("已从存档恢复"))).toHaveLength(1)

      // 两轮之间，人自己改：下一轮收尾不恢复、不出声；卡片记「你改过」
      writeFileSync(文件, 原文 + "\n人补了一句。\n")
      await 说(执行那句(savedPath!, false))
      expect(readFileSync(文件, "utf8")).toContain("人补了一句。")
      expect(通知(事件).filter((t) => t.includes("已从存档恢复"))).toHaveLength(1)
      expect(事件.filter((e) => e.kind === "plan").at(-1)).toMatchObject({ plan: { status: "approved", fileChanged: true } })
      const 史 = await runtime.history("s-d3")
      expect(史.find((x) => x.kind === "plan")).toMatchObject({ plan: { fileChanged: true } })
    } finally {
      await runtime.stop("s-d3")
    }
  })

  it("方案期里压缩一次：方案期还在，压完再说一句照样交方案", { timeout: 60_000 }, async () => {
    const { runtime, 事件, 说 } = await 起一段("s-compact", { compaction: { keepRecentTokens: 1 } })
    try {
      await runtime.setConfigOption("s-compact", "dawn.plan", "1")
      await 说("第一句")
      await 说("第二句")
      runtime.compact("s-compact", "保留方案")
      await runtime.waitForIdle("s-compact")
      const 收 = 事件.find((e) => e.kind === "compaction_end") as Extract<AgentEvent, { kind: "compaction_end" }> | undefined
      expect(收?.status, 收?.error).toBe("done")
      expect(runtime.configOptions("s-compact")!.find((o) => o.id === "dawn.plan")!.current).toBe("1")
      await 说("第三句")
      expect(事件.filter((e) => e.kind === "plan").at(-1)).toMatchObject({ plan: { version: 3, status: "proposed" } })
    } finally {
      await runtime.stop("s-compact")
    }
  })

  it("回退一轮方案：那一版从方案簿里摘掉（答不了、版本号接得上），上一版回到「等你看」；方案期照旧", { timeout: 60_000 }, async () => {
    const { runtime, 事件, 说 } = await 起一段("s-rewind")
    try {
      await runtime.setConfigOption("s-rewind", "dawn.plan", "1")
      await 说("第一版")
      await 说("重写一版")
      const 版 = 事件.flatMap((e) => (e.kind === "plan" && e.plan.status === "proposed" ? [e.plan] : []))
      expect(版.map((p) => p.version)).toEqual([1, 2])
      const r = await runtime.rewind("s-rewind", { 倒数第几句: 1, 文: "重写一版" }, "conversation", [])
      expect(r.conversationError).toBeUndefined()
      await expect(runtime.answerPlan("s-rewind", 版[1]!.planId, "approve")).rejects.toThrow(/没有这一版方案/)
      // 第 1 版又是最新的了：卡片回到「等你看」（事件把它盖回去）
      expect(事件.filter((e) => e.kind === "plan").at(-1)).toMatchObject({ plan: { planId: 版[0]!.planId, status: "proposed" } })
      expect(runtime.configOptions("s-rewind")!.find((o) => o.id === "dawn.plan")!.current).toBe("1")
      await 说("再来一版")
      expect(事件.filter((e) => e.kind === "plan").at(-1)).toMatchObject({ plan: { version: 2, status: "proposed" } })
      const 史 = await runtime.history("s-rewind")
      expect(史.flatMap((x) => (x.kind === "plan" ? [x.plan.version] : []))).toEqual([1, 2])
    } finally {
      await runtime.stop("s-rewind")
    }
  })
})
