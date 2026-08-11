/**
 * 远端执行器（②-B · R1）。
 *
 * 作者：*「我的本地是一个 dawn agent，我想通过 ssh 连接远端的服务器，
 * 然后使用 agent 在远程服务器里面帮我编程，处理数据，写代码，分析数据。」*
 *
 * 这一层只回答一件事：**在那台机器上跑一条命令、读一个文件、写一个文件**。
 * 它不知道 agent、不知道会话、不知道 Run——那些是上面的事。
 *
 * ## 一条长连接，多路复用
 *
 * 每次工具调用新开一条 SSH 连接的代价是一次完整握手（几百毫秒起步），
 * 而 agent 一轮可能调几十次工具。所以连接**建一次、用到底**，
 * 每条命令是它上面的一个 channel。
 *
 * ## 环境捕获与命令执行**分开**——这是 Spike F 换来的
 *
 * 两个都想要、但互相打架：
 *
 *   - **要你的 PATH**：ssh2 的 `exec` 起的是非登录非交互 shell，不读
 *     `~/.bashrc` / `~/.bash_profile`。于是 conda、`~/.local/bin` 统统看不见——
 *     spike 里作者装好的 `ipykernel` 就是这么"消失"的：
 *     它看到的是 `/usr/bin/python3`，那个连 pip 都没有。
 *   - **不要欢迎横幅**：`bash -lc` 会读 profile，而很多服务器的 profile
 *     打一段 MOTD（作者那台是一排星号 + 课程链接）。**它会混进 stdout**——
 *     spike 里因此把横幅解析成了 Python 版本号，而**退出码是 0，
 *     所以它看起来像通过了**。让 agent 每跑一条命令都收到这堆噪声，
 *     后果不是难看，是模型会照着噪声推理。
 *
 * **所以：连上时用登录 shell 捕获一次环境，之后每条命令用干净的非登录 shell
 * 加上那份环境。** 横幅只在捕获那一次出现，而那一次我们只认 `键=值`。
 *
 * ## 断线不静默重连
 *
 * 一条命令断在半路，**它可能跑完了、也可能没跑完**——我们不知道。
 * 所以：如实进 `disconnected`，**绝不自动重跑**（重跑一条可能已经执行过的
 * 命令，比不跑危险得多），由上层决定怎么办。
 */
import type { Client, ClientChannel, ConnectConfig, SFTPWrapper } from "ssh2"

/** 一台远端机器怎么连。**密码不在这里**——它由上层从钥匙串取了再传进来 */
export interface RemoteHostConfig {
  host: string
  port?: number
  username: string
  /** 私钥内容（不是路径）。**读盘是上层的事**，这一层不碰文件系统 */
  privateKey?: string | Buffer
  passphrase?: string
  password?: string
  /** ssh-agent 的 socket。给了就试 */
  agentSock?: string
}

export type RemoteState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "ready" }
  /** **断了就是断了**：原因如实带着，不自动重连 */
  | { kind: "disconnected"; reason: string }

export interface ExecResult {
  /** 退出码。**信号杀死时是 undefined**，那时看 `signal` */
  code: number | undefined
  signal?: string | undefined
  stdout: string
  stderr: string
}

export interface ExecOptions {
  /** 在哪个目录下跑。**必须是绝对路径**——相对路径的含义取决于登录目录 */
  cwd?: string
  /** 上层给的取消信号 */
  signal?: AbortSignal
  /**
   * 秒。**不给就没有超时**（作者定的）。
   *
   * 远端跑一条 `bwa index` 可能要二十分钟，**它和「卡死了」在协议上长得一模一样**。
   * 与其猜一个上限把正常的长任务砍掉，不如把「已经跑了多久」显示出来、
   * 中止交给人按。
   */
  timeoutSec?: number
}

/**
 * 从登录环境里带过去的变量。
 *
 * **不是全带**：一个登录环境有上百个变量，其中不少（`SSH_*`、`XDG_*`）
 * 与「在哪跑代码」无关，带过去只会让命令行变长、也更难查。
 * 这几个是真正决定「你的命令能不能找到东西」的：
 */
const 要带的环境 = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "CONDA_PREFIX",
  "CONDA_DEFAULT_ENV",
  "VIRTUAL_ENV",
  "R_LIBS_USER",
  "LD_LIBRARY_PATH",
  "PYTHONPATH",
] as const

/** 单引号安全包裹。**shell 里唯一不会再解释任何东西的引法** */
export function 单引号(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/**
 * 从一段输出里取 `键=值`。
 *
 * **不靠行号、不靠位置**：远端的 stdout 里可能混着 MOTD，
 * 而且它与我们自己的输出**是交错到达的**（Spike F 实测——
 * 横幅出现在两个分隔标记*中间*）。**顺序不能假设，但一个自造的键名可以。**
 */
export function 取值(out: string, 键: string): string | undefined {
  const m = new RegExp(`${键}=(.*)`).exec(out)
  return m?.[1]?.trim()
}

/** ssh2 的 `Client` 我们只用这几样。**收窄成接口是为了能注入假的去测** */
export interface SshClientLike {
  on(event: "ready" | "error" | "close" | "end", cb: (...a: never[]) => void): unknown
  connect(cfg: ConnectConfig): unknown
  exec(cmd: string, cb: (err: Error | undefined, ch: ClientChannel) => void): unknown
  sftp(cb: (err: Error | undefined, sftp: SFTPWrapper) => void): unknown
  end(): unknown
}

export interface RemoteExecutorOptions {
  config: RemoteHostConfig
  /** 造一个客户端。**测试注入假的**——真机那条走 `ssh2` 的 `Client` */
  createClient: () => SshClientLike
  /** 状态变了就喊一声。**断线要能被上层看见**，不是等下一次调用才发现 */
  onState?: (s: RemoteState) => void
}

export class RemoteExecutor {
  private client: SshClientLike | undefined
  private sftpHandle: SFTPWrapper | undefined
  private 环境: Record<string, string> = {}
  private state: RemoteState = { kind: "idle" }

  constructor(private readonly opts: RemoteExecutorOptions) {}

  current(): RemoteState {
    return this.state
  }

  /** 捕获到的登录环境。**空的表示还没连上**，不是「那台机器没有环境」 */
  loginEnv(): Readonly<Record<string, string>> {
    return this.环境
  }

  private 设状态(s: RemoteState): void {
    this.state = s
    this.opts.onState?.(s)
  }

  async connect(): Promise<void> {
    if (this.state.kind === "ready") return
    this.设状态({ kind: "connecting" })
    const c = this.opts.createClient()
    const { config } = this.opts

    await new Promise<void>((resolve, reject) => {
      c.on("ready", (() => resolve()) as never)
      c.on("error", ((e: Error) => {
        this.设状态({ kind: "disconnected", reason: e.message })
        reject(e)
      }) as never)
      /**
       * **断线要立刻喊出来。** 不喊的话，下一次工具调用会挂在那里等超时，
       * 而屏幕上什么都不说——那正是「点了没反应」的另一种形状。
       */
      c.on("close", (() => {
        if (this.state.kind !== "disconnected") {
          this.设状态({ kind: "disconnected", reason: "连接被对端关闭" })
        }
      }) as never)
      c.connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username,
        ...(config.privateKey ? { privateKey: config.privateKey } : {}),
        ...(config.passphrase ? { passphrase: config.passphrase } : {}),
        ...(config.password ? { password: config.password } : {}),
        ...(config.agentSock ? { agent: config.agentSock } : {}),
        // 很多服务器的「密码」实际走 keyboard-interactive
        tryKeyboard: Boolean(config.password),
        readyTimeout: 20_000,
      })
    })

    this.client = c
    this.设状态({ kind: "ready" })
    await this.捕获环境()
  }

  /**
   * 用**登录 shell**问一次环境，之后再也不用它。
   *
   * 只认 `键=值`——横幅爱怎么打怎么打，它不会有我们的键名。
   */
  private async 捕获环境(): Promise<void> {
    const 行 = 要带的环境.map((k) => `echo "DAWNENV_${k}=\${${k}}"`).join("; ")
    const r = await this.原始执行(`bash -lc ${单引号(行)}`)
    const out: Record<string, string> = {}
    for (const k of 要带的环境) {
      const v = 取值(r.stdout, `DAWNENV_${k}`)
      // **空值不记**：`CONDA_PREFIX=` 与「没有 CONDA_PREFIX」是一回事
      if (v) out[k] = v
    }
    this.环境 = out
  }

  /**
   * 跑一条命令。
   *
   * **非登录 shell + 捕获来的环境**：既拿得到你的 PATH，又不会收到欢迎横幅。
   */
  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    if (this.state.kind !== "ready") {
      throw new Error(`远端不可用（${this.state.kind}）：${this.说明()}`)
    }
    const 前缀 = Object.entries(this.环境)
      .map(([k, v]) => `export ${k}=${单引号(v)}`)
      .join("; ")
    const cd = options.cwd ? `cd ${单引号(options.cwd)} || exit 127; ` : ""

    /**
     * **把 PID 写到一个临时文件里，中止时才真的杀得掉。**
     *
     * SSH 的 channel 关掉**不保证**远端进程会死——它可能继续跑到底，
     * 而我们已经不看了：那正是「中止了但机器还在烧 CPU」。
     * OpenSSH 又不实现 `signal` 请求，所以只能自己记 PID。
     *
     * **不写进 stdout**：这个模块的全部要害就是输出必须干净
     * （见文件头）。所以它落在 `/tmp` 的一个文件里，只有中止时才去读。
     */
    const pid文件 = `/tmp/dawn-run-${Math.random().toString(36).slice(2, 10)}.pid`
    const 脚本 = `echo $$ > ${pid文件}; ${前缀 ? `${前缀}; ` : ""}${cd}${command}`
    const 整条 = `bash -c ${单引号(脚本)}`

    const 超时 =
      options.timeoutSec === undefined
        ? undefined
        : setTimeout(() => void this.杀掉(pid文件), options.timeoutSec * 1000)
    const 中止 = () => void this.杀掉(pid文件)
    options.signal?.addEventListener("abort", 中止, { once: true })
    try {
      return await this.原始执行(整条, options.signal)
    } finally {
      if (超时) clearTimeout(超时)
      options.signal?.removeEventListener("abort", 中止)
      // 清掉那个 pid 文件。**失败不出声**：它只是块草稿纸
      void this.原始执行(`rm -f ${pid文件}`).catch(() => {})
    }
  }

  /**
   * 按 PID 文件杀掉远端那条命令。
   *
   * **先 TERM 后 KILL**：给它一个收尾的机会（写完的文件不该半截）。
   * `kill -- -PID` 打的是**进程组**——一条 `bwa | sort` 是好几个进程，
   * 只杀那个 shell 会留下一堆孤儿继续烧 CPU。
   * 进程组不存在时退回杀单个 PID。
   */
  private async 杀掉(pid文件: string): Promise<void> {
    if (this.state.kind !== "ready") return
    const 脚本 =
      `p=$(cat ${pid文件} 2>/dev/null) || exit 0; [ -n "$p" ] || exit 0; ` +
      `kill -TERM -"$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null; ` +
      `sleep 2; kill -KILL -"$p" 2>/dev/null || kill -KILL "$p" 2>/dev/null; true`
    await this.原始执行(`bash -c ${单引号(脚本)}`).catch(() => {
      // 杀不掉也不抛：**中止本身不该因为清理失败而看起来像失败了**
    })
  }

  private 说明(): string {
    return this.state.kind === "disconnected" ? this.state.reason : ""
  }

  /** 不加任何包装地跑一条。**只有本文件内部用**——外面一律走 `exec` */
  private 原始执行(cmd: string, signal?: AbortSignal): Promise<ExecResult> {
    const c = this.client
    if (!c) throw new Error("还没连上")
    return new Promise<ExecResult>((resolve, reject) => {
      c.exec(cmd, (err, ch) => {
        if (err) return reject(err)
        let stdout = ""
        let stderr = ""
        let code: number | undefined
        let sig: string | undefined
        const 停 = () => {
          try {
            ch.close()
          } catch {
            // 已经关了就算了
          }
        }
        signal?.addEventListener("abort", 停, { once: true })
        ch.on("data", (d: Buffer) => (stdout += d.toString()))
        ch.stderr.on("data", (d: Buffer) => (stderr += d.toString()))
        ch.on("exit", (c2: number | null, s: string | null) => {
          code = c2 ?? undefined
          sig = s ?? undefined
        })
        ch.on("close", () => {
          signal?.removeEventListener("abort", 停)
          resolve({ code, ...(sig ? { signal: sig } : {}), stdout, stderr })
        })
      })
    })
  }

  private sftp(): Promise<SFTPWrapper> {
    if (this.sftpHandle) return Promise.resolve(this.sftpHandle)
    const c = this.client
    if (!c) return Promise.reject(new Error("还没连上"))
    return new Promise((resolve, reject) => {
      c.sftp((err, s) => {
        if (err) return reject(err)
        this.sftpHandle = s
        resolve(s)
      })
    })
  }

  async readFile(path: string): Promise<Buffer> {
    const s = await this.sftp()
    return new Promise((resolve, reject) => {
      s.readFile(path, (err, data) => (err ? reject(err) : resolve(data)))
    })
  }

  async writeFile(path: string, data: string | Buffer): Promise<void> {
    const s = await this.sftp()
    return new Promise((resolve, reject) => {
      s.writeFile(path, data, (err) => (err ? reject(err) : resolve()))
    })
  }

  async readdir(path: string): Promise<{ name: string; directory: boolean; size: number }[]> {
    const s = await this.sftp()
    return new Promise((resolve, reject) => {
      s.readdir(path, (err, list) => {
        if (err) return reject(err)
        resolve(
          list.map((e) => ({
            name: e.filename,
            // `longname` 的第一位是类型；`attrs.isDirectory()` 更直接
            directory: e.attrs.isDirectory(),
            size: e.attrs.size,
          })),
        )
      })
    })
  }

  close(): void {
    this.sftpHandle = undefined
    try {
      this.client?.end()
    } catch {
      // 关不掉就算了：进程退出会带走它
    }
    this.client = undefined
    this.设状态({ kind: "idle" })
  }
}
