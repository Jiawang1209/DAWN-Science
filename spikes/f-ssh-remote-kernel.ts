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
 * DAWN_SSH_HOST=你的主机 DAWN_SSH_USER=你的用户名 npm run spike:f
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

function 连上(): Promise<Client> {
  const key = 私钥()
  const cfg: ConnectConfig = {
    host: HOST!,
    port: PORT,
    username: USER!,
    ...(key ? { privateKey: key } : {}),
    // ssh-agent：与你平时 `ssh` 用的是同一套凭证
    ...(process.env["SSH_AUTH_SOCK"] ? { agent: process.env["SSH_AUTH_SOCK"] } : {}),
    readyTimeout: 15_000,
  }
  const c = new Client()
  return new Promise((resolve, reject) => {
    c.once("ready", () => resolve(c))
    c.once("error", reject)
    c.connect(cfg)
  })
}

/** 在远端跑一条命令，收全 stdout/stderr 与退出码 */
function 远端执行(c: Client, cmd: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    c.exec(cmd, (e, stream) => {
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

  let c: Client | undefined
  const servers: Server[] = []
  let channel: { next: (m: unknown) => void; complete: () => void; subscribe: unknown } | undefined

  try {
    // ── Q1 连得上吗 ────────────────────────────────────────────────
    c = await 连上()
    R.q1 = true
    console.log(`✅ Q1 连上了 ${USER}@${HOST}:${PORT}`)

    // ── Q2 远端有 Python + ipykernel 吗 ───────────────────────────
    const 探 = await 远端执行(
      c,
      `${PYTHON} -c "import sys, ipykernel; print(sys.version.split()[0]); print(ipykernel.__version__)"`,
    )
    if (探.code !== 0) {
      R.说明.push(`远端没有可用的 ipykernel：${探.err.trim() || 探.out.trim()}`)
      console.error(`❌ Q2 ${R.说明.at(-1)}`)
    } else {
      const [ver, ik] = 探.out.trim().split("\n")
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
      await 远端执行(
        c,
        `nohup ${PYTHON} -m ipykernel_launcher -f ${REMOTE_CONN} >/tmp/dawn-spike-f.log 2>&1 & echo $!`,
      )
      let conn: Record<string, unknown> | undefined
      for (let i = 0; i < 30 && !conn; i++) {
        await sleep(300)
        const r = await 远端执行(c, `cat ${REMOTE_CONN} 2>/dev/null || true`)
        const t = r.out.trim()
        if (t.startsWith("{")) {
          try {
            conn = JSON.parse(t) as Record<string, unknown>
          } catch {
            // 文件可能只写了一半，下一轮再看
          }
        }
      }
      if (!conn) {
        R.说明.push("30 次轮询之内没拿到 connection.json——内核没起来或写得太慢")
        console.error(`❌ Q3 ${R.说明.at(-1)}`)
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
        // 按连接文件名精确杀，不用 `pkill python`——那会连你自己的进程一起杀
        await 远端执行(c, `pkill -f ${REMOTE_CONN} || true; rm -f ${REMOTE_CONN}`)
        const 剩 = await 远端执行(c, `pgrep -f ${REMOTE_CONN} | wc -l`)
        R.q5 = Number(剩.out.trim()) === 0
        console.log(R.q5 ? "✅ Q5 远端收摊干净" : `❌ Q5 远端还剩 ${剩.out.trim()} 个进程`)
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
