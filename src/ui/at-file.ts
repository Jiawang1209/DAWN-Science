/**
 * 输入卡上 `@` 菜单的纯逻辑（2026-08-23，学自 dsh-at-file）。
 * 识别语法从 `files/mentions.ts` 取，这里只管：光标前是不是在打一个 `@`、选完怎么写回草稿、候选怎么排。
 */
import { 扫引用, 粘贴标记 } from "../files/mentions.js"

export interface 艾特位置 {
  /** `@` 所在下标 */
  start: number
  /** 光标 */
  end: number
  /** `@` 后面已经打的字（可能带 `/`） */
  query: string
}

/**
 * 光标前是不是正在打 `@…`：从光标往回找最近的 `@`，中间不能有空白或另一个 `@`，
 * 而且 `@` 前面要么是行首要么是空白——`a@b.com` 里那个不算，那是在写邮箱。
 */
export function 在打艾特(draft: string, caret: number): 艾特位置 | undefined {
  const 前 = draft.slice(0, caret)
  const at = 前.lastIndexOf("@")
  if (at < 0) return undefined
  const 中间 = 前.slice(at + 1)
  if (/[\s@]/.test(中间)) return undefined
  // 粘贴进来的 `@`（带标记）不是在打手势
  if (中间.includes(粘贴标记)) return undefined
  if (at > 0 && !/\s/.test(前[at - 1]!)) return undefined
  return { start: at, end: caret, query: 中间 }
}

/** 选了一条：写成 `@路径 `（目录是 `@路径/ `）；→ 钻目录则是 `@路径/` 不加空格、菜单不关 */
export function 艾特选完(draft: string, 位: 艾特位置, path: string, kind: "file" | "dir", 钻进去 = false): { draft: string; caret: number } {
  const 令牌 = `@${path}${kind === "dir" ? "/" : ""}${钻进去 ? "" : " "}`
  const 新 = draft.slice(0, 位.start) + 令牌 + draft.slice(位.end)
  return { draft: 新, caret: 位.start + 令牌.length }
}

/** 从草稿里抠掉一个引用（引用栏的 ×）。跟着的那个空格一起抠 */
export function 抠掉引用(draft: string, path: string): string {
  const r = 扫引用(draft).find((x) => x.path === path)
  if (!r) return draft
  const end = draft[r.end] === " " ? r.end + 1 : r.end
  return draft.slice(0, r.start) + draft.slice(end)
}

export interface 路径条目 {
  /** 相对根的路径，`/` 分隔 */
  path: string
  kind: "file" | "dir"
}

/**
 * 排序，照 dsh-at-file 的 `rankFiles`（`src/client/search.ts`）：
 * - 纯关键词**只匹配文件名**：完整 > 前缀 > 子串 > 紧凑子序列，再短路径优先——
 *   「长路径里散落的字母不产生无关结果」；
 * - 带 `/` 的关键词按路径段**顺序**匹配，最后一段落在文件名上加分；
 * - 空关键词是浏览：浅的在前、同层目录在前。
 */
export function 排路径(条: readonly 路径条目[], query: string, limit: number): 路径条目[] {
  const q = query.trim().toLowerCase()
  if (q === "") return [...条].sort(按浏览).slice(0, limit)
  return 条
    .map((x) => ({ x, 分: 给路径打分(x.path, q) }))
    .filter((e) => e.分 >= 0)
    .sort(
      (a, b) =>
        b.分 - a.分 ||
        (a.x.kind === "dir" ? 1 : 0) - (b.x.kind === "dir" ? 1 : 0) ||
        a.x.path.length - b.x.path.length ||
        (a.x.path < b.x.path ? -1 : 1),
    )
    .slice(0, limit)
    .map((e) => e.x)
}

function 按浏览(a: 路径条目, b: 路径条目): number {
  const 深 = a.path.split("/").length - b.path.split("/").length
  if (深 !== 0) return 深
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
}

function 给路径打分(path: string, q: string): number {
  const 小 = path.toLowerCase()
  const 段 = 小.split("/")
  const 问 = q.replaceAll("\\", "/")
  const 问段 = 问.split("/").filter(Boolean)
  if (!问.includes("/")) return 给名字打分(段.at(-1)!, 问段[0] ?? "")
  if (问段.length === 0) return -1
  if (问.endsWith("/")) {
    const 前缀 = 问.slice(0, -1)
    if (!小.startsWith(`${前缀}/`)) return -1
    const 深 = 小.slice(前缀.length + 1).split("/").length
    return 6000 - (深 - 1) * 100 - path.length
  }
  let 游标 = 0
  let 总 = 0
  let 末 = -1
  for (const 一段 of 问段) {
    let 命中 = -1
    let 命中分 = -1
    for (let i = 游标; i < 段.length; i++) {
      const s = 给名字打分(段[i]!, 一段)
      if (s < 0) continue
      命中分 = s
      命中 = i
      break
    }
    if (命中 < 0) return -1
    总 += 命中分
    末 = 命中
    游标 = 命中 + 1
  }
  return 总 + (末 === 段.length - 1 ? 1000 : 0) - path.length
}

function 给名字打分(name: string, q: string): number {
  if (name === q) return 5000
  if (name.startsWith(q)) return 4500 - name.length
  const 在 = name.indexOf(q)
  if (在 >= 0) return 4000 - 在 * 10 - name.length
  let 首 = -1
  let 上 = -1
  let 空隙 = 0
  let 从 = 0
  for (const ch of q) {
    const 找到 = name.indexOf(ch, 从)
    if (找到 < 0) return -1
    if (首 < 0) 首 = 找到
    if (上 >= 0) 空隙 += 找到 - 上 - 1
    上 = 找到
    从 = 找到 + 1
  }
  return 3000 - 首 * 10 - 空隙 * 5 - name.length
}

export interface 候选行 {
  path: string
  kind: "file" | "dir"
  /** 主标题：文件名；重名时把父目录写进来——人眼扫的是主标题，不靠描述行救 */
  name: string
  /** 父目录，根下的没有 */
  dir?: string
}

export function 成候选行(条: readonly 路径条目[]): 候选行[] {
  const 计数 = new Map<string, number>()
  for (const x of 条) {
    const 名 = x.path.split("/").at(-1)!
    计数.set(名, (计数.get(名) ?? 0) + 1)
  }
  return 条.map((x) => {
    const 段 = x.path.split("/")
    const 名 = 段.at(-1)!
    const dir = 段.slice(0, -1).join("/")
    const 重名 = (计数.get(名) ?? 0) > 1
    return { path: x.path, kind: x.kind, name: 重名 && dir ? `${名} - ${dir}` : 名, ...(dir ? { dir } : {}) }
  })
}
