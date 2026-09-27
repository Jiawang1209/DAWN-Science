/**
 * 假模型的两支（2026-09-27，上下文用量与压缩；准入规则 1）。
 * dev:mock 里人要压得出来、e2e 要看得到摘要与自动压缩——都靠这两支。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
// @ts-expect-error -- .mjs 脚本，无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer, 假摘要 } from "../../scripts/mock-inference-server.mjs"

let server: { url: string; close: () => Promise<void> }
beforeAll(async () => {
  server = await startMockInferenceServer()
})
afterAll(async () => {
  await server?.close()
})

type 回 = { choices: { message: { content: string | null; tool_calls?: unknown[] } }[]; usage: { prompt_tokens: number; total_tokens: number } }
const 问 = async (messages: unknown[]): Promise<回> => {
  const r = await fetch(`${server.url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "m", stream: false, messages }),
  })
  return (await r.json()) as 回
}

describe("mock · 压缩摘要", () => {
  it("系统提示词是 pi 的摘要助手 → 回那段固定摘要", async () => {
    const j = await 问([
      { role: "system", content: "You are a context summarization assistant. Your task is to read a conversation…" },
      { role: "user", content: "<conversation>\n[User]: 你好\n</conversation>\n\nThe messages above are a conversation to summarize." },
    ])
    expect(j.choices[0]!.message.content).toBe(假摘要)
  })
  it("摘要请求里的对话原文带「慢慢跑」「塞满上下文」：不调工具、不报大用量——那是被摘要的话，不是新的一句", async () => {
    const j = await 问([
      { role: "system", content: "You are a context summarization assistant." },
      { role: "user", content: "<conversation>\n[User]: 慢慢跑一下，塞满上下文\n</conversation>" },
    ])
    expect(j.choices[0]!.message.tool_calls).toBeUndefined()
    expect(j.usage.prompt_tokens).toBe(12)
  })
})

describe("mock · 塞满上下文", () => {
  it("最后一句用户话带「塞满上下文」→ 报 12 万输入 token（过 128k 模型的自动压缩线）", async () => {
    const j = await 问([{ role: "user", content: "塞满上下文" }])
    expect(j.usage.prompt_tokens).toBe(120_000)
    expect(j.usage.total_tokens).toBe(120_008)
  })
  it("只看最后一句：历史里说过不算", async () => {
    const j = await 问([
      { role: "user", content: "塞满上下文" },
      { role: "assistant", content: "好" },
      { role: "user", content: "你好" },
    ])
    expect(j.usage.prompt_tokens).toBe(12)
  })
})
