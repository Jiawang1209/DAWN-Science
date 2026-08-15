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
import { 合名单, 工具全名, 拆工具全名, 名字过得了API, 工具名形状, 项目名单文件 } from "../../src/mcp/名单.js"

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
    写项目名单("mcp:\n  lab-db:\n    command: ./tools/mcp-lab\n")
    const r = 合名单(全局一台, 工作区)
    expect(r.服务器.map((x) => x.名).sort()).toEqual(["lab-db", "pg"])
    expect(r.服务器.find((x) => x.名 === "lab-db")!.来自).toBe("项目")
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
    写项目名单("mcp:\n  pg:\n    command: ./local-pg\n  other:\n    command: ./x\n")
    const r = 合名单(全局一台, 工作区)
    expect(r.服务器.map((x) => x.名)).toEqual(["other"])
  })

  /** **读不出来要说清是哪份文件**：一句笼统的「配置有问题」会让人翻整个目录 */
  it("项目名单坏了，如实报出文件名，且全局的照常可用", () => {
    写项目名单("mcp:\n  broken:\n    没有command: 1\n")
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
    写项目名单("mcp:\n  sneaky:\n    command: ./x\n    trusted: true\n")
    const r = 合名单(全局一台, 工作区)
    expect(r.服务器.map((x) => x.名), "让一份被 clone 的配置声明了自己可信").toEqual(["pg"])
    expect(r.问题[0]).toContain(项目名单文件)
  })

  it("一台都没配时是空名单，不是错误", () => {
    expect(合名单(undefined, 工作区)).toEqual({ 服务器: [], 问题: [] })
  })
})

/**
 * **工具名要出境，形状由接收方定**（2026-08-15 作者实测撞的）。
 *
 * > `400: Invalid 'tools[14].function.name': string does not match pattern.`
 * > `Expected a string that matches the pattern '^[a-zA-Z0-9_-]+$'`
 *
 * 我把服务器名的形状按「我们自己觉得合理」定（还允许中文），
 * 于是 `官方参考__echo` 送进 DeepSeek 当场 400。
 *
 * **代价远超那一个工具**：工具清单是整轮请求的一部分，一个名字不合格，
 * **这段对话的每一句都发不出去**——而那条 400 里只字未提 MCP。
 */
describe("名字要过得了模型 API", () => {
  it("**中文名过不了**，并说清为什么", () => {
    const 话 = 名字过得了API("官方参考")
    expect(话, "中文名被放行了——DeepSeek 会当场 400").toBeTruthy()
    expect(话).toContain("a-zA-Z0-9_-")
  })

  it("空格、点、冒号都过不了", () => {
    for (const 名 of ["有 空格", "带.点", "带:冒号"]) {
      expect(名字过得了API(名), `「${名}」被放行了`).toBeTruthy()
    }
  })

  it("双下划线过不了 —— 那是拆前缀的分隔符", () => {
    expect(名字过得了API("a__b")).toContain("双下划线")
  })

  it("正常的名字放行", () => {
    for (const 名 of ["pubmed", "my-server", "srv_2", "PG"]) {
      expect(名字过得了API(名), `「${名}」不该被拦`).toBeUndefined()
    }
  })

  /**
   * **已经配着的那些也要拦**：手写的、老版本加进去的都可能带中文。
   * 拦不住的话，人只会看到一条与 MCP 毫无关系的 400。
   */
  it("**名单里名字不合格的那台不启用，并出声**", () => {
    const r = 合名单({ 官方参考: { command: "npx" }, pubmed: { command: "npx" } })
    expect(r.服务器.map((x) => x.名), "不合格的那台被放进去了").toEqual(["pubmed"])
    expect(r.问题.join("|")).toContain("官方参考")
    expect(r.问题.join("|"), "只说不启用没用——要说清为什么").toContain("a-zA-Z0-9_-")
  })

  /** 拼出来的全名也得过那个形状——**这是最终送出去的那个字符串** */
  it("拼出来的全名过得了那个形状", () => {
    expect(工具名形状.test(工具全名("pubmed", "pubmed_search_articles"))).toBe(true)
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
