/**
 * 真的那份安装器（规格 U6）：坐在 `node:fs` 与 `ditto` 上。
 *
 * **与假的那份共用同一个接口**——e2e 里换掉的只是这一个对象，
 * 上面那一层（要不要下、下到哪、什么时候能装）一个字都不变。
 */
import { execFile } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { chmod, copyFile, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { 下载到 } from "./下载.js"
import { 换包, type 换包依赖, type 换包参数 } from "./换包.js"
import type { 安装器 } from "./服务.js"

const 跑 = promisify(execFile)

export const 本机换包依赖: 换包依赖 = {
  运行: async (cmd, args) => {
    await 跑(cmd, args)
  },
  改名: (a, b) => rename(a, b),
  拷贝: (a, b) => copyFile(a, b),
  chmod: (p, m) => chmod(p, m),
  删: (p) => rm(p, { recursive: true, force: true }),
  找app: (目录) => {
    if (!existsSync(目录)) return undefined
    const 名 = readdirSync(目录).find((n) => n.endsWith(".app"))
    return 名 ? join(目录, 名) : undefined
  },
  读包版本: (app路径) => {
    // 打包版里我们自己的 package.json 就在这儿（2026-09-06 在真的 0.0.2 包上确认过）
    const f = join(app路径, "Contents", "Resources", "app", "package.json")
    try {
      const v = (JSON.parse(readFileSync(f, "utf8")) as { version?: unknown }).version
      return typeof v === "string" ? v : undefined
    } catch {
      // 读不出来就是读不出来。**上一层会因此拒绝换包**，那正是我们要的
      return undefined
    }
  },
}

export function 本机安装器(o: { 下载目录: string; 重启: () => void }): 安装器 {
  return {
    下载: (资源, 进度, signal) => 下载到({ 资源, 目录: o.下载目录, 进度, signal }),
    换包: (p: 换包参数) => 换包(p, 本机换包依赖),
    重启: o.重启,
  }
}

/**
 * 假的那份（`DAWN_FAKE_UPDATE_INSTALL=1`）：**下载照真下**（那条路要真的走一遍），
 * 换包只写一个标记文件、重启不真重启。
 *
 * e2e 里不能真换掉一个 `.app`——那会换掉开发者机器上的东西。
 */
export function 假安装器(o: { 下载目录: string; 标记文件: string; 记(话: string): void }): 安装器 {
  return {
    下载: (资源, 进度, signal) => 下载到({ 资源, 目录: o.下载目录, 进度, signal }),
    换包: async (p) => {
      const { writeFileSync } = await import("node:fs")
      writeFileSync(o.标记文件, JSON.stringify({ 方式: p.方式, 包路径: p.包路径, 期望版本: p.期望版本 }, null, 2))
      o.记(`假装换包：${p.方式} ← ${p.包路径}`)
    },
    重启: () => o.记("假装重启（DAWN_FAKE_UPDATE_INSTALL）"),
  }
}
