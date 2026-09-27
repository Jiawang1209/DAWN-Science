/**
 * 假模型的「改两个文件」分支（2026-09-27，回退这一轮；准入规则 1）。
 * dev:mock 里人要点得到「回到这句之前」、e2e 与集成测试要有东西可退——都靠这一支真的改文件。
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

describe("mock · 改两个文件", () => {
  it("最后一句用户话带「改两个文件」→ 先说一句、再调一条改 out/图.txt 与 README.md 的 bash", async () => {
    const m = (await 问([{ role: "user", content: "帮我改两个文件" }])).choices[0]!.message
    expect(m.content).toBe("我改两个文件。")
    expect(m.tool_calls?.[0]?.function.name).toBe("bash")
    expect(JSON.parse(m.tool_calls![0]!.function.arguments)).toEqual({
      command: "mkdir -p out && printf 'x\\n' >> out/图.txt && printf '改过\\n' >> README.md",
    })
  })
  it("拿到工具结果之后那一问不再调——不循环", async () => {
    const j = await 问([
      { role: "user", content: "改两个文件" },
      { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "bash", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c", content: "" },
    ])
    expect(j.choices[0]!.message.tool_calls).toBeUndefined()
  })
  it("「慢慢跑」照旧是 sleep 20，两支互不抢", async () => {
    const m = (await 问([{ role: "user", content: "慢慢跑" }])).choices[0]!.message
    expect(JSON.parse(m.tool_calls![0]!.function.arguments)).toEqual({ command: "sleep 20" })
  })
})
