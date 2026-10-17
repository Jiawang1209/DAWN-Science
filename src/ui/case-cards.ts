/**
 * 案例卡片的数据那一半（2026-09-15，规格 `2026-09-15-案例卡片-design.md`）。
 *
 * **数据从这一轮 MLAI 工具的返回里取，不靠模型按格式写**（K1，第二版）。
 * 第一版让 agent 附一段 ```mlai-cases 清单；作者真机试的第二次，模型根本没去读技能、直接调了 8 次 MLAI 工具，
 * 写出一大段带 case_id 的文字——清单没有，卡片自然也没有。「模型记得按格式写」不可靠，工具返回是结构化的、一定在。
 *
 * **出哪几张**：正文明确提到的案例，按首次出现的先后；完整 ID、唯一 ID 前缀和唯一标题都认。
 * 数据优先读截断前提取的 caseResults；旧记录兼容完整工具正文。没提到或标题有歧义的不猜。
 */

import type { 案例 } from "../protocol/cases.js"
export type { 案例 } from "../protocol/cases.js"
export { 从工具结果收案例 } from "../cases/results.js"

/** 一张卡：哪台 MCP（决定图廊根地址）+ 那篇 + 在这条回复里的序号 */
export interface 本轮案例 {
  服务器: string
  案例: 案例
  n: number
}

/**
 * 正文里提到了哪几篇，按首次出现排。认三种写法：
 * - 完整的 case_id；
 * - **模型常把长 id 截短**（真机里见过 `20251019-xacaaee`）：一个像 id 的片段（8 位日期开头、≥ 12 字符）
 *   若恰好是**唯一一个**已知 id 的前缀，也算提到了那篇。对不上唯一一篇的不猜。
 * - 本轮结果中的唯一标题，可去明确的库名和系列包装；同名、短词、仅日期不认。
 */
export function 本轮提到的案例(正文: string, 已知: Map<string, { 服务器: string; 案例: 案例 }>): 本轮案例[] {
  const 位置 = new Map<string, number>()
  const 记 = (id: string, i: number) => 位置.set(id, Math.min(位置.get(id) ?? Infinity, i))
  for (const id of 已知.keys()) {
    const i = 正文.indexOf(id)
    if (i >= 0) 记(id, i)
  }
  for (const m of 正文.matchAll(/\d{8}-[A-Za-z0-9-]{4,}/g)) {
    const 片 = m[0].replace(/-+$/, "")
    if (片.length < 12) continue
    const 候选 = [...已知.keys()].filter((id) => id.startsWith(片))
    if (候选.length === 1) 记(候选[0]!, m.index)
  }
  // 模型常写「标题（日期）」而非完整 ID。只去明确的库名/系列包装，不做模糊或日期匹配。
  const 标题表 = new Map<string, Set<string>>()
  for (const [id, { 案例: c }] of 已知) {
    if (!c.title) continue
    const 完整 = c.title.replace(/\s/g, "").toLowerCase()
    const 无库名 = 完整.replace(/^mlai案例库[:：]/, "")
    const 无系列 = 无库名.replace(/^网络可视化r包ggnetview_(?:\d+[._．、:：]?)?/, "")
    for (const title of new Set([完整, 无库名, 无系列])) {
      if (title.length < 4) continue
      const ids = 标题表.get(title) ?? new Set<string>()
      ids.add(id)
      标题表.set(title, ids)
    }
  }
  // 归一化后的下标映回正文，才能与 ID 的首次出现位置一起排序。
  let 归一正文 = ""
  const 原位: number[] = []
  for (let i = 0; i < 正文.length; i++) {
    if (/\s/.test(正文[i]!)) continue
    const char = 正文[i]!.toLowerCase()
    归一正文 += char
    for (let j = 0; j < char.length; j++) 原位.push(i)
  }
  const 提及: { start: number; end: number; ids: Set<string> }[] = []
  for (const [title, ids] of 标题表) {
    for (let i = 归一正文.indexOf(title); i >= 0; i = 归一正文.indexOf(title, i + 1)) {
      提及.push({ start: i, end: i + title.length, ids })
    }
  }
  for (const hit of 提及) {
    if (hit.ids.size !== 1) continue
    const id = [...hit.ids][0]!
    // 「网络布局浅览进阶」不能顺带推荐另一篇「网络布局浅览」。
    const 被长标题包含 = 提及.some((other) => other.start <= hit.start && other.end >= hit.end
      && other.end - other.start > hit.end - hit.start && [...other.ids].some((x) => x !== id))
    if (!被长标题包含) 记(id, 原位[hit.start]!)
  }
  return [...位置.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id], k) => ({ ...已知.get(id)!, n: k + 1 }))
}

/** MCP 地址 → 图廊根：`http://127.0.0.1:8765/mcp` → `http://127.0.0.1:8765` */
export const 图廊根 = (mcpUrl: string): string => mcpUrl.replace(/\/+$/, "").replace(/\/mcp$/, "")

export const 封面地址 = (根: string, c: 案例): string | undefined =>
  c.cover ? `${根}/gallery/asset/${encodeURIComponent(c.case_id)}/${c.cover.replace(/^\/+/, "")}` : undefined

export const 详情地址 = (根: string, c: 案例): string => `${根}/gallery/case/${encodeURIComponent(c.case_id)}`

/**
 * 「照这篇做」替人说出口的那句话。**带 case_id**：agent 直接 `get_case`，不必从「第 2 个」去对是哪篇。
 * 它走的是与手打完全同一条发送路，转录里就是人发的这句——谁选的、选了哪篇，一眼看得见。
 */
export const 选这篇的话 = (c: 案例): string =>
  c.title ? `照这篇做：《${c.title}》（case_id: ${c.case_id}）` : `照这篇做：case_id: ${c.case_id}`
