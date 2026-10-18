import { afterAll, beforeAll, expect, it } from "vitest"
// @ts-expect-error 共享推理服务器为 mjs
import { startMockInferenceServer } from "../../scripts/mock-inference-server.mjs"
let server: Awaited<ReturnType<typeof startMockInferenceServer>>
beforeAll(async () => {server = await startMockInferenceServer()})
afterAll(async () => {await server.close()})
it("共享 mock 按本轮实际资源结果完成四次查询，不跨续问复用旧 ID", async () => {
  const messages: object[] = [{role: "user", content: [{type: "text", text: "子资源验收：按需读取"}]}]
  const tools = ["resource_search", "resource_read"].map(name => ({type: "function", function: {name, parameters: {type: "object"}}}))
  const expected = ["resource_search", "resource_read", "resource_search", "resource_read"]
  for (const [i, name] of expected.entries()) {
    const response = await fetch(server.url + "/chat/completions", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({model: "deepseek-flash", messages, tools, stream: false})})
    const body = await response.json(), message = body.choices[0].message
    expect(message.tool_calls?.[0]?.function.name).toBe(name)
    const args = JSON.parse(message.tool_calls[0].function.arguments)
    if (i === 1) expect(args.id).toBe("skill-id")
    if (i === 3) expect(args.id).toBe("memory-id")
    messages.push(message, {role: "tool", tool_call_id: message.tool_calls[0].id, content: JSON.stringify(i % 2 === 0 ? {items: [{id: i === 0 ? "skill-id" : "memory-id"}]} : {content: "实际正文"})})
  }
})
