/**
 * 一台**假的 ACP agent**（A1，2026-08-16）。
 *
 * ## 它存在的理由，与那台假模型服务器一模一样
 *
 * 真适配器（`@agentclientprotocol/codex-acp` 等）要联网、要登录、
 * 首次还要 `npx` 拉几十兆。拿它跑 e2e 的结果是**那条用例几乎不会被跑**。
 *
 * 所以照 `mock-inference-server.mjs` 那条纪律：
 * **整条链路照跑，只把最外面那个不确定的东西换成确定的。**
 * 协议、进程、stdio、JSON-RPC、我们的运行时、转录、渲染——全是真的，
 * **假的只是「另一端是谁」**。
 *
 * ## 线上格式
 *
 * ACP 是 stdio 上的 **NDJSON**（一行一条 JSON-RPC 消息）。
 * 这份实现只答我们 A1 用得到的三件：`initialize`、`session/new`、`session/prompt`，
 * 外加 `session/cancel`。别的一律回「方法不认识」——
 * **不假装支持**，那样我们才能在用例里看出「这条路还没通」。
 *
 * ## 可调的行为（环境变量）
 *
 * | 变量 | 作用 |
 * |---|---|
 * | `FAKE_ACP_REPLY` | 回什么话，默认是下面那句暗号 |
 * | `FAKE_ACP_CHUNK_DELAY_MS` | 每段之间停多久（验流式与「正在等」） |
 * | `FAKE_ACP_FAIL_INIT` | 置一即在 `initialize` 上报错（验失败要出声） |
 * | `FAKE_ACP_USAGE` | 置一即在回合结束时报 usage（**累计值**，验差值那条） |
 * | `FAKE_ACP_ASK` | 置一即在回话之前**问一次权限**（A2） |
 * | `FAKE_ACP_CALL_MCP` | 置一即**真的去连 DAWN 递过来的那台 MCP 服务器**并调一次（B1） |
 * | `FAKE_ACP_RUN_KERNEL` | 给一段代码即改调 `dawn_run_in_kernel` 跑它（B1·B′，要真内核） |
 * | `FAKE_ACP_LIKE_CLAUDE` | 置一即装成 claude 那台适配器：没有 `configOptions`，只有 `models`/`modes` |
 * | `FAKE_ACP_ASK_NO_OPTIONS` | 置一即问一次但**一个选项都不给**（验那条退路） |
 */

/** **刻意包含一句可断言的暗号**，e2e 靠它判断整条链通了 */
export const FAKE_ACP_REPLY = "假 ACP agent 已应答：DAWN 的 ACP 链路是通的。"

const 回话 = process.env["FAKE_ACP_REPLY"] ?? FAKE_ACP_REPLY
const 段间隔 = Number(process.env["FAKE_ACP_CHUNK_DELAY_MS"] ?? "0")
const 报用量 = process.env["FAKE_ACP_USAGE"] === "1"

/** 这台假 agent 一共答过多少 token。**累计**——真适配器就是这么报的 */
let 累计输入 = 0
let 累计输出 = 0
let 取消了 = false
/** 我们问出去的那些，等着客户端回。key 是 JSON-RPC id */
const 问出去的 = new Map()
let 下一个问id = 1000
/** 最近一次 prompt 的会话 id。协议违规那条要拿它当收件人 */
let 最近的会话 = ""
/** DAWN 在 `session/new` 里递过来的那些 MCP 服务器（B1） */
let 收下的MCP = []

/**
 * 这台假 agent 声称自己有哪些会话开关（A3）。
 *
 * **刻意三条不同形状**：一个 `model` 的 select、一个 `thought_level` 的
 * select（**带分组**，验我们摊平那一段）、一个 boolean。
 * 真适配器给什么我们不知道，而**能处理未知与分组**才是这一层的价值。
 */
/**
 * **装成 claude 那台适配器**（2026-08-17，拿真的量出来的）。
 *
 * `@zed-industries/claude-code-acp` 0.16.2 不给 `configOptions`，
 * 只给 `models` 与 `modes`，改设置走 `session/set_model` / `session/set_mode`，
 * 而且**回的是空的 `{}`**（不带整份新开关）。
 * `@agentclientprotocol/codex-acp` 1.4.0 则三样都给。
 *
 * 一台假 agent 只演一种适配器的话，我们验的就只是那一种。
 */
const 像claude = process.env["FAKE_ACP_LIKE_CLAUDE"] === "1"

/** 键名刻意保持不对称：模型是 `modelId`，模式是 `id`——真适配器就是这样 */
const 那两份 = {
  models: {
    currentModelId: "default",
    availableModels: [
      /**
       * **说明里那个 `<模型> · <说明>` 的形状是照真 claude 抄的**
       * （2026-08-19）：`@zed-industries/claude-code-acp` 0.16.2 报的是
       * `name: "Default (recommended)"` + `description: "Opus 4.6 · Most capable…"`。
       *
       * 抄这个形状不是为了好看：界面有一条「把 `·` 前面那段提到前面」的规则
       * （作者要的——*「直接是 Opus4.6 而不是 Default (recommended)」*）。
       * **假的这里不带 `·`，那条规则就没有任何判据走得到它。**
       */
      { modelId: "default", name: "Default (recommended)", description: "Opus 4.6 · 最能干的那个" },
      { modelId: "haiku", name: "Haiku", description: "Haiku 4.5 · 快而便宜" },
    ],
  },
  modes: {
    currentModeId: "default",
    availableModes: [
      { id: "default", name: "Default", description: "危险操作要问" },
      { id: "acceptEdits", name: "Accept Edits", description: "文件改动自动接受" },
    ],
  },
}

const 开关们 = [
  {
    id: "model",
    name: "模型",
    category: "model",
    type: "select",
    currentValue: "sonnet",
    options: [
      { value: "sonnet", name: "Sonnet" },
      { value: "opus", name: "Opus", description: "更贵更强" },
    ],
  },
  {
    id: "thought",
    name: "推理强度",
    category: "thought_level",
    type: "select",
    currentValue: "low",
    // **分组形状**：里面套一层 options
    options: [
      { name: "常用", options: [{ value: "low", name: "低" }, { value: "high", name: "高" }] },
    ],
  },
  { id: "yolo", name: "不再逐个确认", type: "boolean", currentValue: false },
]

function 发(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

/**
 * `mcpServers` 那一格的形状对不对。**只校验形状，不校验语义**——
 * 名字叫什么、命令存不存在，那是真 agent 拉起来时的事。
 *
 * @returns 有问题就回一段说明（照真适配器的口径：说清是哪一项、嫌什么），
 *   没问题回 `undefined`
 */
function 挑出坏的MCP(list) {
  if (list === undefined) return { _errors: ["Invalid input: expected array, received undefined"] }
  if (!Array.isArray(list)) return { _errors: ["Invalid input: expected array"] }
  for (let i = 0; i < list.length; i++) {
    const 台 = list[i]
    if (!台 || typeof 台 !== "object") return { [i]: { _errors: ["expected object"] } }
    for (const k of ["name", "command"]) {
      if (typeof 台[k] !== "string") return { [i]: { [k]: { _errors: ["expected string"] } } }
    }
    if (!Array.isArray(台.args)) return { [i]: { args: { _errors: ["expected array"] } } }
    /**
     * **这一条就是那个洞。** `env` 是 `[{name, value}]`，不是一个对象——
     * 真适配器的原话：`Invalid input: expected array, received object`。
     */
    if (!Array.isArray(台.env)) {
      return { [i]: { env: { _errors: [`Invalid input: expected array, received ${台.env === undefined ? "undefined" : typeof 台.env}`] } } }
    }
    for (const e of 台.env) {
      if (!e || typeof e.name !== "string" || typeof e.value !== "string") {
        return { [i]: { env: { _errors: ["每一条要是 {name: string, value: string}"] } } }
      }
    }
  }
  return undefined
}

function 回结果(id, result) {
  发({ jsonrpc: "2.0", id, result })
}

/**
 * @param data 具体嫌什么。**照真适配器的口径放在 `data` 里**——
 *   `message` 只是 JSON-RPC 的分类（`Invalid params`），指望它具体是错的。
 *   （2026-08-19：客户端一侧一直只取 `message`、把 `data` 扔了，
 *   于是屏幕上只剩「操作 createTask 执行失败」。两边一起修的。）
 */
function 回错(id, code, message, data) {
  发({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } })
}

const 睡 = (ms) => new Promise((r) => setTimeout(r, ms))

async function 处理(msg) {
  const { id, method, params } = msg

  if (method === "initialize") {
    if (process.env["FAKE_ACP_FAIL_INIT"] === "1") {
      // **失败要出声**：我们的运行时应当把这句话原样摆到屏幕上
      return 回错(id, -32603, "假 agent 被要求在初始化时失败")
    }
    return 回结果(id, {
      protocolVersion: params?.protocolVersion ?? 1,
      agentCapabilities: {
        // **默认不支持**：多数适配器现在就是这样，而「不支持」与「失败」要分得开
        loadSession: process.env["FAKE_ACP_CAN_LOAD"] === "1",
        promptCapabilities: { image: false },
      },
      authMethods: [],
    })
  }

  if (method === "session/new") {
    /**
     * **像真适配器那样校验 `mcpServers`**（2026-08-19 补的）。
     *
     * ## 它是被一个真实的洞逼出来的
     *
     * DAWN 一直把 `env` 当成 `Record<string, string>` 送出去，
     * 而 ACP 里它是 `EnvVariable[]`（`{name, value}` 一条条列）。
     * 真的 `@zed-industries/claude-code-acp` 当场回 `-32602 Invalid params`，
     * 作者在界面上看到的是一句「操作 createTask 执行失败」。
     *
     * **而这台假 agent 此前照单全收**——于是整套 e2e 全绿，
     * 而那条路在真适配器上一步都走不动。
     *
     * 这正是本仓库那条准入规则的原话：*「两套 mock 会各自漂移，
     * 那时『本地是好的』就不再意味着什么。」* 假的可以省掉一切**行为**，
     * **但不能在契约的形状上比真的宽容**——宽容的那一格就是判据的盲区。
     */
    const 坏的 = 挑出坏的MCP(params?.mcpServers)
    if (坏的) return 回错(id, -32602, "Invalid params", 坏的)
    收下的MCP = params?.mcpServers ?? []
    // **cwd 原样回给我们**：用例据此验「它真的开在项目目录里」
    return 回结果(id, {
      sessionId: `fake-acp-${Date.now()}`,
      _meta: { cwd: params?.cwd },
      // **开关随会话一起给**（A3）——真适配器就是这么报的
      /**
       * **codex 那台三样都给**（`configOptions` + `models` + `modes`），
       * claude 那台只给后两样。照着各自的真形状发——
       * 只发 `configOptions` 的话，「已经有了就不再合成」那道闸
       * 删掉也没人红（2026-08-17 变异测试当场抓到的假绿）。
       */
      ...(像claude
        ? 那两份
        : process.env["FAKE_ACP_NO_CONFIG"] === "1"
          ? {}
          : { configOptions: 开关们, ...那两份 }),
    })
  }

  if (method === "session/load") {
    /**
     * **没声明支持就不认这个方法**——真 agent 就是这样。
     *
     * 一律答应的话，「问过能力再试」与「不问就试」在用例里分不出来
     * （变异测试当场证明了：把那个判断删掉，用例照样绿）。
     */
    if (process.env["FAKE_ACP_CAN_LOAD"] !== "1") {
      return 回错(id, -32601, "假 agent 没有声明 loadSession，不认识这个方法")
    }
    最近的会话 = params?.sessionId
    if (process.env["FAKE_ACP_LOAD_FAILS"] === "1") {
      return 回错(id, -32603, "假 agent 被要求在 load 时失败")
    }
    /**
     * **接上了要留个痕迹**：不留的话「接回来了」与「新开了一段」
     * 在屏幕上一模一样，那时用例证明不了任何事。
     */
    发({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `【接回了上一段】${params.sessionId}` },
        },
      },
    })
    return 回结果(id, { configOptions: 开关们 })
  }

  if (method === "session/set_config_option") {
    /**
     * **claude 那台适配器根本没有这个方法**（2026-08-17 实测 0.16.2）。
     * 回 -32601 而不是回一个空结果——两者在客户端那边要走完全不同的路，
     * 而「回空结果」会让「我们发错了方法」这件事悄悄溜过去。
     */
    if (像claude) return 回错(id, -32601, '"Method not found": session/set_config_option')
    const 条 = 开关们.find((o) => o.id === params?.configId)
    if (!条) return 回错(id, -32602, `没有这个开关：${params?.configId}`)
    条.currentValue = params.value
    /**
     * **回整份新的**，不是回改动的那一条——协议就是这么定的，
     * 而它顺带免掉了客户端的合并逻辑（合并只会多一种「合错了」的失效方式）。
     */
    return 回结果(id, { configOptions: 开关们 })
  }

  if (method === "session/set_model") {
    const 有 = 那两份.models.availableModels.some((m) => m.modelId === params?.modelId)
    if (!有) return 回错(id, -32602, `没有这个模型：${params?.modelId}`)
    那两份.models.currentModelId = params.modelId
    // **回空的 `{}`**——真 claude 就是这样，客户端得自己改当前值
    return 回结果(id, {})
  }

  if (method === "session/set_mode") {
    const 有 = 那两份.modes.availableModes.some((m) => m.id === params?.modeId)
    if (!有) return 回错(id, -32602, `没有这个模式：${params?.modeId}`)
    那两份.modes.currentModeId = params.modeId
    return 回结果(id, {})
  }

  if (method === "session/cancel") {
    取消了 = true
    return // 通知，没有回复
  }

  if (method === "session/prompt") {
    取消了 = false
    最近的会话 = params.sessionId

    /**
     * **先问一次权限**（A2）。真 agent 就是这么干的：
     * 它要动一个文件之前停下来问，等客户端回一个 optionId。
     */
    if (process.env["FAKE_ACP_ASK"] === "1" || process.env["FAKE_ACP_ASK_NO_OPTIONS"] === "1") {
      const 问id = 下一个问id++
      const 答案 = new Promise((成) => 问出去的.set(问id, 成))
      发({
        jsonrpc: "2.0",
        id: 问id,
        method: "session/request_permission",
        params: {
          sessionId: params.sessionId,
          toolCall: { title: "读一下 data/raw/观测.csv", kind: "read" },
          options:
            process.env["FAKE_ACP_ASK_NO_OPTIONS"] === "1"
              ? []
              : [
                  { optionId: "yes", name: "允许这一次", kind: "allow_once" },
                  { optionId: "always", name: "以后都允许", kind: "allow_always" },
                  { optionId: "no", name: "这次不行", kind: "reject_once" },
                ],
        },
      })
      const 结果 = await 答案
      // **把答案原样说出来**：用例据此确认「点了哪个，它就收到哪个」
      发({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: `【权限结果】${JSON.stringify(结果)}` },
          },
        },
      })
    }
    /**
     * **真的把那台 MCP 服务器拉起来，调一次工具**（B1）。
     *
     * 这一段是整条路唯一的判据来源：它证明的不是「我们发过 mcpServers」，
     * 而是**那台服务器真的起得来、真的连回了 DAWN、真的拿到了结果**。
     */
    if (process.env["FAKE_ACP_CALL_MCP"] === "1" && 收下的MCP.length > 0) {
      const 结果 = await 调一次MCP(收下的MCP[0], params.sessionId)
      发({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: `【MCP 结果】${结果}` },
          },
        },
      })
    }

    const 文字 = (params?.prompt ?? [])
      .filter((b) => b?.type === "text")
      .map((b) => b.text)
      .join(" ")

    // 一段一段地吐，**与真 agent 一样是流式**
    const 段们 = [`${回话}`, 文字 ? `（你说的是：${文字}）` : ""].filter(Boolean)
    for (const 段 of 段们) {
      if (取消了) {
        /**
         * **被取消时留一句可断言的痕迹**（A3）。
         *
         * 不留的话，「取消生效了」与「它本来就只说了这么多」在屏幕上
         * 长得一模一样——那时那条用例证明不了任何事。
         */
        发({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: params.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "【被取消了】" },
            },
          },
        })
        break
      }
      发({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: params.sessionId,
          update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: 段 } },
        },
      })
      if (段间隔 > 0) await 睡(段间隔)
    }

    累计输入 += 12
    累计输出 += 8
    return 回结果(id, {
      stopReason: 取消了 ? "cancelled" : "end_turn",
      // **累计值，不是这一轮的增量**——真适配器就是这么报的，
      // 我们的运行时必须自己算差值（见设计文档第三条）
      ...(报用量
        ? { usage: { totalTokens: 累计输入 + 累计输出, inputTokens: 累计输入, outputTokens: 累计输出 } }
        : {}),
    })
  }

  // 客户端回了我们问出去的那一条
  if (method === undefined && id !== undefined && 问出去的.has(id)) {
    const 成 = 问出去的.get(id)
    问出去的.delete(id)
    成(msg.result?.outcome ?? msg.error ?? null)
    return
  }

  /**
   * **一条回复对应一个还等着的 id。**对不上就是协议违规——
   * 真 JSON-RPC 对端会当成错误，而我们的用例要看得见它
   * （「同一个询问答两次」正是靠这条抓出来的）。
   */
  if (method === undefined && id !== undefined) {
    发({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: 最近的会话,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `【意外的回复】id=${id}` },
        },
      },
    })
    return
  }

  if (id !== undefined && method !== undefined) 回错(id, -32601, `假 agent 不认识这个方法：${method}`)
}

let 缓冲 = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (块) => {
  缓冲 += 块
  let i
  while ((i = 缓冲.indexOf("\n")) >= 0) {
    const 行 = 缓冲.slice(0, i).trim()
    缓冲 = 缓冲.slice(i + 1)
    if (!行) continue
    let msg
    try {
      msg = JSON.parse(行)
    } catch {
      // **不静默吞**：坏行写到 stderr，我们的运行时会把它留在尾巴里
      process.stderr.write(`[假 ACP] 这一行不是 JSON：${行.slice(0, 120)}\n`)
      continue
    }
    void 处理(msg)
  }
})

process.stdin.on("end", () => process.exit(0))


/**
 * 把 DAWN 递过来的那台 MCP 服务器拉起来，列一次工具、调一次（B1）。
 *
 * **刻意用最笨的方式手写 MCP 的三句话**（initialize / tools/list / tools/call）——
 * 引 SDK 的话，这台假 agent 就跟被测代码共用同一份实现了，
 * 而那时它证明的是「SDK 自洽」，不是「我们那台服务器能用」。
 */
async function 调一次MCP(台, sessionId) {
  const { spawn } = await import("node:child_process")
  const p = spawn(台.command === "node" ? process.execPath : 台.command, 台.args, {
    stdio: ["pipe", "pipe", "pipe"],
    /**
     * **`env` 是 `[{name, value}]`，摊平之后才能给 `spawn`**（2026-08-19）。
     *
     * 上一版写的是 `...(台.env ?? {})`——把一个数组展开进对象，
     * 得到的是 `{0: {...}, 1: {...}}`，**于是那几个环境变量一个都没传下去**。
     * 它此前不出错，只因为 DAWN 送的恰好是对象（而那正是那个洞本身）。
     */
    env: { ...process.env, ...Object.fromEntries((台.env ?? []).map((e) => [e.name, e.value])) },
  })
  let 缓 = ""
  const 等 = new Map()
  let 序 = 1
  p.stdout.setEncoding("utf8")
  p.stdout.on("data", (块) => {
    缓 += 块
    let i
    while ((i = 缓.indexOf("\n")) >= 0) {
      const 行 = 缓.slice(0, i).trim()
      缓 = 缓.slice(i + 1)
      if (!行) continue
      try {
        const m = JSON.parse(行)
        const f = 等.get(m.id)
        if (f) {
          等.delete(m.id)
          f(m)
        }
      } catch { /* 不是 JSON：忽略 */ }
    }
  })
  const 问 = (method, params) =>
    new Promise((成) => {
      const id = 序++
      等.set(id, 成)
      p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
    })
  try {
    await 问("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "假 ACP agent", version: "0" },
    })
    p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
    const 列 = await 问("tools/list", {})
    const 名们 = (列.result?.tools ?? []).map((t) => t.name).join(",")
    /**
     * **跑内核那条要单独一个开关**（B1·B′）：它要一台真内核，
     * 而绝大多数用例跑在隔离的假 kernelspec 上。
     * 混在一起的话，那些用例会因为「本机没配内核」而红——
     * 红得毫无信息量，而那正是把人训练成忽略红色的最快方式。
     */
    if (process.env["FAKE_ACP_RUN_KERNEL"]) {
      const 跑 = await 问("tools/call", {
        name: "dawn_run_in_kernel",
        arguments: { language: "python", code: process.env["FAKE_ACP_RUN_KERNEL"] },
      })
      const 出 = 跑.result?.content?.[0]?.text ?? 跑.error?.message ?? "（没有内容）"
      return `工具=[${名们}] 内核=${出}`
    }
    const 调 = await 问("tools/call", {
      name: "dawn_record_note",
      arguments: { text: "经 MCP 记的一条" },
    })
    const 文 = 调.result?.content?.[0]?.text ?? 调.error?.message ?? "（没有内容）"
    return `工具=[${名们}] 调用=${文}`
  } finally {
    p.kill()
  }
}
