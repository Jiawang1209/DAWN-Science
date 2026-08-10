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
 * 一段**富 markdown** 回复。用户说的话里带「markdown」时给它。
 *
 * 它存在的理由是排版：作者 2026-08-10 说*「回复的 markdown 格式并不美观」*，
 * 而**看不见就没法改**——默认那句暗号里一个标题一个列表都没有。
 * 这里把标题层级、有序/无序/嵌套列表、行内与块代码、表格、引用、分隔线
 * 一次摆齐，改样式时对着它看，e2e 也拿它当靶子。
 */
export const MARKDOWN_REPLY = [
  "# 一级标题",
  "",
  "这是一段正文，里面有 `行内代码`、**加粗**、*斜体* 和[一个链接](https://example.com)。",
  "",
  "## 二级标题",
  "",
  "1. 有序的第一项",
  "2. 有序的第二项",
  "   - 嵌套的无序项",
  "   - 又一项",
  "",
  "### 三级标题",
  "",
  "- 无序的一项",
  "- 另一项",
  "",
  "```python",
  "import pandas as pd",
  "df = pd.read_csv('sales.csv')",
  "print(df.describe())",
  "```",
  "",
  "| 字段 | 类型 | 缺失 |",
  "| --- | --- | --- |",
  "| id | int | 0 |",
  "| name | str | 3 |",
  "",
  "> 引用：这一段是补充说明。",
  "",
  "---",
  "",
  "最后一段。",
].join("\n")

/**
 * 起一个假推理服务器。
 *
 * @param {object} [opts]
 * @param {number} [opts.failStatus] 让所有请求以这个 HTTP 状态失败（验「失败要出声」）
 * @param {string} [opts.failMessage] 失败时的 message
 * @param {string} [opts.reply] 固定回复正文
 * @param {(body: any) => {toolName: string, args: object} | undefined} [opts.toolCall]
 *   返回值非空时，改为让模型「调用一个工具」——用来在 e2e 里确定性地触发工具路径
 * @returns {Promise<{url: string, port: number, requests: any[], close: () => Promise<void>}>}
 */
export function startMockInferenceServer(opts = {}) {
  const 默认回复 = opts.reply ?? CANNED_REPLY
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

      /**
       * **说了「markdown」就给那一大段。** 排版这件事看不见就没法改，
       * 而一句暗号里没有标题也没有表格。
       */
      /**
       * **让它失败**（2026-08-10）。
       *
       * 加这一档是为了验一件本来验不了的事：**请求被拒时界面说不说话**。
       * 真实场景里这非常常见——key 写错了、过期了、额度用完了。
       * 而「失败必须出声」是本项目的硬规矩（规格 7.5）。
       */
      if (opts.failStatus) {
        res.writeHead(opts.failStatus, { "content-type": "application/json" })
        res.end(
          JSON.stringify({
            error: { message: opts.failMessage ?? "mock：这个 key 不对", type: "invalid_request_error" },
          }),
        )
        return
      }

      const 用户说的 = JSON.stringify(body.messages ?? "")
      const reply = 用户说的.includes("markdown") ? MARKDOWN_REPLY : 默认回复

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
/**
 * **两个模型，不是一个。**
 *
 * 2026-08-09（①-B″ · U2）：模型选择器需要「有得选」才谈得上验证。
 * 一个模型的假后端能让选择器渲染出来，却证明不了**切换真的发生了**——
 * 而假后端记下的请求体里带着 `model` 字段，那正是唯一能从外部证明它的东西。
 *
 * 准入规则 ①：新增协议操作要在同一次改动里补 mock 分支。
 * 这里是同一条规则的另一面——**新增一个「有多种取值」的能力，
 * 假后端就得能提供多种取值**，否则 `dev:mock` 与 e2e 看到的永远是退化情形。
 */
export function mockModelsJson(
  baseUrl,
  providerId = "deepseek",
  modelIds = ["deepseek-v4-flash", "deepseek-v4-deep"],
) {
  const ids = Array.isArray(modelIds) ? modelIds : [modelIds]
  return {
    providers: {
      [providerId]: {
        baseUrl,
        apiKey: "mock-key-not-a-real-secret",
        api: "openai-completions",
        models: ids.map((id) => ({ id, name: `Mock ${id}`, api: "openai-completions" })),
      },
    },
  }
}
