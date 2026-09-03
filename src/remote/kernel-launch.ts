/**
 * 远端起内核 / 停内核 / 扫残留（远程内核，2026-09-03，spec §形状「远端起停」）。
 *
 * 全是**脚本拼接 + 输出解析**，`exec` 注入进来（生产是 `RemoteLike.exec`，它走的是
 * 捕获过登录环境的 shell——Spike F 纪律 ①）。这里不碰 ssh2、不碰 zeromq。
 *
 * ## 四条纪律的落点（`spikes/FINDINGS.md` Spike F）
 * ② 远端 stdout 混着 MOTD 且顺序没保证：单值一律 `键=值`（`取值`），多行 JSON 取最外层花括号（`取花括号`）。
 * ③ `pgrep`/`pkill` 会匹配到自己：模式写成 `[d]awn-<id>-`。
 * ④ 杀进程要等它真的没了，僵尸不算活着：`ps -o stat=` 首字母是 `Z` 就当没了。
 *
 * ## 文件是内核自己写的
 * `-f "$f"` 指向一个**不存在**的路径时 ipykernel / IRkernel 会自己挑端口、生成 key、把 connection.json 写在那儿。
 * 我们不上传任何东西（作者硬约束：服务器只有 sshd + 用户自装的内核包）。收摊时把它和同名 `.log` 一起删。
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

/** `dawn-<装机id>-<语言>-<时间戳 36 进制>.json`。装机 id 让两台电脑共用一个服务器账号时互不误杀 */
export function 内核文件名(装机id: string, 语言: 内核语言, now = Date.now()): string {
  return `dawn-${装机id}-${语言}-${now.toString(36)}.json`
}

/** 起内核那一条。文件落 `$TMPDIR`（缺省 /tmp）；日志同名 `.log`；回 `DAWNPID` 与 `DAWNFILE` */
export function 远端启动命令(语言: 内核语言, 解释器路径: string, 文件名: string): string {
  const 起 =
    语言 === "python"
      ? `${单引号(解释器路径)} -m ipykernel_launcher -f "$f"`
      : `${单引号(解释器路径)} --slave -e 'IRkernel::main()' --args "$f"`
  return `f="\${TMPDIR:-/tmp}/${文件名}"; nohup ${起} >"$f.log" 2>&1 & echo DAWNPID=$!; echo "DAWNFILE=$f"`
}

/** 最外层那对花括号之间的东西。MOTD 在前在后在中间都不管——只要它不含花括号 */
export function 取花括号(out: string): string | undefined {
  const a = out.indexOf("{")
  const b = out.lastIndexOf("}")
  if (a < 0 || b <= a) return undefined
  return out.slice(a, b + 1)
}

/** 起来了、但握手之前就死了：日志尾巴是诊断的全部线索 */
export class 远端启动失败 extends Error {
  constructor(message: string, readonly 日志尾: string) {
    super(message)
  }
}

export interface 已起的 {
  pid: number
  /** 远端 connection.json 的绝对路径 */
  文件: string
  连接信息: KernelConnectionInfo
}

const 活着脚本 = (pid: number) =>
  `if kill -0 ${pid} 2>/dev/null && [ "$(ps -o stat= -p ${pid} 2>/dev/null | cut -c1)" != "Z" ]; then echo DAWNALIVE=1; else echo DAWNALIVE=0; fi`

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
  const 最多 = o.最多轮询 ?? 30
  const r = await exec(远端启动命令(o.语言, o.解释器路径, o.文件名), { cwd: o.cwd, timeoutSec: 20 })
  const pid = Number(取值(r.stdout, "DAWNPID"))
  const 文件 = 取值(r.stdout, "DAWNFILE")
  if (!Number.isInteger(pid) || pid <= 0 || !文件) {
    throw new Error(`远端起内核的命令没跑起来（退出码 ${r.code ?? "无"}）：${(r.stderr || r.stdout).trim().split("\n").slice(-5).join("\n")}`)
  }
  for (let i = 0; i < 最多; i++) {
    const 活 = await exec(活着脚本(pid))
    if (取值(活.stdout, "DAWNALIVE") !== "1") {
      const 日志 = await exec(`tail -n 40 ${单引号(`${文件}.log`)} 2>/dev/null; true`)
      throw new 远端启动失败(`远端 ${o.语言} 内核起来就退出了`, 日志.stdout)
    }
    const c = await exec(`cat ${单引号(文件)} 2>/dev/null; echo DAWNRC=$?`)
    const json = 取值(c.stdout, "DAWNRC") === "0" ? 取花括号(c.stdout) : undefined
    if (json) {
      try {
        return { pid, 文件, 连接信息: 解析连接(json) }
      } catch {
        // 文件可能只写了一半，下一轮再读
      }
    }
    await sleep(500)
  }
  await exec(`kill -KILL ${pid} 2>/dev/null; rm -f ${单引号(文件)} ${单引号(`${文件}.log`)}; true`).catch(() => {})
  throw new Error(`远端 ${o.语言} 内核 ${最多} 次轮询内没写出 connection.json——已把它杀掉`)
}

/** TERM → 等它真没了（僵尸不算活着）→ 等不到就 KILL → 删文件与日志 */
export async function 停远端内核(
  exec: 远端执行["exec"],
  k: { pid: number; 文件: string },
  o: { sleep?: (ms: number) => Promise<void>; 最多等?: number } = {},
): Promise<void> {
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const 最多 = o.最多等 ?? 20
  await exec(`kill -TERM ${k.pid} 2>/dev/null; true`)
  let 没了 = false
  for (let i = 0; i < 最多; i++) {
    const r = await exec(活着脚本(k.pid))
    if (取值(r.stdout, "DAWNALIVE") !== "1") {
      没了 = true
      break
    }
    await sleep(500)
  }
  if (!没了) await exec(`kill -KILL ${k.pid} 2>/dev/null; true`)
  await exec(`rm -f ${单引号(k.文件)} ${单引号(`${k.文件}.log`)}; true`)
}

/** 每次连上先扫：`$TMPDIR/dawn-<装机id>-*.json` 与命令行带它的进程。**只认自己装机 id 的**（定案 4） */
export async function 扫残留(exec: 远端执行["exec"], 装机id: string): Promise<{ 清了: number }> {
  const 脚本 =
    `n=0; for f in "\${TMPDIR:-/tmp}"/dawn-${装机id}-*.json; do [ -e "$f" ] || continue; n=$((n+1)); rm -f "$f" "$f.log"; done; ` +
    `pkill -9 -f '[d]awn-${装机id}-' 2>/dev/null; echo DAWNSWEPT=$n`
  const r = await exec(脚本)
  return { 清了: Number(取值(r.stdout, "DAWNSWEPT")) || 0 }
}
