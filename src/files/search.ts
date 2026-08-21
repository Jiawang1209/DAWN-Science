/**
 * 按文件名搜（dock-polish ③，2026-08-21）。
 *
 * 学自 DSH-better-sidebar（`ccb_hive_code_learn/DSH-better-sidebar-解读.md` §1.3）的三条：
 *   - **有预算**：命中数、看过的条目数、时间，三个都有上界；
 *   - **截断出声**：停在哪条预算上、看了多少，调用方要能说给人听（规格 7.5）；
 *   - **不跟符号链接**：目录环会把预算全吃掉、还什么都搜不到。
 *
 * **走法注入**：`readdir` 本地是 `fs`、远端是 SFTP——同一个走法，两边对同一棵树说同样的话。
 * 没用那台机器上的 `find`：mock 的假机器不认它，而且 `find` 的截断说不出「看了多少」。
 *
 * 宽度优先：人要找的多半在浅处，深处的 `node_modules/…/main.js` 不该排在 `src/main.ts` 前面。
 */
import { DEFAULT_IGNORED } from "./access.js"

export interface 搜索条目 {
  name: string
  kind: "file" | "dir"
  /** 符号链接（目录或文件都可能）。标了的目录不进去 */
  symlink?: boolean | undefined
}

export type 读目录 = (dir: string) => Promise<readonly 搜索条目[]>

export interface 搜索选项 {
  maxMatches?: number
  maxVisited?: number
  timeoutMs?: number
  /** 不进去的目录名 */
  skip?: ReadonlySet<string>
  /** 测试用的钟 */
  clock?: () => number
  signal?: AbortSignal
}

export interface 搜索结果 {
  matches: { path: string; kind: "file" | "dir" }[]
  /** 看过多少条目（文件 + 目录） */
  visited: number
  /** 因为在忽略名单里没进去的目录数 */
  skippedDirs: number
  /** 读不了（权限、断链）的目录数 */
  unreadable: number
  /** 停在了哪条预算上；没截断就没有 */
  truncated?: "matches" | "visited" | "time" | undefined
}

export const 搜索默认预算 = { maxMatches: 200, maxVisited: 100_000, timeoutMs: 4_000 } as const

const 拼 = (dir: string, name: string) => (dir === "" ? name : `${dir.replace(/\/+$/, "")}/${name}`)

export async function 搜文件名(readdir: 读目录, 根: string, query: string, opts: 搜索选项 = {}): Promise<搜索结果> {
  const q = query.trim().toLowerCase()
  const 出: 搜索结果 = { matches: [], visited: 0, skippedDirs: 0, unreadable: 0 }
  if (!q) return 出
  const maxMatches = opts.maxMatches ?? 搜索默认预算.maxMatches
  const maxVisited = opts.maxVisited ?? 搜索默认预算.maxVisited
  const timeoutMs = opts.timeoutMs ?? 搜索默认预算.timeoutMs
  const skip = opts.skip ?? DEFAULT_IGNORED
  const clock = opts.clock ?? (() => Date.now())
  const 按路径 = q.includes("/")
  const 起 = clock()
  const 根前缀 = 根 === "" ? "" : `${根.replace(/\/+$/, "")}/`
  const 相对 = (p: string) => (根前缀 && p.startsWith(根前缀) ? p.slice(根前缀.length) : p)

  const 队列: string[] = [根]
  while (队列.length) {
    if (opts.signal?.aborted) break
    if (clock() - 起 > timeoutMs) {
      出.truncated = "time"
      break
    }
    const dir = 队列.shift()!
    let 条: readonly 搜索条目[]
    try {
      条 = await readdir(dir)
    } catch {
      出.unreadable += 1
      continue
    }
    for (const e of 条) {
      出.visited += 1
      const 全 = 拼(dir, e.name)
      const 目标 = 按路径 ? 相对(全) : e.name
      if (目标.toLowerCase().includes(q)) {
        出.matches.push({ path: 全, kind: e.kind })
        if (出.matches.length >= maxMatches) {
          出.truncated = "matches"
          return 出
        }
      }
      if (e.kind === "dir") {
        if (skip.has(e.name)) 出.skippedDirs += 1
        else if (!e.symlink) 队列.push(全)
      }
      if (出.visited >= maxVisited) {
        出.truncated = "visited"
        return 出
      }
    }
  }
  return 出
}
