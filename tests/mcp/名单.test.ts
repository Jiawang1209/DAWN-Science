/**
 * MCP 名单：全局 + 项目级追加（2026-08-15）。
 *
 * 这一组盯的是**重名怎么办**。作者定的作用域是「全局为主、项目可追加」，
 * 而两处同名时，「项目赢」和「全局赢」都能自圆其说——
 * **正因为两种都说得通，人无法从配置本身看出哪个在生效**。
 * 一台连生产库、一台连本地副本，猜错的代价不对称。
 *
 * 所以判据是：**两个都不用，并且出声**（规格 7.5）。
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 合名单, 工具全名, 拆工具全名, 项目名单文件 } from "../../src/mcp/名单.js"

let 工作区: string

beforeEach(() => {
  工作区 = mkdtempSync(join(tmpdir(), "dawn-mcp-"))
})
afterEach(() => {
  rmSync(工作区, { recursive: true, force: true })
})

const 写项目名单 = (内容: string) => {
  mkdirSync(join(工作区, ".dawn"), { recursive: true })
  writeFileSync(join(工作区, 项目名单文件), 内容)
}

const 全局一台 = { pg: { command: "npx", args: ["-y", "server-postgres"] } }

describe("MCP 名单 · 合并", () => {
  it("没有项目时只有全局", () => {
    const r = 合名单(全局一台)
    expect(r.服务器.map((x) => x.名)).toEqual(["pg"])
    expect(r.服务器[0]!.来自).toBe("全局")
    expect(r.问题).toEqual([])
  })

  it("项目里的追加进来，并标明它是项目带的", () => {
    写项目名单("mcp:\n  课题库:\n    command: ./tools/mcp-lab\n")
    const r = 合名单(全局一台, 工作区)
    expect(r.服务器.map((x) => x.名).sort()).toEqual(["pg", "课题库"])
    expect(r.服务器.find((x) => x.名 === "课题库")!.来自).toBe("项目")
  })

  /** **这条是这一组的要害。** 静静挑一个用，等于让人看不出在用哪台 */
  it("**重名时两个都不用，并说清怎么办**", () => {
    写项目名单("mcp:\n  pg:\n    command: ./local-pg\n")
    const r = 合名单(全局一台, 工作区)
    expect(r.服务器, "撞名的两台应当一台都不启用").toEqual([])
    expect(r.问题).toHaveLength(1)
    expect(r.问题[0]).toContain("pg")
    expect(r.问题[0], "只说撞了没用——要说怎么办").toMatch(/改个名字/)
  })

  it("重名不影响别的那些", () => {
    写项目名单("mcp:\n  pg:\n    command: ./local-pg\n  另一台:\n    command: ./x\n")
    const r = 合名单(全局一台, 工作区)
    expect(r.服务器.map((x) => x.名)).toEqual(["另一台"])
  })

  /** **读不出来要说清是哪份文件**：一句笼统的「配置有问题」会让人翻整个目录 */
  it("项目名单坏了，如实报出文件名，且全局的照常可用", () => {
    写项目名单("mcp:\n  坏的:\n    没有command: 1\n")
    const r = 合名单(全局一台, 工作区)
    expect(r.服务器.map((x) => x.名)).toEqual(["pg"])
    expect(r.问题[0]).toContain(项目名单文件)
  })

  it("没有 .dawn/mcp.yaml 就是没有，不是错误", () => {
    expect(合名单(全局一台, 工作区).问题).toEqual([])
  })

  /**
   * **一份被 clone 下来的配置不能声明自己可信**（2026-08-15 改的）。
   *
   * 我第一版把 `trusted` 写进了 `McpServerSchema`。那是个漏洞：
   * 项目级名单住在 `.dawn/mcp.yaml`，**会跟着仓库一起被 clone**——
   * 于是别人的仓库可以说「这台我信得过」，而那台服务器是他写的。
   *
   * 现在两个开关都只住在本机的设置库里（`mcp.trusted.<名>` / `mcp.off.<名>`），
   * 配置里再写就是不认识的字段，**严格模式会当场拒掉整份**。
   */
  it("**项目配置里写 `trusted: true` 是不认的**", () => {
    写项目名单("mcp:\n  偷信任的:\n    command: ./x\n    trusted: true\n")
    const r = 合名单(全局一台, 工作区)
    expect(r.服务器.map((x) => x.名), "让一份被 clone 的配置声明了自己可信").toEqual(["pg"])
    expect(r.问题[0]).toContain(项目名单文件)
  })

  it("一台都没配时是空名单，不是错误", () => {
    expect(合名单(undefined, 工作区)).toEqual({ 服务器: [], 问题: [] })
  })
})

describe("工具全名", () => {
  /** 两台服务器各有一个 `query` 是常事——**不加前缀模型分不清打给谁** */
  it("带服务器名前缀", () => {
    expect(工具全名("pg", "query")).toBe("pg__query")
  })

  it("拆得回来", () => {
    expect(拆工具全名("pg__query")).toEqual({ 服务器名: "pg", 工具名: "query" })
  })

  /** 工具名里带单个下划线很常见，**所以分隔符是双下划线** */
  it("工具名自己带下划线也不会拆错", () => {
    expect(拆工具全名(工具全名("pg", "run_sql"))).toEqual({ 服务器名: "pg", 工具名: "run_sql" })
  })

  it("**拆不开就说拆不开，不猜**", () => {
    expect(拆工具全名("query")).toBeUndefined()
    expect(拆工具全名("__query")).toBeUndefined()
    expect(拆工具全名("pg__")).toBeUndefined()
  })
})
