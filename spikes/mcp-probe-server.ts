/**
 * Spike B 用的最小 MCP server：只暴露一个 dawn_probe 工具。
 * 被调用时往 DAWN_PROBE_LOG 追加一行 JSON——这是「MCP 注入成功」的证据。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { appendFileSync } from "node:fs"
import { z } from "zod"

const LOG = process.env.DAWN_PROBE_LOG
if (!LOG) {
  // 注意：MCP over stdio 的 stdout 是协议通道，诊断信息必须走 stderr
  console.error("mcp-probe-server: 缺少 DAWN_PROBE_LOG")
  process.exit(1)
}

const server = new McpServer({ name: "dawn-probe", version: "0.0.1" })

server.tool(
  "dawn_probe",
  "把一条消息记录到 DAWN 探针日志。测试用。",
  { message: z.string() },
  async ({ message }) => {
    appendFileSync(LOG, JSON.stringify({ kind: "tool", message, at: new Date().toISOString() }) + "\n")
    return { content: [{ type: "text" as const, text: "recorded" }] }
  },
)

await server.connect(new StdioServerTransport())
