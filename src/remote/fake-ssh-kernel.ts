/**
 * 假服务器上「真起本机内核」的那几条命令（远程内核，2026-09-03）。
 *
 * 准入规则 1：`dev:mock` 与 e2e 没有真服务器，远程内核这条主路径要在 mock 模式下走得通。
 * 假的仍只是「另一端是谁」：内核是**本机真 spawn 的 ipykernel**（路径来自 `DAWN_FAKE_SSH_PYTHON`），
 * connection.json 是它真写的，`forwardOut`（`fake-ssh.ts` 那边）直连本机端口，`kill` 真杀、`rm` 真删。
 * 这样 `kernel-launch.ts` / `tunnel.ts` / `channel.ts` 在 mock 模式下走的全是真代码——假的只有「命令是谁答的」。
 *
 * **没设 `DAWN_FAKE_SSH_PYTHON` 时**：探测事实里那条路径答的是写死的 `/usr/bin/python3`（多半打不开），
 * 起内核那条会如实回 127——不假装能起一台内核。
 *
 * ## 这里的正则为什么不照抄计划文档
 *
 * `kernel-launch.ts` / `interpreters.ts` 里的 shell 单行脚本在写这份计划之后又改过一轮
 * （加了 `setsid`、`</dev/null`；读文件从 `cat` 换成整段 base64；探测命令连 `-c`/`-e` 那个 flag
 * 本身也被单引号包住了）。这里的每一条正则都是照 `kernel-launch.ts`/`interpreters.ts` 里
 * 真正拼出来的字符串反推的，不是照旧版计划文档抄的。
 */
import { spawn, spawnSync } from "node:child_process"
import { existsSync, openSync, readFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export interface 结果 { out: string; err: string; code: number }

const 真python = (): string | undefined => process.env["DAWN_FAKE_SSH_PYTHON"] || undefined

/** 认得就答，认不得返回 undefined 让假机器走它自己那套（127） */
export function 假内核命令(整条: string): 结果 | undefined {
  // 探测事实（interpreters.ts 的 `事实脚本`）：一律用写死的事实作答，不真的探测这台电脑
  if (整条.includes("DAWNFACT_HOME")) {
    const py = 真python() ?? "/usr/bin/python3"
    return { out: `*** 假服务器 ***\nDAWNFACT_HOME=/home/dawn\nDAWNFACT_OS=Linux\nDAWNFACT_PATH_python3=${py}\nDAWNFACT_EXE=${py}\n`, err: "", code: 0 }
  }

  /**
   * 探测某个候选（interpreters.ts 的 `探测远端解释器` → `kernel/probe.ts` 的 `执行`）：
   * `${单引号(cmd)} ${args.map(单引号).join(" ")}` —— **连 `-c`/`-e` 那个 flag 本身也被单引号包住**，
   * 不是 `'<path>' -c '<code>'` 那种半包。真是这样才认得，这条真去 spawn 那条本机 python 探版本与 ipykernel。
   */
  const 探 = /^'([^']+)' '(-c|-e)' '((?:[^']|'\\'')*)'$/.exec(整条.trim())
  if (探) {
    const [, path, flag, code] = 探
    if (path !== 真python()) return { out: "", err: `${path}: command not found（这是一台假服务器）\n`, code: 127 }
    const r = spawnSync(path!, [flag!, code!.replace(/'\\''/g, "'")], { encoding: "utf8", timeout: 8000 })
    return { out: r.stdout ?? "", err: r.stderr ?? "", code: r.status ?? 1 }
  }

  /**
   * 起内核（`kernel-launch.ts` 的 `远端启动命令`，python 分支）：
   * `f="${TMPDIR:-/tmp}/"'<名>'; s=; command -v setsid …; if […]; then …fi; nohup $s '<py>' -m ipykernel_launcher -f "$f" </dev/null >"$f.log" 2>&1 & echo DAWNPID=$!; echo "DAWNFILE=$f"`
   * `-f "$f"` 指向一个不存在的路径，交给**真的** ipykernel 自己写 connection.json——我们不造它的内容。
   */
  const 起 =
    /^f="\$\{TMPDIR:-\/tmp\}\/"'([^']+)'; s=; command -v setsid >\/dev\/null 2>&1 && s=setsid; if \[ -n "\$s" \]; then echo DAWNSETSID=1; else echo DAWNSETSID=0; fi; nohup \$s '([^']+)' -m ipykernel_launcher -f "\$f" <\/dev\/null >"\$f\.log" 2>&1 & echo DAWNPID=\$!; echo "DAWNFILE=\$f"$/.exec(
      整条,
    )
  if (起) {
    const [, 名, path] = 起
    if (path !== 真python()) return { out: "", err: `${path}: No such file or directory\n`, code: 127 }
    const f = join(tmpdir(), 名!)
    const log = openSync(`${f}.log`, "a")
    // detached + unref：这台「假服务器」是同一个 Node 进程，内核不能挂在测试进程的生死上
    const child = spawn(path!, ["-m", "ipykernel_launcher", "-f", f], { detached: true, stdio: ["ignore", log, log] })
    child.unref()
    // `DAWNSETSID` 照这台机器上真有没有 `setsid`答，不硬编成 0 或 1——这条本来就是「这台机器上有没有装 util-linux」
    const 有setsid = spawnSync("sh", ["-c", "command -v setsid"], { encoding: "utf8" }).status === 0
    return { out: `DAWNSETSID=${有setsid ? 1 : 0}\nDAWNPID=${child.pid}\nDAWNFILE=${f}\n`, err: "", code: 0 }
  }

  // 活着？（`kernel-launch.ts` 的 `活着脚本`：`kill -0 … && [ "$(ps -o stat= …)" != "Z" ]`）
  const 活 = /kill -0 (\d+) 2>\/dev\/null && \[ "\$\(ps -o stat=/.exec(整条)
  if (活) return { out: `DAWNALIVE=${活着(Number(活[1])) ? 1 : 0}\n`, err: "", code: 0 }

  /**
   * 读 connection.json（`kernel-launch.ts` 的 `读文件脚本`）：整段 base64 编码带回来，
   * `DAWNRC=0` 先于 `DAWNJSON=` 回声；文件不在答 `DAWNRC=1`；base64 本身失败答 `DAWNRC=2`
   * （这台假机器上 `base64` 命令不会失败，所以这条分支这里用不上，但读不出文件的那条要如实答）。
   */
  const 读 =
    /^if \[ -f '([^']+)' \]; then b=\$\(base64 < '[^']+' \| tr -d '\\n'\) \|\| \{ echo DAWNRC=2; exit 0; \}; echo DAWNRC=0; echo "DAWNJSON=\$b"; else echo DAWNRC=1; fi$/.exec(
      整条.trim(),
    )
  if (读 && 读[1]!.includes("dawn-")) {
    try {
      const 内容 = readFileSync(读[1]!)
      return { out: `DAWNRC=0\nDAWNJSON=${内容.toString("base64")}\n`, err: "", code: 0 }
    } catch {
      return { out: "DAWNRC=1\n", err: "", code: 0 }
    }
  }

  // tail -n 40 '<f>.log' 2>/dev/null（起内核失败时的诊断）
  const 尾 = /^tail -n 40 '([^']+)'/.exec(整条.trim())
  if (尾) {
    try {
      return { out: readFileSync(尾[1]!, "utf8").slice(-4000), err: "", code: 0 }
    } catch {
      return { out: "", err: "", code: 0 }
    }
  }

  /**
   * kill -TERM/-KILL/-INT <pid>，与 rm -f '<f>' '<f>.log'。
   *
   * `停远端内核` 是分两条 exec 发的（先 kill 再 rm），但 `起远端内核` 轮询耗尽时的清理
   * 是**拼在同一条命令里**发的（`kill -KILL <pid> …; rm -f …; true`）——两种都要认得，
   * 所以这里不做互斥：这条命令里有哪个就做哪个。
   */
  const 杀 = /kill -(TERM|KILL|INT) (\d+)/.exec(整条)
  const 删 = /rm -f '([^']+)' '([^']+)'/.exec(整条)
  if (杀 || 删) {
    if (杀) {
      try {
        process.kill(Number(杀[2]), 杀[1] === "TERM" ? "SIGTERM" : 杀[1] === "KILL" ? "SIGKILL" : "SIGINT")
      } catch {
        // 没了就算了
      }
    }
    if (删 && 删[1]!.includes("dawn-")) {
      for (const p of [删[1]!, 删[2]!]) {
        try {
          unlinkSync(p)
        } catch {
          // 本来就没有
        }
      }
    }
    return { out: "", err: "", code: 0 }
  }

  // 测试用例里那条简化的存活确认（没有 `&& [ "$(ps -o stat= …)" ]` 那半句）
  const 杀0 = /^if kill -0 (\d+) 2>\/dev\/null; then echo DAWNALIVE=1; else echo DAWNALIVE=0; fi$/.exec(整条.trim())
  if (杀0) return { out: `DAWNALIVE=${活着(Number(杀0[1])) ? 1 : 0}\n`, err: "", code: 0 }

  // 扫残留（`kernel-launch.ts` 的 `扫残留`）：这台假机器上从来没有真正的残留可扫，答 0 就够诚实
  if (整条.includes("DAWNSWEPT")) return { out: "DAWNSWEPT=0\n", err: "", code: 0 }

  return undefined
}

function 活着(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export { existsSync as 文件在 }
