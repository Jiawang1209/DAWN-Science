/**
 * 本地 OpenAI 兼容的假推理服务器。
 *
 * **学自 Hermes `apps/desktop/scripts/dev-mock.mjs`。** 它的关键设计不是
 * 「把界面从后端摘下来单独看」——那样看到的是界面的幻觉，接线错了照样看不出来，
 * 而那正是 DAWN 前三次交付翻车的根因。
 *
 * 它的做法是反过来的：**整条真链路照跑，只把最外面那个不确定的东西
 *（模型）换成确定的**。协议、IPC、事件流、pi 的 agent loop、工具执行、
 * 渲染——全都是真的，只有模型回复是写死的。
 *
 * 还有一条同样重要的纪律，Hermes 在文件头写明了：
 * **本模块同时供 `dev:mock` 与 e2e 使用**，使本地开发与 CI 测同一条链。
 * 两套 mock 会各自漂移，那时「本地是好的」就不再意味着什么。
 *
 * ## 怎么让 pi 连过来
 *
 * pi 的内置 provider 把 baseUrl 写死在目录里。覆盖入口是 `models.json`：
 * `{ providers: { deepseek: { baseUrl, apiKey } } }`——由 `ModelConfig.load()`
 * 读取，`ModelRuntime.create({ modelsPath })` 指路。见
 * `«REF»/pi-main/packages/coding-agent/src/core/model-config.ts` 的 `ProviderConfigSchema`。
 */
import http from "node:http"

/** 默认回复。**刻意包含一句可断言的暗号**，e2e 靠它判断整条链通了 */
export const CANNED_REPLY = "假模型已应答：DAWN 的整条链路是通的。"

/**
 * 起一个假推理服务器。
 *
 * @param {object} [opts]
 * @param {string} [opts.reply] 固定回复正文
 * @param {(body: any) => {toolName: string, args: object} | undefined} [opts.toolCall]
 *   返回值非空时，改为让模型「调用一个工具」——用来在 e2e 里确定性地触发工具路径
 * @returns {Promise<{url: string, port: number, requests: any[], close: () => Promise<void>}>}
 */
export function startMockInferenceServer(opts = {}) {
  const reply = opts.reply ?? CANNED_REPLY
  /** 收到的请求原样留存，供测试断言「我们到底发了什么给模型」 */
  const requests = []

  const server = http.createServer((req, res) => {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      // 模型目录探测：pi 会问 /v1/models。给一个空表即可，
      // 真正用哪个模型由 models.json 决定
      if (req.url?.endsWith("/models") && req.method === "GET") {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ object: "list", data: [] }))
        return
      }

      let body
      try {
        body = raw ? JSON.parse(raw) : {}
      } catch {
        // 解析不了也要如实回一个错误，不要假装成功——
        // 假服务器同样受「无静默回退」约束（规格 7.5）
        res.writeHead(400, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: { message: "mock server 收到了非 JSON 的请求体" } }))
        return
      }
      requests.push({ url: req.url, body })

      const tool = opts.toolCall?.(body)
      const stream = body.stream !== false

      if (!stream) {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify(nonStreamPayload(reply, tool)))
        return
      }

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      })
      for (const chunk of streamChunks(reply, tool)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
      res.write("data: [DONE]\n\n")
      res.end()
    })
  })

  return new Promise((resolve, reject) => {
    server.on("error", reject)
    // 端口给 0：**取一个空闲端口**，避免与用户正在跑的东西撞车
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      resolve({
        url: `http://127.0.0.1:${port}/v1`,
        port,
        requests,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

const MODEL_ID = "mock-model"

/** 把回复切成几段发，**让流式路径真的被走到**——一次性发完等于没测流式 */
function streamChunks(reply, tool) {
  const id = "chatcmpl-mock"
  const head = { id, object: "chat.completion.chunk", model: MODEL_ID, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }

  if (tool) {
    return [
      head,
      {
        id, object: "chat.completion.chunk", model: MODEL_ID,
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0, id: "call_mock", type: "function",
              function: { name: tool.toolName, arguments: JSON.stringify(tool.args) },
            }],
          },
          finish_reason: null,
        }],
      },
      { id, object: "chat.completion.chunk", model: MODEL_ID, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
    ]
  }

  const parts = splitIntoParts(reply)
  return [
    head,
    ...parts.map((text) => ({
      id, object: "chat.completion.chunk", model: MODEL_ID,
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    })),
    {
      id, object: "chat.completion.chunk", model: MODEL_ID,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    },
  ]
}

function nonStreamPayload(reply, tool) {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion",
    model: MODEL_ID,
    choices: [{
      index: 0,
      message: tool
        ? { role: "assistant", content: null, tool_calls: [{ id: "call_mock", type: "function", function: { name: tool.toolName, arguments: JSON.stringify(tool.args) } }] }
        : { role: "assistant", content: reply },
      finish_reason: tool ? "tool_calls" : "stop",
    }],
    usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
  }
}

/** 切成三段。段数不重要，**多于一段**才重要 */
function splitIntoParts(text) {
  if (text.length < 3) return [text]
  const n = Math.ceil(text.length / 3)
  return [text.slice(0, n), text.slice(n, n * 2), text.slice(n * 2)].filter(Boolean)
}

/**
 * 生成指向 mock 的 `models.json`。
 *
 * `api: "openai-completions"` 是显式写死的：pi 的 deepseek provider 本来就是
 * 这个形态，但**依赖别人的默认值会让这个假服务器在 provider 换了之后悄悄失效**。
 */
export function mockModelsJson(baseUrl, providerId = "deepseek", modelId = "deepseek-v4-flash") {
  return {
    providers: {
      [providerId]: {
        baseUrl,
        apiKey: "mock-key-not-a-real-secret",
        api: "openai-completions",
        models: [{ id: modelId, name: "Mock model", api: "openai-completions" }],
      },
    },
  }
}
