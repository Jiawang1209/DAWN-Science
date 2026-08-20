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
/** 等它抛，把抛出来的当 `手的错误` 交回去。**没抛就是失败**——这些用例验的就是拒绝 */
const 抓 = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("本该拒绝，却成功了")
    },
    (e: unknown) => e as 手的错误,
  )
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
    const r = await 手.处理("fs/read_text_file", {
      sessionId: "s",
      path: join(工作区, "a.txt"),
      line: 2,
      limit: 2,
    })
    expect(r).toEqual({ content: "二\n三\n" })
  })

  it("文件不在时，错误里有路径", async () => {
    建()
    await expect(
      手.处理("fs/read_text_file", { sessionId: "s", path: join(工作区, "没有.txt") }),
    ).rejects.toThrow(/没有\.txt/)
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
    const e = await 抓(手.处理("fs/read_text_file", { sessionId: "s", path: 外 }))
    expect(e).toBeInstanceOf(手的错误)
    expect(e.code).toBe(-32602)
    expect(e.message).toContain("dawn-hands-外面.txt")
  })

  it("`..` 爬出去也拒绝", async () => {
    建()
    const e = await 抓(手
      .处理("fs/write_text_file", { sessionId: "s", path: join(工作区, "..", "爬.txt"), content: "" }))
    expect(e.code).toBe(-32602)
  })

  it("相对路径拒绝——ACP 的路径一律绝对", async () => {
    建()
    const e = await 抓(手.处理("fs/read_text_file", { sessionId: "s", path: "a.txt" }))
    expect(e.code).toBe(-32602)
  })

  it("不认识的方法，code 是 -32601", async () => {
    建()
    const e = await 抓(手.处理("fs/delete", { sessionId: "s" }))
    expect(e.code).toBe(-32601)
  })
})

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
    const 出 = (await 手.处理("terminal/output", { sessionId: "s", terminalId })) as {
      output: string
      truncated: boolean
      exitStatus?: unknown
    }
    expect(出.output).toContain("出")
    expect(出.output).toContain("错")
    expect(出.truncated).toBe(false)
    expect(出.exitStatus).toEqual({ exitCode: 3 })
  })

  it("没结束时 output 不带 exitStatus", async () => {
    建()
    const { terminalId } = (await 手.处理("terminal/create", { sessionId: "s", command: "sleep 5" })) as {
      terminalId: string
    }
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
    const 出a = (await 手.处理("terminal/output", { sessionId: "s", terminalId: a.terminalId })) as {
      output: string
    }
    expect(出a.output.trim().endsWith(工作区.split("/").pop()!)).toBe(true)

    const b = (await 手.处理("terminal/create", {
      sessionId: "s",
      command: "pwd",
      cwd: join(工作区, "子"),
    })) as { terminalId: string }
    await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId: b.terminalId })
    const 出b = (await 手.处理("terminal/output", { sessionId: "s", terminalId: b.terminalId })) as {
      output: string
    }
    expect(出b.output.trim().endsWith("子")).toBe(true)

    const e = await 抓(手.处理("terminal/create", { sessionId: "s", command: "pwd", cwd: tmpdir() }))
    expect(e.code).toBe(-32602)
  })

  it("env 是 `[{name,value}]` 数组，真的传进去", async () => {
    建()
    const { terminalId } = (await 手.处理("terminal/create", {
      sessionId: "s",
      command: 'printf "$DAWN_HANDS_PROBE"',
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
    const 出 = (await 手.处理("terminal/output", { sessionId: "s", terminalId })) as {
      output: string
      truncated: boolean
    }
    expect(出.output).toBe("ghij")
    expect(出.truncated).toBe(true)
    expect(记.some((t) => /6/.test(t) && /字节/.test(t))).toBe(true)
  })

  it("release 之后那个 id 不认了；release 一个还在跑的会先杀", async () => {
    建()
    const { terminalId } = (await 手.处理("terminal/create", { sessionId: "s", command: "sleep 5" })) as {
      terminalId: string
    }
    await 手.处理("terminal/release", { sessionId: "s", terminalId })
    const e = await 抓(手.处理("terminal/output", { sessionId: "s", terminalId }))
    expect(e.code).toBe(-32602)
  })

  it("不存在的 terminalId，-32602 且话里有那个 id", async () => {
    建()
    const e = await 抓(手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId: "t999" }))
    expect(e.code).toBe(-32602)
    expect(e.message).toContain("t999")
  })
})
