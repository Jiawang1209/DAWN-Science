/**
 * `NativeRuntime.问一句` 真走 pi 的 `completeSimple` 到假模型（提示词增强 E1）。
 * 两条路都验：有会话（用会话此刻的模型）、没会话（给 provider + model）。
 * 假模型认纪律层的标记句，回「改写：<原文>」——与 e2e 同一套规则（准入规则 ①）。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import { 拼system, 拼user } from "../../src/enhance/prompts.js"
// @ts-expect-error -- .mjs 脚本，无类型声明
import { startMockInferenceServer, mockModelsJson } from "../../scripts/mock-inference-server.mjs"

let server: { url: string; requests: unknown[]; close: () => Promise<void> }
let dir: string
let modelsPath: string

beforeAll(async () => {
  server = await startMockInferenceServer()
  dir = mkdtempSync(join(tmpdir(), "dawn-enhance-ask-"))
  mkdirSync(join(dir, "workspace"), { recursive: true })
  modelsPath = join(dir, "models.json")
  writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url), null, 2))
})
afterAll(() => server?.close())

describe("问一句", () => {
  it("没会话：给 provider + model，拿到整段回答与模型名", { timeout: 30_000 }, async () => {
    const rt = new NativeRuntime({ modelsPath })
    const r = await rt.问一句(
      { provider: "deepseek", model: "deepseek-v4-flash" },
      { system: 拼system(false), user: 拼user("把图画好看点", []), maxTokens: 500 },
    )
    expect(r.text).toBe("改写：把图画好看点")
    expect(r.model).toBe("deepseek/deepseek-v4-flash")
    // 不进转录、不进账本：这儿没有会话，自然也没有
  })

  it("有会话：用会话此刻的模型；带参考块时假模型复述它带了什么", { timeout: 30_000 }, async () => {
    const rt = new NativeRuntime({ modelsPath })
    const sessionId = "s-enh"
    await rt.start({ sessionId, workspace: join(dir, "workspace"), sessionDir: join(dir, "session"), native: { provider: "deepseek", model: "deepseek-v4-flash" } })
    const r = await rt.问一句({ sessionId }, { system: 拼system(true), user: 拼user("再画一张", ["【对话背景（只吸收明确的需求与约束，不复述）】\n[用户] 上一张"]), maxTokens: 500 })
    expect(r.text).toBe("（参考了：对话背景）改写：再画一张")
    await rt.stop(sessionId)
  })

  it("不认识的 provider 如实报错，不静默回退", async () => {
    const rt = new NativeRuntime({ modelsPath })
    await expect(rt.问一句({ provider: "没有这家", model: "x" }, { user: "x", maxTokens: 10 })).rejects.toThrow(/没有 provider/)
  })
})
