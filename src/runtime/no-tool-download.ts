/**
 * pi 的 `grep` / `find` 不许自己去 GitHub 下 `rg` / `fd`（2026-09-28，先出方案 Task 6 顺带定的）。
 *
 * pi 的这两件工具每次执行先 `ensureTool("rg" | "fd")`（`utils/tools-manager.js`）：本机 PATH 上没有、
 * `~/.pi/agent/bin` 里也没有，就**悄悄**从 GitHub releases 下一份装进 `~/.pi/agent/bin`——
 * 一次没人知道的联网、一个没人知道的二进制落在用户家目录里。方案期又恰好是这两件被启用的时候。
 *
 * 两道闸，谁都不替谁：
 *   1. `关掉pi自己下载()`：进程里设 `PI_OFFLINE=1`——pi 自己的开关（`isOfflineModeEnabled`，执行时读 env）。
 *      子进程（子 agent 那个 pi）继承它：它用的是 pi 原装的 grep，没有下面那层包装。
 *      同一个变量还让 pi 的 `ModelRuntime` 不去网上刷模型目录（`modelNetworkEnabled`）——我们本来就不叫它刷
 *      （全仓没有 `allowModelNetwork` / `refresh()` 调用），pi 自己的几处刷新也都显式 `allowNetwork: false`。
 *   2. `不自己下载(定义, 工具)`：执行前我们先照 pi 的 `getToolPath` 同一套找法看一眼；找不到就**不进 pi**，
 *      直接回一条说人话的错（pi 那句是英文的 “could not be downloaded”，而且 env 被人改回 0 时它就真去下了）。
 *
 * `ls` 不经这里——它不调外部程序。
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { getAgentDir } from "@earendil-works/pi-coding-agent"

export type 外部搜索工具 = "rg" | "fd"

/** 与 pi `TOOLS` 表里的 `systemBinaryNames` 一致：Debian 系把 fd 装成 `fdfind` */
const 系统里的名字: Record<外部搜索工具, string[]> = { rg: ["rg"], fd: ["fd", "fdfind"] }

/** 设 pi 的离线开关。**用户自己设过就不动**（设成什么都算他的决定；第二道闸照样拦下载） */
export function 关掉pi自己下载(env: NodeJS.ProcessEnv = process.env): void {
  if (env.PI_OFFLINE === undefined) env.PI_OFFLINE = "1"
}

/**
 * 这台机器上 pi 找得到这个程序吗——**与 pi `getToolPath` 同一套**：先看 `<agentDir>/bin/<名>`，再在 PATH 上试 `--version`。
 * 找法对齐是要害：我们说「有」而 pi 找不到，它就会去下。
 */
export function 找得到(工具: 外部搜索工具): boolean {
  const 后缀 = process.platform === "win32" ? ".exe" : ""
  if (existsSync(join(getAgentDir(), "bin", 工具 + 后缀))) return true
  return 系统里的名字[工具].some((名) => {
    try {
      const r = spawnSync(名, ["--version"], { stdio: "pipe", timeout: 5_000 })
      return r.error === undefined || r.error === null
    } catch {
      return false
    }
  })
}

export function 没装的话(工具: 外部搜索工具): string {
  const 件 = 工具 === "rg" ? "grep" : "find"
  return `这台机器没有装 ${工具}，${件} 用不了；可以用 ls / read，或把这一步写进方案`
}

/**
 * 包一件 pi 的 `grep` / `find` 定义：程序不在就回 isError（**不抛**——抛异常会被当成这一轮出事，模型学不到「换条路」），
 * 在就原样交给 pi。名字、说明、参数 schema 一字不动。
 */
export function 不自己下载<T extends { execute: (...a: never[]) => unknown }>(定义: T, 工具: 外部搜索工具): T {
  const 原来的 = 定义.execute.bind(定义) as (...a: unknown[]) => unknown
  return {
    ...定义,
    execute: (...a: unknown[]) => {
      if (!找得到(工具)) {
        return Promise.resolve({ content: [{ type: "text" as const, text: 没装的话(工具) }], isError: true, details: undefined })
      }
      return 原来的(...a)
    },
  } as T
}
