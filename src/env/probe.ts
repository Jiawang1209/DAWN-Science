/**
 * 机器环境的探测（②-B · R5，2026-08-13）。
 *
 * ## 一条脚本，两个执行器
 *
 * 本地与远端**共用这一份脚本和这一份解析**，区别只在谁去跑它。
 * 写两份的话，「本地跟远端环境一样吗」这个问题会先败在
 * 「两边采集的字段不一样」上——而那正是 ②-B 判据要回答的问题。
 *
 * ## 为什么必须是登录 shell（Spike F 纪律 1）
 *
 * ssh2 的 `exec` 给的是非登录非交互 shell，不读 `~/.bashrc`；
 * GUI 里起来的 Electron 同样拿不到用户 shell 里的 PATH。
 * 两处的后果一样，而且不是「跑不了」这种看得见的失败——
 * **是看到了另一台机器**：作者装好的 `ipykernel` 在探测眼里不存在。
 *
 * 远端那边这条纪律**已经落在 `RemoteExecutor` 里**（连接时 `bash -lc` 捕获一次
 * 登录环境，之后每条命令带着它跑），所以这里不再写第二遍——
 * 同一条规则有两个家，迟早有一个先坏。**本地那条在 `本地执行` 里补上。**
 *
 * ## 为什么是 `键=值`（Spike F 纪律 2）
 *
 * 远端 stdout 里混着 MOTD，**而且它与我们的输出是交错到达的**
 * （Spike F 实测：横幅出现在两个分隔标记*中间*）。所以不靠行号、不靠位置、
 * 也不靠「第一行是什么」——只靠一个自造的键名。键一律带 `dawn_` 前缀。
 *
 * ## 探不到就不给
 *
 * 每一项都可能探不到：精简容器里没有 `/etc/os-release`，没有 `nproc`，
 * 甚至没有 `git`。**那时这个字段整个不出现**，而不是填 `"unknown"` 或空串——
 * 缺字段读作「不知道」，`"unknown"` 会被当成一个真的值参与比对。
 *
 * ## 一个环境变量都不采
 *
 * 沿用 S17 的禁令。快照是要被分享出去的：`PATH` 泄露目录结构，
 * `*_API_KEY` 更糟。「用了哪个 conda 环境」记解释器路径就够了。
 */
import { execFile } from "node:child_process"
import { 单引号, 取值 } from "../remote/ssh.js"
import type { ShellEnvironment, ToolRecord } from "./snapshot.js"

/** 要看 PATH 上有没有的工具。**只收计划 R5 点名的那三个** */
const 要看的工具 = ["python3", "R", "git"] as const

/**
 * 探测脚本。
 *
 * **每一条都自带兜底且吞掉 stderr**：探不到时应当什么都不打印，
 * 而不是让一句 `nproc: command not found` 混进输出里被当成值。
 *
 * `2>/dev/null` 之外还有一层 `|| true`：有的 shell 在 `set -e` 下
 * 会因为一条失败的命令直接退出，那样**后面的字段会全部消失**，
 * 而症状看起来像「这台机器什么都探不到」。
 */
export function 探测脚本(workspace?: string): string {
  const 行: string[] = [
    `echo "dawn_os=$(uname -s 2>/dev/null || true)"`,
    `echo "dawn_osrelease=$(uname -r 2>/dev/null || true)"`,
    `echo "dawn_arch=$(uname -m 2>/dev/null || true)"`,
    /**
     * 发行版：Linux 看 os-release，macOS 没有这个文件，退到 `sw_vers`。
     *
     * **每一支都必须产出单行**（2026-08-13 真机上抓到的）。上一版写的是
     * `A || B || true | tr '\n' ' '`——而 shell 里 `|` 比 `||` 结合得紧，
     * 那个 `tr` 只作用在 `true` 上。于是 macOS 那支的两行原样进了 `echo`：
     * `取值` 只取到第一行「macOS」，**版本号被悄悄截掉，多出来的那行还漏进了输出**。
     *
     * 现在用 `printf` 直接拼成一行，不产生换行，也就不需要事后去擦。
     */
    `echo "dawn_distro=$( (. /etc/os-release 2>/dev/null && printf '%s' "$PRETTY_NAME") || printf '%s %s' "$(sw_vers -productName 2>/dev/null)" "$(sw_vers -productVersion 2>/dev/null)" || true )"`,
    `echo "dawn_cpus=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || true)"`,
    // 内存：Linux 的 MemTotal 单位就是 KiB；macOS 的 hw.memsize 是字节，换算成 KiB
    `echo "dawn_memkib=$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || ( [ -n "$(sysctl -n hw.memsize 2>/dev/null)" ] && expr $(sysctl -n hw.memsize) / 1024 ) 2>/dev/null || true)"`,
  ]
  for (const t of 要看的工具) {
    行.push(`echo "dawn_tool_${键名(t)}_path=$(command -v ${t} 2>/dev/null || true)"`)
    /**
     * **版本要它自己报，不从路径猜。** `/usr/bin/python3` 是哪个版本，
     * 路径上一个字都没写；猜出来的版本会被当成事实记进证据里。
     *
     * 只取第一行：`R --version` 会打一整段许可证声明。
     */
    行.push(
      `echo "dawn_tool_${键名(t)}_ver=$(command -v ${t} >/dev/null 2>&1 && ${t} --version 2>&1 | head -n 1 || true)"`,
    )
  }
  if (workspace) {
    行.push(
      `echo "dawn_gitrepo=$(git -C ${单引号(workspace)} rev-parse --is-inside-work-tree 2>/dev/null || true)"`,
    )
  }
  return 行.join("\n")
}

/** `R` 里有大写，键名统一压成小写；工具名本身照原样记进快照 */
function 键名(工具: string): string {
  return 工具.toLowerCase()
}

/**
 * 把探测输出解析成一份快照。
 *
 * `where` 与 `workspace` **不是探来的**——它们是我们自己知道的事实
 * （这条连接是谁、这次观察的是哪个目录）。让机器自报身份反而不可靠：
 * 两台机器可以同名。
 */
export function 解析探测(
  stdout: string,
  where: ShellEnvironment["where"],
  workspace?: string,
): ShellEnvironment {
  const 出: ShellEnvironment = { kind: "shell", where }

  const os = 非空(取值(stdout, "dawn_os"))
  if (os) 出.os = os
  const rel = 非空(取值(stdout, "dawn_osrelease"))
  if (rel) 出.osRelease = rel
  const arch = 非空(取值(stdout, "dawn_arch"))
  if (arch) 出.arch = arch
  const distro = 非空(取值(stdout, "dawn_distro"))
  if (distro) 出.distro = distro

  const cpus = 正整数(取值(stdout, "dawn_cpus"))
  if (cpus !== undefined) 出.cpus = cpus
  const mem = 正整数(取值(stdout, "dawn_memkib"))
  if (mem !== undefined) 出.memoryKib = mem

  const 工具: Record<string, ToolRecord> = {}
  for (const t of 要看的工具) {
    const path = 非空(取值(stdout, `dawn_tool_${键名(t)}_path`))
    if (!path) continue
    const ver = 非空(取值(stdout, `dawn_tool_${键名(t)}_ver`))
    // **路径有、版本没有是一个合法状态**：有的工具不认 `--version`。
    // 那时如实只记路径
    工具[t] = ver ? { path, version: ver } : { path }
  }
  if (Object.keys(工具).length > 0) 出.tools = 工具

  if (workspace) {
    出.workspace = workspace
    const 是仓库 = 非空(取值(stdout, "dawn_gitrepo"))
    /**
     * **只认 `true`；探不到就不给这个字段。**
     *
     * `git` 不存在、目录不存在、没权限——这三种都会让它探不到，
     * 而它们都不等于「这不是一个 git 仓库」。写一个 `false` 上去，
     * 就是把「不知道」记成了一条确定的事实（不变式 5）。
     */
    if (是仓库 === "true") 出.workspaceIsGitRepo = true
    else if (是仓库 === "false") 出.workspaceIsGitRepo = false
  }
  return 出
}

/** 空串与只有空白都算「没探到」。**它们不是值** */
function 非空(s: string | undefined): string | undefined {
  const t = s?.trim()
  return t ? t : undefined
}

function 正整数(s: string | undefined): number | undefined {
  const t = 非空(s)
  if (!t) return undefined
  const n = Number.parseInt(t, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** 跑一条命令拿 stdout。远端是 `RemoteExecutor.exec`，本地是下面那个 */
export type 执行一条 = (command: string) => Promise<{ stdout: string }>

/**
 * 探一台机器。
 *
 * **失败不抛，返回 undefined。** 探不到环境不该让「连上」这件事失败——
 * 但也**不能返回一个空快照顶上**：那等于宣称「这台机器什么都没有」。
 * 上层据此如实说「这次没探到环境」（不变式 3：失败要出声）。
 */
export async function 探测机器(
  执行: 执行一条,
  where: ShellEnvironment["where"],
  workspace?: string,
): Promise<ShellEnvironment | undefined> {
  try {
    const { stdout } = await 执行(探测脚本(workspace))
    const snap = 解析探测(stdout, where, workspace)
    /**
     * **一个字段都没探到 = 没探到。**
     *
     * 只剩 `kind` 与 `where` 的那份快照没有任何证据价值，
     * 存进去只会让「这次运行有环境快照」这句话变成假的。
     */
    if (snap.os === undefined && snap.arch === undefined && snap.tools === undefined) {
      return undefined
    }
    return snap
  } catch {
    return undefined
  }
}

/**
 * 本地执行器：**走登录 shell**。
 *
 * 与远端同一条理由。GUI 里起来的 Electron 拿到的 PATH 常常不是用户
 * 在终端里看到的那套（macOS 上尤其），不走 `-l` 的话记下来的是
 * **另一台机器**——同一台电脑，另一套 PATH。
 */
export const 本地执行: 执行一条 = (command) =>
  new Promise((resolve, reject) => {
    execFile(
      "bash",
      ["-lc", command],
      { maxBuffer: 4 * 1024 * 1024, timeout: 20_000 },
      (err, stdout) => {
        // **有 stdout 就用**：`bash -lc` 里某一条失败不代表整次探测失败，
        // 而我们的脚本每条都自带兜底
        if (stdout) resolve({ stdout })
        else if (err) reject(err)
        else resolve({ stdout: "" })
      },
    )
  })
