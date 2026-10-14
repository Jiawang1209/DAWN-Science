import { expect, it, vi } from "vitest"
// @ts-expect-error -- shared JavaScript mock server
import { startMockInferenceServer } from "../../scripts/mock-inference-server.mjs"

it("标题请求不触发或消耗工具夹具，不混入对话请求列表", async () => {
  const toolCall = vi.fn(() => ({ toolName: "bash", args: { command: "echo main" } }))
  const server = await startMockInferenceServer({ toolCall })
  try {
    const request = async (messages: object[]) => (await fetch(`${server.url}/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "mock", stream: false, messages }),
    })).json() as Promise<{ choices: { message: { content: string; tool_calls?: unknown[] } }[] }>
    const title = await request([
      { role: "system", content: "为会话生成简短主题标题" },
      { role: "user", content: JSON.stringify({ request: "500米8月数据偏差核查，跑个长的", siblingTitles: [] }) },
    ])
    expect(title.choices[0]!.message.content).toBe("500米8月偏差校正")
    expect(title.choices[0]!.message.tool_calls).toBeUndefined()
    expect(toolCall).not.toHaveBeenCalled()
    expect(server.requests).toHaveLength(0)
    await request([{ role: "user", content: "正常的主对话" }])
    expect(toolCall).toHaveBeenCalledTimes(1)
    expect(server.requests).toHaveLength(1)
    expect(server.titleRequests).toHaveLength(1)
  } finally { await server.close() }
})
