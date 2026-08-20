# ACP 客户端的手 · T1（本机版）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `AcpRuntime` 向适配器声明 `fs` 与 `terminal` 能力并真的实现这七个方法（本机版），使 claude-code-acp 的读/改/跑全部经过 DAWN；`_meta.claudeCode.options.disallowedTools` 堵住 Grep/Glob 漏网。

**Architecture:** 新模块 `src/runtime/acp/hands.ts`（「客户端的手」）把七个 ACP 客户端方法实现在一个抽象后端之上，本期只有 `本机后端`；T2 再加远端后端，运行时不用改。`AcpRuntime.收一条` 的第 ④ 分支从「一律拒绝」改成「交给手」。假 agent 加一个开关真的去调这七个方法，单元测试仍然是「对着假 agent 起真进程」。

**Tech Stack:** Node 22 · TypeScript · vitest · `scripts/fake-acp-agent.mjs`（与 `dev:mock`、e2e 共用）

**规格：** `docs/superpowers/specs/2026-08-20-acp-terminal-design.md` §二「claude」表 + §三 T1

---

## 文件

| 文件 | 职责 |
|---|---|
| Create `src/runtime/acp/hands.ts` | `手的后端` 接口、`本机后端`、`客户端的手`（七个方法 + 路径门 + 终端表 + 截断记数） |
| Create `tests/runtime/acp-hands.test.ts` | 直接对 `客户端的手` 的单元测试（不起进程） |
| Modify `src/runtime/acp/runtime.ts` | 握手能力、`_meta`、④ 分支交给手、`回错` 带 code、`stop` 释放终端 |
| Modify `scripts/fake-acp-agent.mjs` | `FAKE_ACP_USE_HANDS=1`：在 prompt 里真调七个方法并把结果说出来 |
| Modify `tests/runtime/acp-runtime.test.ts` | 整条路：假 agent 经运行时读/写/跑 |
| Modify `docs/DEVELOPMENT_HISTORY.md` | 一条 feat |

---

### Task 1: `客户端的手` —— 路径门与 `fs/*`

**Files:**
- Create: `src/runtime/acp/hands.ts`
- Test: `tests/runtime/acp-hands.test.ts`

- [ ] **Step 1: 写失败的测试**

```ts
// tests/runtime/acp-hands.test.ts
/**
 * ACP 客户端的手（T1，2026-08-20）。
 *
 * 直接对 `客户端的手` 测，不起进程：这里验的是**方法语义与路径门**，
 * 协议与 stdio 那一层在 acp-runtime.test.ts 里对着假 agent 验。
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 客户端的手, 本机后端, 手的错误 } from "../../src/runtime/acp/hands.js"

let 工作区: string
let 手: 客户端的手
const 建 = () => {
  工作区 = mkdtempSync(join(tmpdir(), "dawn-hands-"))
  手 = new 客户端的手(本机后端(), { 工作区, 记录: () => {} })
  return 手
}
afterEach(async () => {
  await 手?.释放全部()
  rmSync(工作区, { recursive: true, force: true })
})

describe("fs/read_text_file", () => {
  it("整份读回来", async () => {
    建()
    writeFileSync(join(工作区, "a.txt"), "一\n二\n三\n")
    const r = await 手.处理("fs/read_text_file", { sessionId: "s", path: join(工作区, "a.txt") })
    expect(r).toEqual({ content: "一\n二\n三\n" })
  })

  it("`line` 与 `limit` 按行切（line 从 1 数）", async () => {
    建()
    writeFileSync(join(工作区, "a.txt"), "一\n二\n三\n四\n")
    const r = await 手.处理("fs/read_text_file", { sessionId: "s", path: join(工作区, "a.txt"), line: 2, limit: 2 })
    expect(r).toEqual({ content: "二\n三\n" })
  })

  it("文件不在时，错误里有路径", async () => {
    建()
    await expect(手.处理("fs/read_text_file", { sessionId: "s", path: join(工作区, "没有.txt") })).rejects.toThrow(/没有\.txt/)
  })
})

describe("fs/write_text_file", () => {
  it("写进去，父目录不在就建", async () => {
    建()
    const p = join(工作区, "深", "的", "b.txt")
    await 手.处理("fs/write_text_file", { sessionId: "s", path: p, content: "内容" })
    expect(readFileSync(p, "utf8")).toBe("内容")
  })
})

describe("路径门：与 native 的 gatedTools 同口径", () => {
  it("工作区外的绝对路径拒绝，code 是 -32602，话里有那条路径", async () => {
    建()
    const 外 = join(tmpdir(), "dawn-hands-外面.txt")
    const e = await 手.处理("fs/read_text_file", { sessionId: "s", path: 外 }).catch((x) => x)
    expect(e).toBeInstanceOf(手的错误)
    expect(e.code).toBe(-32602)
    expect(e.message).toContain("dawn-hands-外面.txt")
  })

  it("`..` 爬出去也拒绝", async () => {
    建()
    const e = await 手.处理("fs/write_text_file", { sessionId: "s", path: join(工作区, "..", "爬.txt"), content: "" }).catch((x) => x)
    expect(e.code).toBe(-32602)
  })

  it("相对路径拒绝——ACP 的路径一律绝对", async () => {
    建()
    const e = await 手.处理("fs/read_text_file", { sessionId: "s", path: "a.txt" }).catch((x) => x)
    expect(e.code).toBe(-32602)
  })

  it("不认识的方法，code 是 -32601", async () => {
    建()
    const e = await 手.处理("fs/delete", { sessionId: "s" }).catch((x) => x)
    expect(e.code).toBe(-32601)
  })
})
```

- [ ] **Step 2: 跑一次，确认失败**

Run: `npx vitest run tests/runtime/acp-hands.test.ts`
Expected: FAIL，`Cannot find module '../../src/runtime/acp/hands.js'`

- [ ] **Step 3: 最小实现（fs 两个 + 门；终端方法先抛 -32601）**

```ts
// src/runtime/acp/hands.ts
/**
 * ACP 客户端的手（T1，2026-08-20）。
 *
 * ACP 的 agent 可以**把手借给客户端**：读写走 `fs/read_text_file` / `fs/write_text_file`，
 * 跑命令走 `terminal/*`。2026-08-20 在真适配器上量过：claude-code-acp 借，codex-acp 不借
 * （见 specs/2026-08-20-acp-terminal-design.md §一）。
 *
 * 这里把七个方法实现在一个抽象后端之上。**本期只有本机后端**；
 * 远端后端（T2）换的只是「另一端是谁」，运行时与这一层不用改——
 * 与 `RemoteExecutor` 对 native 工具的做法同一形状。
 *
 * ## 路径门
 *
 * 与 native 的 `gatedTools` 同口径：读写限于会话工作区，越界回 `-32602` 并把那条路径说出来。
 * ACP 的路径**一律绝对**——相对路径的含义取决于谁的 cwd，拒掉比猜安全。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { spawn, type ChildProcess } from "node:child_process"

/** JSON-RPC 能看懂的错误：带 code。运行时原样写回对方 */
export class 手的错误 extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

export interface 跑着的命令 {
  /** 每来一段输出（stdout 与 stderr 合流，ACP 的 terminal 不分流） */
  onData(cb: (chunk: Buffer) => void): void
  /** 结束时给退出码 / 信号。**两者至多一个有值** */
  exited: Promise<{ exitCode?: number; signal?: string }>
  kill(): void
}

export interface 手的后端 {
  readFile(path: string): Promise<string>
  /** 父目录不在就建（Write 工具的语义） */
  writeFile(path: string, content: string): Promise<void>
  exec(command: string, opts: { cwd: string; env: Record<string, string> }): 跑着的命令
}

export function 本机后端(): 手的后端 {
  return {
    readFile: (p) => readFile(p, "utf8"),
    async writeFile(p, content) {
      await mkdir(dirname(p), { recursive: true })
      await writeFile(p, content, "utf8")
    },
    exec(command, { cwd, env }) {
      /**
       * **走 shell**：agent 给的是一整句话（`grep -rl 'x' . 2>/dev/null`），
       * 不是 argv。native 的 bash 工具也是这么跑的。
       */
      const proc: ChildProcess = spawn(command, { cwd, env: { ...process.env, ...env }, shell: true, stdio: ["ignore", "pipe", "pipe"] })
      const 听众: Array<(c: Buffer) => void> = []
      const 喂 = (c: Buffer) => 听众.forEach((f) => f(c))
      proc.stdout?.on("data", 喂)
      proc.stderr?.on("data", 喂)
      return {
        onData: (cb) => 听众.push(cb),
        exited: new Promise((成) => {
          proc.once("exit", (code, signal) => 成(signal ? { signal } : { exitCode: code ?? 0 }))
          // 起不来（shell 不在之类）也要收口，不然 wait_for_exit 永远挂着
          proc.once("error", () => 成({ exitCode: 127 }))
        }),
        kill: () => proc.kill("SIGTERM"),
      }
    },
  }
}

interface 手的选项 {
  /** 读写与命令都限在这里面（绝对路径） */
  工作区: string
  /** 我们自己的日志口：截断了多少字节等，协议里没有格子放的话从这里出声 */
  记录: (text: string) => void
}

interface 一台终端 {
  命令: 跑着的命令
  缓冲: Buffer[]
  字节数: number
  上限: number
  丢了: number
  结果?: { exitCode?: number; signal?: string }
}

const 默认输出上限 = 1024 * 1024

export class 客户端的手 {
  private readonly 终端们 = new Map<string, 一台终端>()
  private 下一个终端 = 1

  constructor(
    private readonly 后端: 手的后端,
    private readonly opts: 手的选项,
  ) {}

  /** 收一条客户端方法。不认识的回 -32601，参数不对回 -32602 */
  async 处理(method: string, params: unknown): Promise<unknown> {
    const p = (params ?? {}) as Record<string, unknown>
    switch (method) {
      case "fs/read_text_file":
        return this.读(p)
      case "fs/write_text_file":
        return this.写(p)
      case "terminal/create":
        return this.开终端(p)
      case "terminal/output":
        return this.终端输出(p)
      case "terminal/wait_for_exit":
        return this.等终端(p)
      case "terminal/kill":
        return this.杀终端(p)
      case "terminal/release":
        return this.放终端(p)
      default:
        throw new 手的错误(-32601, `DAWN 不支持 ${method}`)
    }
  }

  async 释放全部(): Promise<void> {
    for (const id of [...this.终端们.keys()]) await this.放终端({ terminalId: id })
  }

  /* ── fs ───────────────────────────────────────────────── */

  private async 读(p: Record<string, unknown>) {
    const path = this.门(p["path"])
    let text: string
    try {
      text = await this.后端.readFile(path)
    } catch (e) {
      throw new 手的错误(-32603, `读不了 ${path}：${e instanceof Error ? e.message : String(e)}`)
    }
    const line = typeof p["line"] === "number" ? p["line"] : undefined
    const limit = typeof p["limit"] === "number" ? p["limit"] : undefined
    if (line === undefined && limit === undefined) return { content: text }
    /** 按行切，**保留每行自己的换行**——拼回去就是原文的那一段 */
    const 行 = text.split(/(?<=\n)/)
    const 起 = Math.max(0, (line ?? 1) - 1)
    const 段 = 行.slice(起, limit === undefined ? undefined : 起 + limit)
    return { content: 段.join("") }
  }

  private async 写(p: Record<string, unknown>) {
    const path = this.门(p["path"])
    if (typeof p["content"] !== "string") throw new 手的错误(-32602, "fs/write_text_file 缺 content")
    try {
      await this.后端.writeFile(path, p["content"])
    } catch (e) {
      throw new 手的错误(-32603, `写不了 ${path}：${e instanceof Error ? e.message : String(e)}`)
    }
    return {}
  }

  /** 路径门。回规范化后的绝对路径 */
  private 门(raw: unknown): string {
    if (typeof raw !== "string" || !isAbsolute(raw)) {
      throw new 手的错误(-32602, `路径必须是绝对路径：${String(raw)}`)
    }
    const 绝 = resolve(raw)
    const 相 = relative(this.opts.工作区, 绝)
    if (相 === "" || (!相.startsWith("..") && !isAbsolute(相))) return 绝
    throw new 手的错误(-32602, `${raw} 在这段会话的工作区（${this.opts.工作区}）之外，不给读写`)
  }

  /* ── terminal：Task 2 ─────────────────────────────────── */

  private 开终端(_p: Record<string, unknown>): unknown {
    throw new 手的错误(-32601, "terminal/create 还没实现")
  }
  private 终端输出(_p: Record<string, unknown>): unknown {
    throw new 手的错误(-32601, "terminal/output 还没实现")
  }
  private 等终端(_p: Record<string, unknown>): unknown {
    throw new 手的错误(-32601, "terminal/wait_for_exit 还没实现")
  }
  private 杀终端(_p: Record<string, unknown>): unknown {
    throw new 手的错误(-32601, "terminal/kill 还没实现")
  }
  private async 放终端(_p: Record<string, unknown>): Promise<unknown> {
    throw new 手的错误(-32601, "terminal/release 还没实现")
  }
}

// `sep` 与 `默认输出上限`、`一台终端`、`下一个终端` 在 Task 2 用上
void sep
void 默认输出上限
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx vitest run tests/runtime/acp-hands.test.ts`
Expected: 8 passed

- [ ] **Step 5: typecheck 并提交**

Run: `npm run typecheck`
Expected: 无错误（`释放全部` 调 `放终端` 会抛——测试里 `afterEach` 用了 `?.` 且没有终端时循环不进去，不会触发）

```bash
git add src/runtime/acp/hands.ts tests/runtime/acp-hands.test.ts
git commit -m "feat(acp): 客户端的手——fs/read_text_file、fs/write_text_file 与路径门"
```

---

### Task 2: `terminal/*` 五个方法

**Files:**
- Modify: `src/runtime/acp/hands.ts`（替换 Task 1 里「Task 2」那五个桩）
- Test: `tests/runtime/acp-hands.test.ts`

- [ ] **Step 1: 追加失败的测试**

```ts
// 追加到 tests/runtime/acp-hands.test.ts 末尾
describe("terminal/*", () => {
  it("create 不等结束就回 id；wait_for_exit 拿到退出码；output 是合流的输出", async () => {
    建()
    const { terminalId } = (await 手.处理("terminal/create", {
      sessionId: "s",
      command: "printf 出; printf 错 1>&2; exit 3",
    })) as { terminalId: string }
    expect(terminalId).toMatch(/^t\d+$/)
    const 退 = await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId })
    expect(退).toEqual({ exitCode: 3 })
    const 出 = (await 手.处理("terminal/output", { sessionId: "s", terminalId })) as { output: string; truncated: boolean; exitStatus?: unknown }
    expect(出.output).toContain("出")
    expect(出.output).toContain("错")
    expect(出.truncated).toBe(false)
    expect(出.exitStatus).toEqual({ exitCode: 3 })
  })

  it("没结束时 output 不带 exitStatus", async () => {
    建()
    const { terminalId } = (await 手.处理("terminal/create", { sessionId: "s", command: "sleep 5" })) as { terminalId: string }
    const 出 = (await 手.处理("terminal/output", { sessionId: "s", terminalId })) as { exitStatus?: unknown }
    expect(出.exitStatus).toBeUndefined()
    await 手.处理("terminal/kill", { sessionId: "s", terminalId })
    const 退 = (await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId })) as { signal?: string }
    expect(退.signal).toBe("SIGTERM")
  })

  it("cwd 默认是工作区；给了 cwd 也得在工作区里", async () => {
    建()
    mkdirSync(join(工作区, "子"))
    const a = (await 手.处理("terminal/create", { sessionId: "s", command: "pwd" })) as { terminalId: string }
    await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId: a.terminalId })
    const 出a = (await 手.处理("terminal/output", { sessionId: "s", terminalId: a.terminalId })) as { output: string }
    expect(出a.output.trim().endsWith(工作区.split("/").pop()!)).toBe(true)

    const b = (await 手.处理("terminal/create", { sessionId: "s", command: "pwd", cwd: join(工作区, "子") })) as { terminalId: string }
    await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId: b.terminalId })
    const 出b = (await 手.处理("terminal/output", { sessionId: "s", terminalId: b.terminalId })) as { output: string }
    expect(出b.output.trim().endsWith("子")).toBe(true)

    const e = await 手.处理("terminal/create", { sessionId: "s", command: "pwd", cwd: tmpdir() }).catch((x) => x)
    expect(e.code).toBe(-32602)
  })

  it("env 是 `[{name,value}]` 数组，真的传进去", async () => {
    建()
    const { terminalId } = (await 手.处理("terminal/create", {
      sessionId: "s",
      command: "printf \"$DAWN_HANDS_PROBE\"",
      env: [{ name: "DAWN_HANDS_PROBE", value: "到了" }],
    })) as { terminalId: string }
    await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId })
    const 出 = (await 手.处理("terminal/output", { sessionId: "s", terminalId })) as { output: string }
    expect(出.output).toBe("到了")
  })

  it("超过 outputByteLimit 从头丢、truncated 为真，并在我们的日志里说清丢了多少", async () => {
    const 记: string[] = []
    工作区 = mkdtempSync(join(tmpdir(), "dawn-hands-"))
    手 = new 客户端的手(本机后端(), { 工作区, 记录: (t) => 记.push(t) })
    const { terminalId } = (await 手.处理("terminal/create", {
      sessionId: "s",
      command: "printf 'abcdefghij'",
      outputByteLimit: 4,
    })) as { terminalId: string }
    await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId })
    const 出 = (await 手.处理("terminal/output", { sessionId: "s", terminalId })) as { output: string; truncated: boolean }
    expect(出.output).toBe("ghij")
    expect(出.truncated).toBe(true)
    expect(记.some((t) => /6/.test(t) && /字节/.test(t))).toBe(true)
  })

  it("release 之后那个 id 不认了；release 一个还在跑的会先杀", async () => {
    建()
    const { terminalId } = (await 手.处理("terminal/create", { sessionId: "s", command: "sleep 5" })) as { terminalId: string }
    await 手.处理("terminal/release", { sessionId: "s", terminalId })
    const e = await 手.处理("terminal/output", { sessionId: "s", terminalId }).catch((x) => x)
    expect(e.code).toBe(-32602)
  })

  it("不存在的 terminalId，-32602 且话里有那个 id", async () => {
    建()
    const e = await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId: "t999" }).catch((x) => x)
    expect(e.code).toBe(-32602)
    expect(e.message).toContain("t999")
  })
})
```

- [ ] **Step 2: 跑一次，确认新用例失败**

Run: `npx vitest run tests/runtime/acp-hands.test.ts`
Expected: 8 passed, 7 failed（都是「还没实现」）

- [ ] **Step 3: 把五个桩换成实现**

把 Task 1 里 `/* ── terminal：Task 2 ── */` 到类结尾之间的五个桩，以及文件末尾两行 `void`，整体替换为：

```ts
  /* ── terminal ─────────────────────────────────────────── */

  private 开终端(p: Record<string, unknown>): { terminalId: string } {
    if (typeof p["command"] !== "string" || p["command"] === "") {
      throw new 手的错误(-32602, "terminal/create 缺 command")
    }
    /**
     * ACP 的 `args` 是可选的 argv 尾巴。**拼进 command**——我们走 shell，
     * 逐个加引号比让 shell 自己分词更容易出错，而真适配器（claude）从来只给 command。
     */
    const args = Array.isArray(p["args"]) ? (p["args"] as unknown[]).filter((a): a is string => typeof a === "string") : []
    const command = [p["command"], ...args.map(单引号)].join(" ")
    const cwd = p["cwd"] === undefined ? this.opts.工作区 : this.门(p["cwd"])
    /** `env` 是 `[{name, value}]`——与 `mcpServers[].env` 同一形状（2026-08-19 撞过） */
    const env: Record<string, string> = {}
    if (Array.isArray(p["env"])) {
      for (const e of p["env"] as Array<Record<string, unknown>>) {
        if (typeof e?.["name"] === "string" && typeof e?.["value"] === "string") env[e["name"]] = e["value"]
      }
    }
    const 上限 = typeof p["outputByteLimit"] === "number" && p["outputByteLimit"] > 0 ? p["outputByteLimit"] : 默认输出上限

    const terminalId = `t${this.下一个终端++}`
    const 命令 = this.后端.exec(command, { cwd, env })
    const 台: 一台终端 = { 命令, 缓冲: [], 字节数: 0, 上限, 丢了: 0 }
    命令.onData((c) => this.攒(台, c))
    void 命令.exited.then((r) => {
      台.结果 = r
      if (台.丢了 > 0) {
        // **说清省了多少**（规格 7.5）。协议里 `truncated` 只是一个布尔，数在我们这儿
        this.opts.记录(`终端 ${terminalId} 的输出超过 ${上限} 字节上限，从头丢了 ${台.丢了} 字节`)
      }
    })
    this.终端们.set(terminalId, 台)
    return { terminalId }
  }

  /** 攒输出，超了从头丢。**丢的按字节数记**，不按段数——段的大小是随机的 */
  private 攒(台: 一台终端, c: Buffer): void {
    台.缓冲.push(c)
    台.字节数 += c.length
    while (台.字节数 > 台.上限 && 台.缓冲.length > 0) {
      const 头 = 台.缓冲[0]!
      const 多 = 台.字节数 - 台.上限
      if (头.length <= 多) {
        台.缓冲.shift()
        台.字节数 -= 头.length
        台.丢了 += 头.length
      } else {
        台.缓冲[0] = 头.subarray(多)
        台.字节数 -= 多
        台.丢了 += 多
      }
    }
  }

  private 终端输出(p: Record<string, unknown>) {
    const 台 = this.取终端(p)
    return {
      output: Buffer.concat(台.缓冲).toString("utf8"),
      truncated: 台.丢了 > 0,
      ...(台.结果 ? { exitStatus: 台.结果 } : {}),
    }
  }

  private async 等终端(p: Record<string, unknown>) {
    const 台 = this.取终端(p)
    return await 台.命令.exited
  }

  private 杀终端(p: Record<string, unknown>) {
    this.取终端(p).命令.kill()
    return {}
  }

  private async 放终端(p: Record<string, unknown>) {
    const id = String(p["terminalId"])
    const 台 = this.终端们.get(id)
    if (!台) return {} // release 是幂等的：放一个已经不在的，不算错
    this.终端们.delete(id)
    if (!台.结果) {
      台.命令.kill()
      await 台.命令.exited
    }
    return {}
  }

  private 取终端(p: Record<string, unknown>): 一台终端 {
    const id = p["terminalId"]
    const 台 = typeof id === "string" ? this.终端们.get(id) : undefined
    if (!台) throw new 手的错误(-32602, `没有这台终端：${String(id)}`)
    return 台
  }
}

function 单引号(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}
```

并把文件顶部 `import { dirname, isAbsolute, relative, resolve, sep } from "node:path"` 改成不含 `sep`。

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx vitest run tests/runtime/acp-hands.test.ts`
Expected: 15 passed

- [ ] **Step 5: typecheck 并提交**

Run: `npm run typecheck`

```bash
git add src/runtime/acp/hands.ts tests/runtime/acp-hands.test.ts
git commit -m "feat(acp): 客户端的手——terminal/* 五个方法，超限从头丢并记数"
```

---

### Task 3: 假 agent 学会用手

**Files:**
- Modify: `scripts/fake-acp-agent.mjs`

准入规则 1：新增协议操作必须在同一次改动里补假后端。假 agent 置 `FAKE_ACP_USE_HANDS=1` 时，
在 `session/prompt` 里**真的**调七个方法，并把每一步的结果说成一句话，用例据此断言。

- [ ] **Step 1: 在文件头的开关表（第 33 行附近）加一行**

```js
 * | `FAKE_ACP_USE_HANDS` | 置一即在回话前**真调客户端的手**：读 `<cwd>/手-读.txt`、写 `<cwd>/手-写.txt`、跑 `printf`（T1） |
```

- [ ] **Step 2: 在 `initialize` 分支里记下客户端能力**

找到 `if (method === "initialize") {`，在它读 `FAKE_ACP_FAIL_INIT` 之前加：

```js
    客户端能力 = params?.clientCapabilities ?? {}
```

并在文件顶部（`const 像claude = ...` 之后）加：

```js
/** 客户端握手时声明的能力。**没声明就不调**——真适配器也是这么干的 */
let 客户端能力 = {}
/** 问出去的客户端方法：id → resolve。与 `问出去的`（权限）分开记，错误也要拿得到 */
const 调出去的 = new Map()
let 下一个调id = 5000

/** 调一次客户端方法，回 `{result}` 或 `{error}`。**不抛**：用例要看见错误长什么样 */
function 调(method, params) {
  const id = 下一个调id++
  return new Promise((成) => {
    调出去的.set(id, 成)
    发({ jsonrpc: "2.0", id, method, params })
  })
}
```

- [ ] **Step 3: 收回复时先认 `调出去的`**

找到 `// 客户端回了我们问出去的那一条` 那一段，在它**前面**加：

```js
  if (method === undefined && id !== undefined && 调出去的.has(id)) {
    const 成 = 调出去的.get(id)
    调出去的.delete(id)
    成(msg.error ? { error: msg.error } : { result: msg.result })
    return
  }
```

- [ ] **Step 4: 在 `session/prompt` 里、权限询问那段之后加**

```js
    /**
     * **真调客户端的手**（T1）。七个方法各一次，每一步说一句话——
     * 用例靠这些话断言「经过了运行时」，而不是看文件有没有变（那也看）。
     */
    if (process.env["FAKE_ACP_USE_HANDS"] === "1") {
      const 说 = (text) =>
        发({
          jsonrpc: "2.0",
          method: "session/update",
          params: { sessionId: params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } },
        })
      if (!客户端能力.fs?.readTextFile || !客户端能力.fs?.writeTextFile || !客户端能力.terminal) {
        说(`【手】客户端没声明 fs/terminal：${JSON.stringify(客户端能力)}`)
      } else {
        const cwd = 会话目录
        const 读 = await 调("fs/read_text_file", { sessionId: params.sessionId, path: `${cwd}/手-读.txt` })
        说(`【手·读】${JSON.stringify(读)}`)
        const 写 = await 调("fs/write_text_file", { sessionId: params.sessionId, path: `${cwd}/手-写.txt`, content: "假 agent 写的" })
        说(`【手·写】${JSON.stringify(写)}`)
        const 越界 = await 调("fs/read_text_file", { sessionId: params.sessionId, path: "/etc/hostname" })
        说(`【手·越界】${JSON.stringify(越界)}`)
        const 开 = await 调("terminal/create", { sessionId: params.sessionId, command: "printf 终端通了", outputByteLimit: 4096 })
        说(`【手·开】${JSON.stringify(开)}`)
        const tid = 开.result?.terminalId
        const 退 = await 调("terminal/wait_for_exit", { sessionId: params.sessionId, terminalId: tid })
        说(`【手·退】${JSON.stringify(退)}`)
        const 出 = await 调("terminal/output", { sessionId: params.sessionId, terminalId: tid })
        说(`【手·出】${JSON.stringify(出)}`)
        const 放 = await 调("terminal/release", { sessionId: params.sessionId, terminalId: tid })
        说(`【手·放】${JSON.stringify(放)}`)
      }
    }
```

并在 `session/new` 分支里记下 cwd：找到 `if (method === "session/new") {`，在其内第一行加 `会话目录 = params?.cwd`，在文件顶部 `let 客户端能力 = {}` 旁加 `let 会话目录 = process.cwd()`。

- [ ] **Step 5: 手跑一次假 agent 看握手还正常**

Run: `printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},"terminal":true}}}\n' | node scripts/fake-acp-agent.mjs | head -1`
Expected: 一行 JSON，含 `"id":1` 与 `agentCapabilities`

- [ ] **Step 6: 全量测试仍绿（假 agent 被很多用例共用）**

Run: `npx vitest run tests/runtime/acp-runtime.test.ts`
Expected: 全部 passed（这一步改的是假 agent 的**新增**分支，旧路径不变）

- [ ] **Step 7: 提交**

```bash
git add scripts/fake-acp-agent.mjs
git commit -m "feat(mock): 假 ACP agent 置 FAKE_ACP_USE_HANDS 时真调客户端的手"
```

---

### Task 4: 运行时接上手

**Files:**
- Modify: `src/runtime/acp/runtime.ts`
- Test: `tests/runtime/acp-runtime.test.ts`

- [ ] **Step 1: 写失败的整条路测试**

追加到 `tests/runtime/acp-runtime.test.ts` 末尾：

```ts
describe("客户端的手（T1）", () => {
  /** 用一个临时目录当工作区：假 agent 要在里面读、写 */
  const 带工作区 = (id: string) => {
    const 工作区 = mkdtempSync(join(tmpdir(), "dawn-acp-hands-"))
    writeFileSync(join(工作区, "手-读.txt"), "读到了")
    return { s: { ...spec(id), workspace: 工作区 } as SessionSpec, 工作区 }
  }

  it("**握手声明了 fs 与 terminal**，假 agent 七个方法各调一次都有回音", async () => {
    const rt = 起一个({ FAKE_ACP_USE_HANDS: "1" })
    const { s, 工作区 } = 带工作区("h1")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "用手")
    await 等到(收, (e) => e.kind === "idle", "回合收口")
    const 话 = 收.filter((e): e is Extract<AgentEvent, { kind: "output" }> => e.kind === "output").map((e) => e.data).join("")

    expect(话).not.toContain("客户端没声明")
    expect(话).toContain('【手·读】{"result":{"content":"读到了"}}')
    expect(话).toContain('【手·写】{"result":{}}')
    expect(readFileSync(join(工作区, "手-写.txt"), "utf8")).toBe("假 agent 写的")
    // 越界：code 要是 -32602，且话里有那条路径
    expect(话).toMatch(/【手·越界】\{"error":\{"code":-32602,"message":"[^"]*\/etc\/hostname/)
    expect(话).toMatch(/【手·开】\{"result":\{"terminalId":"t\d+"\}\}/)
    expect(话).toContain('【手·退】{"result":{"exitCode":0}}')
    expect(话).toContain('"output":"终端通了","truncated":false,"exitStatus":{"exitCode":0}')
    expect(话).toContain('【手·放】{"result":{}}')
  })

  it("session/new 带上 `_meta.claudeCode.options.disallowedTools`", async () => {
    const rt = 起一个({ FAKE_ACP_ECHO_NEW_PARAMS: "1" })
    const s = spec("h2")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "看参数")
    const 话 = await 等到(收, (e) => e.kind === "output" && e.data.includes("【session/new 参数】"), "假 agent 复述参数")
    expect(话.kind === "output" && 话.data).toContain('"disallowedTools":["Grep","Glob","NotebookEdit"]')
  })
})
```

并在文件顶部 import 里补：`import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"`（`join`、`tmpdir` 已有）。

第二条用例要假 agent 多一个开关 `FAKE_ACP_ECHO_NEW_PARAMS`：在 `scripts/fake-acp-agent.mjs` 的 `session/new` 分支里记 `新建参数 = params`（顶部 `let 新建参数`），在 `session/prompt` 里（`FAKE_ACP_USE_HANDS` 那段之后）加：

```js
    if (process.env["FAKE_ACP_ECHO_NEW_PARAMS"] === "1") {
      发({
        jsonrpc: "2.0",
        method: "session/update",
        params: { sessionId: params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `【session/new 参数】${JSON.stringify(新建参数)}` } } },
      })
    }
```

并在文件头开关表加一行 `| FAKE_ACP_ECHO_NEW_PARAMS | 置一即把 session/new 收到的参数原样复述（验 _meta） |`。

- [ ] **Step 2: 跑一次，确认两条都失败**

Run: `npx vitest run tests/runtime/acp-runtime.test.ts -t "客户端的手"`
Expected: 2 failed——第一条话里含「客户端没声明」，第二条找不到 `disallowedTools`

- [ ] **Step 3: 运行时改四处**

(a) import：

```ts
import { 客户端的手, 本机后端, 手的错误 } from "./hands.js"
```

(b) `一段` 接口加一个字段（放在 `停了: boolean` 前）：

```ts
  /** 这一段借给 agent 的手（T1）。`stop` 时释放里面的终端 */
  手: 客户端的手
```

(c) `start()` 里建 `段` 的地方（`const 段: 一段 = {` 那个对象字面量）加：

```ts
      手: new 客户端的手(本机后端(), {
        工作区: spec.workspace,
        记录: (text) => this.发(spec.sessionId, { kind: "notice", sessionId: spec.sessionId, text }),
      }),
```

> `发` 在段尚未放进 `段们` 前不会送达——`记录` 只在命令结束后才调，那时段早已就位。

(d) 握手（`clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } }` 那一行）换成：

```ts
      /**
       * **把手借出去**（T1，2026-08-20）。claude-code-acp 看见这三样为真，
       * 就把自己的 Read/Write/Edit/Bash 禁掉、改调我们的 `fs/*` 与 `terminal/*`
       * （量过：specs/2026-08-20-acp-terminal-design.md §一）。codex-acp 不看，照旧。
       */
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
```

(e) `session/new` 与 `session/load` 两处请求参数都加 `_meta`。先在类外定义：

```ts
/**
 * `session/new` / `session/load` 的 `_meta`：**只有 claude-code-acp 读它**，别的适配器当它不存在
 * （codex-acp 1.6.2 验过收下不报错）。
 *
 * `disallowedTools`：Grep / Glob / NotebookEdit 不经过 `fs/*`——它们直接摸适配器所在机器的磁盘，
 * 是借手之后**仅剩的漏网**。禁掉之后它改用 `grep` 走 terminal（量过）。
 * WebFetch / WebSearch 留着：网络从本机走，无所谓。
 */
const 会话_META = {
  claudeCode: { options: { disallowedTools: ["Grep", "Glob", "NotebookEdit"] } },
} as const
```

然后 `session/load` 的参数对象加 `_meta: 会话_META,`，`session/new` 的参数对象加 `_meta: 会话_META,`。

(f) `收一条` 的第 ④ 分支换成：

```ts
    /**
     * ④ 别的请求——**读写文件、终端——交给手**（T1）。
     *
     * 它在等回复，不回它就一直卡着（表现是「它死了」）。
     * 所以成了回 result，败了回带 code 的 error——两条路都**必须**写回去。
     */
    if (typeof id === "number" && typeof msg["method"] === "string") {
      const method = msg["method"]
      void 段.手.处理(method, msg["params"]).then(
        (result) => this.回结果(段, id, result),
        (e: unknown) => {
          if (e instanceof 手的错误) this.回错(段, id, e.message, e.code)
          else this.回错(段, id, `${method} 失败：${e instanceof Error ? e.message : String(e)}`, -32603)
        },
      )
    }
```

(g) `回错` 加 code 参数，新增 `回结果`：

```ts
  private 回结果(段: 一段, id: number, result: unknown): void {
    段.proc.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, result: result ?? {} })}\n`)
  }

  private 回错(段: 一段, id: number, message: string, code = -32601): void {
    段.proc.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`)
  }
```

(h) `stop()` 里 `段.停了 = true` 之前加：

```ts
    // 借出去的终端一起收——不然 agent 死了，它起的 `sleep 999` 还活着
    await 段.手.释放全部()
```

- [ ] **Step 4: 跑这两条与整个文件**

Run: `npx vitest run tests/runtime/acp-runtime.test.ts`
Expected: 全部 passed（含新加的 2 条）

- [ ] **Step 5: typecheck、全量单测**

Run: `npm run typecheck && npm test`
Expected: 全绿。若 `tests/ui/design-contract.test.ts` 或 `source-hygiene` 有新规则咬到（如「不许用 `/etc/hostname` 之类绝对路径」），按它的提示改测试里的越界路径为 `join(tmpdir(), "dawn-hands-外面.txt")`。

- [ ] **Step 6: 提交**

```bash
git add src/runtime/acp/runtime.ts tests/runtime/acp-runtime.test.ts scripts/fake-acp-agent.mjs
git commit -m "feat(acp): 运行时把手借给适配器——fs/terminal 能力、_meta 禁 Grep/Glob、请求交给手"
```

---

### Task 5: 拿真适配器验一次（准入规则 3）

**Files:** 无改动；验证。

- [ ] **Step 1: 起 mock 链路，确认旧路径没坏**

Run: `npm run dev:mock`，建一个 ACP agent 的会话，发一句话，看到假 agent 的暗号回话，回合收口。关掉。

- [ ] **Step 2: 真 claude-code-acp**

用 `npm run app` 起应用（**不要从 Claude Code 的终端里起**——`CLAUDECODE` 环境变量那条坑），在设置里确认有 claude 那条 ACP agent，选一个本机项目建会话，发：

> 读一下这个目录里的 README（或任一文件）的前 5 行，然后新建一个 `hands-probe.txt` 写一行字，再运行 `ls -la` 告诉我结果。

判据：
- 三件都做成，`hands-probe.txt` 出现在项目目录；
- 右侧坞「审阅」里这一轮的文件事实仍然出现（B1 的 git 反推没被影响）；
- 对话里**没有**「DAWN 不支持 …」字样。

- [ ] **Step 3: 真 codex-acp 不受影响**

同一应用里换 codex 那条 agent，发「回答 OK」。判据：正常回话，握手与 `session/new` 没报错。

- [ ] **Step 4: 若哪一条红了**

先怀疑自己（`add-without-breaking`）：把 `clientCapabilities` 临时改回三个 false 再试——恢复就是我们这一版的问题；不恢复就是环境。不要静默跳过这一步，在历史条目里如实写。

---

### Task 6: 开发历史

**Files:**
- Modify: `docs/DEVELOPMENT_HISTORY.md`

- [ ] **Step 1: 先回填上一条的 hash**

Run: `git log --oneline -5`，把「ACP agent 在服务器上干活：设计定案」那条里的「修订：待回填」换成 `7144f80`。

- [ ] **Step 2: 顶部追加**

```markdown
### 2026-08-20 — ACP 客户端的手（T1，本机版）：claude 的读/改/跑全部经过 DAWN

- **Type**: feat
- **Commit**: 待回填
- **Motivation**: 规格 `2026-08-20-acp-terminal-design.md` T1。此前握手声明「没有 fs/terminal」，claude-code-acp 只能用自带工具直接摸磁盘，DAWN 对它干了什么一无所知，也没法在 T2 把它的手伸到服务器上。
- **What**: 新增 `src/runtime/acp/hands.ts`（七个客户端方法、与 native 同口径的路径门、终端输出超限从头丢并记数）；`AcpRuntime` 握手声明 `fs`+`terminal`，`session/new`/`load` 带 `_meta.claudeCode.options.disallowedTools: [Grep, Glob, NotebookEdit]`，④ 分支由「一律拒绝」改为交给手，`stop` 释放终端；假 agent 加 `FAKE_ACP_USE_HANDS` / `FAKE_ACP_ECHO_NEW_PARAMS`。
- **Impact**: claude 类 ACP agent 的文件读写与命令现在经过运行时；codex 不读这些能力，行为不变。本机会话的路径门收紧为「工作区之内」——与 native 一致。文件事实仍由 git 反推（B1），未改。
- **Verification**: `tests/runtime/acp-hands.test.ts` 15 条、`acp-runtime.test.ts` 新增 2 条（对着假 agent 起真进程）；`npm test`、`typecheck` 全绿；真 claude-code-acp 与真 codex-acp 各跑一轮（Task 5 的判据）。
```

- [ ] **Step 3: 提交**

```bash
git add docs/DEVELOPMENT_HISTORY.md
git commit -m "docs: ACP 客户端的手 T1 的历史条目"
```

---

## 自检

- **规格覆盖**：握手 ✔ Task 4(d)；`_meta` ✔ 4(e)；`fs/read` 含 line/limit ✔ Task 1；`fs/write` 建父目录 ✔ Task 1；`terminal/create` 不等结束 / 环形截断 / 记数 ✔ Task 2；`output` 不带 exitStatus 直到结束 ✔ Task 2；`wait_for_exit` / `kill` / `release` ✔ Task 2；路径门 -32602 ✔ Task 1；假 agent 同一次改动 ✔ Task 3；真适配器验证 ✔ Task 5。影子目录、路径翻译、`spec.remote` 属 T2，不在此计划。
- **名字一致**：`客户端的手`、`本机后端`、`手的错误`、`处理`、`释放全部`、`记录`、`工作区` 在 Task 1/2/4 用法一致；`回错(段, id, message, code)` 的旧调用处只传三个参数，默认 -32601 不变。
- **占位**：无。
