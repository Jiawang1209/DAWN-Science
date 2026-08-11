/**
 * 一台**假服务器**（②-B · R3）。
 *
 * ## 为什么它在 `src/` 里，而不是在 `tests/` 里
 *
 * 准入规则 1：*「新增协议操作，必须在同一次改动里补 mock 分支……
 * 新增一个操作却不补它，界面在 mock 模式下就会悄悄偏离真实契约。」*
 *
 * 远端连接这一批尤其如此——`npm run dev:mock` 与 e2e 都**没有一台真服务器可连**。
 * 没有这份假的，「添加服务器 → 连接 → 它连上了」这条主路径在 mock 模式下
 * 根本走不通，于是它只能靠人拿真机试，而那意味着**它几乎不会被试**。
 *
 * ## 它假到什么程度是有讲究的
 *
 * 它假装的是**SSH 协议那一层**（`ssh2` 的 `Client`），不是我们的执行器。
 * 也就是说 `RemoteExecutor` 那些真正要紧的行为——环境捕获、单引号转义、
 * 退出码、断线不重连——**在 mock 模式下走的仍是真代码**。
 * 假的只有「另一端是谁」。
 *
 * **认证也是真判的**：口令不对就拒。否则 mock 模式会把
 * 「口令根本没传到」这类错误全部吞掉——那正是最需要被发现的一类。
 */
import { EventEmitter } from "node:events"
import type { SshClientLike } from "./ssh.js"

/** 假机器上认的口令。**写死一个**——mock 模式的意义就是确定性 */
export const 假口令 = "dawn"

/** 假机器上的家目录 */
const 家 = "/home/dawn"

/**
 * 一份小小的假文件系统。**够让 `ls` / `cat` 有话可说**，
 * 不试图做成一个真的文件系统——那是另一个项目。
 */
const 文件: Record<string, string> = {
  [`${家}/读我.md`]: "# 这是一台假服务器\n\n它只在 mock 模式下存在。\n",
  [`${家}/数据/样本.csv`]: "id,值\n1,3.14\n2,2.72\n",
}

interface 通道 extends EventEmitter {
  stderr: EventEmitter
}

/**
 * 造一个假的 `ssh2.Client`。
 *
 * @param 口令对不对 上层从钥匙串取到的口令；不对就在 `connect` 时抛认证失败
 */
export function 造一台假服务器(): SshClientLike {
  const c = new EventEmitter() as EventEmitter & SshClientLike
  let 已连 = false

  c.connect = ((cfg: { password?: string; privateKey?: unknown }) => {
    setTimeout(() => {
      /**
       * **认证真判。**
       *
       * 一律放行的话，「口令没从钥匙串取到」「口令传错了字段」这类错误
       * 在 mock 模式下全都会显示成连接成功——而它们恰恰是这一批最容易出的错。
       */
      if (!cfg.privateKey && cfg.password !== 假口令) {
        c.emit("error", new Error("All configured authentication methods failed"))
        return
      }
      已连 = true
      c.emit("ready")
    }, 10)
  }) as SshClientLike["connect"]

  c.exec = ((cmd: string, cb: (e: Error | undefined, ch: 通道) => void) => {
    if (!已连) {
      cb(new Error("Not connected"), undefined as never)
      return
    }
    const ch = new EventEmitter() as 通道
    ch.stderr = new EventEmitter()
    cb(undefined, ch)
    setTimeout(() => {
      const { out, err, code } = 跑(cmd)
      /**
       * **先吐一段欢迎横幅**（只在登录 shell 那一条上）。
       *
       * 这不是恶趣味：Spike F 的头号发现就是**登录横幅会混进命令输出**，
       * 而 `RemoteExecutor` 里那套「登录 shell 只跑一次、之后用干净 shell」
       * 正是为它而设。mock 里不复现这一点，那套代码就等于没被走过。
       */
      if (/bash -lc/.test(cmd)) {
        ch.emit("data", Buffer.from("*** 假服务器 · 仅在 mock 模式下存在 ***\n"))
      }
      if (out) ch.emit("data", Buffer.from(out))
      if (err) ch.stderr.emit("data", Buffer.from(err))
      /**
       * **先 `exit` 带退出码，再 `close`。** 真 ssh2 就是这个顺序，
       * 而 `RemoteExecutor` 的退出码只从 `exit` 上读。
       *
       * 第一版只发了 `close(code)`，于是 mock 模式下**每条命令的退出码都是
       * `undefined`**——命令失败在界面上会变成「跑完了，没说什么」。
       * 这一处正是 mock 悄悄偏离真实契约的样子，写测试时当场抓到。
       */
      ch.emit("exit", code, null)
      ch.emit("close")
    }, 5)
  }) as SshClientLike["exec"]

  c.sftp = ((cb: (e: Error | undefined, sftp: unknown) => void) => {
    cb(undefined, {
      readFile: (p: string, f: (e: Error | undefined, b?: Buffer) => void) => {
        const v = 文件[p]
        if (v === undefined) f(new Error(`No such file: ${p}`))
        else f(undefined, Buffer.from(v))
      },
      writeFile: (p: string, d: string | Buffer, f: (e?: Error) => void) => {
        文件[p] = d.toString()
        f()
      },
      readdir: (p: string, f: (e: Error | undefined, list?: unknown[]) => void) => {
        const 前缀 = `${p.replace(/\/+$/, "")}/`
        const 名字 = new Set<string>()
        for (const k of Object.keys(文件)) {
          if (!k.startsWith(前缀)) continue
          名字.add(k.slice(前缀.length).split("/")[0]!)
        }
        f(
          undefined,
          [...名字].map((filename) => ({ filename, attrs: { mode: 0o100644, size: 0 } })),
        )
      },
      end: () => {},
    })
  }) as SshClientLike["sftp"]

  c.end = (() => {
    已连 = false
    // **主动断开也要出声**：`RemoteExecutor` 靠 `close` 事件收尾
    setTimeout(() => c.emit("close"), 1)
  }) as SshClientLike["end"]

  return c
}

/** 这台假机器认得的几条命令。**认不得的如实回 127**，不假装成功 */
function 跑(整条: string): { out: string; err: string; code: number } {
  // 我们发过去的是 `bash -c '…'` 或 `bash -lc '…'`，把里面那层剥出来
  const m = /^bash -l?c '(.*)'$/s.exec(整条)
  const 里面 = m ? m[1]!.replace(/'\\''/g, "'") : 整条

  // 环境捕获那一条：`echo "DAWNENV_PATH=${PATH}"; …`
  if (里面.includes("DAWNENV_")) {
    const 环境: Record<string, string> = {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      HOME: 家,
      LANG: "en_US.UTF-8",
    }
    const 行 = [...里面.matchAll(/DAWNENV_([A-Z_]+)=/g)].map(
      (x) => `DAWNENV_${x[1]}=${环境[x[1]!] ?? ""}`,
    )
    return { out: `${行.join("\n")}\n`, err: "", code: 0 }
  }

  // 真正的命令前面会有 `echo $$ > …; export …; cd '…' || exit 127; `
  const cd = /cd '([^']*)'/.exec(里面)
  let 当前 = cd?.[1] ?? 家
  const 去掉前缀 = 里面.replace(
    /^(echo \$\$ > \S+; )?(export [^;]+; )*(cd '[^']*' \|\| exit 127; )?/,
    "",
  )

  /**
   * **认得那层「记住当前目录」的包装**（②-B · R4′）。
   *
   * 远端 bash 工具发出来的是
   * `{ <命令>\n}; rc=$?; printf '\n__DAWN_CWD__%s\n' "$(pwd)"; exit $rc`。
   * 真 bash 当然认得它；这台假机器不认的话，**mock 模式下每条命令都会
   * 报 `command not found`**——而那与「工具没接上远端」在界面上长得一样。
   */
  const 包装 = /^\{ ([\s\S]*)\n\}; rc=\$\?; printf '[^']*' "\$\(pwd\)"; exit \$rc$/.exec(去掉前缀)
  const 命令 = 包装 ? 包装[1]! : 去掉前缀

  const 段 = 命令.split(/\s*&&\s*|\s*;\s*/).filter(Boolean)
  let out = ""
  let err = ""
  let code = 0
  for (const 一段 of 段) {
    // `cd` 由这台假机器自己记着——真 shell 也是这么干的
    const c = /^cd\s+(.+)$/.exec(一段)
    if (c) {
      const 目标 = c[1]!.replace(/^["']|["']$/g, "")
      const 新的 = 目标.startsWith("/") ? 目标 : `${当前.replace(/\/+$/, "")}/${目标}`
      // **不存在的目录要失败**，否则 `cd 打错的名字` 会静默成功
      if (!存在(新的)) {
        err += `bash: cd: ${目标}: No such file or directory\n`
        code = 1
        break
      }
      当前 = 新的
      continue
    }
    const r = 一条(一段, 当前)
    out += r.out
    err += r.err
    code = r.code
    // `&&` 的语义：前一条失败就不往下走
    if (code !== 0) break
  }

  // 包装要求的那行标记由**这台机器**打出来（真 bash 就是这么打的）
  if (包装) out += `\n${标记}${当前}\n`
  return { out, err, code }
}

const 标记 = "__DAWN_CWD__"

/** 那个路径在这台假机器上存在吗（目录算存在，只要它下面有文件） */
function 存在(路径: string): boolean {
  const p = 路径.replace(/\/+$/, "")
  return Object.keys(文件).some((k) => k === p || k.startsWith(`${p}/`))
}

function 一条(命令: string, 当前: string): { out: string; err: string; code: number } {
  if (/^pwd\b/.test(命令)) return { out: `${当前}\n`, err: "", code: 0 }
  if (/^echo\s+/.test(命令)) {
    return {
      out: `${命令.replace(/^echo\s+/, "").replace(/^["']|["']$/g, "")}\n`,
      err: "",
      code: 0,
    }
  }
  if (/^ls\b/.test(命令)) {
    const 前缀 = `${当前.replace(/\/+$/, "")}/`
    const 名字 = new Set<string>()
    for (const k of Object.keys(文件)) {
      if (k.startsWith(前缀)) 名字.add(k.slice(前缀.length).split("/")[0]!)
    }
    return { out: `${[...名字].join("\n")}\n`, err: "", code: 0 }
  }
  if (/^cat\s+/.test(命令)) {
    const 路径 = 命令.replace(/^cat\s+/, "").replace(/^["']|["']$/g, "")
    const 全 = 路径.startsWith("/") ? 路径 : `${当前}/${路径}`
    const v = 文件[全]
    if (v === undefined) return { out: "", err: `cat: ${路径}: No such file or directory\n`, code: 1 }
    return { out: v, err: "", code: 0 }
  }
  if (/^(hostname|uname)\b/.test(命令)) return { out: "dawn-fake\n", err: "", code: 0 }
  if (/^mkdir\b/.test(命令)) return { out: "", err: "", code: 0 }

  /**
   * **认不得就说认不得。**
   *
   * 一律回 0 的话，mock 模式下每条命令都"成功"了，
   * 于是界面上的失败路径永远走不到——而那正是最需要被看见的一条。
   */
  return {
    out: "",
    err: `${命令.split(/\s+/)[0]}: command not found（这是一台假服务器）\n`,
    code: 127,
  }
}
