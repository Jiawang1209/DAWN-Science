/**
 * 子 agent 的运行目录（2026-09-27，spec §4.2 / §2.4）。
 *
 * ```
 * <会话目录>/subagents/<安全化的 toolCallId>/<序号>/
 *   ├─ （pi 的 agentDir：设置等）
 *   ├─ transcript/<时间>_<id>.jsonl   ← pi 会话文件：过程的全文，重开后读它、接着问时续它
 *   └─ meta.json                      ← 谁、任务、状态、原因、交回主 agent 的结果
 * ```
 *
 * **按调用分目录**：此前 `agentDirOf` 只按序号，第二次派子 agent 时序号 0 又写进同一个目录——文件在，对应关系没了（spec §1.1）。
 * 这里只管读写盘；什么时候写由 `tool.ts` 定，什么时候读由后端定。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { 读记录同步 } from "../runtime/pi-record.js"
import type { RestoredItem } from "../runtime/types.js"
import type { TranscriptItem } from "../protocol/index.js"
import { 子目录段 } from "../protocol/subagent-id.js"
import { 截工具结果 } from "./child-events.js"

export interface 子运行元 {
  agent: string
  task: string
  status: "running" | "ok" | "error"
  error?: string
  result?: { text: string; truncated?: { originalBytes: number; keptBytes: number } }
  startedAt: number
  endedAt?: number
}

/** toolCallId 来自模型提供方，**不许它带着 `..` 或分隔符逃出 subagents/**。与中枢判「同一个目录」共用一个（审查 2026-09-27） */
const 安全段 = 子目录段

export function 子运行目录(sessionDir: string, toolCallId: string, index: number): string {
  return join(sessionDir, "subagents", 安全段(toolCallId), String(index))
}

/** 写 `meta.json`。**失败回一句原因、不抛**：记录失败不该拖垮子 agent，但调用方要把这句说出来（规格 7.5） */
export function 写元(dir: string, 元: 子运行元): string | undefined {
  try {
    mkdirSync(dir, { recursive: true })
    // 先写临时文件再改名（2026-09-27 审查）：写到一半被杀，留下的是完整的旧版或新版，不是半截 JSON
    const 临时 = join(dir, `meta.json.${process.pid}.tmp`)
    writeFileSync(临时, JSON.stringify(元, null, 2))
    renameSync(临时, join(dir, "meta.json"))
    return undefined
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

const 状态们: readonly unknown[] = ["running", "ok", "error"]

export function 读元(dir: string): 子运行元 | undefined {
  try {
    const v = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as 子运行元
    return typeof v?.agent === "string" && v.agent.length > 0 && typeof v.task === "string" && 状态们.includes(v.status)
      ? v
      : undefined
  } catch {
    return undefined
  }
}

/** `transcript/` 里最新那份会话文件。一个子 agent 只有一份（接着问是续同一份），取最新只是兜底 */
export function 会话文件(dir: string): string | undefined {
  const t = join(dir, "transcript")
  if (!existsSync(t)) return undefined
  const 文件们 = readdirSync(t).filter((f) => f.endsWith(".jsonl")).map((f) => join(t, f))
  if (文件们.length === 0) return undefined
  return 文件们.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
}

/**
 * 会话文件 → 历史条目（与主对话续接同一套翻法、同一个来源 `getBranch()`——子 agent 跑长了 pi 也会压缩，
 * 走 `buildSessionContext()` 就只剩一段摘要）。没有会话文件 = undefined，调用方如实说「没留下过程记录」
 */
export function 读子转录(dir: string, 上限字节 = 子转录读盘上限字节): RestoredItem[] | undefined {
  const f = 会话文件(dir)
  if (!f) return undefined
  // **先看多大再读**（2026-09-27 审查）：pi 是整份同步读进来的，一个跑了几小时的子 agent 能有上百 MB，
  // 点一下 chip 就把主进程卡住、内存翻倍。超了就不读，说清多大（规格 7.5：不静默截断）
  const 大小 = statSync(f).size
  if (大小 > 上限字节) throw new 子转录过大(f, 大小, 上限字节)
  // **只读**（2026-09-28）：`SessionManager.open(f)` 遇到旧版本 / 空文件会重写它——打开看一眼不该改盘上的过程记录
  return 读记录同步(f).map((x) =>
    // 工具结果与活着那条路同一个 16 KiB、同一句「省了多少」
    x.kind === "tool" && x.result !== undefined ? { ...x, result: 截工具结果(x.result).text } : x,
  )
}

/** 读盘重建时会话文件的上限（2026-09-27 审查）。超了不整份读 */
export const 子转录读盘上限字节 = 20 * 1024 * 1024

/** 会话文件太大、没读。带着多大与在哪，调用方照实说 */
export class 子转录过大 extends Error {
  constructor(
    readonly 文件: string,
    readonly 字节: number,
    readonly 上限: number,
  ) {
    super(`过程记录有 ${兆(字节)}，超过读盘上限 ${兆(上限)}，没有载入；全文在 ${文件}`)
    this.name = "子转录过大"
  }
}

const 兆 = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`

/** 这次调用下盘上有记录的那几个，按序号排 */
export function 子agent组(sessionDir: string, toolCallId: string): { index: number; 元: 子运行元 }[] {
  const 根 = join(sessionDir, "subagents", 安全段(toolCallId))
  if (!existsSync(根)) return []
  return readdirSync(根)
    .filter((n) => /^\d+$/.test(n))
    // 记录读不出来的**照样占一颗 chip、说清楚**（2026-09-27 审查）：悄悄丢掉等于这个子 agent 没存在过（规格 7.5）
    .map((n) => ({ index: Number(n), 元: 读元(join(根, n)) ?? 记录坏了 }))
    .sort((a, b) => a.index - b.index)
}

export const 没跑完 = "DAWN 关掉时它还在跑，没有跑完"

export const 记录读不出来 = "这个子 agent 的记录（meta.json）读不出来，看不到它当时的任务与结果"
const 记录坏了: 子运行元 = { agent: "子 agent", task: "", status: "error", error: 记录读不出来, startedAt: 0 }

/**
 * 重开之后补回 chip 组（spec §2.4）：每条 `subagent` 工具行后面，按盘上的 `meta.json` 插一条 `subagents`。
 * pi 的会话文件里没有 chip（那是我们的东西），不补的话「子 agent 看得见」只在本次运行里成立。
 * **盘上写着 running 的**：那是 DAWN 关掉时还在跑的——记成失败并说清楚，不留一颗永远转圈的 chip。
 */
export function 补子agent组(items: readonly TranscriptItem[], sessionDir: string): TranscriptItem[] {
  const 出: TranscriptItem[] = []
  for (const it of items) {
    出.push(it)
    if (it.type !== "tool" || it.name !== "subagent") continue
    const 组 = 子agent组(sessionDir, it.id)
    if (组.length === 0) continue
    出.push({
      type: "subagents",
      id: `sub:${it.id}`,
      agents: 组.map(({ index, 元 }) => ({
        index,
        agent: 元.agent,
        task: 元.task,
        status: 元.status === "running" ? ("error" as const) : 元.status,
        ...(元.status === "running" ? { error: 没跑完 } : 元.error ? { error: 元.error } : {}),
      })),
    })
  }
  return 出
}
