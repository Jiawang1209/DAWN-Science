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

const server = new McpServer({ name: "dawn-mcp-test", version: "0.0.1" })

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

await server.connect(new StdioServerTransport())
