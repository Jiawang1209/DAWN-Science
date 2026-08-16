/**
 * DAWN 的 MCP 服务器（B1 路线 B，2026-08-17）。
 *
 * **这个进程是 ACP agent 拉起的，不是我们**——我们只在 `session/new` 里
 * 声明「有这么一台服务器，这样起它」。所以它拿不到 DAWN 的任何东西，
 * 只能顺着一条本地 socket 回去问（见 `src/acp/gateway.ts`）。
 *
 * ```
 * ACP agent ──stdio/MCP──▶ 这里 ──socket+令牌──▶ DAWN 主进程
 * ```
 *
 * ## 它刻意什么都不知道
 *
 * 工具清单、参数 schema、执行结果，**全部现问现答**。
 * 在这里缓存一份的话，DAWN 那边改了工具、这边还在用旧的——
 * 而那种不一致没有任何地方会报出来。
 *
 * ## 三个环境变量，缺一个都不许起
 *
 * `DAWN_GATEWAY_PATH` / `DAWN_GATEWAY_TOKEN` / `DAWN_SESSION_ID`。
 * **缺了就响亮地退出**：一台连不上 DAWN 的 MCP 服务器，
 * 对 agent 来说是「工具列表是空的」——那看起来像我们没给它工具，
 * 而不是「配错了」。
 */
import { createConnection } from "node:net"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

const 路径 = process.env["DAWN_GATEWAY_PATH"]
const 令牌 = process.env["DAWN_GATEWAY_TOKEN"]
const 会话 = process.env["DAWN_SESSION_ID"]
if (!路径 || !令牌 || !会话) {
  process.stderr.write(
    "[dawn-mcp] 少了 DAWN_GATEWAY_PATH / DAWN_GATEWAY_TOKEN / DAWN_SESSION_ID，起不来\n",
  )
  process.exit(2)
}

/** 与网关的那条连接。**一条，长驻**——每次调用都重连会把握手成本乘以调用次数 */
const 连接 = await new Promise((成, 败) => {
  const s = createConnection(路径)
  s.setEncoding("utf8")
  s.once("error", 败)
  s.once("connect", () => 成(s))
})

let 缓冲 = ""
let 下一个id = 1
/** 还在等回复的那些请求 */
const 等着 = new Map()

连接.on("data", (块) => {
  缓冲 += 块
  let i
  while ((i = 缓冲.indexOf("\n")) >= 0) {
    const 行 = 缓冲.slice(0, i).trim()
    缓冲 = 缓冲.slice(i + 1)
    if (!行) continue
    const msg = JSON.parse(行)
    const 位 = 等着.get(msg.id)
    if (!位) continue // 认证那一句的回复，没有 id
    等着.delete(msg.id)
    位(msg)
  }
})

/**
 * **对面断了，我们也走。**
 *
 * DAWN 退出之后这个进程还活着的话，agent 那边看到的是一台
 * 「工具都在、但每次调用都超时」的服务器——**比没有更坏**。
 */
连接.on("close", () => process.exit(0))

const 问 = (method, params) =>
  new Promise((成) => {
    const id = 下一个id++
    等着.set(id, 成)
    连接.write(`${JSON.stringify({ id, method, params })}\n`)
  })

/**
 * 第一句是认证，**而且要等它答应了才往下走**。
 *
 * 不等的话，我们会在网关已经把连接掐掉的情况下照样把自己
 * 宣布成一台可用的 MCP 服务器——agent 于是拿到一份工具清单，
 * 然后每一次调用都莫名其妙地失败。
 * **连不上就别装作起来了**：响亮退出，让 agent 当场知道这台服务器没起来。
 */
await new Promise((成, 败) => {
  const 超时 = setTimeout(() => 败(new Error("网关没有回应认证")), 5000)
  连接.once("close", () => {
    clearTimeout(超时)
    败(new Error("网关拒绝了这次连接"))
  })
  const 一次 = (块) => {
    if (!String(块).includes('"ok"')) return
    连接.off("data", 一次)
    clearTimeout(超时)
    成()
  }
  连接.on("data", 一次)
  连接.write(`${JSON.stringify({ token: 令牌, sessionId: 会话 })}\n`)
}).catch((e) => {
  process.stderr.write(`[dawn-mcp] ${e.message}\n`)
  process.exit(3)
})

const server = new Server(
  { name: "dawn", version: "0.0.1" },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const r = await 问("tools/list", {})
  return {
    tools: (r.result?.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.schema,
    })),
  }
})

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const r = await 问("tools/call", { name: req.params.name, arguments: req.params.arguments ?? {} })
  /**
   * **网关报错要变成工具的错误结果，不是协议错误。**
   *
   * 协议错误会让 agent 认为「这台服务器坏了」；而我们要的是
   * 「这一次调用不行，原因如下」——**那样它才可能改道**。
   */
  if (r.error) return { content: [{ type: "text", text: r.error }], isError: true }
  return {
    content: [{ type: "text", text: r.result?.文本 ?? "" }],
    ...(r.result?.出错 ? { isError: true } : {}),
  }
})

await server.connect(new StdioServerTransport())
