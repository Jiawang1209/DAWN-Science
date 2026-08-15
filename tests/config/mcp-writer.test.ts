/**
 * 往 `providers.yaml` 里加 / 删一台 MCP 服务器（2026-08-15）。
 *
 * 这一组盯的是**改别人文件时的三条纪律**（与 `writer.ts` 一字不差）：
 *   ① 一个既有字节都不动
 *   ② 只加，不覆盖同名的
 *   ③ 写完读回来再宣布成功，读不回来就还原
 *
 * 外加「粘贴 JSON」那一条最要紧的：**密钥的值一律丢掉，只留名字**。
 * 别人的 README 给的都是 Claude Desktop 的 JSON，里面 `env` 装着密钥本身——
 * **而这份配置文件是会被分享、会进 git 的**。
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { addMcpServer, removeMcpServer, 从JSON解出 } from "../../src/config/mcp-writer.js"

let 目录: string
let 文件: string

const 基础 = `providers:
  kimi-k3:
    baseUrl: "https://api.moonshot.cn/v1"
    models: ["kimi-k3", "kimi-k2.6"]

agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]
`

beforeEach(() => {
  目录 = mkdtempSync(join(tmpdir(), "dawn-mcpw-"))
  文件 = join(目录, "providers.yaml")
  writeFileSync(文件, 基础)
})
afterEach(() => rmSync(目录, { recursive: true, force: true }))

const 读 = () => readFileSync(文件, "utf8")

describe("加一台", () => {
  it("没有 `mcp:` 那一段时，新建一段", () => {
    const r = addMcpServer(文件, { 名: "pubmed", command: "npx", args: ["-y", "包"] })
    expect(r.mcp?.["pubmed"]?.command).toBe("npx")
    expect(读()).toContain("mcp:")
  })

  /** **这一条是整组的要害**：我们是在改用户手写的文件 */
  it("**既有内容一个字节都不动**", () => {
    addMcpServer(文件, { 名: "pubmed", command: "npx" })
    const 现在 = 读()
    // 行内列表不许被改写成块状（`parseDocument` + `toString()` 会干这事）
    expect(现在).toContain(`models: ["kimi-k3", "kimi-k2.6"]`)
    expect(现在).toContain("capabilities: [chat, exec]")
    // 原文每一行都还在
    for (const 行 of 基础.split("\n").filter((l) => l.trim())) {
      expect(现在, `这一行没了：${行}`).toContain(行)
    }
  })

  it("已经有一段 `mcp:` 时，加在那一段里", () => {
    addMcpServer(文件, { 名: "first", command: "a" })
    const r = addMcpServer(文件, { 名: "second", command: "b" })
    expect(Object.keys(r.mcp ?? {}).sort()).toEqual(["first", "second"])
    expect(读().match(/^mcp:$/gm), "不该出现两段 mcp:").toHaveLength(1)
  })

  it("env 只写名字，cwd 给了才写", () => {
    addMcpServer(文件, { 名: "srv", command: "npx", env: ["A_KEY"], cwd: "/w" })
    expect(读()).toContain(`env: ["A_KEY"]`)
    expect(读()).toContain(`cwd: "/w"`)
  })

  /** **不覆盖**：那可能是用户手写的，他没要求我们改它 */
  it("同名的一律拒绝，不覆盖", () => {
    addMcpServer(文件, { 名: "srv", command: "a" })
    expect(() => addMcpServer(文件, { 名: "srv", command: "b" })).toThrow(/已经有一台/)
    expect(读()).toContain(`command: "a"`)
  })

  /** 名字会成为工具前缀，**双下划线是我们拆前缀的分隔符** */
  it("名字不合法时说清楚哪儿不合法", () => {
    expect(() => addMcpServer(文件, { 名: "有 空格", command: "a" })).toThrow(/a-zA-Z0-9_-/)
    expect(() => addMcpServer(文件, { 名: "has__dunder", command: "a" })).toThrow(/双下划线/)
  })

  it("command 是空的就不写", () => {
    expect(() => addMcpServer(文件, { 名: "srv", command: "  " })).toThrow(/command/)
  })

  /** 值里有引号、空格的也要写得回来——**宁可多一对引号** */
  it("带空格和引号的命令照样读得回来", () => {
    const r = addMcpServer(文件, {
      名: "weird",
      command: "/opt/my tools/run.sh",
      args: ['{"a":1}', "--x y"],
    })
    expect(r.mcp?.["weird"]?.command).toBe("/opt/my tools/run.sh")
    expect(r.mcp?.["weird"]?.args).toEqual(['{"a":1}', "--x y"])
  })
})

describe("删一台", () => {
  it("删得掉，其余的不动", () => {
    addMcpServer(文件, { 名: "a1", command: "a" })
    addMcpServer(文件, { 名: "b1", command: "b" })
    const r = removeMcpServer(文件, "a1")
    expect(Object.keys(r.mcp ?? {})).toEqual(["b1"])
    expect(读()).toContain("capabilities: [chat, exec]")
  })

  it("没有这一台时如实说，不静静成功", () => {
    addMcpServer(文件, { 名: "a1", command: "a" })
    expect(() => removeMcpServer(文件, "不存在")).toThrow(/没有叫/)
  })

  it("最后一台删掉之后，文件仍然读得回来", () => {
    addMcpServer(文件, { 名: "a1", command: "a" })
    const r = removeMcpServer(文件, "a1")
    expect(r.mcp ?? {}).toEqual({})
    expect(r.agents["ds-chat"]).toBeDefined()
  })
})

describe("粘贴 Claude Desktop 的 JSON", () => {
  /** 最常见的形状：整份配置 */
  it("认 `mcpServers` 包着的那种", () => {
    const { 台 } = 从JSON解出(
      `{"mcpServers":{"pubmed":{"command":"npx","args":["-y","@x/pubmed"]}}}`,
    )
    expect(台.名).toBe("pubmed")
    expect(台.command).toBe("npx")
    expect(台.args).toEqual(["-y", "@x/pubmed"])
  })

  it("认只给了一台的那种", () => {
    expect(从JSON解出(`{"srv":{"command":"uvx","args":["s"]}}`).台.名).toBe("srv")
  })

  it("认连名字都没有的那种（由调用方另填名字）", () => {
    const { 台 } = 从JSON解出(`{"command":"npx"}`)
    expect(台.名).toBeUndefined()
    expect(台.command).toBe("npx")
  })

  /**
   * **这一条是「粘贴」存在的一半理由。**
   * 照抄的人不会注意到自己刚把 key 写进了一份会进 git 的文件。
   */
  it("**密钥的值一律丢掉，只留名字**", () => {
    const r = 从JSON解出(
      `{"mcpServers":{"pg":{"command":"npx","env":{"PGURL":"postgres://user:pw@host/db"}}}}`,
    )
    expect(r.台.env).toEqual(["PGURL"])
    expect(r.密钥名).toEqual(["PGURL"])
    expect(JSON.stringify(r), "密钥的值被带出来了").not.toContain("pw@host")
  })

  it("一次粘了好几台时，说清有哪几台、让人挑一台", () => {
    expect(() => 从JSON解出(`{"mcpServers":{"a":{"command":"x"},"b":{"command":"y"}}}`)).toThrow(
      /a、b/,
    )
  })

  /** 报错要说得像人话——**「Unexpected token」帮不了任何人** */
  it("不是 JSON 时，告诉人多半是漏了外层大括号", () => {
    expect(() => 从JSON解出(`"command": "npx"`)).toThrow(/大括号/)
  })

  it("没有 command 时如实说", () => {
    expect(() => 从JSON解出(`{"srv":{"args":["x"]}}`)).toThrow(/command/)
  })
})
