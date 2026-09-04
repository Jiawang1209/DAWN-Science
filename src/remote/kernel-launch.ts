/**
 * 远端起内核 / 停内核 / 扫残留（远程内核，2026-09-03，spec §形状「远端起停」）。
 *
 * 全是**脚本拼接 + 输出解析**，`exec` 注入进来（生产是 `RemoteLike.exec`，它走的是
 * 捕获过登录环境的 shell——Spike F 纪律 ①）。这里不碰 ssh2、不碰 zeromq。
 *
 * ## 四条纪律的落点（`spikes/FINDINGS.md` Spike F）
 * ② 远端 stdout 混着 MOTD 且顺序没保证：单值一律 `键=值`（`取值`）。
 *    读 connection.json 走 base64 整段编码再 `键=值` 取出来解码（`起远端内核` 里的「读文件脚本」）——
 *    按花括号配对解析在 MOTD 随手带一个 `{` 时就会被带偏，删掉了。`DAWNRC=0` 要**先于** `DAWNJSON=`
 *    回声：`取值` 是不带锚点的首次匹配，万一 base64 载荷里凑巧出现字面 `DAWNRC=` 这几个字符
 *    （字母表允许，虽然概率极低），先回声的那个 `DAWNRC=0` 才是真正会被取到的那个。
 * ③ `pgrep`/`pkill` 会匹配到自己：模式写成 `[d]awn-<id>-`。**`扫残留` 里连 for 循环的 glob 也要同样处理**——
 *    exec 把整条脚本喂给 `bash -c '...'` 跑，那个 wrapper 自己的 cmdline 里原样带着脚本文本（含 glob 那句），
 *    只给 pkill 的正则套方括号不够：wrapper 自己的 cmdline 里那句没转义的 `dawn-<id>-*.json` glob 一样会被
 *    `pkill -f` 命中，脚本还没来得及 `echo DAWNSWEPT` 就把自己杀了，症状是「每次都悄悄报 0」。
 *    同一个坑还有个变种：执行器给每条脚本都包了一层 `echo $$ > /tmp/dawn-run-XXXX.pid` 的 wrapper
 *    （见 `ssh.ts`），装机 id 恰好是 `"run"` 的话，`[d]awn-run-.*\.json` 又会绕回去命中那层 wrapper——
 *    `校验装机id` 索性把这个值也拒了。
 * ④ 杀进程要等它真的没了，僵尸不算活着：`ps -o stat=` 首字母是 `Z` 就当没了。
 *
 * ## 文件是内核自己写的
 * `-f "$f"` 指向一个**不存在**的路径时 ipykernel / IRkernel 会自己挑端口、生成 key、把 connection.json 写在那儿。
 * 我们不上传任何东西（作者硬约束：服务器只有 sshd + 用户自装的内核包）。收摊时把它和同名 `.log` 一起删。
 *
 * ## 内核不能挂在 ssh 通道的 stdin / 进程组上
 * `nohup cmd &` 默认仍然继承调用它的 shell 的标准输入，也仍在同一个进程组里——这是
 * `ssh host 'cmd &'` 挂死连接的经典坑，而且执行器超时/中止时用进程组信号收摊
 * （`ssh.ts` 里 `杀掉` 的 `kill -TERM -"$p"`）会把内核一起带走。`setsid` 把它单独摘成一个新会话
 * （探测不到就退化成不用，覆盖没装 util-linux 的宿主，比如 macOS），`</dev/null` 断开继承的标准输入。
 * 关掉 job control 时 `$s <cmd> &` 里的 `setsid` 是就地 exec，`$!` 拿到的仍是内核自己的 pid。
 */
import type { KernelConnectionInfo } from "../kernel/types.js"
import { 单引号, 取值 } from "./ssh.js"

export type 内核语言 = "python" | "R"

export interface 远端执行 {
  exec(
    command: string,
    options?: { cwd?: string; timeoutSec?: number },
  ): Promise<{ code: number | undefined; stdout: string; stderr: string }>
}

/** 装机 id 会原样拼进 shell 脚本（文件名、glob、pkill 正则）；不校验就是命令注入口子 */
function 校验装机id(装机id: string): void {
  if (!/^[A-Za-z0-9]+$/.test(装机id)) throw new Error(`装机 id 只能是字母数字，收到：${JSON.stringify(装机id)}`)
  // 执行器给每条脚本都包了一层 `echo $$ > /tmp/dawn-run-XXXX.pid` 的 wrapper；装机 id 是
  // "run" 的话，`扫残留` 的 `[d]awn-run-.*\.json` pkill 正则会连那层 wrapper 一起命中。
  if (装机id === "run") throw new Error(`装机 id 不能是 "run"——会撞上执行器自己的 wrapper 脚本`)
}

/** `dawn-<装机id>-<语言>-<时间戳 36 进制>.json`。装机 id 让两台电脑共用一个服务器账号时互不误杀 */
export function 内核文件名(装机id: string, 语言: 内核语言, now = Date.now()): string {
  校验装机id(装机id)
  return `dawn-${装机id}-${语言}-${now.toString(36)}.json`
}

/** 起内核那一条。文件落 `$TMPDIR`（缺省 /tmp）；日志同名 `.log`；回 `DAWNPID` 与 `DAWNFILE` */
export function 远端启动命令(语言: 内核语言, 解释器路径: string, 文件名: string): string {
  const 起 =
    语言 === "python"
      ? `${单引号(解释器路径)} -m ipykernel_launcher -f "$f"`
      : `${单引号(解释器路径)} --slave -e 'IRkernel::main()' --args "$f"`
  return (
    `f="\${TMPDIR:-/tmp}/"${单引号(文件名)}; ` +
    `s=; command -v setsid >/dev/null 2>&1 && s=setsid; ` +
    `if [ -n "$s" ]; then echo DAWNSETSID=1; else echo DAWNSETSID=0; fi; ` +
    `nohup $s ${起} </dev/null >"$f.log" 2>&1 & echo DAWNPID=$!; echo "DAWNFILE=$f"`
  )
}

/** 起来了、但握手之前就死了：日志尾巴是诊断的全部线索 */
export class 远端启动失败 extends Error {
  constructor(message: string, readonly 日志尾: string) {
    super(message)
    this.name = "远端启动失败"
  }
}

export interface 已起的 {
  pid: number
  /** 远端 connection.json 的绝对路径 */
  文件: string
  连接信息: KernelConnectionInfo
  /** 这台机器有没有 `setsid`；没有的话内核跟启动它的 shell 挂在同一进程组，执行器超时/中止会连累它 */
  setsid: boolean
}

export const 活着脚本 = (pid: number) =>
  `if kill -0 ${pid} 2>/dev/null && [ "$(ps -o stat= -p ${pid} 2>/dev/null | cut -c1)" != "Z" ]; then echo DAWNALIVE=1; else echo DAWNALIVE=0; fi`

/**
 * 整段 base64 编码把 connection.json 带回来，`键=值` 一取一解码——MOTD 混进来的花括号不会污染 JSON.parse。
 * `DAWNRC=0` 写在 `DAWNJSON=` 之前（纪律②）；`base64` 本身失败（权限、命令缺失……）就回 `DAWNRC=2`，
 * 让调用方立刻报错，而不是把它当成「文件还没写出来」等到轮询耗尽。
 */
const 读文件脚本 = (文件: string) =>
  `if [ -f ${单引号(文件)} ]; then ` +
  `b=$(base64 < ${单引号(文件)} | tr -d '\\n') || { echo DAWNRC=2; exit 0; }; ` +
  `echo DAWNRC=0; echo "DAWNJSON=$b"; ` +
  `else echo DAWNRC=1; fi`

function 解析连接(json: string): KernelConnectionInfo {
  const o = JSON.parse(json) as Record<string, unknown>
  const 端口 = ["shell_port", "iopub_port", "stdin_port", "control_port", "hb_port"] as const
  for (const k of 端口) if (typeof o[k] !== "number") throw new Error(`connection.json 里 ${k} 不是数字`)
  if (typeof o["key"] !== "string") throw new Error("connection.json 里没有 key")
  return {
    ip: typeof o["ip"] === "string" ? o["ip"] : "127.0.0.1",
    transport: typeof o["transport"] === "string" ? o["transport"] : "tcp",
    key: o["key"],
    signature_scheme: typeof o["signature_scheme"] === "string" ? o["signature_scheme"] : "hmac-sha256",
    ...(typeof o["kernel_name"] === "string" ? { kernel_name: o["kernel_name"] } : {}),
    shell_port: o["shell_port"] as number,
    iopub_port: o["iopub_port"] as number,
    stdin_port: o["stdin_port"] as number,
    control_port: o["control_port"] as number,
    hb_port: o["hb_port"] as number,
  }
}

export async function 起远端内核(
  exec: 远端执行["exec"],
  o: {
    语言: 内核语言
    解释器路径: string
    /** 内核的工作目录 = 起它那一刻会话的远端当前目录（定案 2） */
    cwd: string
    文件名: string
    sleep?: (ms: number) => Promise<void>
    最多轮询?: number
  },
): Promise<已起的> {
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  // 30 次 × 500ms = 15s 在 IRkernel 冷启动（首次编译/加载包）上偏紧；60 次给到 30s 的上限。
  const 最多 = o.最多轮询 ?? 60
  const r = await exec(远端启动命令(o.语言, o.解释器路径, o.文件名), { cwd: o.cwd, timeoutSec: 20 })
  const pid = Number(取值(r.stdout, "DAWNPID"))
  const 文件 = 取值(r.stdout, "DAWNFILE")
  if (!Number.isInteger(pid) || pid <= 0 || !文件) {
    throw new Error(`远端起内核的命令没跑起来（退出码 ${r.code ?? "无"}）：${(r.stderr || r.stdout).trim().split("\n").slice(-5).join("\n")}`)
  }
  const setsid = 取值(r.stdout, "DAWNSETSID") === "1"
  if (!setsid) {
    console.error("[远端内核] 这台机器没有 setsid，内核与启动 shell 同一进程组——执行器超时/中止会连内核一起杀")
  }
  let 最后解析错误: unknown
  for (let i = 0; i < 最多; i++) {
    const 活 = await exec(活着脚本(pid), { timeoutSec: 10 })
    if (取值(活.stdout, "DAWNALIVE") !== "1") {
      const 日志 = await exec(`tail -n 40 ${单引号(`${文件}.log`)} 2>/dev/null; true`, { timeoutSec: 10 })
      throw new 远端启动失败(`远端 ${o.语言} 内核起来就退出了`, 日志.stdout)
    }
    const c = await exec(读文件脚本(文件), { timeoutSec: 10 })
    const rc = 取值(c.stdout, "DAWNRC")
    if (rc === "2") {
      throw new Error(`远端 connection.json 存在但读不出来（base64 失败）：${文件}`)
    }
    if (rc === "0") {
      const b64 = 取值(c.stdout, "DAWNJSON")
      if (b64) {
        try {
          const json = Buffer.from(b64, "base64").toString("utf8")
          return { pid, 文件, 连接信息: 解析连接(json), setsid }
        } catch (e) {
          // 文件可能只写了一半：记下最后一次解析失败，轮询耗尽时带出去；这一轮继续等
          最后解析错误 = e
        }
      }
    }
    await sleep(500)
  }
  // 杀不掉也不抛：清理失败不该盖过原来的错——轮询耗尽本身就是要报的那个错
  await exec(`kill -KILL ${pid} 2>/dev/null; rm -f ${单引号(文件)} ${单引号(`${文件}.log`)}; true`, { timeoutSec: 10 }).catch(() => {})
  const 附加 = 最后解析错误 instanceof Error ? `（最后一次解析失败：${最后解析错误.message}）` : ""
  throw new Error(`远端 ${o.语言} 内核 ${最多} 次轮询内没写出 connection.json——已把它杀掉${附加}`)
}

/** 进程还在不在（SSH `kill -0`，僵尸不算）。**这是心跳的结论**（规格定案 1）：链路不通时抛，调用方当「不知道」 */
export async function 远端活着(exec: 远端执行["exec"], pid: number): Promise<boolean> {
  const r = await exec(活着脚本(pid), { timeoutSec: 10 })
  return 取值(r.stdout, "DAWNALIVE") === "1"
}

/** 接回前的认领（定案 10）：进程活着 **且** connection.json 还在。一条脚本问两件事，少一趟 SSH */
export async function 远端内核还在(exec: 远端执行["exec"], k: { pid: number; 文件: string }): Promise<boolean> {
  const r = await exec(
    `${活着脚本(k.pid)}; if [ -f ${单引号(k.文件)} ]; then echo DAWNFILE=1; else echo DAWNFILE=0; fi`,
    { timeoutSec: 10 },
  )
  return 取值(r.stdout, "DAWNALIVE") === "1" && 取值(r.stdout, "DAWNFILE") === "1"
}

/** 判死之后的收摊（定案 4）：删 json 与 .log。**失败不抛**——文件留给下次扫残留，调用方自己出声 */
export async function 删远端文件(exec: 远端执行["exec"], 文件: string): Promise<void> {
  await exec(`rm -f ${单引号(文件)} ${单引号(`${文件}.log`)}; true`, { timeoutSec: 10 })
}

/** TERM → 等它真没了（僵尸不算活着）→ 等不到就 KILL → 删文件与日志 */
export async function 停远端内核(
  exec: 远端执行["exec"],
  k: { pid: number; 文件: string },
  o: { sleep?: (ms: number) => Promise<void>; 最多等?: number } = {},
): Promise<void> {
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const 最多 = o.最多等 ?? 20
  await exec(`kill -TERM ${k.pid} 2>/dev/null; true`, { timeoutSec: 10 })
  let 没了 = false
  for (let i = 0; i < 最多; i++) {
    const r = await exec(活着脚本(k.pid), { timeoutSec: 10 })
    if (取值(r.stdout, "DAWNALIVE") !== "1") {
      没了 = true
      break
    }
    await sleep(500)
  }
  if (!没了) await exec(`kill -KILL ${k.pid} 2>/dev/null; true`, { timeoutSec: 10 })
  await exec(`rm -f ${单引号(k.文件)} ${单引号(`${k.文件}.log`)}; true`, { timeoutSec: 10 })
}

/**
 * 每次连上先扫：`$TMPDIR/dawn-<装机id>-*.json` 与命令行带它的进程。**只认自己装机 id 的**（定案 4）。
 *
 * **逐文件杀，不再全局 `pkill`**（接回，2026-09-04 定案 11）：`别动` 是这台服务器上等着接回的那几台的文件名，
 * 它们要留着。全局 `pkill -f '[d]awn-<id>-.*\.json'` 分不出「上次留下的」与「等着接回的」，
 * 所以改成对每个不在名单上的 json 按 `basename` 精确 `pkill`。glob 与模式都带 `[d]`（自噬那条坑，见文件头 ③）；
 * `"[d]${b#d}"` 在 wrapper 的 cmdline 里是这七个字面字符，不会被自己命中。
 */
export async function 扫残留(
  exec: 远端执行["exec"],
  装机id: string,
  别动: readonly string[] = [],
): Promise<{ 清了: number }> {
  校验装机id(装机id)
  for (const f of 别动) {
    if (!/^dawn-[A-Za-z0-9]+-(python|R)-[a-z0-9]+\.json$/.test(f)) {
      throw new Error(`「别动」名单里的文件名不合法：${JSON.stringify(f)}`)
    }
  }
  const 跳过 = 别动.length ? `case "$(basename "$f")" in ${别动.map(单引号).join("|")}) continue;; esac; ` : ""
  const 脚本 =
    `n=0; for f in "\${TMPDIR:-/tmp}"/[d]awn-${装机id}-*.json; do [ -e "$f" ] || continue; ${跳过}` +
    `n=$((n+1)); b=$(basename "$f"); pkill -9 -f "[d]\${b#d}" 2>/dev/null; rm -f "$f" "$f.log"; done; echo DAWNSWEPT=$n`
  const r = await exec(脚本, { timeoutSec: 10 })
  return { 清了: Number(取值(r.stdout, "DAWNSWEPT")) || 0 }
}
