/**
 * 怎么把一个 ACP 适配器**起起来**（A1，2026-08-16）。
 *
 * 单独一个文件，因为这件事**整个是跨平台问题**，而它与协议无关。
 * 作者：*「我这个 App 是要打包为 windows, mac, linux 三个平台的本地软件的，
 * 因此我们开发要考虑这个条件。」*
 *
 * ## 三条，每一条都在某个平台上会咬人
 *
 * ### 一、`npx` 在 Windows 上不叫 `npx`
 *
 * 它是 `npx.cmd`。`child_process.spawn` **不走 shell**（走 shell 是命令注入的门），
 * 于是 `spawn("npx")` 在 Windows 上直接 ENOENT——
 * 而症状是「加了 agent，一点就说起不来」，没人会想到是三个字母的事。
 * wisp 的文档也踩过，它写着 *「on Windows prefer `npx.cmd`」*——
 * **但那是让用户自己去填**。我们替他填。
 *
 * ### 二、更该做的是**根本不依赖用户的 Node**
 *
 * 适配器是 npm 包，得有 Node 才跑得起来。而一个打包好的桌面应用，
 * **不能假设用户装过 Node**——那是开发者才有的东西。
 *
 * Electron 自己带着 Node：把 `ELECTRON_RUN_AS_NODE=1` 交给
 * `process.execPath`，它就是一个纯 Node。于是
 * `node <适配器入口>` 这条路**在三个平台上都不需要用户装任何东西**。
 *
 * 所以命令有两种写法，**由配置里的 `command` 决定，不猜**：
 *
 * ```yaml
 * # ① 用户自己的 npx（要装 Node；我们负责在 Windows 上补 .cmd）
 * command: npx
 * args: ["-y", "@agentclientprotocol/codex-acp"]
 *
 * # ② 我们带的 Node 跑一个已经装好的入口（不要求用户装 Node）
 * command: node
 * args: ["/…/node_modules/@agentclientprotocol/codex-acp/dist/index.js"]
 * ```
 *
 * 第二种里 `node` 是一个**记号**，不是去 PATH 上找 node——
 * 我们把它换成 `process.execPath` 并带上 `ELECTRON_RUN_AS_NODE`。
 * 记号写成 `node` 而不是别的，是因为**人照着文档抄的就是这个词**。
 *
 * ### 三、Windows 上杀不干净
 *
 * POSIX 上 `kill(-pid)` 能连着整个进程组一起收（`pty.ts` 里那套）。
 * **Windows 没有进程组**，`npx` 起的是一棵树（npx → node → 适配器），
 * 杀掉 npx 只会留下孤儿，而那个孤儿还占着 stdio。
 * 那边得走 `taskkill /T /F`。
 */
import { spawn, type ChildProcess } from "node:child_process"

export interface 起法 {
  command: string
  args: readonly string[]
  cwd: string
  /** 可注入，测试用。生产走 `process.platform` */
  platform?: NodeJS.Platform
  /** 可注入，测试用。生产走 `process.execPath` */
  execPath?: string
}

/** 算出真正要执行的 argv 与环境。**纯函数**——三个平台都能在一台机器上验 */
export function 算命令(起: 起法): {
  command: string
  args: string[]
  env: Record<string, string | undefined>
} {
  const platform = 起.platform ?? process.platform
  const execPath = 起.execPath ?? process.execPath

  /**
   * `node` 是记号：**换成我们自己带的那个**，于是用户不需要装 Node。
   * `ELECTRON_RUN_AS_NODE` 让 Electron 的二进制表现为纯 Node
   * （不开窗口、不初始化 app）。
   */
  if (起.command === "node") {
    return {
      command: execPath,
      args: [...起.args],
      env: { ELECTRON_RUN_AS_NODE: "1" },
    }
  }

  /**
   * Windows 上这几个是批处理包装器，**必须带扩展名**——
   * `spawn` 不查 PATHEXT（那是 shell 干的事，而我们不走 shell）。
   */
  const 要补后缀 = new Set(["npx", "npm", "pnpm", "yarn", "bun"])
  if (platform === "win32" && 要补后缀.has(起.command)) {
    return { command: `${起.command}.cmd`, args: [...起.args], env: {} }
  }

  return { command: 起.command, args: [...起.args], env: {} }
}

/** 起一个适配器进程。stdio 是 `pipe`——ACP 就在 stdin/stdout 上说话 */
export function 起适配器(起: 起法): ChildProcess {
  const c = 算命令(起)
  return spawn(c.command, c.args, {
    cwd: 起.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...c.env },
    /**
     * **POSIX 上单独成组**，好让停止时能连着子孙一起收
     * （`npx` 起的是一棵树）。Windows 没有进程组，那边走 `taskkill /T`。
     */
    ...(( 起.platform ?? process.platform) === "win32" ? {} : { detached: true }),
  })
}

/**
 * 收掉一个适配器进程**及其子孙**。
 *
 * **两个平台两条路，这不是可以将就的地方**：`npx` 起的是
 * `npx → node → 适配器` 一棵树，只杀最上面那个会留下一个还占着
 * stdio 的孤儿——症状是「关了会话，CPU 还在转」。
 */
export function 收进程(proc: ChildProcess, platform: NodeJS.Platform = process.platform): void {
  if (proc.pid === undefined || proc.exitCode !== null) return
  if (platform === "win32") {
    // `/T` 连子孙、`/F` 强制。**Windows 上没有别的可靠办法**
    spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" })
    return
  }
  try {
    // 负号 = 整个进程组（`detached: true` 让它自成一组）
    process.kill(-proc.pid, "SIGTERM")
  } catch {
    // 组不在了（它自己已经退了）就退回单个进程，**再失败就算了**：
    // 收不掉一个已经死了的进程不是错误
    try {
      proc.kill("SIGTERM")
    } catch {
      /* 已经没了 */
    }
  }
}
