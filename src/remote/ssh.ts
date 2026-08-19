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
import { createReadStream, createWriteStream } from "node:fs"
import { rename as 改名, rm as 删掉, stat as 本地stat } from "node:fs/promises"
import { pipeline } from "node:stream/promises"
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
  /**
   * 这次断开是**我们自己按的**。
   *
   * 「人主动断开」与「被对端掐掉」在 socket 层长得一模一样，
   * 但在界面上必须分开说：前者是「未连」，后者是「断了 + 原因」。
   * 混成一个，人点了断开会看到一条故障提示。
   */
  private 自己关的 = false

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
    // 重连时把旗放下，否则上一次主动断开会让这一次的真断线被咽掉
    this.自己关的 = false
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
        /**
         * **我们自己关的那次不算断线。**
         *
         * `end()` 之后 socket 的 `close` 也会来一趟，而它长得跟对端把我们
         * 掐掉一模一样。不分开的话，人点了「断开」，界面显示的是
         * **「断了 · 连接被对端关闭」**——一次主动操作被报成一次故障。
         *
         * 这个缺陷单元测试没抓到（那里的断言是同步的，赶在 close 回调之前），
         * **是 e2e 在真实产物上撞出来的**。又一次「测试绿了 ≠ 能用了」。
         */
        if (this.自己关的) return
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

  /**
   * 下载一个文件。**流式，可取消，不留半截文件。**
   *
   * ## 为什么不用 `fastGet`
   *
   * `fastGet` 带 `step` 进度、还并发拉块（高延迟链路上更快），
   * 但它是回调式的，**没有中止口——取消不掉**。
   * 而一颗按不动的「取消」比没有这颗按钮更糟。
   * 我们拿速度换可取消，因为作者明确要取消。
   *
   * ## 「半截文件必须消失」这条保证在这儿，不在调用方
   *
   * 先落到 `<目标>.dawn-part`，传完才改名过去（同目录内改名是原子的）；
   * 出错或取消就把 part 删掉。
   *
   * **放在调用方的话，每多一个调用方就多一次忘记的机会**——
   * 而忘记的表现是：下载目录里躺着一个半截文件，
   * 它跟完整的那个长得一模一样，你拿它去跑分析都不会发现。
   *
   * @param 进度 只报**字节**。速度由上层算——这一层不认识时钟，
   *   那样它才能在测试里不依赖真实时间。
   */
  async download(
    远端: string,
    本地: string,
    opts: { 进度?: (已传: number, 总共?: number) => void; signal?: AbortSignal } = {},
  ): Promise<void> {
    const s = await this.sftp()
    const 总共 = (await this.stat(远端)).size
    const part = `${本地}.dawn-part`
    let 已传 = 0
    const rs = s.createReadStream(远端)
    rs.on("data", (块: string | Buffer) => {
      已传 += 块.length
      opts.进度?.(已传, 总共)
    })
    try {
      await pipeline(rs, createWriteStream(part), ...(opts.signal ? [{ signal: opts.signal }] : []))
      await 改名(part, 本地)
    } catch (e) {
      // **清干净**。清不掉也别把清理的错盖住原来那个——原因才是要说的那句
      await 删掉(part, { force: true }).catch(() => {})
      throw e
    }
  }

  /**
   * 上传一个文件。与 `download` **两头对称**：
   * 流式、可取消、先落 part 再改名。
   *
   * **取消同样不该在服务器上留半个文件**——别人的机器上留垃圾比自己机器上更糟。
   *
   * @param 覆盖 SFTP v3 的 `rename` **在目标已存在时会失败**（不是 POSIX 那种覆盖）。
   *   要覆盖就得先 `unlink` 再改名——**那一瞬间不是原子的**，如实说明，不假装是。
   */
  async upload(
    本地: string,
    远端: string,
    opts: { 进度?: (已传: number, 总共?: number) => void; signal?: AbortSignal; 覆盖?: boolean } = {},
  ): Promise<void> {
    const s = await this.sftp()
    const 总共 = (await 本地stat(本地)).size
    const part = `${远端}.dawn-part`
    let 已传 = 0
    const rs = createReadStream(本地)
    rs.on("data", (块: string | Buffer) => {
      已传 += 块.length
      opts.进度?.(已传, 总共)
    })
    try {
      await pipeline(rs, s.createWriteStream(part), ...(opts.signal ? [{ signal: opts.signal }] : []))
      if (opts.覆盖) await this.unlink(远端).catch(() => {})
      await this.rename(part, 远端)
    } catch (e) {
      await this.unlink(part).catch(() => {})
      throw e
    }
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

  /**
   * 一个条目的元信息。**目录与文件必须分得开**——
   * 界面上「点进去」与「预览」是两件事，混了就是点一个目录去解码图片。
   */
  async stat(path: string): Promise<{ directory: boolean; size: number; modifiedAt?: Date }> {
    const s = await this.sftp()
    return new Promise((resolve, reject) => {
      s.stat(path, (err, st) => {
        if (err) return reject(err)
        resolve({
          directory: st.isDirectory(),
          size: st.size,
          // `mtime` 是秒；**取不到就不给这一格**，不拿 0 冒充 1970 年
          ...(st.mtime ? { modifiedAt: new Date(st.mtime * 1000) } : {}),
        })
      })
    })
  }

  async unlink(path: string): Promise<void> {
    const s = await this.sftp()
    return new Promise((resolve, reject) => {
      s.unlink(path, (err) => (err ? reject(err) : resolve()))
    })
  }

  /** **SFTP 的 `rmdir` 只删空目录**——递归是调用方的事，这一层不替它决定 */
  async rmdir(path: string): Promise<void> {
    const s = await this.sftp()
    return new Promise((resolve, reject) => {
      s.rmdir(path, (err) => (err ? reject(err) : resolve()))
    })
  }

  async rename(从: string, 到: string): Promise<void> {
    const s = await this.sftp()
    return new Promise((resolve, reject) => {
      s.rename(从, 到, (err) => (err ? reject(err) : resolve()))
    })
  }

  /**
   * 列一层目录。
   *
   * **`mtime` 也一起取**（2026-08-19）。此前这里只拿了名字/类型/大小，
   * 后端于是给文件树填了个 1970 占位，注释还写着「SFTP 不给修改时间」——
   * 可它就在旁边的 `attrs.mtime` 里（SFTP 协议的 `ATTRS` 本来就带时间）。
   * 又一次「东西到手了，最后一步没往下传」。
   *
   * 作者要它的理由：*「我只需要在文件树里看到生成了什么数据就好，
   * 有时间戳我就知道哪个是新生成的。」*——服务器上的目录多半不是 git 仓库，
   * 时间戳是那儿唯一现成的「什么是新的」。
   *
   * SFTP 给的是**秒**；这里换成毫秒，与 `Date` 同一口径。
   */
  async readdir(path: string): Promise<{ name: string; directory: boolean; size: number; mtimeMs: number }[]> {
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
            mtimeMs: e.attrs.mtime * 1000,
          })),
        )
      })
    })
  }

  close(): void {
    this.sftpHandle = undefined
    // **先立起这面旗再关**：`end()` 可能同步就把 `close` 事件发出来
    this.自己关的 = true
    try {
      this.client?.end()
    } catch {
      // 关不掉就算了：进程退出会带走它
    }
    this.client = undefined
    this.设状态({ kind: "idle" })
  }
}
