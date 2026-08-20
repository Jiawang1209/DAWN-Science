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
import {
  客户端的手,
  本机后端,
  本机门,
  远端后端,
  远端门,
  影子翻译,
  手的错误,
} from "../../src/runtime/acp/hands.js"
import type { RemoteLike } from "../../src/runtime/types.js"

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
  手 = new 客户端的手(本机后端(), { 门: 本机门(工作区), 默认cwd: 工作区, 记录: () => {} })
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

describe("路径门：复用 native 的 `看风险`", () => {
  it("**读不设门**——工作区外也读得到（native 就是这样，理由在 permissions.ts）", async () => {
    建()
    const 外 = join(tmpdir(), `dawn-hands-外面-${process.pid}.txt`)
    writeFileSync(外, "外面的")
    const r = await 手.处理("fs/read_text_file", { sessionId: "s", path: 外 })
    expect(r).toEqual({ content: "外面的" })
    rmSync(外)
  })

  it("写到工作区外拒绝，code 是 -32602，话里有那条路径", async () => {
    建()
    const 外 = join(tmpdir(), "dawn-hands-外面.txt")
    const e = await 抓(手.处理("fs/write_text_file", { sessionId: "s", path: 外, content: "" }))
    expect(e).toBeInstanceOf(手的错误)
    expect(e.code).toBe(-32602)
    expect(e.message).toContain("dawn-hands-外面.txt")
  })

  it("`..` 爬出去也拒绝", async () => {
    建()
    const e = await 抓(
      手.处理("fs/write_text_file", { sessionId: "s", path: join(工作区, "..", "爬.txt"), content: "" }),
    )
    expect(e.code).toBe(-32602)
  })

  it("`data/raw/` 是原始数据，不给写", async () => {
    建()
    const e = await 抓(
      手.处理("fs/write_text_file", { sessionId: "s", path: join(工作区, "data", "raw", "x.csv"), content: "" }),
    )
    expect(e.code).toBe(-32602)
    expect(e.message).toContain("原始")
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

  it("cwd 默认是工作区；给了 cwd 就用它", async () => {
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
    手 = new 客户端的手(本机后端(), { 门: 本机门(工作区), 默认cwd: 工作区, 记录: (t) => 记.push(t) })
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

  /**
   * **杀要杀整棵树，收要等管道关**（2026-08-21 审查抓到的，两条都在本机复现过）。
   *
   * ① `shell: true` 起的是一个 `sh -c`，`kill` 只送给那层壳：`sleep 30 | cat` 里的
   *   `sleep` 被过继给 PID 1 继续活。`launch.ts` 的 `收进程` 早就为同一件事
   *   用了「自成进程组 + 杀负 pid」，这里照做。
   * ② `exited` 在 `exit` 事件上结算，而 stdout 的尾巴可能还在路上——
   *   `wait_for_exit` 之后的 `output` 拿到半截，还说 `truncated: false`。改在 `close` 上。
   */
  it("kill 之后整棵进程树都死了——孙进程不过继给 PID 1", async () => {
    建()
    // 用一个独一无二的时长当标记，`ps` 里按它找那个 sleep
    const 标 = `sleep 30.${process.pid}`
    const { terminalId } = (await 手.处理("terminal/create", {
      sessionId: "s",
      command: `${标} | cat`,
    })) as { terminalId: string }
    await new Promise((r) => setTimeout(r, 150))
    await 手.处理("terminal/kill", { sessionId: "s", terminalId })
    await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId })
    await new Promise((r) => setTimeout(r, 150))
    const { execSync } = await import("node:child_process")
    const 活着 = execSync(`ps -axo command | grep -F ${JSON.stringify(标)} | grep -v grep || true`).toString().trim()
    expect(活着, "sleep 还活着——只杀了 sh 那层壳").toBe("")
  })

  it("wait_for_exit 之后 output 是完整的——后台孙进程的迟到输出也在", async () => {
    建()
    const { terminalId } = (await 手.处理("terminal/create", {
      sessionId: "s",
      command: "(sleep 0.2; echo LATE) & echo EARLY",
    })) as { terminalId: string }
    await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId })
    const 出 = (await 手.处理("terminal/output", { sessionId: "s", terminalId })) as { output: string }
    expect(出.output).toContain("EARLY")
    expect(出.output).toContain("LATE")
  })

  it("不存在的 terminalId，-32602 且话里有那个 id", async () => {
    建()
    const e = await 抓(手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId: "t999" }))
    expect(e.code).toBe(-32602)
    expect(e.message).toContain("t999")
  })
})

/** 假执行器：文件放在内存里，exec 只认几条命令，并记下每一次调用 */
function 假执行器() {
  const 文件 = new Map<string, string>()
  const 调用: Array<{ command: string; cwd: string | undefined }> = []
  const ex: RemoteLike = {
    async exec(command, options) {
      调用.push({ command, cwd: options?.cwd })
      if (command.startsWith("mkdir -p ")) return { code: 0, stdout: "", stderr: "" }
      if (command.includes("exit 2")) return { code: 2, stdout: "出", stderr: "错" }
      return { code: 0, stdout: `ran:${command}@${options?.cwd ?? ""}`, stderr: "" }
    },
    async readFile(path) {
      const v = 文件.get(path)
      if (v === undefined) throw new Error(`No such file: ${path}`)
      return Buffer.from(v)
    },
    async writeFile(path, data) {
      文件.set(path, String(data))
    },
  }
  return { ex, 文件, 调用 }
}

describe("远端后端：手伸到服务器上", () => {
  const 远 = { get: () => "/home/u/proj", set: () => {} }

  it("读写走执行器；写之前 `mkdir -p` 父目录", async () => {
    const { ex, 文件, 调用 } = 假执行器()
    文件.set("/home/u/proj/a.txt", "服务器上的")
    手 = new 客户端的手(远端后端(ex), { 门: 远端门(远), 默认cwd: 远.get(), 记录: () => {} })
    expect(await 手.处理("fs/read_text_file", { sessionId: "s", path: "/home/u/proj/a.txt" })).toEqual({
      content: "服务器上的",
    })
    await 手.处理("fs/write_text_file", { sessionId: "s", path: "/home/u/proj/深/b.txt", content: "写上去" })
    expect(文件.get("/home/u/proj/深/b.txt")).toBe("写上去")
    expect(调用.some((c) => c.command === "mkdir -p '/home/u/proj/深'")).toBe(true)
  })

  it("终端：在远端 cwd 里跑；env 变成命令前缀；退出码与合流输出都回来", async () => {
    const { ex, 调用 } = 假执行器()
    手 = new 客户端的手(远端后端(ex), { 门: 远端门(远), 默认cwd: 远.get(), 记录: () => {} })
    const { terminalId } = (await 手.处理("terminal/create", {
      sessionId: "s",
      command: "printf 出; exit 2",
      env: [{ name: "K", value: "v'1" }],
    })) as { terminalId: string }
    expect(await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId })).toEqual({ exitCode: 2 })
    const 出 = (await 手.处理("terminal/output", { sessionId: "s", terminalId })) as { output: string }
    expect(出.output).toBe("出错")
    expect(调用.at(-1)).toEqual({ command: "export K='v'\\''1'; printf 出; exit 2", cwd: "/home/u/proj" })
  })

  /**
   * **远端 kill 不能报成退出码 0**（2026-08-21 审查抓到的）。
   * `ssh.ts` 的 abort 路径自己关通道，结果是 `code: undefined` 且没有 `signal`——
   * 上一版把它映成 `exitCode: 0`，agent 会以为 `sleep 999` 正常跑完了。
   */
  it("远端 kill：code 为 undefined 时报 signal，不报 exitCode 0", async () => {
    const ex: RemoteLike = {
      exec: (_c, o) =>
        new Promise((成) => {
          o?.signal?.addEventListener("abort", () => 成({ code: undefined, stdout: "", stderr: "" }))
        }),
      readFile: async () => Buffer.from(""),
      writeFile: async () => {},
    }
    手 = new 客户端的手(远端后端(ex), { 门: 远端门(远), 默认cwd: 远.get(), 记录: () => {} })
    const { terminalId } = (await 手.处理("terminal/create", { sessionId: "s", command: "sleep 999" })) as {
      terminalId: string
    }
    await 手.处理("terminal/kill", { sessionId: "s", terminalId })
    const 退 = (await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId })) as { exitCode?: number; signal?: string }
    expect(退.exitCode).toBeUndefined()
    expect(退.signal).toBeTruthy()
  })

  it("远端门：默认无界（与 remote/tools 一致）；给了界就拦", async () => {
    const { ex } = 假执行器()
    手 = new 客户端的手(远端后端(ex), { 门: 远端门(远), 默认cwd: 远.get(), 记录: () => {} })
    await 手.处理("fs/write_text_file", { sessionId: "s", path: "/tmp/随便.txt", content: "" })
    const 圈 = new 客户端的手(远端后端(ex), {
      门: 远端门({ ...远, 界: "/home/u/proj" }),
      默认cwd: 远.get(),
      记录: () => {},
    })
    const e = await 抓(圈.处理("fs/write_text_file", { sessionId: "s", path: "/tmp/随便.txt", content: "" }))
    expect(e.code).toBe(-32602)
    expect(e.message).toContain("/tmp/随便.txt")
  })

  it("相对路径按远端 cwd 解析——`解析远端路径` 的口径", async () => {
    const { ex, 文件 } = 假执行器()
    文件.set("/home/u/proj/r.txt", "相对的")
    手 = new 客户端的手(远端后端(ex), { 门: 远端门(远), 默认cwd: 远.get(), 记录: () => {} })
    expect(await 手.处理("fs/read_text_file", { sessionId: "s", path: "r.txt" })).toEqual({ content: "相对的" })
  })
})

describe("影子翻译：agent 以为在本机影子目录，其实在远端", () => {
  const 译 = 影子翻译("/local/shadow", "/home/u/proj")

  it("以影子开头的路径换前缀；别的绝对路径原样放行", () => {
    expect(译.路径("/local/shadow/a/b.txt")).toBe("/home/u/proj/a/b.txt")
    expect(译.路径("/local/shadow")).toBe("/home/u/proj")
    expect(译.路径("/data/raw/x.csv")).toBe("/data/raw/x.csv")
    // **前缀相似不算**：/local/shadow2 不是影子目录
    expect(译.路径("/local/shadow2/x")).toBe("/local/shadow2/x")
  })

  it("命令字符串里出现的影子路径也换", () => {
    expect(译.命令("ls /local/shadow/data && cat /local/shadow/a.txt")).toBe(
      "ls /home/u/proj/data && cat /home/u/proj/a.txt",
    )
    expect(译.命令("cd /local/shadow; ls")).toBe("cd /home/u/proj; ls")
    expect(译.命令("ls /local/shadow2")).toBe("ls /local/shadow2")
  })

  it("包一层门：先翻译，再交给里面的门", () => {
    const 内 = 远端门({ get: () => "/home/u/proj", set: () => {}, 界: "/home/u/proj" })
    const 门 = 译.包(内)
    expect(门.写("/local/shadow/out.txt")).toBe("/home/u/proj/out.txt")
    expect(() => 门.写("/local/shadow/../x")).toThrow()
  })
})
