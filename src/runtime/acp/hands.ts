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
 * 与 native 的四个工具**同一套判据**，不另写：本机复用 `policy/permissions.ts` 的 `看风险`
 * （读不设门、写圈在工作区并保护 `data/raw`），远端复用 `remote/tools.ts` 的 `解析远端路径`
 * （默认无界，`界` 可选）。越界回 `-32602` 并把那条路径说出来。
 * 本机的路径**一律绝对**——相对路径的含义取决于谁的 cwd，拒掉比猜安全；
 * 远端的相对路径按远端 cwd 解析，那是 `解析远端路径` 一直以来的口径。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { spawn, type ChildProcess } from "node:child_process"
import { 看风险 } from "../../policy/permissions.js"
import { 解析远端路径 } from "../../remote/tools.js"
import type { RemoteCwd, RemoteLike } from "../types.js"

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

/**
 * 远端后端：读写走 SFTP，命令走一次 `exec`。
 *
 * **不流式**：`RemoteLike.exec` 是跑完整体回，所以 `terminal/output` 在命令结束前
 * 看到的是空。claude-code-acp 的用法是 `wait_for_exit` 之后再 `output`，正好够用；
 * 真要中途看输出，那是 `RemoteExecutor` 加流式接口的事，不在这里假装。
 *
 * `env` 变成 `export K='v'; ` 前缀——`RemoteLike.exec` 没有 env 参数，
 * 而 `RemoteExecutor` 自己也是这么给登录环境的（`ssh.ts` 里 `前缀` 那段）。
 */
export function 远端后端(ex: RemoteLike): 手的后端 {
  return {
    readFile: async (p) => (await ex.readFile(p)).toString("utf8"),
    async writeFile(p, content) {
      const 父 = p.replace(/\/[^/]*$/, "") || "/"
      const r = await ex.exec(`mkdir -p ${单引号(父)}`)
      if (r.code !== 0) throw new Error(`建不了目录 ${父}：${r.stderr || r.stdout}`)
      await ex.writeFile(p, content)
    },
    exec(command, { cwd, env }) {
      const 前缀 = Object.entries(env)
        .map(([k, v]) => `export ${k}=${单引号(v)}; `)
        .join("")
      const 控 = new AbortController()
      const 听众: Array<(c: Buffer) => void> = []
      const exited = ex.exec(前缀 + command, { cwd, signal: 控.signal }).then(
        (r) => {
          const 出 = Buffer.from(r.stdout + r.stderr)
          if (出.length > 0) 听众.forEach((f) => f(出))
          return r.signal ? { signal: r.signal } : { exitCode: r.code ?? 0 }
        },
        (e: unknown) => {
          听众.forEach((f) => f(Buffer.from(e instanceof Error ? e.message : String(e))))
          return { exitCode: 127 }
        },
      )
      return { onData: (cb) => 听众.push(cb), exited, kill: () => 控.abort() }
    },
  }
}

/**
 * 门：收一条路径，回它该用的绝对路径，或抛 `手的错误`。
 * **按操作分**——native 的判据里读与写不是一回事（读不设门）。
 */
export interface 手的门 {
  读(path: string): string
  写(path: string): string
  /** 终端的 cwd。不按路径拦（native 的 bash 也不拦），只做形状检查 */
  cwd(path: string): string
}

/** 本机：复用 `看风险`——与 native 的 write/edit **同一个函数**，不另写一套 */
export function 本机门(工作区: string): 手的门 {
  const 绝对 = (p: string) => {
    if (!isAbsolute(p)) throw new 手的错误(-32602, `路径必须是绝对路径：${p}`)
    return resolve(p)
  }
  return {
    读: 绝对,
    写(p) {
      const 路 = 绝对(p)
      const 险 = 看风险("write", { path: 路 }, { workspace: 工作区 })
      if (险) throw new 手的错误(-32602, 险.说明)
      return 路
    },
    cwd: 绝对,
  }
}

/** 远端门：复用 `解析远端路径`——与 native 的远端四工具同一个函数。默认无界 */
export function 远端门(cwd: RemoteCwd): 手的门 {
  const 解 = (p: string) => {
    try {
      return 解析远端路径(cwd.get(), p, cwd.界)
    } catch (e) {
      throw new 手的错误(-32602, e instanceof Error ? e.message : String(e))
    }
  }
  return { 读: 解, 写: 解, cwd: 解 }
}

/**
 * 影子翻译（T2）。
 *
 * claude-code-acp 要求 `session/new` 的 `cwd` 在本机存在（SDK 在那里 spawn），
 * 而远端会话的真目录在服务器上。于是给它一个空的本机影子目录，
 * 它说的 `<影子>/x` 我们听成 `<远端cwd>/x`。**不以影子开头的绝对路径原样放行**——
 * 用户说的 `/data/raw/x.csv` 就是服务器上的那个文件。
 */
export function 影子翻译(影子: string, 远端: string) {
  const 根 = 影子.replace(/\/+$/, "")
  const 路径 = (p: string) => (p === 根 ? 远端 : p.startsWith(`${根}/`) ? 远端 + p.slice(根.length) : p)
  const 命令 = (s: string) =>
    s.split(根).reduce((acc, 段, i) => {
      if (i === 0) return 段
      // 只有后面紧跟 `/`、空白、结尾或 shell 分隔符的才是影子路径；`/local/shadow2` 不是
      const 下一个 = 段[0]
      const 算 = 下一个 === undefined || 下一个 === "/" || /[\s'"`;&|)]/.test(下一个)
      return acc + (算 ? 远端 : 根) + 段
    }, "")
  const 包 = (内: 手的门): 手的门 => ({
    读: (p) => 内.读(路径(p)),
    写: (p) => 内.写(路径(p)),
    cwd: (p) => 内.cwd(路径(p)),
  })
  return { 路径, 命令, 包 }
}

interface 手的选项 {
  门: 手的门
  /** `terminal/create` 不给 cwd 时在哪跑 */
  默认cwd: string
  /** 远端会话里把命令串中的影子路径换掉（`影子翻译().命令`）。本机不给 */
  翻译命令?: (s: string) => string
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
    const path = this.路径(p["path"], "读")
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
    const path = this.路径(p["path"], "写")
    if (typeof p["content"] !== "string") throw new 手的错误(-32602, "fs/write_text_file 缺 content")
    try {
      await this.后端.writeFile(path, p["content"])
    } catch (e) {
      throw new 手的错误(-32603, `写不了 ${path}：${e instanceof Error ? e.message : String(e)}`)
    }
    return {}
  }

  /** 路径门。形状在这儿查，判据在注入的 `门` 里 */
  private 路径(raw: unknown, 作: "读" | "写" | "cwd"): string {
    if (typeof raw !== "string") throw new 手的错误(-32602, `路径必须是字符串：${String(raw)}`)
    return this.opts.门[作](raw)
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
    const 原命令 = [p["command"], ...args.map(单引号)].join(" ")
    const command = this.opts.翻译命令?.(原命令) ?? 原命令
    const cwd = p["cwd"] === undefined ? this.opts.默认cwd : this.路径(p["cwd"], "cwd")
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
