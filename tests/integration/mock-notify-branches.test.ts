/**
 * 假模型的「演一次失败」「演一次权限」（2026-09-27，桌面通知；准入规则 1）。
 * 桌面通知三种时刻里，出错与等你点头此前只有夹具级旋钮（`failStatus` 整台服务器都失败、`toolCall` 要写进用例），
 * dev:mock 里人演不出来——两句暗号各开一支，e2e 用的也是它们。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
// @ts-expect-error -- .mjs 脚本，无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer, 演一次权限 } from "../../scripts/mock-inference-server.mjs"
import { 看风险 } from "../../src/policy/permissions.js"

let server: { url: string; close: () => Promise<void> }
beforeAll(async () => {
  server = await startMockInferenceServer()
})
afterAll(async () => {
  await server?.close()
})

const 问 = (messages: unknown[]) =>
  fetch(`${server.url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "m", stream: false, messages }),
  })

describe("mock · 演一次失败", () => {
  it("最后一句用户话带它 → 401，message 里说清是演的", async () => {
    const r = await 问([{ role: "user", content: "演一次失败" }])
    expect(r.status).toBe(401)
    expect(((await r.json()) as { error: { message: string } }).error.message).toContain("演一次失败")
  })
  it("前面说过、最后一句没说 → 照常回答（不把整段会话都毒死）", async () => {
    const r = await 问([
      { role: "user", content: "演一次失败" },
      { role: "assistant", content: "…" },
      { role: "user", content: "你好" },
    ])
    expect(r.status).toBe(200)
  })
})

describe("mock · 演一次权限", () => {
  it("先说一句、再调一条要联网的 bash", async () => {
    const j = (await (await 问([{ role: "user", content: "演一次权限" }])).json()) as {
      choices: { message: { content: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[]
    }
    const m = j.choices[0]!.message
    expect(m.content).toBe(演一次权限.say)
    expect(m.tool_calls?.[0]?.function.name).toBe("bash")
    expect(JSON.parse(m.tool_calls![0]!.function.arguments)).toEqual(演一次权限.args)
  })
  it("那条命令真会被门当成「联网」——「请求批准」档下弹得出卡（不是硬拒、不是放行）", () => {
    const 险 = 看风险("bash", 演一次权限.args, { workspace: "/tmp/w", remote: false })
    expect(险?.类别).toBe("联网")
  })
  it("拿到工具结果之后不再调——不循环", async () => {
    const j = (await (
      await 问([
        { role: "user", content: "演一次权限" },
        { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "bash", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "c", content: "人拒绝了" },
      ])
    ).json()) as { choices: { message: { tool_calls?: unknown[] } }[] }
    expect(j.choices[0]!.message.tool_calls).toBeUndefined()
  })
})
