/**
 * `models.json` 生成：列出的模型**不再硬写成收图**（2026-08-26）。
 *
 * 作者的 `providers.yaml` 里 deepseek 列了 `deepseek-v4-flash`，
 * 上一版把每个列出的模型都写成 `input: ["text","image"]`——
 * 于是 agent `read` 到一张 png 就把字节发了出去，DeepSeek 回 400。
 * 他从没要过图。**缺失不等于支持。**
 */
import { describe, expect, it } from "vitest"
import { buildModelsJson } from "../../src/config/models-json.js"

const 取 = (json: ReturnType<typeof buildModelsJson>, p: string, id: string) =>
  (json.providers?.[p]?.models ?? []).find((m) => m.id === id)

describe("buildModelsJson · 模型的 input", () => {
  it("注册表认识的模型继承它的 input（deepseek-v4-flash 只收文字）", () => {
    const json = buildModelsJson({ deepseek: { models: ["deepseek-v4-pro", "deepseek-v4-flash"] } })
    expect(取(json, "deepseek", "deepseek-v4-flash")?.input).toEqual(["text"])
    expect(取(json, "deepseek", "deepseek-v4-pro")?.input).toEqual(["text"])
  })

  it("注册表认识的模型把它声明的其他字段也带上（pi 对列出的模型不会自己回填）", () => {
    const json = buildModelsJson({ deepseek: { models: ["deepseek-v4-flash"] } })
    const m = 取(json, "deepseek", "deepseek-v4-flash")!
    expect(m.reasoning).toBe(true)
    expect(m.contextWindow).toBe(1000000)
    expect(m.api).toBe("openai-completions")
    // 不带的：provider / baseUrl（由 provider 层决定）、密钥
    expect(m).not.toHaveProperty("provider")
    expect(m).not.toHaveProperty("baseUrl")
  })

  it("yaml 写了 api 时以 yaml 为准，不被注册表盖掉", () => {
    const json = buildModelsJson({
      deepseek: { api: "anthropic-messages", models: ["deepseek-v4-flash"] },
    })
    expect(取(json, "deepseek", "deepseek-v4-flash")?.api).toBe("anthropic-messages")
  })

  it("自建端点上不认识的模型缺省只收文字", () => {
    const json = buildModelsJson({
      myvllm: { baseUrl: "http://127.0.0.1:8000/v1", api: "openai-completions", models: ["qwen-x"] },
    })
    const m = 取(json, "myvllm", "qwen-x")!
    expect(m.input).toEqual(["text"])
    expect(m.name).toBe("qwen-x")
    expect(m.api).toBe("openai-completions")
  })

  it("provider 声明 vision: true 时，它列出的模型收图", () => {
    const json = buildModelsJson({
      myvllm: { baseUrl: "http://127.0.0.1:8000/v1", api: "openai-completions", vision: true, models: ["qwen-vl"] },
    })
    expect(取(json, "myvllm", "qwen-vl")?.input).toEqual(["text", "image"])
  })

  it("vision: true 对注册表认识的模型同样生效（用户明确要的才算）", () => {
    const json = buildModelsJson({ deepseek: { vision: true, models: ["deepseek-v4-flash"] } })
    expect(取(json, "deepseek", "deepseek-v4-flash")?.input).toEqual(["text", "image"])
  })

  it("基底里的 apiKey 不落盘；没列 models 的 provider 不写 models", () => {
    const json = buildModelsJson(
      { deepseek: { baseUrl: "https://x" } },
      { providers: { deepseek: { apiKey: "sk-fake", models: [{ id: "a", name: "a" }] } } },
    )
    expect(json.providers?.deepseek).not.toHaveProperty("apiKey")
    expect(json.providers?.deepseek?.baseUrl).toBe("https://x")
    // 基底给的 models 保留
    expect(json.providers?.deepseek?.models?.[0]?.id).toBe("a")
  })
})
