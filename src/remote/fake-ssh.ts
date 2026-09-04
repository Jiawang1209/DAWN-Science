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
 *
 * ## 内核那几条命令是真的（任务 9，2026-09-03）
 *
 * `跑()` 把远程内核相关的那几条命令（探测解释器、起/停内核、扫残留）转手给
 * `fake-ssh-kernel.ts` 的 `假内核命令`——那边**真的在本机 spawn 一台 ipykernel**
 * （路径来自 `DAWN_FAKE_SSH_PYTHON`），`forwardOut` 也真的 `connect` 到本机端口。
 * 这台假机器上「假」的只剩「另一端是谁」；其余认不出的命令仍按本文件下方那套
 * 小假文件系统 + 127 的老规矩来。
 */
import { EventEmitter } from "node:events"
import { connect } from "node:net"
import { Readable, Writable } from "node:stream"
import type { SshClientLike } from "./ssh.js"
import { 假内核命令, 扫残留延迟 } from "./fake-ssh-kernel.js"

/** 假机器上认的口令。**写死一个**——mock 模式的意义就是确定性 */
export const 假口令 = "dawn"

/** 假机器上的家目录 */
const 家 = "/home/dawn"

/**
 * 一份小小的假文件系统。**够让 `ls` / `cat` 有话可说**，
 * 不试图做成一个真的文件系统——那是另一个项目。
 */
const 初始文件: Record<string, string> = {
  [`${家}/读我.md`]: "# 这是一台假服务器\n\n它只在 mock 模式下存在。\n",
  [`${家}/数据/样本.csv`]: "id,值\n1,3.14\n2,2.72\n",
  /**
   * **一个够大的文件**，好让传输分成很多块。
   *
   * 全部同步吐完的话，「进度报了不止一次」与「传到一半能取消」两条判据
   * **都会假绿**——它们根本没有机会发生。
   */
  [`${家}/数据/大文件.bin`]: "x".repeat(4096),
}

const 文件: Record<string, string> = { ...初始文件 }

/**
 * 写不进去的目录。**验「权限不够要说是权限不够」那条**——
 * 一句笼统的「上传失败」会让人去查网络、查路径、查磁盘，就是想不到是权限。
 */
const 只读目录 = new Set<string>([`${家}/只读`])

/** 只读目录里得有点东西，否则它在树上根本不出现 */
文件[`${家}/只读/别动我.txt`] = "这个目录不让写\n"
初始文件[`${家}/只读/别动我.txt`] = "这个目录不让写\n"

/**
 * 把假机器恢复原状。**测试之间必须叫一次**——
 * 这张表是模块级的，上一条用例传上去的文件会漏给下一条
 * （`FAKE_ACP_*` 那张手打清单漏过两次，同一个形状）。
 */
export function 重置假机器(): void {
  for (const k of Object.keys(文件)) delete 文件[k]
  Object.assign(文件, 初始文件)
}

/** 这台假机器的家目录。测试与 mock 都要能指得出来 */
export const 假家目录 = 家

/** 传输时每块多大。**小一点**，好让一个几 KB 的文件也能分成很多块 */
const 块大小 = 256

function 是目录(路径: string): boolean {
  const p = `${路径.replace(/\/+$/, "")}/`
  return Object.keys(文件).some((k) => k.startsWith(p))
}

/**
 * 一份 `attrs`。**必须带 `isDirectory()`**——
 * 真 ssh2 给的是 `Stats` 对象，而 `RemoteExecutor.readdir` 正是调它。
 *
 * 第一版这里是个字面量 `{ mode, size }`，于是**那条路一跑就抛 TypeError**。
 * 没人发现，因为那三个 SFTP 方法当时一个调用点都没有——
 * **写下来的代码不等于跑过的代码。**
 */
function 属性(路径: string) {
  const 目录 = 是目录(路径)
  return {
    mode: 目录 ? 0o040755 : 0o100644,
    size: 目录 ? 0 : Buffer.byteLength(文件[路径] ?? ""),
    mtime: 1_755_000_000,
    isDirectory: () => 目录,
  }
}

/** 这个路径的上一级是不是只读的 */
function 落在只读里(路径: string): boolean {
  const 上级 = 路径.slice(0, 路径.lastIndexOf("/"))
  return [...只读目录].some((d) => 上级 === d || 上级.startsWith(`${d}/`))
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
    /**
     * **扫残留那条可以被测试故意拖住**（`设扫残留延迟`，审查反馈）。
     *
     * 单看「哪条命令先被送到假服务器」证不了「起内核等过扫残留」——`跑()` 认命令的顺序
     * 与 `interpreterOf` 发命令的顺序都是天生固定的，不管 `await 扫过.get(cid)` 在不在，
     * 两条命令抵达的先后都不会变。只有让扫残留的**响应**明显晚于它平时的样子，
     * 「没等它跑完就把下一条发出去了」这件事才会在命令记录的顺序里露出来。
     */
    const 延迟 = cmd.includes("DAWNSWEPT") ? 5 + 扫残留延迟() : 5
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
    }, 延迟)
  }) as SshClientLike["exec"]

  /**
   * **假服务器 = 本机**：直连那个端口（任务 9）。内核是真在本机 spawn 出来的
   * （见 `fake-ssh-kernel.ts`），它自己在 `127.0.0.1:<端口>` 上监听 zeromq——
   * 这条隧道因此不用假造任何协议内容，`connect` 到那个端口就是「转发」本身。
   */
  c.forwardOut = ((
    _srcIP: string, _srcPort: number, dstIP: string, dstPort: number,
    cb: (e: Error | undefined, ch: unknown) => void,
  ) => {
    if (!已连) {
      cb(new Error("Not connected"), undefined)
      return
    }
    const s = connect(dstPort, dstIP)
    /**
     * **回调只能叫一次**（审查反馈）：`once` 只保证各自的监听器只触发一次，
     * 不保证两边不会都触发——`connect` 之后 socket 依然可能 `error`（比如对端半路挂了），
     * 那时 `connect` 与 `error` 的监听器都还挂着，`cb` 就会被叫两次，真 ssh2 的回调约定不允许这样。
     * 先记下错误监听器，`connect` 成功后把它摘掉，再报「连上了」。
     */
    const 出错了 = (e: Error) => cb(e, undefined)
    s.once("error", 出错了)
    s.once("connect", () => {
      s.off("error", 出错了)
      cb(undefined, s)
    })
  }) as SshClientLike["forwardOut"]

  c.sftp = ((cb: (e: Error | undefined, sftp: unknown) => void) => {
    cb(undefined, {
      readFile: (p: string, f: (e: Error | undefined, b?: Buffer) => void) => {
        const v = 文件[p]
        if (v === undefined) f(new Error(`No such file: ${p}`))
        else f(undefined, Buffer.from(v))
      },
      writeFile: (p: string, d: string | Buffer, f: (e?: Error) => void) => {
        if (落在只读里(p)) return f(new Error("Permission denied"))
        文件[p] = d.toString()
        f()
      },
      readdir: (p: string, f: (e: Error | undefined, list?: unknown[]) => void) => {
        const 根 = p.replace(/\/+$/, "")
        if (!是目录(根)) return f(new Error(`No such directory: ${p}`))
        const 前缀 = `${根}/`
        const 名字 = new Set<string>()
        for (const k of Object.keys(文件)) {
          if (!k.startsWith(前缀)) continue
          名字.add(k.slice(前缀.length).split("/")[0]!)
        }
        f(
          undefined,
          // **`attrs` 要带 `isDirectory()`**，真 ssh2 给的是 `Stats`
          [...名字].map((filename) => ({ filename, attrs: 属性(`${前缀}${filename}`) })),
        )
      },
      stat: (p: string, f: (e: Error | undefined, st?: unknown) => void) => {
        if (文件[p] === undefined && !是目录(p)) return f(new Error(`No such file: ${p}`))
        f(undefined, 属性(p))
      },
      unlink: (p: string, f: (e?: Error) => void) => {
        if (文件[p] === undefined) return f(new Error(`No such file: ${p}`))
        if (落在只读里(p)) return f(new Error("Permission denied"))
        delete 文件[p]
        f()
      },
      /** **只删空目录**——真 SFTP 就是这样，递归是调用方的事 */
      rmdir: (p: string, f: (e?: Error) => void) => {
        if (!是目录(p)) return f(new Error(`No such directory: ${p}`))
        f(new Error("Directory not empty"))
      },
      /**
       * **目标已存在就失败**——SFTP v3 的 `rename` 不是 POSIX 那种覆盖。
       * 假成会覆盖的话，`upload` 里那段「先 unlink 再改名」永远走不到，
       * 而它在真服务器上是必经之路。
       */
      rename: (从: string, 到: string, f: (e?: Error) => void) => {
        if (文件[从] === undefined) return f(new Error(`No such file: ${从}`))
        if (文件[到] !== undefined) return f(new Error("Failure: file already exists"))
        文件[到] = 文件[从]!
        delete 文件[从]
        f()
      },
      /**
       * **分块吐，而且隔一个宏任务**。
       *
       * 同步吐完的话「进度报了不止一次」与「传到一半能取消」两条判据
       * 都会假绿——它们根本没有机会发生。
       */
      createReadStream: (p: string) => {
        const 内容 = Buffer.from(文件[p] ?? "")
        // 同上：**在被读那一刻就报**，不靠定时器
        if (文件[p] === undefined) {
          return new Readable({
            read() {
              this.destroy(new Error(`No such file: ${p}`))
            },
          })
        }
        let i = 0
        return new Readable({
          read() {
            if (i >= 内容.length) return void this.push(null)
            const 块 = 内容.subarray(i, i + 块大小)
            i += 块大小
            setTimeout(() => this.push(块), 1)
          },
        })
      },
      createWriteStream: (p: string) => {
        /**
         * **权限在第一次写那一刻就拒，不能靠定时器。**
         *
         * 第一版是 `setTimeout(() => w.destroy(…), 1)`，于是一个 1 字节的文件
         * **在定时器落地之前就已经写完了**——上传成功，判据当场变红。
         * 更坏的是它**时快时慢**：单独跑那一条是红的，整个文件一起跑是绿的。
         * 假的东西一旦有竞态，它证明的就不再是被测代码。
         */
        if (落在只读里(p)) {
          return new Writable({
            write(_块: Buffer, _enc: unknown, done: (e?: Error) => void) {
              done(new Error("Permission denied"))
            },
          })
        }
        const 块们: Buffer[] = []
        return new Writable({
          write(块: Buffer, _enc: unknown, done: (e?: Error) => void) {
            块们.push(Buffer.from(块))
            done()
          },
          final(done: (e?: Error) => void) {
            文件[p] = Buffer.concat(块们).toString()
            done()
          },
        })
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

/**
 * **测试专用**：这台假机器收到过的命令，按到达顺序。
 *
 * 只为验「谁先谁后」这类判据（扫残留要先于起内核完成，见
 * `tests/electron/remote-kernel.test.ts`）——没有别的用途，
 * 生产代码不该、也不会读它。记的是 `exec` 收到的原样字符串
 * （`bash -c '…'` 那一整层，没剥壳），子串匹配（`DAWNSWEPT` / `ipykernel_launcher`）够用。
 *
 * **封顶 500 条，超了扔最老的那些**（审查反馈）：这台假机器也背着 `dev:mock`——
 * 那是一个不会自己退出的长跑进程，没有上限的话这张表会跟着它一起无限长大。
 */
const 命令记录: string[] = []
const 命令记录上限 = 500
export function 跑过的命令(): string[] {
  return [...命令记录]
}
export function 清空记录(): void {
  命令记录.length = 0
}

/** 这台假机器认得的几条命令。**认不得的如实回 127**，不假装成功 */
function 跑(整条: string): { out: string; err: string; code: number } {
  命令记录.push(整条)
  if (命令记录.length > 命令记录上限) 命令记录.splice(0, 命令记录.length - 命令记录上限)
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

  // 远程内核那几条（真起本机 ipykernel）——它们带 `;`，要在切分之前整条认。
  // `; true` / `; true;` 这种尾巴（`kernel-launch.ts` 那边为了不让 `kill`/`rm` 的非零退出码
  // 冒充命令失败而加的）两边都试一遍，去不去掉都认得，保险起见。
  // `当前` 带过去——起内核要用它当 `spawn` 的 `cwd`（定案 2），假机器的虚构家目录会被那边自己滤掉
  const 内核 = 假内核命令(去掉前缀.replace(/; true$/, "").replace(/; true;$/, ";"), 当前)
  if (内核) return 内核

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

/**
 * **测试开关**（`fakeSshControl{do:"dropLink"}`，接回 7.31）：把这台进程里所有假 SSH 链路掐断，
 * 只断链路、不碰内核子进程——模拟「网断了、服务器上那台还活着」。返回掐断了几条。
 *
 * **占位：任务 8 里真正实现**（要动 `假客户端` 的连接登记表）。现在回 0，好让 typecheck 与协议先成立。
 */
export function 掐断所有假连接(): number {
  return 0
}
