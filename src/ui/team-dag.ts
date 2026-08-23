/**
 * 团队面板的纯逻辑（2026-08-23，学自 dsh-agent-teams 的 `activity-model.ts`）：
 * 任务的派生态、按依赖深度分列的小 DAG 布局、一个任务的上下游。
 * 没有 React、没有 DOM——`tests/ui/team-dag.test.ts` 直接测。
 */
import type { TeamSnapshot } from "../protocol/index.js"

export type 任务 = TeamSnapshot["tasks"][number]

/**
 * 派生态（它叫 state，与 status 分开）：
 * - `running`：领了 / 在做；
 * - `blocked`：待领但有依赖没完成——**等着别人**，橙色；
 * - `open`：待领且能领；
 * - `completed`；`dead`：失败 / 取消。
 */
export type 任务态 = "running" | "blocked" | "open" | "completed" | "dead"

export function 任务的态(x: 任务, 全部: readonly 任务[]): 任务态 {
  if (x.status === "completed") return "completed"
  if (x.status === "failed" || x.status === "cancelled") return "dead"
  if (x.status === "claimed" || x.status === "in_progress") return "running"
  const 等 = x.dependencies.some((d) => 全部.find((y) => y.id === d)?.status !== "completed")
  return 等 ? "blocked" : "open"
}

/** 依赖深度：没依赖的 0，有依赖的 = 最深依赖 + 1。环（坏数据）当 0，不死循环 */
export function 任务深度(全部: readonly 任务[]): Map<string, number> {
  const 表 = new Map(全部.map((x) => [x.id, x]))
  const 深 = new Map<string, number>()
  const 在算 = new Set<string>()
  const 算 = (id: string): number => {
    const 有 = 深.get(id)
    if (有 !== undefined) return 有
    if (在算.has(id)) return 0
    在算.add(id)
    const x = 表.get(id)
    const d = x && x.dependencies.length ? Math.max(...x.dependencies.map((p) => (表.has(p) ? 算(p) + 1 : 0))) : 0
    在算.delete(id)
    深.set(id, d)
    return d
  }
  for (const x of 全部) 算(x.id)
  return 深
}

export const 节点宽 = 92
export const 节点高 = 30
export const 列距 = 26
export const 行距 = 8

export interface 布局 {
  width: number
  height: number
  nodes: { task: 任务; x: number; y: number }[]
  edges: { from: string; to: string; path: string }[]
  /** 全没依赖 = 平行网格，不画线 */
  平行: boolean
}

/** 按 id 里的数字排（t2 在 t10 前） */
const 按id = (a: 任务, b: 任务) => a.id.localeCompare(b.id, "en", { numeric: true })

/** 列 = 依赖深度；行 = 同列里按 id 稳定排；边是三次曲线，扇入也看得清 */
export function 分列布局(全部: readonly 任务[]): 布局 {
  const 深 = 任务深度(全部)
  const 列们 = new Map<number, 任务[]>()
  for (const x of 全部) {
    const d = 深.get(x.id) ?? 0
    列们.set(d, [...(列们.get(d) ?? []), x])
  }
  const 列序 = [...列们.entries()].sort(([a], [b]) => a - b).map(([, xs]) => xs.sort(按id))
  const 位 = new Map<string, { x: number; y: number }>()
  const nodes: 布局["nodes"] = []
  列序.forEach((列, c) =>
    列.forEach((task, r) => {
      const x = c * (节点宽 + 列距)
      const y = r * (节点高 + 行距)
      位.set(task.id, { x, y })
      nodes.push({ task, x, y })
    }),
  )
  const edges: 布局["edges"] = []
  for (const x of 全部) {
    const 到 = 位.get(x.id)
    if (!到) continue
    for (const d of x.dependencies) {
      const 从 = 位.get(d)
      if (!从) continue
      const x1 = 从.x + 节点宽
      const y1 = 从.y + 节点高 / 2
      const x2 = 到.x
      const y2 = 到.y + 节点高 / 2
      edges.push({ from: d, to: x.id, path: `M${x1} ${y1}C${x1 + 14} ${y1},${x2 - 14} ${y2},${x2} ${y2}` })
    }
  }
  const 行数 = Math.max(1, ...列序.map((l) => l.length))
  return {
    width: 列序.length ? 列序.length * 节点宽 + (列序.length - 1) * 列距 : 0,
    height: 列序.length ? 行数 * 节点高 + (行数 - 1) * 行距 : 0,
    nodes,
    edges,
    平行: 全部.length > 0 && 全部.every((x) => x.dependencies.length === 0),
  }
}

/** 与这个任务有关的整条链：上游 + 下游，环安全 */
export function 相关任务(id: string, 全部: readonly 任务[]): ReadonlySet<string> {
  const 表 = new Map(全部.map((x) => [x.id, x]))
  if (!表.has(id)) return new Set()
  const 下游 = new Map<string, string[]>()
  for (const x of 全部) for (const d of x.dependencies) 下游.set(d, [...(下游.get(d) ?? []), x.id])
  const 出 = new Set<string>()
  const 上走 = (k: string) => {
    if (出.has(k) && k !== id) return
    出.add(k)
    for (const d of 表.get(k)?.dependencies ?? []) if (!出.has(d)) 上走(d)
  }
  const 下走 = (k: string) => {
    出.add(k)
    for (const n of 下游.get(k) ?? []) if (!出.has(n)) 下走(n)
  }
  上走(id)
  下走(id)
  return 出
}

/** 节点上那一小截标题：去掉开头的序号，截到第一个分隔符，最长 18 */
export function 短标题(subject: string): string {
  const 去序 = subject.replace(/^\d+[-_.、\s]*/u, "")
  const 头 = 去序.split(/[（(·：:]/u)[0]?.trim() || 去序
  return 头.length > 18 ? `${头.slice(0, 17)}…` : 头
}

/** 名字 → 0..7 的稳定色号（头像用 hue-rotate 走一圈强调色，不写裸色） */
export function 色号(name: string): number {
  let h = 2166136261
  for (const ch of name) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return h % 8
}

/** 头像上那一个字：中文取第一个字，英文取首字母大写 */
export function 首字(name: string): string {
  const c = [...name.trim()][0] ?? "?"
  return c.toUpperCase()
}
