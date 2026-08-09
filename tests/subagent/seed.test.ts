/**
 * 新工作区里那份子 agent 样例（2026-08-10）。
 *
 * 子 agent 的能力早就具备，但新用户打开 DAWN **不知道该往哪写什么**——
 * `.dawn/agents/` 是空的，格式也没有任何地方提示。所以建会话时放一份样例。
 *
 * 这条测试盯三件事，每一件都对应一个具体的坏法：
 *   1. **样例不能变成一个 agent** —— 加载器把 `.dawn/agents/` 下每个 `.md`
 *      都当定义，样例若叫 `scout.md` 就是我们替用户装上了一个 agent
 *   2. **样例不能报成坏定义** —— 叫 `README.md` 的话每次建会话都报一次问题
 *   3. **不能与仓库里那份样例漂移** —— 两个家，改了一个另一个不会说话
 */
import { describe, expect, it } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { seedSubagentExample } from "../../src/session/manager.js"
import { loadSubagentDefinitions } from "../../src/subagent/definitions.js"

const CANON = resolve(import.meta.dirname, "../../examples/agents/scout.md")

function ws(): string {
  return mkdtempSync(join(tmpdir(), "dawn-seed-"))
}

describe("样例落地", () => {
  it("放下 scout.md.example 与 README.txt", () => {
    const root = ws()
    seedSubagentExample(root)
    expect(existsSync(join(root, ".dawn", "agents", "scout.md.example"))).toBe(true)
    expect(existsSync(join(root, ".dawn", "README.txt"))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it("**样例不会变成一个 agent** —— `.md.example` 加载器不认", () => {
    const root = ws()
    seedSubagentExample(root)
    const { agents, problems } = loadSubagentDefinitions(root)
    expect(agents).toEqual([])
    // **也不能报成问题**：那样每次建会话都刷一条，比不放样例更烦
    expect(problems).toEqual([])
    rmSync(root, { recursive: true, force: true })
  })

  it("**改个名就真的能用** —— 这是 README 里教的那一步", () => {
    const root = ws()
    seedSubagentExample(root)
    const dir = join(root, ".dawn", "agents")
    writeFileSync(join(dir, "scout.md"), readFileSync(join(dir, "scout.md.example"), "utf8"))
    const { agents, problems } = loadSubagentDefinitions(root)
    expect(problems).toEqual([])
    expect(agents.map((a) => a.name)).toEqual(["scout"])
    rmSync(root, { recursive: true, force: true })
  })

  it("**与 examples/agents/scout.md 逐字一致** —— 否则就是同一份东西两个家", () => {
    const root = ws()
    seedSubagentExample(root)
    const seeded = readFileSync(join(root, ".dawn", "agents", "scout.md.example"), "utf8")
    expect(seeded).toBe(readFileSync(CANON, "utf8"))
    rmSync(root, { recursive: true, force: true })
  })

  it("**已存在就不动** —— 覆盖等于替用户做决定", () => {
    const root = ws()
    const dir = join(root, ".dawn", "agents")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "scout.md.example"), "我自己改过的")
    writeFileSync(join(root, ".dawn", "README.txt"), "我自己写的")
    seedSubagentExample(root)
    expect(readFileSync(join(dir, "scout.md.example"), "utf8")).toBe("我自己改过的")
    expect(readFileSync(join(root, ".dawn", "README.txt"), "utf8")).toBe("我自己写的")
    rmSync(root, { recursive: true, force: true })
  })

  it("工作区不可写时不抛异常 —— 写不出样例不该拦住建会话", () => {
    expect(() => seedSubagentExample("/dev/null/不存在的路径")).not.toThrow()
  })
})
