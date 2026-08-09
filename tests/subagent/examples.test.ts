/**
 * 仓库里那四份样例定义必须真的能被加载（①-B″ · S1）。
 *
 * **样例是给人抄的**，抄一份坏的比没有样例更坏——用户会以为是自己的环境有问题。
 * 所以它们不放在文档里当代码块，而是放在 `examples/agents/` 下，
 * 由这条测试用**真的加载器**读一遍。
 */
import { describe, expect, it } from "vitest"
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { loadSubagentDefinitions } from "../../src/subagent/definitions.js"

const EXAMPLES = resolve(import.meta.dirname, "../../examples/agents")

/** 样例目录本身不是项目根，所以摆成 `<root>/.dawn/agents/` 再读 */
function asProject(): string {
  const root = mkdtempSync(join(tmpdir(), "dawn-examples-"))
  mkdirSync(join(root, ".dawn"), { recursive: true })
  cpSync(EXAMPLES, join(root, ".dawn", "agents"), { recursive: true })
  return root
}

describe("examples/agents 里的样例", () => {
  it("**一个都不报问题** —— 样例坏了，用户会以为是自己的环境有问题", () => {
    const root = asProject()
    const { agents, problems } = loadSubagentDefinitions(root)
    expect(problems).toEqual([])
    expect(agents.map((a) => a.name).sort()).toEqual(["planner", "reviewer", "scout", "worker"])
    rmSync(root, { recursive: true, force: true })
  })

  it("每个都有非空的 system prompt 与 description", () => {
    const root = asProject()
    for (const a of loadSubagentDefinitions(root).agents) {
      expect(a.systemPrompt.trim().length, `${a.name} 的正文不该是空的`).toBeGreaterThan(20)
      expect(a.description.trim().length, `${a.name} 的描述不该是空的`).toBeGreaterThan(5)
    }
    rmSync(root, { recursive: true, force: true })
  })

  it("**worker 刻意不写 tools** —— 它要继承默认全套，缺省不等于「不给工具」", () => {
    const root = asProject()
    const byName = new Map(loadSubagentDefinitions(root).agents.map((a) => [a.name, a]))
    expect(byName.get("worker")!.tools).toBeUndefined()
    expect(byName.get("scout")!.tools).toEqual(["read", "bash"])
    expect(byName.get("planner")!.tools).toEqual(["read"])
    rmSync(root, { recursive: true, force: true })
  })
})
