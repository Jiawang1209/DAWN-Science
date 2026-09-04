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
 *
 * ## 探测那条会挡住这个进程一小会（审查反馈）
 *
 * `探` 分支的 `spawnSync` 最多等 8 秒（`kernel/probe.ts` 的 `超时毫秒`）——这台「假机器」
 * 是同一个 Node 进程，`spawnSync` 是**同步阻塞**的，所以每探一个候选，这个进程连同它上面
 * 跑着的所有别的假连接都会卡住到 8 秒。mock 模式下候选通常只有一个（`DAWN_FAKE_SSH_PYTHON`
 * 指的那条），可以接受；真要探好几个候选、又赶上它们真的卡住不应答，这条尾巴才会显出来。
 */
import { spawn, spawnSync } from "node:child_process"
import { basename, join } from "node:path"
import { closeSync, existsSync, openSync, readdirSync, readFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"

export interface 结果 { out: string; err: string; code: number }

const 真python = (): string | undefined => process.env["DAWN_FAKE_SSH_PYTHON"] || undefined

/**
 * 这台假机器上真为它 spawn 过的 pid，按 connection.json 的**文件名**（不含目录）记。
 * `扫残留` 与「起内核失败自己清理」都要靠它才能真的杀对进程——**不记的话扫残留只能删文件、
 * 杀不到进程**，那与「说自己扫过了」不是一回事（准入规则 1：mock 不能说谎）。
 */
const 内核进程 = new Map<string, number>()

/**
 * `command -v setsid` 探一次就够——**这台机器有没有装 util-linux 不会在一次测试运行期间变**。
 * 每次起内核都真 `spawnSync` 一次纯属浪费。
 */
let setsid缓存: boolean | undefined

/**
 * **测试专用**：`DAWNSWEPT` 那条回声前刻意等这么多毫秒。默认 0（不等）。
 *
 * 单是「扫残留先于起内核」这条判据本身**证不了什么**——`跑()` 里内核那几条的分发顺序
 * 天生就是先认扫残留、`interpreterOf` 也天生先发扫残留的 exec 请求，所以不管
 * `wiring.ts` 里那句 `await 扫过.get(cid)` 在不在，两条命令抵达假服务器的**先后**都不会变，
 * 命令记录里的顺序永远是「扫在前」——判据测的是「谁先被发出去」，不是「谁先跑完」。
 * 只有让扫残留的**响应**明显滞后，才能让「没等它跑完就发了下一条」这件事在记录顺序里露出来
 * （`fake-ssh.ts` 的 `c.exec` 用它决定这条命令的 `setTimeout` 延迟）。见
 * `tests/electron/remote-kernel.test.ts`：那条用例把它调到几百毫秒，
 * 靠这个把「删掉 `await` 会不会真的红」这件事变得可验证。
 */
let 扫延迟ms = 0
export function 设扫残留延迟(ms: number): void {
  扫延迟ms = ms
}
export function 扫残留延迟(): number {
  return 扫延迟ms
}

/**
 * 认得就答，认不得返回 undefined 让假机器走它自己那套（127）。
 *
 * @param cwd 这条命令的当前目录（`fake-ssh.ts` 的 `跑()` 早于这次改动就已经从 `cd '<路径>'`
 *   前缀里解出来了，见 `当前` 那个变量）。**起内核要用它**：定案 2 说内核的工作目录是
 *   起它那一刻会话所在的目录，真 SSH 是靠先 `cd` 再 `nohup` 做到的；这台假机器不走 shell，
 *   不把它转成 `spawn` 的 `cwd` 的话，内核会长在这个测试进程自己的 cwd 上——不是同一件事。
 */
export function 假内核命令(整条: string, cwd?: string): 结果 | undefined {
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
    /**
     * 定案 2：内核的工作目录是起它那一刻会话所在的目录。真 SSH 靠 shell 先 `cd` 做到；
     * 这台假机器不走 shell，接上 `spawn` 的 `cwd` 才不会让内核长在测试进程自己的目录上。
     *
     * **但只在那条路径这台机器上真的存在时才用**——假服务器的「家目录」是虚构的
     * `/home/dawn`（`fake-ssh.ts` 里那个常量），这台真机器上通常没有这个目录，
     * `spawn` 收到一个不存在的 `cwd` 会直接 ENOENT，内核连起都起不来。
     * 落到本机文件系统上真实存在的路径（e2e/mock 传的 scratch 目录、真实工作区）就用它；
     * 落在虚构路径上就不给 `cwd`，退回这个测试进程自己的当前目录——那不完全对，
     * 但总比让内核压根起不来要诚实。
     */
    const 真cwd = cwd && existsSync(cwd) ? cwd : undefined
    const child = spawn(path!, ["-m", "ipykernel_launcher", "-f", f], {
      detached: true,
      stdio: ["ignore", log, log],
      ...(真cwd ? { cwd: 真cwd } : {}),
    })
    // 子进程已经把这个 fd 复制过去了，父进程这边的句柄留着不关就是一个真的 fd 泄漏（审查反馈）
    closeSync(log)
    child.unref()
    内核进程.set(名!, child.pid!)
    child.once("exit", () => {
      if (内核进程.get(名!) === child.pid) 内核进程.delete(名!)
    })
    setsid缓存 ??= spawnSync("sh", ["-c", "command -v setsid"], { encoding: "utf8" }).status === 0
    return { out: `DAWNSETSID=${setsid缓存 ? 1 : 0}\nDAWNPID=${child.pid}\nDAWNFILE=${f}\n`, err: "", code: 0 }
  }

  /**
   * R 那条（`kernel-launch.ts` 的 `远端启动命令`，R 分支：`'<Rscript>' --slave -e 'IRkernel::main()' --args "$f"`）。
   * **这台假机器只会真起 python 内核**——`DAWN_FAKE_SSH_PYTHON` 是唯一接进来的真解释器。
   * 认不出这条就静默落到最后 `return undefined`、外层假机器再回一个笼统的 127，
   * 那和「这台机器没装 R」长得一模一样，会把「R 内核压根没接」的坑晾在那儿没人发现——
   * 所以这里单独认出这个形状，回一句能一眼看出「不是没装 R，是这台假机器压根不支持」的话。
   */
  if (/^f="\$\{TMPDIR:-\/tmp\}\/"'[^']+'; s=; command -v setsid .*--slave -e 'IRkernel::main\(\)' --args "\$f"/.test(整条)) {
    return { out: "", err: "假服务器只会起 python 内核\n", code: 127 }
  }

  /**
   * 活着 + 文件在（`kernel-launch.ts` 的 `远端内核还在`，接回前的认领，定案 10）：
   * `<活着脚本>; if [ -f '<文件>' ]; then echo DAWNFILE=1; else echo DAWNFILE=0; fi` 是**一条**命令，
   * 两个键都要答。
   *
   * **必须排在下面那条「活着？」之前**：那条的正则只认前半句，先撞上它就只答 `DAWNALIVE`，
   * 调用方取不到 `DAWNFILE` 于是一律断定「内核没了」——mock 模式下接回永远失败，
   * 而且失败得悄无声息（看起来就像内核真的死了）。
   */
  const 在 =
    /kill -0 (\d+) 2>\/dev\/null && \[ "\$\(ps -o stat=.*; if \[ -f '([^']+)' \]; then echo DAWNFILE=1; else echo DAWNFILE=0; fi$/.exec(
      整条.trim(),
    )
  if (在) {
    return {
      out: `DAWNALIVE=${活着(Number(在[1])) ? 1 : 0}\nDAWNFILE=${existsSync(在[2]!) ? 1 : 0}\n`,
      err: "",
      code: 0,
    }
  }

  /**
   * 活着？（`kernel-launch.ts` 的 `活着脚本`：`kill -0 … && [ "$(ps -o stat= …)" != "Z" ]`）
   *
   * **问了 `DAWNFILE` 的不走这条**：那是上面那条合并脚本，只是形状对不上（比如文件名里有引号，
   * `单引号()` 转成 `'\''` 把 `[^']+` 拆散了）。那时宁可整条认不得、如实落到 127 让调用方报错，
   * 也不能只答一半——少答一个键，调用方会把它读成「内核没了」，而那是一句悄无声息的谎。
   */
  const 活 = 整条.includes("DAWNFILE=") ? null : /kill -0 (\d+) 2>\/dev\/null && \[ "\$\(ps -o stat=/.exec(整条)
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
      内核进程.delete(basename(删[1]!))
    }
    return { out: "", err: "", code: 0 }
  }

  // 测试用例里那条简化的存活确认（没有 `&& [ "$(ps -o stat= …)" ]` 那半句）
  const 杀0 = /^if kill -0 (\d+) 2>\/dev\/null; then echo DAWNALIVE=1; else echo DAWNALIVE=0; fi$/.exec(整条.trim())
  if (杀0) return { out: `DAWNALIVE=${活着(Number(杀0[1])) ? 1 : 0}\n`, err: "", code: 0 }

  /**
   * 扫残留（`kernel-launch.ts` 的 `扫残留`）：`DAWNSWEPT=0` 一律写死曾经是这里的实现，
   * **那是一句谎**——它让「扫残留先于起内核完成」这类判据即使真的失效也测不出来
   * （审查反馈：假的要是连自己该干的活都不干，就不配叫「假的」，是「空的」）。
   * 这里真扫：从脚本里认出装机 id，`readdirSync` 找同一个 id 的 `dawn-<id>-*.json`，
   * 有记着 pid 的真 `SIGKILL`（`pkill -9` 那半），文件真删（`rm -f` 那半），数真数出来。
   */
  if (整条.includes("DAWNSWEPT")) {
    const id = /\[d\]awn-([A-Za-z0-9]+)-\*\.json/.exec(整条)?.[1]
    /**
     * 装机 id 认不出来就**不扫**（审查反馈 2026-09-05）。
     * 从前这里落到 `DAWNSWEPT=0`：那是又一句没人验过的写死答案——脚本的 glob 改一个字，
     * 「每次连上先扫」这条路在 mock 下就整条空转，而回执还说「扫过了，一台残留都没有」。
     * 认不得就如实回 127，让不匹配当场出声。
     */
    if (!id) {
      return { out: "", err: `假服务器：扫残留脚本里认不出装机 id，不敢扫——${整条}\n`, code: 127 }
    }
    /**
     * 「别动」名单（接回，定案 11）：脚本里是 `case "$(basename "$f")" in 'a'|'b') continue;; esac`。
     * **真跳过**——不杀、不删、也不计数。只把它从计数里减掉而照样删文件，是同一句谎的新版本：
     * 「接回时把等着被认领的内核扫掉了」这个真 bug 会在一片绿里活下来。
     *
     * **认得出名单在那儿、却读不出来，就一个都不动**（审查反馈 2026-09-05，与合并探测脚本那条同一个规矩）：
     * 措辞归 `kernel-launch.ts` 管，只差一对引号这条正则就匹配不上，于是名单被读成空的——
     * 等着接回的那台内核的 connection.json 被删、进程被 SIGKILL，回执却是 `DAWNSWEPT=1` 加退出码 0。
     * 那是一句**会毁状态**的谎，正是这台假机器存在的理由要挡的那一类。
     * 判据：命令里有 `case` 就说明真脚本拼了名单（不带名单的那条只有 `b=$(basename "$f")`，没有 `case`）。
     */
    const 名单原文 = /case "\$\(basename "\$f"\)" in ((?:'[^']+'\|?)+)\) continue;; esac/.exec(整条)?.[1]
    if (名单原文 === undefined && /\bcase\b/.test(整条)) {
      return {
        out: "",
        err: `假服务器：扫残留脚本里有「别动」名单但读不出来，不敢扫（扫了就会把等着接回的内核删掉）——${整条}\n`,
        code: 127,
      }
    }
    const 名单 = new Set(
      (名单原文 ?? "")
        .split("|")
        .map((s) => s.replace(/^'|'$/g, ""))
        .filter(Boolean),
    )
    let n = 0
    const 前缀 = `dawn-${id}-`
    const 目录 = tmpdir()
    for (const 名 of readdirSync(目录)) {
      if (!名.startsWith(前缀) || !名.endsWith(".json")) continue
      if (名单.has(名)) continue
      n++
      const pid = 内核进程.get(名)
      if (pid !== undefined) {
        try {
          process.kill(pid, "SIGKILL")
        } catch {
          // 没了就算了
        }
        内核进程.delete(名)
      }
      for (const p of [join(目录, 名), join(目录, `${名}.log`)]) {
        try {
          unlinkSync(p)
        } catch {
          // 本来就没有
        }
      }
    }
    return { out: `DAWNSWEPT=${n}\n`, err: "", code: 0 }
  }

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

/**
 * **测试专用开关**（`fakeSshControl{do:"killKernels"}`，接回 7.31）——与 `重置假机器()`、`跑过的命令()`
 * 同一个性质：生产代码不叫它，只有 e2e / mock 用来把一件真实世界里的事演一遍。
 *
 * 演的是**集群 OOM**：对这台假机器起过的所有内核子进程真发 `SIGKILL`，
 * DAWN 这边什么都不会被告知（没有 exit 事件、链路照旧好着），只能靠心跳察觉——这正是定案 1 要验的那条路。
 *
 * **connection.json 不删**：真被 OOM 杀掉的内核不会顺手清理自己的文件，
 * 那些文件是判死收摊（定案 4）或下一次扫残留的活。这里替它删掉，就等于替被测代码把活干了。
 *
 * **作用域是整个进程**：杀的是这台假机器（模块级的 `内核进程` 那张表）起过的所有内核，
 * 不是「某一条连接的」——`dev:mock` 与 e2e 里同一个进程可以连着好几台假服务器，
 * 它们的内核全记在同一张表上。写多服务器的用例别照单用它
 * （`e2e/remote-kernel.spec.ts` 的 `假服务器开关` 那段注释说的是同一件事）。
 *
 * 返回真杀掉了几台（`process.kill` 抛了的不算——那台本来就已经没了）。
 */
export function 杀掉所有假内核(): number {
  let n = 0
  for (const [名, pid] of [...内核进程]) {
    try {
      process.kill(pid, "SIGKILL")
      n++
    } catch {
      // 已经没了
    }
    内核进程.delete(名)
  }
  return n
}
