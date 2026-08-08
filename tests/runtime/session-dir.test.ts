import { describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { materializeSessionDir } from "../../src/runtime/session-dir.js"

const mcp = [{ name: "dawn-report", command: "node", args: ["server.js"], env: { X: "1" } }]

const newDir = () => mkdtempSync(join(tmpdir(), "dawn-sd-"))

/** 从 args 里取某个标志的值，取不到返回 undefined */
function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

describe("materializeSessionDir · claude", () => {
  // Spike B 实测：MCP 走 --mcp-config，hook 走 --settings，两个不同的标志与文件。
  // settings.json 里放 mcpServers 是无效的。
  it("MCP 写进独立的 mcp.json，并由 --mcp-config 指向", () => {
    const dir = newDir()
    const out = materializeSessionDir("claude", dir, { mcpServers: mcp })
    const path = flagValue(out.args, "--mcp-config")
    expect(path).toBe(join(dir, "mcp.json"))
    const cfg = JSON.parse(readFileSync(path!, "utf8"))
    expect(cfg.mcpServers["dawn-report"].command).toBe("node")
    expect(cfg.mcpServers["dawn-report"].env).toEqual({ X: "1" })
  })

  it("总是带 --strict-mcp-config —— 只用我们注入的 MCP，忽略其它一切", () => {
    const dir = newDir()
    const out = materializeSessionDir("claude", dir, { mcpServers: [] })
    expect(out.args).toContain("--strict-mcp-config")
  })

  it("hook 写进 settings.json，并由 --settings 指向", () => {
    const dir = newDir()
    const out = materializeSessionDir("claude", dir, { mcpServers: [], stopHookCommand: "/bin/true" })
    const path = flagValue(out.args, "--settings")
    expect(path).toBe(join(dir, "settings.json"))
    const cfg = JSON.parse(readFileSync(path!, "utf8"))
    expect(JSON.stringify(cfg.hooks)).toContain("/bin/true")
  })

  it("没有 hook 时不生成 settings.json，也不带 --settings", () => {
    const dir = newDir()
    const out = materializeSessionDir("claude", dir, { mcpServers: mcp })
    expect(out.args).not.toContain("--settings")
    expect(existsSync(join(dir, "settings.json"))).toBe(false)
  })

  it("不设置 CLAUDE_CONFIG_DIR —— 那会连认证一起隔离掉（Spike B 实测）", () => {
    const dir = newDir()
    const out = materializeSessionDir("claude", dir, { mcpServers: mcp })
    expect(out.env).toEqual({})
  })
})

describe("materializeSessionDir · codex", () => {
  it("写 config.toml 并设置 CODEX_HOME", () => {
    const dir = newDir()
    const out = materializeSessionDir("codex", dir, { mcpServers: mcp })
    expect(out.env.CODEX_HOME).toBe(dir)
    expect(existsSync(join(dir, "config.toml"))).toBe(true)
  })

  it("config.toml 里 MCP server 带上 command / args / env", () => {
    const dir = newDir()
    materializeSessionDir("codex", dir, { mcpServers: mcp })
    const toml = readFileSync(join(dir, "config.toml"), "utf8")
    expect(toml).toContain("[mcp_servers.dawn-report]")
    expect(toml).toContain('command = "node"')
    expect(toml).toContain('args = ["server.js"]')
    expect(toml).toContain('X = "1"')
  })

  it("hook 走 notify 字段", () => {
    const dir = newDir()
    materializeSessionDir("codex", dir, { mcpServers: [], stopHookCommand: "/bin/true" })
    expect(readFileSync(join(dir, "config.toml"), "utf8")).toContain('notify = ["/bin/true"]')
  })

  it("不需要额外命令行参数", () => {
    const dir = newDir()
    const out = materializeSessionDir("codex", dir, { mcpServers: mcp })
    expect(out.args).toEqual([])
  })
})

describe("materializeSessionDir · 通用约束", () => {
  it("未知 CLI 家族响亮报错，不静默生成空配置", () => {
    const dir = newDir()
    expect(() => materializeSessionDir("unknown-cli", dir, { mcpServers: [] })).toThrow(/unknown-cli/)
  })

  it("报错信息列出已支持的家族", () => {
    const dir = newDir()
    expect(() => materializeSessionDir("nope", dir, { mcpServers: [] })).toThrow(/claude/)
  })

  it("绝不写入用户家目录：产出的路径全部在给定 sessionDir 之下", () => {
    for (const family of ["claude", "codex"]) {
      const dir = newDir()
      const out = materializeSessionDir(family, dir, { mcpServers: mcp, stopHookCommand: "/bin/true" })
      expect(out.writtenFiles.length).toBeGreaterThan(0)
      for (const p of out.writtenFiles) expect(p.startsWith(dir)).toBe(true)
    }
  })

  it("sessionDir 不存在时会被创建", () => {
    const dir = join(newDir(), "nested", "deep")
    materializeSessionDir("claude", dir, { mcpServers: [] })
    expect(existsSync(dir)).toBe(true)
  })
})
