/**
 * 测试用的真 MCP 服务器（2026-08-15）。**单元测试与 e2e 共用这一份。**
 *
 * 理由与假推理服务器同一条（准入规则 1）：
 * > *「`npm run dev:mock` 与 `npm run test:e2e` 必须共用同一个 mock ——
 * >   两套 mock 会各自漂移，那时「本地是好的」就不再意味着什么。」*
 *
 * 它是**真的 MCP 服务器**，不是替身：走 stdio、说真协议。
 * 我们要验的正是「我们这个客户端能不能跟一台真服务器说上话」——
 * 拿一个假的 transport 去测，测的就只是我们自己那几行。
 *
 * ## 三个工具各自对着一种情形
 *
 * - `echo`      —— 正常返回文本
 * - `boom`      —— 返回 `isError`（**工具报错不等于调用失败**，两者要分得开）
 * - `写一行`     —— 往 `DAWN_MCP_TEST_LOG` 追加一行，**这是「真的调到了」的物证**
 *
 * ## stdout 是协议通道
 *
 * MCP over stdio 用 stdout 说协议，**任何 `console.log` 都会把协议流搞坏**。
 * 诊断一律走 stderr。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import http from "node:http"
import { appendFileSync } from "node:fs"
import { z } from "zod"

/**
 * 需要一个环境变量才肯起来的那一档。
 *
 * `DAWN_MCP_TEST_REQUIRE=1` 时，缺 `DAWN_MCP_TEST_SECRET` 就退出并说清缺什么——
 * 用来验「起不来的原因要说全」那条：**「缺 key」与「命令不存在」是两件事**。
 */
if (process.env.DAWN_MCP_TEST_REQUIRE === "1" && !process.env.DAWN_MCP_TEST_SECRET) {
  console.error("mcp-test-server: 缺 DAWN_MCP_TEST_SECRET")
  process.exit(1)
}

/**
 * **工具注册抽成一个函数**（2026-08-19）。
 *
 * stdio 那条一个进程一台服务器就够；而 streamable HTTP 的**无状态**用法
 * 要求**每个请求新建一份 server + transport**——复用一份的话，
 * 第一个请求（`initialize`）能过，第二个就废（transport 带着上一次的请求状态）。
 * 这个坑是写完当场撞上的：客户端报 `Error POSTing to endpoint:`，
 * 而单独 curl 一次 `initialize` 却一切正常。
 */
function 装上工具(server) {
server.tool("echo", "把收到的话原样回给你。测试用。", { message: z.string() }, async ({ message }) => ({
  content: [{ type: "text", text: `echo: ${message}` }],
}))

server.tool("boom", "总是报错。测试用。", {}, async () => ({
  isError: true,
  content: [{ type: "text", text: "这个工具就是用来失败的" }],
}))

server.tool(
  "写一行",
  "往测试日志里追加一行。这是「真的调到了」的物证。",
  { message: z.string() },
  async ({ message }) => {
    const 日志 = process.env.DAWN_MCP_TEST_LOG
    if (!日志) {
      return { isError: true, content: [{ type: "text", text: "没有设 DAWN_MCP_TEST_LOG" }] }
    }
    appendFileSync(日志, `${JSON.stringify({ message, secret: process.env.DAWN_MCP_TEST_SECRET ?? null })}\n`)
    return { content: [{ type: "text", text: "记下了" }] }
  },
)
}

/**
 * 它收到的 `Authorization` 头。**远端那条路的物证**（2026-08-19）。
 *
 * 密钥从钥匙串取出来、拼进请求头、跨过 HTTP 到达服务器——这一整条链
 * 只有服务器这一端说得出「我到底收到了什么」。少了它，
 * 「连上了」与「连上了但没带密钥」在判据里长得一模一样。
 */
let 收到的授权 = null

/** 造一台装好工具的服务器。**stdio 用一份，HTTP 每个请求一份** */
function 造一台() {
  const s = new McpServer({ name: "dawn-mcp-test", version: "0.0.1" })
  装上工具(s)
  s.tool("我收到的头", "回报这次连接带来的 Authorization。测试用。", {}, async () => ({
    content: [{ type: "text", text: `Authorization=${收到的授权 ?? "（没有）"}` }],
  }))
  return s
}

/**
 * **同一份工具，两种传输**（2026-08-19）。
 *
 * 给了 `DAWN_MCP_HTTP_PORT` 就起 streamable HTTP，否则照旧走 stdio。
 *
 * **不另写一份 HTTP 的假服务器**：那样两份的工具集迟早各自漂移，
 * 而「本机那条能用」就不再说明「远端那条也能用」——
 * 准入规则 ① 那句话（*「两套 mock 会各自漂移」*）对这里同样成立。
 */
const 端口 = Number(process.env.DAWN_MCP_HTTP_PORT ?? "")
if (Number.isFinite(端口) && 端口 > 0) {
  /**
   * **无状态模式**（`sessionIdGenerator: undefined`）：测试里每次请求都可以独立处理，
   * 不必维护会话。真服务器多半有状态，但那是**它那一侧**的事——
   * 我们要验的是我们这个客户端说不说得对。
   */
  http
    .createServer((req, res) => {
      if (!req.url?.startsWith("/mcp")) {
        res.writeHead(404).end("只认 /mcp")
        return
      }
      // **记下这次带没带授权**：上面那个工具靠它作证
      收到的授权 = req.headers["authorization"] ?? null
      let 原文 = ""
      req.on("data", (c) => (原文 += c))
      req.on("end", () => {
        let body
        try {
          body = 原文 ? JSON.parse(原文) : undefined
        } catch {
          res.writeHead(400).end("不是 JSON")
          return
        }
        /**
         * **每个请求一份**（见上面 `装上工具` 的说明）：复用一份 transport 的话，
         * `initialize` 能过而下一个请求就废。
         */
        void (async () => {
          const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
          res.on("close", () => void t.close())
          await 造一台().connect(t)
          await t.handleRequest(req, res, body)
        })()
      })
    })
    .listen(端口, () => process.stderr.write(`[假 MCP] streamable HTTP 起在 ${端口}\n`))
} else {
  await 造一台().connect(new StdioServerTransport())
}
