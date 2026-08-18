/**
 * **外部工具也要进账本**（2026-08-18）。
 *
 * 「外部」指两类：MCP 服务器的工具，以及内核里的 `run_code`。它们与内置工具
 * 走的是同一条缝（`native.ts` 的 `toolsFor` → pi 的 `customTools`），
 * **但一直没套溯源探针**——`toolsFor` 的最后一句是
 * `[...(base ?? []), ...内核工具, ...mcp工具]`：`base` 包过，后面两个直接拼上去。
 *
 * 后果不是「账本上一个字都没有」（那句我说重了）——`tool_start` 照常记一条
 * `tool_call:<工具名>` 的 Run，**缺的是文件事实**：模型让内核画了一张图、
 * 让 MCP 服务器写了一份表，账本答不出「那次调用写了什么」。
 * 而那正是不变式 5 存在的理由。
 *
 * ## 为什么外部工具「一律观察」，不走白名单
 *
 * `PRODUCING_TOOLS` 那张白名单的前提是**「这些工具是我们写的，我们知道
 * 哪个会写文件」**。对第三方工具这个前提不成立：名字是它自己起的、
 * 参数 schema 是它自己定的，我们看不见它内部干什么
 * （`mcp-tool.ts` 那条「过门」的注释里写的就是这句）。
 *
 * 代价是每次调用多一对 `git status`。**这个代价我们早就在付**：
 * `bash` 就在白名单里，而 bash 的调用次数比 MCP 多一个数量级。
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ProvenanceProbe, 套上溯源, type ToolFileFacts } from "../../src/runtime/provenance.js"

let repo: string
let 收到: { toolCallId: string; facts: ToolFileFacts }[]

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  })
}

/** 一个假的外部工具：跑起来就往工作区写点东西 */
const 会写文件的工具 = (名: string, 写什么: () => void) => ({
  name: 名,
  description: "假的",
  async execute(_id: string, _p: unknown, _s: unknown, _u: unknown, _c: unknown) {
    写什么()
    return { content: [{ type: "text", text: "好了" }] }
  },
})

const 跑一次 = async (定义: Record<string, unknown>, 工作区: string) => {
  const 套好的 = 套上溯源(定义, new ProvenanceProbe(工作区), (toolCallId: string, facts: ToolFileFacts) =>
    收到.push({ toolCallId, facts }),
  )
  return (套好的.execute as (...a: unknown[]) => Promise<unknown>)("tc-1", {}, undefined, undefined, undefined)
}

beforeEach(() => {
  收到 = []
  repo = mkdtempSync(join(tmpdir(), "dawn-外部溯源-"))
  git(repo, "init", "-q", "-b", "main")
  writeFileSync(join(repo, "seed.txt"), "seed\n")
  git(repo, "add", ".")
  git(repo, "commit", "-q", "-m", "seed")
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe("外部工具的溯源", () => {
  it("**内核画出来的那张图记进账本**", async () => {
    await 跑一次(会写文件的工具("run_code", () => writeFileSync(join(repo, "fig1.svg"), "<svg/>")), repo)

    expect(收到).toHaveLength(1)
    expect(收到[0]!.toolCallId).toBe("tc-1")
    expect(收到[0]!.facts.filesWritten).toContain("fig1.svg")
  })

  it("**名字说明不了任何事**：一个叫 `grep` 的 MCP 工具照样观察", async () => {
    /**
     * 这一条是这个文件存在的理由。`grep` **不在** `PRODUCING_TOOLS` 里——
     * 按内置那条路它会被整个跳过，而第三方服务器完全可以起一个叫 `grep`、
     * 却真的往盘上写东西的工具。**白名单的前提在这里不成立。**
     */
    await 跑一次(会写文件的工具("某服务器__grep", () => writeFileSync(join(repo, "偷偷写的.txt"), "x")), repo)

    expect(收到).toHaveLength(1)
    expect(收到[0]!.facts.filesWritten).toContain("偷偷写的.txt")
  })

  it("什么都没写时报**一个空的清单** —— 那是观察到的结果，不是猜的", async () => {
    await 跑一次(会写文件的工具("某服务器__查询", () => {}), repo)

    expect(收到).toHaveLength(1)
    expect(收到[0]!.facts.filesWritten).toEqual([])
  })

  it("**非 git 仓库一个字都不报** —— 「不知道」不等于「没改」", async () => {
    const 不是仓库 = mkdtempSync(join(tmpdir(), "dawn-非仓库-"))
    try {
      await 跑一次(
        会写文件的工具("某服务器__写", () => writeFileSync(join(不是仓库, "a.txt"), "x")),
        不是仓库,
      )
      // **不是发一条 `filesWritten: []`**：那会被读成「确认没改任何文件」
      expect(收到).toEqual([])
    } finally {
      rmSync(不是仓库, { recursive: true, force: true })
    }
  })

  it("工具自己抛了，**事实照记，异常照抛**", async () => {
    const 炸了 = {
      name: "某服务器__会炸",
      async execute() {
        writeFileSync(join(repo, "炸之前写的.txt"), "x")
        throw new Error("服务器崩了")
      },
    }
    await expect(跑一次(炸了 as unknown as Record<string, unknown>, repo)).rejects.toThrow("服务器崩了")
    // 它在炸之前**真的写了东西**，那件事必须留痕
    expect(收到[0]?.facts.filesWritten).toContain("炸之前写的.txt")
  })

  it("**原样转交**：名字、说明、入参一个都不动", async () => {
    const 原 = { name: "某服务器__x", description: "说明", parameters: { a: 1 }, async execute() { return "r" } }
    const 套好的 = 套上溯源(原 as unknown as Record<string, unknown>, new ProvenanceProbe(repo), () => {})
    expect(套好的.name).toBe("某服务器__x")
    expect(套好的.description).toBe("说明")
    expect(套好的.parameters).toEqual({ a: 1 })
    // 返回值也要原样回去——包装器不许改工具的答复
    expect(await (套好的.execute as (...a: unknown[]) => Promise<unknown>)("tc", {}, undefined, undefined, undefined)).toBe("r")
  })
})
