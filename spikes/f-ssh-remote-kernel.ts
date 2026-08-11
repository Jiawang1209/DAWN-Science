/**
 * Spike F —— **远端内核**（②-B · S15 的技术核心）
 *
 * ## 它回答的那一个问题
 *
 * ②-B 的判据（G4）是：*同一段代码在本地和一台 SSH 机器上各跑一次，
 * 两条 Run 记录都可查、且都带环境快照。* 本地那一半 ②-A 已经做通。
 * **远端那一半有两条路，代价差一个数量级：**
 *
 *   - **A（本 spike 验的）**：ssh2 起远端 `ipykernel`，把它的 5 个 zeromq 端口
 *     隧道回本地。**协议不变**——`src/kernel/channel.ts` 那一套原样复用。
 *   - **B（备选）**：远端跑 Jupyter Server，走 HTTP/WebSocket。不用管端口，
 *     但那是**另一套协议**，等于在 `channel.ts` 旁边再开一份实现——
 *     一个新的「坐在哪一层」的依赖决策（规格 §4）。
 *
 * **A 不通，S15 的整个形状就变了。** 所以先花一个 spike 问清楚，
 * 而不是写到一半才发现。
 *
 * ## 五个必须回答的问题
 *
 *   Q1 ssh2 连得上吗（key / ssh-agent，两种都试）
 *   Q2 远端有 Python 且装了 ipykernel 吗
 *   Q3 起得来内核、拿得到它写的 connection.json（5 个端口 + HMAC key）吗
 *   Q4 **5 个端口能隧道回本地，并用现有那套 zeromq 通道跑通一次 execute 吗**
 *   Q5 收摊干净吗——远端**不留残留进程**（这条不验的话，spike 本身会在你机器上攒垃圾）
 *
 * ## 怎么跑
 *
 * ```bash
 * # 密钥/agent 认证（会自动试）
 * DAWN_SSH_HOST=你的主机 DAWN_SSH_USER=你的用户名 npm run spike:f
 *
 * # 密码认证：**这样喂，密码不进 shell 历史**
 * read -s -p "密码: " P && DAWN_SSH_PASSWORD="$P" \
 *   DAWN_SSH_HOST=你的主机 DAWN_SSH_USER=你的用户名 npm run spike:f; unset P
 * ```
 * 可选：`DAWN_SSH_PORT`（默认 22）、`DAWN_SSH_KEY`（默认依次试
 * `~/.ssh/id_ed25519`、`~/.ssh/id_rsa`）、`DAWN_SSH_PYTHON`（默认 `python3`）。
 *
 * **密钥不进仓库、不进日志。** 这里只读你本机已有的私钥文件，
 * 或者走 `SSH_AUTH_SOCK`（ssh-agent）——与你平时 `ssh` 用的是同一套凭证。
 * `ssh2` **不读 `~/.ssh/config`**（它没有这个能力），所以主机名要显式给。
 */
import { Client, type ConnectConfig } from "ssh2"
import { createServer, type Server, type Socket } from "node:net"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createMainChannel } from "enchannel-zmq-backend"
import { executeRequest, kernelInfoRequest } from "@nteract/messaging"

const HOST = process.env["DAWN_SSH_HOST"]
const USER = process.env["DAWN_SSH_USER"]
const PORT = Number(process.env["DAWN_SSH_PORT"] ?? 22)
const PYTHON = process.env["DAWN_SSH_PYTHON"] ?? "python3"

/** 内核在远端写连接文件的地方。带随机后缀，**不与别人的 spike 撞** */
const REMOTE_CONN = `/tmp/dawn-spike-f-${Math.random().toString(36).slice(2, 8)}.json`
const MARKER = "DAWN_REMOTE_OK"

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface Msg {
  header: { msg_type: string; msg_id: string }
  content: Record<string, unknown>
}

/** 订阅直到命中或超时。**不用 rxjs 算子**——理由见 spike D 的文件头（6/7 版本分裂） */
function waitFor(
  obs: { subscribe: (f: (m: Msg) => void) => { unsubscribe: () => void } },
  predicate: (m: Msg) => boolean,
  ms: number,
): Promise<Msg | null> {
  return new Promise((resolve) => {
    let settled = false
    const sub = obs.subscribe((m) => {
      if (!settled && predicate(m)) {
        settled = true
        clearTimeout(t)
        sub.unsubscribe()
        resolve(m)
      }
    })
    const t = setTimeout(() => {
      if (!settled) {
        settled = true
        sub.unsubscribe()
        resolve(null)
      }
    }, ms)
  })
}

/** 私钥：显式指定的优先，否则按惯例依次试。**读不到就交给 agent** */
function 私钥(): Buffer | undefined {
  const 指定 = process.env["DAWN_SSH_KEY"]
  const 候选 = 指定 ? [指定] : [join(homedir(), ".ssh", "id_ed25519"), join(homedir(), ".ssh", "id_rsa")]
  for (const p of 候选) if (existsSync(p)) return readFileSync(p)
  return undefined
}

/**
 * 连上去。**三种认证都试**：私钥 / ssh-agent / 密码。
 *
 * ## 为什么密码这条必须有
 *
 * 第一版只试了前两种，作者在 `gs191.genek.cn` 上直接
 * `All configured authentication methods failed`——**共享集群与教学机
 * 绝大多数是密码认证**，而那正是「远端跑一段代码」最常见的场景。
 * 少了它，spike 问不到它真正想问的那个问题（隧道通不通），
 * 却看起来像「路线 A 不行」。**认证失败与协议失败是两件事，不能混。**
 *
 * ## 密码从哪来
 *
 * 只从 `DAWN_SSH_PASSWORD` 读，**不打印、不写盘、不进任何结论**。
 * 建议这样喂，避免它进 shell 历史：
 * ```bash
 * read -s -p "密码: " P && DAWN_SSH_PASSWORD="$P" DAWN_SSH_HOST=… npm run spike:f; unset P
 * ```
 * `keyboard-interactive` 也一并接上——很多服务器的「密码」其实走的是它。
 */
function 连上(): Promise<Client> {
  const key = 私钥()
  /**
   * 密码有两条来路，**都不经过命令行**：
   *   - `DAWN_SSH_PASSWORD_FILE`：一个只有你读得到的文件（推荐）
   *   - `DAWN_SSH_PASSWORD`：环境变量
   *
   * 为什么补上文件这条：`read -s` 那种交互式喂法**要有 TTY**，
   * 而从工具/CI 里跑的时候没有——那时 `read` 直接读到 EOF，
   * 整条命令静静地什么都不做（作者撞上过一次，表现是「跑完没有任何输出」）。
   *
   * **末尾的换行要去掉**：编辑器保存时几乎一定会加一个，
   * 而它会让密码对不上——而报错只会说「认证失败」。
   */
  const 密码文件 = process.env["DAWN_SSH_PASSWORD_FILE"]
  const 密码 =
    (密码文件 && existsSync(密码文件) ? readFileSync(密码文件, "utf8").replace(/\r?\n$/, "") : undefined) ||
    process.env["DAWN_SSH_PASSWORD"]
  const 试过: string[] = []
  if (key) 试过.push("私钥")
  if (process.env["SSH_AUTH_SOCK"]) 试过.push("ssh-agent")
  if (密码) 试过.push(密码文件 ? "密码（来自文件）" : "密码（来自环境变量）")
  console.log(`   认证方式：${试过.length ? 试过.join(" / ") : "（一种都没有）"}`)

  const cfg: ConnectConfig = {
    host: HOST!,
    port: PORT,
    username: USER!,
    ...(key ? { privateKey: key } : {}),
    // ssh-agent：与你平时 `ssh` 用的是同一套凭证
    ...(process.env["SSH_AUTH_SOCK"] ? { agent: process.env["SSH_AUTH_SOCK"] } : {}),
    ...(密码 ? { password: 密码 } : {}),
    // 很多服务器的「密码」实际走 keyboard-interactive，**两条都要开**
    tryKeyboard: Boolean(密码),
    readyTimeout: 20_000,
  }
  const c = new Client()
  return new Promise((resolve, reject) => {
    c.once("ready", () => resolve(c))
    c.once("error", (e: Error) => {
      // **把「试过哪些」带上**：光说「都失败了」没法判断下一步该给什么
      reject(new Error(`${e.message}（试过：${试过.join(" / ") || "无"}）`))
    })
    if (密码) {
      c.on("keyboard-interactive", (_n, _i, _l, _p, finish) => finish([密码]))
    }
    c.connect(cfg)
  })
}

/**
 * **登录 shell 会往 stdout 里塞东西。**
 *
 * 作者这台机器的 `~/.bashrc` 打了一段欢迎横幅（一排星号 + 课程链接），
 * 于是「取前两行当版本号」取到的是横幅——**而退出码是 0，
 * 所以它看起来像通过了**：`远端 Python ******** · ipykernel 基因课服务器使用指南…`。
 *
 * **一个假「通过」比一个失败危险**：失败会让人去查，假通过会让人往下走。
 *
 * 所以凡是要**解析**的输出，一律夹在标记之间，只认标记之间那一段。
 */
const 标记 = "<<<DAWN-F>>>"
const 取净输出 = (out: string): string => {
  const i = out.indexOf(标记)
  const j = out.lastIndexOf(标记)
  return i >= 0 && j > i ? out.slice(i + 标记.length, j).trim() : out.trim()
}

/**
 * **单个值一律走 `键=值`，不靠位置也不靠标记。**
 *
 * 「夹在标记之间」还是不够硬：这台机器的欢迎横幅是 sshd 的 MOTD，
 * 它和我们自己的 stdout **是交错到达的**——实测出现过横幅落在两个标记
 * *中间* 的情况，于是「剩几个进程」被解析成了一排星号。
 *
 * **顺序不能假设，但一个自造的键名可以。**
 */
const 取值 = (out: string, 键: string): string | undefined =>
  new RegExp(`${键}=([^\\s]*)`).exec(out)?.[1]

/** 多行 JSON：**取最外层那一对花括号**，横幅落在前后都不影响 */
/**
 * **`pgrep` 会匹配到执行它的那条命令行本身。**
 *
 * 这个坑在这个 spike 里咬了两次：第一次让 Q5 报「还剩 1 个进程」
 * （内核压根没起来）；第二次更狠——清理命令 `pgrep … | xargs kill -9`
 * **把自己那个 shell 杀了**，于是输出是空的，看起来像「命令没跑」。
 *
 * 解法是老办法：把模式写成 `[i]pykernel_launcher`。
 * 它作为正则仍然匹配 `ipykernel_launcher`，但**命令行里那串字面量
 * 不再等于模式本身**，于是不会自匹配。
 */
const 取JSON = (out: string): string | undefined => {
  const i = out.indexOf("{")
  const j = out.lastIndexOf("}")
  return i >= 0 && j > i ? out.slice(i, j + 1) : undefined
}

/**
 * 在远端跑一条命令，收全 stdout/stderr 与退出码。
 *
 * ## **一律走登录 shell**（`bash -lc`）
 *
 * ssh2 的 `exec` 起的是**非登录、非交互** shell——它不读 `~/.bashrc`、
 * 不读 `~/.bash_profile`，于是 conda 的初始化、`~/.local/bin` 的 PATH
 * **一样都没有**。
 *
 * 后果不是「跑不了」，而是**看到的是另一台机器**：作者在交互式 ssh 里
 * `pip install ipykernel` 装得好好的，spike 这边却报 `No module named ipykernel`，
 * 因为它看到的 `python3` 是 `/usr/bin/python3`（那个连 pip 都没有）。
 *
 * **这条直接进 S15 的设计**：远端执行必须与「人自己 ssh 上去」看到同一套环境，
 * 否则环境快照记的是一台不存在的机器。
 */
function 远端执行(c: Client, cmd: string): Promise<{ code: number; out: string; err: string }> {
  // 单引号包住整条命令；内部的单引号按 shell 惯例转义
  const 登录着跑 = `bash -lc '${cmd.replace(/'/g, `'\\''`)}'`
  return new Promise((resolve, reject) => {
    c.exec(登录着跑, (e, stream) => {
      if (e) return reject(e)
      let out = ""
      let err = ""
      stream.on("data", (d: Buffer) => (out += d.toString()))
      stream.stderr.on("data", (d: Buffer) => (err += d.toString()))
      stream.on("close", (code: number) => resolve({ code: code ?? 0, out, err }))
    })
  })
}

/**
 * 把远端的一个端口隧道到本地。
 *
 * **这就是 `ssh -L` 干的事**：本地起一个 TCP server，每条进来的连接
 * 用 `forwardOut` 开一条 SSH 通道，两头对接。zeromq 在上面跑的是原样的 TCP，
 * 它不知道中间隔着一条 SSH——**这正是路线 A 能保住「一份通道实现」的原因**。
 */
function 隧道(c: Client, 远端端口: number): Promise<{ 本地端口: number; server: Server }> {
  return new Promise((resolve, reject) => {
    const server = createServer((sock: Socket) => {
      c.forwardOut("127.0.0.1", 0, "127.0.0.1", 远端端口, (e, ch) => {
        if (e) {
          sock.destroy()
          return
        }
        sock.pipe(ch).pipe(sock)
      })
    })
    server.once("error", reject)
    // 端口给 0 让系统挑：**写死端口的 spike 在第二个人跑的时候就撞了**
    server.listen(0, "127.0.0.1", () => {
      const a = server.address()
      if (a && typeof a === "object") resolve({ 本地端口: a.port, server })
      else reject(new Error("拿不到本地端口"))
    })
  })
}

async function main() {
  const R = {
    q1: false,
    q2: false,
    q3: false,
    q4: false,
    q5: false,
    远端Python: "",
    ipykernel: "",
    端口: [] as number[],
    说明: [] as string[],
  }

  if (!HOST || !USER) {
    console.error("用法：DAWN_SSH_HOST=主机 DAWN_SSH_USER=用户名 npm run spike:f")
    process.exit(2)
  }

  /**
   * **收拾模式**：`DAWN_SPIKE_CLEANUP=1` 只连上去清掉这个 spike 留下的内核。
   *
   * 为什么值得留在仓库里：Q5 修好之前，几轮 spike 在作者的共享集群上
   * 留了 3 个跑着的 ipykernel。**在别人的机器上留垃圾，是要有办法收的**——
   * 而「写一个一次性脚本」上次因为不在项目目录里、`ssh2` 都解析不到。
   *
   * **只杀名字里带 `dawn-spike-f` 的**：那是我们起的，绝不碰用户自己的内核。
   */
  if (process.env["DAWN_SPIKE_CLEANUP"]) {
    const c2 = await 连上()
    const 清 = await 远端执行(
      c2,
      `pgrep -u "$USER" -af "[i]pykernel_launcher" | grep "[d]awn-spike-f" | cut -d" " -f1 | xargs -r kill -9; sleep 1; ` +
        `echo "DAWNLEFT=$(pgrep -u "$USER" -f "[i]pykernel_launcher" | wc -l)"`,
    )
    console.log(`清理完毕，你账号下还剩 ${取值(清.out, "DAWNLEFT") ?? "?"} 个 ipykernel 进程`)
    c2.end()
    return
  }

  let c: Client | undefined
  const servers: Server[] = []
  let channel: { next: (m: unknown) => void; complete: () => void; subscribe: unknown } | undefined
  /** 远端内核的 PID。**收摊按它核**——按文件名 grep 会匹配到自己 */
  let 内核PID: number | undefined

  try {
    // ── Q1 连得上吗 ────────────────────────────────────────────────
    c = await 连上()
    R.q1 = true
    console.log(`✅ Q1 连上了 ${USER}@${HOST}:${PORT}`)

    // ── Q2 远端有 Python + ipykernel 吗 ───────────────────────────
    const 探 = await 远端执行(
      c,
      `${PYTHON} -c "import sys, ipykernel; print('DAWNPY=' + sys.version.split()[0]); print('DAWNIK=' + ipykernel.__version__)"`,
    )
    if (探.code !== 0) {
      R.说明.push(`远端没有可用的 ipykernel：${(探.err.trim() || 探.out.trim()).split("\n").at(-1)}`)
      console.error(`❌ Q2 ${R.说明.at(-1)}`)
      /**
       * **缺件就把现场探清楚，别让人再跑一趟。**
       *
       * 「远端没装 ipykernel」是环境问题，不是路线问题——但下一步该敲什么命令，
       * 取决于那台机器长什么样：有没有 pip、能不能 `--user` 装、
       * 是不是 conda / module 管的环境。**一次问全，比来回三趟强。**
       */
      const 现场 = await 远端执行(
        c,
        [
          `echo "--- python ---"; command -v -a python3 python 2>/dev/null; ${PYTHON} -V 2>&1`,
          `echo "--- PATH ---"; echo "$PATH"`,
          `echo "--- 家目录里的 python 环境 ---"; ls -d ~/miniconda3 ~/anaconda3 ~/miniforge3 ~/.local/bin ~/venv* 2>/dev/null`,
          `echo "--- pip ---"; command -v pip3 pip 2>/dev/null; ${PYTHON} -m pip -V 2>&1 | head -1`,
          `echo "--- conda ---"; command -v conda mamba 2>/dev/null; echo "$CONDA_PREFIX"`,
          `echo "--- module ---"; command -v module lmod 2>/dev/null`,
          `echo "--- 家目录可写 ---"; touch ~/.dawn-write-test && echo yes && rm -f ~/.dawn-write-test || echo no`,
        ].join("; "),
      )
      console.log("\n—— 远端现场 ——\n" + 现场.out.trim())
      R.说明.push("现场见上；下一步的安装命令按它来定")
    } else {
      const ver = 取值(探.out, "DAWNPY")
      const ik = 取值(探.out, "DAWNIK")
      R.远端Python = ver ?? ""
      R.ipykernel = ik ?? ""
      R.q2 = true
      console.log(`✅ Q2 远端 Python ${ver} · ipykernel ${ik}`)
    }

    if (R.q2) {
      // ── Q3 起内核，拿它写的 connection.json ────────────────────
      /**
       * **`nohup` + `&`，并且立刻断开**：`exec` 的 stream 一关，
       * 远端进程若还挂在这个会话上会被 SIGHUP 带走。
       */
      const 起 = await 远端执行(
        c,
        `nohup ${PYTHON} -m ipykernel_launcher -f ${REMOTE_CONN} >/tmp/dawn-spike-f.log 2>&1 & echo "DAWNPID=$!"`,
      )
      // **记下 PID**：收摊时按它核，而不是按文件名 grep（见 Q5 那段）
      内核PID = Number(取值(起.out, "DAWNPID")) || undefined
      console.log(`   远端内核 PID ${内核PID ?? "（没拿到）"}`)
      let conn: Record<string, unknown> | undefined
      for (let i = 0; i < 30 && !conn; i++) {
        await sleep(300)
        const r = await 远端执行(c, `cat ${REMOTE_CONN} 2>/dev/null || true`)
        const t = 取JSON(r.out) ?? ""
        if (t.startsWith("{")) {
          try {
            conn = JSON.parse(t) as Record<string, unknown>
          } catch {
            // 文件可能只写了一半，下一轮再看
          }
        }
      }
      if (!conn) {
        /**
         * **把远端的日志带回来。**「没拿到文件」有十来种原因
         * （模块缺、权限、被 SIGHUP 带走…），而它们的区别全在那个日志里。
         */
        const 日志 = await 远端执行(c, `echo "${标记}"; tail -20 /tmp/dawn-spike-f.log 2>&1; echo "${标记}"`)
        R.说明.push("30 次轮询之内没拿到 connection.json；远端日志见下")
        console.error(`❌ Q3 ${R.说明.at(-1)}`)
        console.error("—— 远端日志 ——\n" + 取净输出(日志.out))
      } else {
        R.q3 = true
        const 端口名 = ["shell_port", "iopub_port", "stdin_port", "control_port", "hb_port"] as const
        R.端口 = 端口名.map((k) => Number(conn![k]))
        console.log(`✅ Q3 内核起来了，远端端口 ${R.端口.join(" / ")}`)

        // ── Q4 隧道 + 跑通一次 execute ──────────────────────────
        const 映射: Record<string, number> = {}
        for (const k of 端口名) {
          const { 本地端口, server } = await 隧道(c, Number(conn[k]))
          servers.push(server)
          映射[k] = 本地端口
        }
        console.log(`   隧道就位：${端口名.map((k) => `${k}→${映射[k]}`).join(" ")}`)

        /**
         * **连接信息里除了端口，其余原样照抄**——
         * 尤其是 `key` 与 `signature_scheme`：HMAC 对不上的话，
         * 内核会**静默丢弃**每一条消息，表现为「连上了但永远没有回复」。
         */
        const 本地连接 = { ...conn, ...映射, ip: "127.0.0.1" }
        channel = (await createMainChannel(本地连接 as never)) as never

        /** **先订阅再发**：反过来的话，回复可能在你开始听之前就到了 */
        const 等信息 = waitFor(
          channel as never,
          (m) => m.header.msg_type === "kernel_info_reply",
          15_000,
        )
        ;(channel as { next: (m: unknown) => void }).next(kernelInfoRequest())
        const info2 = await 等信息
        if (!info2) {
          R.说明.push("隧道通了但 kernel_info 没回——多半是 HMAC key 或端口对错了")
          console.error(`❌ Q4 ${R.说明.at(-1)}`)
        } else {
          const req = executeRequest(`print("${MARKER}", 40 + 2)`)
          // 同样先订阅再发
          const 等输出 = waitFor(
            channel as never,
            (m) =>
              m.header.msg_type === "stream" &&
              String((m.content as { text?: string }).text ?? "").includes(MARKER),
            20_000,
          )
          ;(channel as { next: (m: unknown) => void }).next(req)
          const 命中 = await 等输出
          if (命中) {
            R.q4 = true
            console.log(`✅ Q4 远端算出来了：${String((命中.content as { text: string }).text).trim()}`)
          } else {
            R.说明.push("execute 发出去了，20 秒内没等到带标记的输出")
            console.error(`❌ Q4 ${R.说明.at(-1)}`)
          }
        }
      }
    }
  } catch (err) {
    R.说明.push(`异常：${err instanceof Error ? err.message : String(err)}`)
    console.error("❌", R.说明.at(-1))
  } finally {
    // ── Q5 收摊：**远端不留残留** ─────────────────────────────
    try {
      ;(channel as { complete?: () => void } | undefined)?.complete?.()
    } catch {
      // 通道可能已经断了
    }
    for (const s of servers) s.close()
    if (c) {
      try {
        /**
         * **按 PID 核，不按文件名 grep。**
         *
         * 第一版写的是 `pgrep -f ${REMOTE_CONN} | wc -l`——它**把执行这条命令的
         * 那个 shell 自己也匹配上了**（那个 shell 的命令行里就含着这个文件名）。
         * 于是内核压根没起来的那一次，Q5 也报「还剩 1 个进程」：
         * **一个不存在的问题，看起来像一个真问题。**
         */
        /**
         * **杀完要等它真的没了，而且僵尸不算活着。**
         *
         * 第一版 `kill` 之后立刻 `kill -0` 就判——报「还活着」。
         * 两个原因叠在一起：① SIGTERM 之后 ipykernel 要收尾，不是立刻消失；
         * ② 它的父进程（那个 login shell）已经退了，于是它会先变成**僵尸**，
         * 而 `kill -0` 对僵尸**照样返回 0**。
         *
         * 所以：轮询等它消失，并把 `Z` 状态当作已死（僵尸不占资源，
         * init 收走它只是时间问题）。
         */
        if (内核PID) {
          await 远端执行(c, `kill ${内核PID} 2>/dev/null; true`)
          for (let i = 0; i < 10; i++) {
            const st = await 远端执行(
              c,
              `echo "DAWNSTAT=$(ps -o stat= -p ${内核PID} 2>/dev/null || echo gone)"`,
            )
            const 状态 = 取值(st.out, "DAWNSTAT") ?? "gone"
            if (!状态 || 状态 === "gone" || 状态.startsWith("Z")) break
            if (i === 3) await 远端执行(c, `kill -9 ${内核PID} 2>/dev/null; true`)
            await sleep(300)
          }
          const 末 = await 远端执行(
            c,
            `echo "DAWNSTAT=$(ps -o stat= -p ${内核PID} 2>/dev/null || echo gone)"`,
          )
          const 状态 = 取值(末.out, "DAWNSTAT") ?? "gone"
          R.q5 = !状态 || 状态 === "gone" || 状态.startsWith("Z")
          console.log(
            R.q5
              ? "✅ Q5 远端收摊干净"
              : `❌ Q5 远端那个内核（PID ${内核PID}）还活着，状态 ${状态}`,
          )
        } else {
          R.q5 = true
        }
        await 远端执行(c, `rm -f ${REMOTE_CONN}`)

        /**
         * **顺带扫一眼有没有别人（或之前的我）留下的内核。**
         * 共享集群上留一个跑着的进程是很不礼貌的，而且它占着内存。
         */
        const 残 = await 远端执行(
          c,
          `echo "DAWNLEFT=$(pgrep -u "$USER" -f "[i]pykernel_launcher" | wc -l)"`,
        )
        const n = Number(取值(残.out, "DAWNLEFT")) || 0
        if (n > 0) console.log(`   ⚠ 你账号下还有 ${n} 个 ipykernel 进程（可能是更早的残留）`)
      } catch {
        R.说明.push("收摊时连接已断，残留未确认")
      }
      c.end()
    }
  }

  console.log("\n—— 结论 ——")
  console.log(JSON.stringify(R, null, 2))
  // **四个核心问题全通才算通过**（Q5 是卫生，不影响路线判断）
  process.exit(R.q1 && R.q2 && R.q3 && R.q4 ? 0 : 1)
}

void main()
