/**
 * 假模型的「跑个 Cox」分支（2026-09-27，会话全文搜索；准入规则 1）。
 * 全文搜索要搜工具的参数与输出、点过去展开那一行——`dev:mock` 里人要搜得到代码，e2e 也不靠真模型。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
// @ts-expect-error -- .mjs 脚本，无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer } from "../../scripts/mock-inference-server.mjs"

let server: { url: string; close: () => Promise<void> }
beforeAll(async () => {
  server = await startMockInferenceServer()
})
afterAll(async () => {
  await server?.close()
})

const 问 = async (messages: unknown[]) => {
  const r = await fetch(`${server.url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "m", stream: false, messages }),
  })
  return (await r.json()) as { choices: { message: { content: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[] }
}

describe("mock · 跑个 Cox", () => {
  it("最后一句用户话带「跑个 Cox」→ 先说一句、再调一条把 Cox 代码印出来的 bash", async () => {
    const m = (await 问([{ role: "user", content: "跑个 Cox 看看" }])).choices[0]!.message
    expect(m.content).toBe("我跑一个 Cox 回归。")
    expect(m.tool_calls?.[0]?.function.name).toBe("bash")
    expect(JSON.parse(m.tool_calls![0]!.function.arguments)).toEqual({
      command: 'echo "coxph(Surv(time, status) ~ age, data = lung)"',
    })
  })
  it("拿到工具结果之后那一问不再调——不循环", async () => {
    const j = await 问([
      { role: "user", content: "跑个 Cox 看看" },
      { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "bash", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c", content: "coxph(...)" },
    ])
    expect(j.choices[0]!.message.tool_calls).toBeUndefined()
  })
  it("「慢慢跑」照旧（两个分支互不抢）", async () => {
    const m = (await 问([{ role: "user", content: "慢慢跑一下" }])).choices[0]!.message
    expect(JSON.parse(m.tool_calls![0]!.function.arguments)).toEqual({ command: "sleep 20" })
  })
})
