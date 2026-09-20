/**
 * `models.json` 生成：列出的模型**不再硬写成收图**（2026-08-26）。
 *
 * 作者的 `providers.yaml` 里 deepseek 列了 `deepseek-v4-flash`，
 * 上一版把每个列出的模型都写成 `input: ["text","image"]`——
 * 于是 agent `read` 到一张 png 就把字节发了出去，DeepSeek 回 400。
 * 他从没要过图。**缺失不等于支持。**
 *
 * **2026-09-20 这份判据换了分工**（pi 升 0.86.0，DeepSeek 退休了 `deepseek-v4-flash`
 * 这个别名，V4.1-Flash 叫 `deepseek-flash` 且**真的收图了**）。
 * 换 id 之前这里两个模型都只收文字，**「继承注册表的声明」只验了一个方向**；
 * 现在一边一个：`deepseek-flash` 说收图、`deepseek-v4-pro` 说只收文字。
 *
 * 更要紧的是 `vision: true` 那条**必须挂在注册表说「只收文字」的模型上**。
 * 挂在 `deepseek-flash` 上的话，代码把这个开关整个忽略掉它也是绿的——
 * 那就是本项目说的「两处长得一样，等于没有判据」。
 */
import { describe, expect, it } from "vitest"
import { buildModelsJson } from "../../src/config/models-json.js"

const 取 = (json: ReturnType<typeof buildModelsJson>, p: string, id: string) =>
  (json.providers?.[p]?.models ?? []).find((m) => m.id === id)

describe("buildModelsJson · 模型的 input", () => {
  it("注册表认识的模型继承它的 input——两个方向都验", () => {
    const json = buildModelsJson({ deepseek: { models: ["deepseek-v4-pro", "deepseek-flash"] } })
    // 注册表说收图 → 我们写收图（不写的话粘进去的图会被静默丢掉）
    expect(取(json, "deepseek", "deepseek-flash")?.input).toEqual(["text", "image"])
    // 注册表说只收文字 → 我们只写文字（写多了就是 2026-08-26 那个 400）
    expect(取(json, "deepseek", "deepseek-v4-pro")?.input).toEqual(["text"])
  })

  it("注册表认识的模型把它声明的其他字段也带上（pi 对列出的模型不会自己回填）", () => {
    const json = buildModelsJson({ deepseek: { models: ["deepseek-flash"] } })
    const m = 取(json, "deepseek", "deepseek-flash")!
    expect(m.reasoning).toBe(true)
    expect(m.contextWindow).toBe(1000000)
    expect(m.api).toBe("openai-completions")
    // 不带的：provider / baseUrl（由 provider 层决定）、密钥
    expect(m).not.toHaveProperty("provider")
    expect(m).not.toHaveProperty("baseUrl")
  })

  it("yaml 写了 api 时以 yaml 为准，不被注册表盖掉", () => {
    const json = buildModelsJson({
      deepseek: { api: "anthropic-messages", models: ["deepseek-flash"] },
    })
    expect(取(json, "deepseek", "deepseek-flash")?.api).toBe("anthropic-messages")
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
    // **必须挑一个注册表说「只收文字」的**——挂在 deepseek-flash 上的话，
    // 代码就算完全忽略这个开关，这条也照样绿。
    const json = buildModelsJson({ deepseek: { vision: true, models: ["deepseek-v4-pro"] } })
    expect(取(json, "deepseek", "deepseek-v4-pro")?.input).toEqual(["text", "image"])
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
