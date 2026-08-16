/**
 * DAWN 工具网关 + 那台 MCP 服务器（B1 路线 B，2026-08-17）。
 *
 * **两截一起验，而且用真的 MCP 客户端**。
 *
 * 分开打桩的话，能证明的只有「我调了我自己写的函数」——
 * 而这条路上最容易错的恰恰是接缝：MCP 的形状（`inputSchema` 而不是 `schema`）、
 * 认证那一句、错误该变成「工具出错」还是「协议出错」。
 *
 * 这与那台假 ACP agent 是同一条纪律：**假的只该是「另一端是谁」**。
 * 这里连「另一端」都是真的——真进程、真 stdio、真 socket。
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { 开网关, 网关地址, type 网关工具 } from "../../src/acp/gateway.js"

const 服务器脚本 = join(import.meta.dirname, "..", "..", "scripts", "dawn-mcp-server.mjs")

const 样例工具: 网关工具[] = [
  {
    name: "dawn_list_skills",
    description: "列出这个项目里的 Agent Skills",
    schema: { type: "object", properties: {} },
  },
  {
    name: "dawn_record_note",
    description: "往账本里记一条结论",
    schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
]

let 收摊: (() => void)[] = []
afterEach(() => {
  for (const f of 收摊.reverse()) {
    try {
      f()
    } catch {
      /* 已经收过了 */
    }
  }
  收摊 = []
})

/** 起一台网关 + 一个真的 MCP 客户端（客户端会自己把服务器进程拉起来） */
async function 接起来(装配: {
  工具们?: (s: string) => 网关工具[]
  调用?: (s: string, n: string, a: Record<string, unknown>) => Promise<{ 文本: string; 出错?: boolean }>
  会话?: string
  令牌?: string
}) {
  const dir = mkdtempSync(join(tmpdir(), "dawn-gw-"))
  收摊.push(() => rmSync(dir, { recursive: true, force: true }))
  const gw = 开网关({
    工具们: 装配.工具们 ?? (() => 样例工具),
    调用: 装配.调用 ?? (async () => ({ 文本: "好了" })),
    runtimeDir: dir,
  })
  收摊.push(gw.关掉)

  const client = new Client({ name: "试", version: "0" }, { capabilities: {} })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [服务器脚本],
    env: {
      ...(process.env as Record<string, string>),
      DAWN_GATEWAY_PATH: gw.地址.path,
      DAWN_GATEWAY_TOKEN: 装配.令牌 ?? gw.地址.token,
      DAWN_SESSION_ID: 装配.会话 ?? "s1",
    },
  })
  await client.connect(transport)
  收摊.push(() => void client.close())
  return { client, gw }
}

describe("整条路", () => {
  it("**工具清单从 DAWN 现问现答**，形状是 MCP 的", async () => {
    const { client } = await 接起来({})
    const r = await client.listTools()
    expect(r.tools.map((t) => t.name)).toEqual(["dawn_list_skills", "dawn_record_note"])
    /**
     * **MCP 那边叫 `inputSchema`，我们内部叫 `schema`。**
     * 这一处改名是整条路上最容易漏的：漏了的话工具能列出来，
     * 但模型不知道怎么填参数——而那看起来像模型笨。
     */
    expect(r.tools[1]?.inputSchema).toMatchObject({ required: ["text"] })
  })

  it("**调用真的打到 DAWN**，参数与会话都带过去了", async () => {
    const 记 : { s: string; n: string; a: Record<string, unknown> }[] = []
    const { client } = await 接起来({
      会话: "会话甲",
      调用: async (s, n, a) => {
        记.push({ s, n, a })
        return { 文本: `记下了：${String(a["text"])}` }
      },
    })
    const r = await client.callTool({ name: "dawn_record_note", arguments: { text: "样本有偏" } })
    expect(记).toEqual([{ s: "会话甲", n: "dawn_record_note", a: { text: "样本有偏" } }])
    expect((r.content as { text: string }[])[0]?.text).toBe("记下了：样本有偏")
  })

  /**
   * **工具出错 ≠ 服务器坏了。**
   *
   * 回成协议错误的话，agent 会认为「这台服务器不能用」而不再调它；
   * 我们要的是「这一次不行，原因如下」——**那样它才可能改道**。
   */
  it("工具报错回成「这次调用出错」，不是协议错误", async () => {
    const { client } = await 接起来({
      调用: async () => {
        throw new Error("这个技能不存在")
      },
    })
    const r = await client.callTool({ name: "dawn_record_note", arguments: {} })
    expect(r.isError).toBe(true)
    expect((r.content as { text: string }[])[0]?.text).toContain("这个技能不存在")
  })
})

describe("认证", () => {
  /**
   * **令牌不对就断开，而且不说为什么。**
   *
   * 一个会告诉你「令牌错了」的接口，等于确认了「令牌对的那条路存在」。
   * 对面的表现是连接被关掉——那正是我们要的。
   */
  it("令牌不对时连不上", async () => {
    await expect(接起来({ 令牌: "不是那个令牌" })).rejects.toThrow()
  })
})

describe("跨平台", () => {
  /**
   * **Windows 没有 Unix domain socket**，那边是命名管道。
   * 与 `runtime/acp/launch.ts` 那三条同一类问题：
   * 一处平台差别写在一个地方，配一条能在本机验三个平台的判据。
   */
  it("win32 走命名管道，其余走私有目录里的 socket 文件", () => {
    expect(网关地址("abc", "/私有", "win32")).toBe("\\\\.\\pipe\\dawn-abc")
    for (const p of ["darwin", "linux"] as const) {
      expect(网关地址("abc", "/私有", p)).toBe("/私有/abc.sock")
    }
  })
})
