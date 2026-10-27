import { describe, expect, it } from "vitest"
import { parseSetupEndpoint } from "../../src/ui/setup-endpoint.js"

const defaults = {
  deepseek: { baseUrl: "https://api.deepseek.com", api: "openai-completions" },
  anthropic: { baseUrl: "https://api.anthropic.com", api: "anthropic-messages" },
}

describe("首启连接地址识别", () => {
  it("识别目录地址与完整的 OpenAI/Anthropic 接口路径", () => {
    expect(parseSetupEndpoint("https://api.deepseek.com/v1/chat/completions", defaults)).toMatchObject({ providerId: "deepseek", baseUrl: "https://api.deepseek.com/v1", api: "openai-completions", recognized: true })
    expect(parseSetupEndpoint("https://api.anthropic.com/v1/messages", defaults)).toMatchObject({ providerId: "anthropic", baseUrl: "https://api.anthropic.com", api: "anthropic-messages" })
    expect(parseSetupEndpoint("https://api.anthropic.com/v1/", defaults)).toMatchObject({ providerId: "anthropic", baseUrl: "https://api.anthropic.com", api: "anthropic-messages" })
    expect(parseSetupEndpoint("https://lab.example/v1", {}, "anthropic-messages")).toMatchObject({ baseUrl: "https://lab.example", api: "anthropic-messages" })
    expect(parseSetupEndpoint("https://gateway.example/v1/responses", {})).toMatchObject({ baseUrl: "https://gateway.example/v1", api: "openai-responses", recognized: false })
  })

  it("未知主机或共享地址不冒认服务商；自定义 ID 对规范化后的地址稳定", () => {
    expect(parseSetupEndpoint("https://api.deepseek.com.evil.example/v1", defaults).recognized).toBe(false)
    const shared = { a: { baseUrl: "https://gateway.example/v1" }, b: { baseUrl: "https://gateway.example/v1" } }
    expect(parseSetupEndpoint("https://gateway.example/v1", shared).recognized).toBe(false)
    expect(parseSetupEndpoint("https://gateway.example/v1/chat/completions", {}).providerId).toBe(parseSetupEndpoint("https://gateway.example/v1/", {}).providerId)
  })

  it.each(["file:///tmp/key", "https://user:pass@example.com/v1", "https://example.com/v1?key=secret", "https://example.com/v1#fragment", "not-a-url"])("拒绝不适合作为连接基址的输入 %s", raw => {
    expect(() => parseSetupEndpoint(raw, defaults)).toThrow()
  })
})
