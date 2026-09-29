/**
 * 续接读哪份 pi 记录（2026-09-29）。主对话、子 agent / 团队成员接着问、全文搜索三处都走这一份规则。
 *
 * ## 依赖决策（规格 §4）
 *
 * - **坐在哪**：pi-coding-agent 的 `SessionManager.open(path, sessionDir, cwdOverride)` 与 `SessionManager.create`。
 *   挑文件是我们自己挑：目录里的 `.jsonl` 按 mtime 从新到旧，头一个读得出会话 header 的——与 pi `findMostRecentSession`
 *   同一条，**只少了按 cwd 过滤**（pi 没有导出它）。
 * - **放弃了什么**：`SessionManager.continueRecent`。给它自己的目录时它只认 header 里 `cwd` 等于此刻工作目录的记录——
 *   那是为「多段会话共用一个目录」防串的；我们的记录目录是一段对话一个、跟着对话搬家（`SessionManager.rehome`），
 *   过滤防不了什么，只会在普通对话选了文件夹之后**一份都对不上、悄悄新开一段**：界面上话还在，模型全忘了。
 * - **不变式挂在**：`tests/ui/design-contract.test.ts`「续接不走 continueRecent」——`src/` 里不许再出现它。
 */
import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs"
import { join } from "node:path"
import { SessionManager } from "@earendil-works/pi-coding-agent"

/** header 最多往前看这么多字节（与 pi 的 `MAX_SESSION_HEADER_SCAN_BYTES` 同一个量级） */
const 头扫描上限 = 64 * 1024

/** 这个目录里续接该读哪份。没有目录 / 没有读得出 header 的记录 → undefined（这段还没有一轮说完） */
export function 续接哪份(dir: string): string | undefined {
  let 名们: string[]
  try {
    名们 = readdirSync(dir).filter((n) => n.endsWith(".jsonl"))
  } catch {
    return undefined
  }
  const 们: { path: string; mtimeMs: number }[] = []
  for (const n of 名们) {
    const path = join(dir, n)
    try {
      们.push({ path, mtimeMs: statSync(path).mtimeMs })
    } catch {
      // 列目录与 stat 之间被删了：当它不在
    }
  }
  们.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return 们.find((f) => 有会话头(f.path))?.path
}

/** 续上这个目录里的那份；没有就新开。工作目录按此刻的 `cwd`——记录 header 里的是它出生时的，搬过家就不一样 */
export function 续接或新建(cwd: string, dir: string): SessionManager {
  const f = 续接哪份(dir)
  return f ? SessionManager.open(f, dir, cwd) : SessionManager.create(cwd, dir)
}

/** 头一个读得出的行是 `type: "session"`。坏行 pi 跳过接着找，这里同样 */
function 有会话头(path: string): boolean {
  let 文 = ""
  try {
    const fd = openSync(path, "r")
    try {
      const buf = Buffer.alloc(头扫描上限)
      文 = buf.subarray(0, readSync(fd, buf, 0, 头扫描上限, 0)).toString("utf8")
    } finally {
      closeSync(fd)
    }
  } catch {
    return false
  }
  for (const 行 of 文.split("\n")) {
    if (!行.trim()) continue
    try {
      if ((JSON.parse(行) as { type?: unknown }).type === "session") return true
    } catch {
      // 坏行：接着找
    }
  }
  return false
}
