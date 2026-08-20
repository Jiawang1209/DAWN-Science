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
import { dirname, isAbsolute, relative, resolve } from "node:path"
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
      const proc: ChildProcess = spawn(command, {
        cwd,
        env: { ...process.env, ...env },
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      })
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

  /* ── terminal ─────────────────────────────────────────── */

  private 开终端(p: Record<string, unknown>): { terminalId: string } {
    if (typeof p["command"] !== "string" || p["command"] === "") {
      throw new 手的错误(-32602, "terminal/create 缺 command")
    }
    /**
     * ACP 的 `args` 是可选的 argv 尾巴。**拼进 command**——我们走 shell，
     * 逐个加引号比让 shell 自己分词更容易出错，而真适配器（claude）从来只给 command。
     */
    const args = Array.isArray(p["args"])
      ? (p["args"] as unknown[]).filter((a): a is string => typeof a === "string")
      : []
    const command = [p["command"], ...args.map(单引号)].join(" ")
    const cwd = p["cwd"] === undefined ? this.opts.工作区 : this.门(p["cwd"])
    /** `env` 是 `[{name, value}]`——与 `mcpServers[].env` 同一形状（2026-08-19 撞过） */
    const env: Record<string, string> = {}
    if (Array.isArray(p["env"])) {
      for (const e of p["env"] as Array<Record<string, unknown>>) {
        if (typeof e?.["name"] === "string" && typeof e?.["value"] === "string") env[e["name"]] = e["value"]
      }
    }
    const 上限 =
      typeof p["outputByteLimit"] === "number" && p["outputByteLimit"] > 0 ? p["outputByteLimit"] : 默认输出上限

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
