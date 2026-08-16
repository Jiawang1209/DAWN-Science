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

function 发(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

function 回结果(id, result) {
  发({ jsonrpc: "2.0", id, result })
}

function 回错(id, code, message) {
  发({ jsonrpc: "2.0", id, error: { code, message } })
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
      agentCapabilities: { loadSession: false, promptCapabilities: { image: false } },
      authMethods: [],
    })
  }

  if (method === "session/new") {
    // **cwd 原样回给我们**：用例据此验「它真的开在项目目录里」
    return 回结果(id, { sessionId: `fake-acp-${Date.now()}`, _meta: { cwd: params?.cwd } })
  }

  if (method === "session/cancel") {
    取消了 = true
    return // 通知，没有回复
  }

  if (method === "session/prompt") {
    取消了 = false
    const 文字 = (params?.prompt ?? [])
      .filter((b) => b?.type === "text")
      .map((b) => b.text)
      .join(" ")

    // 一段一段地吐，**与真 agent 一样是流式**
    const 段们 = [`${回话}`, 文字 ? `（你说的是：${文字}）` : ""].filter(Boolean)
    for (const 段 of 段们) {
      if (取消了) break
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

  if (id !== undefined) 回错(id, -32601, `假 agent 不认识这个方法：${method}`)
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
