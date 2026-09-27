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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { SessionManager } from "@earendil-works/pi-coding-agent"
import { 分支转消息, 消息转历史 } from "../runtime/history.js"
import type { RestoredItem } from "../runtime/types.js"
import type { TranscriptItem } from "../protocol/index.js"

export interface 子运行元 {
  agent: string
  task: string
  status: "running" | "ok" | "error"
  error?: string
  result?: { text: string; truncated?: { originalBytes: number; keptBytes: number } }
  startedAt: number
  endedAt?: number
}

/** toolCallId 来自模型提供方，**不许它带着 `..` 或分隔符逃出 subagents/** */
function 安全段(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_") || "_"
}

export function 子运行目录(sessionDir: string, toolCallId: string, index: number): string {
  return join(sessionDir, "subagents", 安全段(toolCallId), String(index))
}

/** 写 `meta.json`。**失败回一句原因、不抛**：记录失败不该拖垮子 agent，但调用方要把这句说出来（规格 7.5） */
export function 写元(dir: string, 元: 子运行元): string | undefined {
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "meta.json"), JSON.stringify(元, null, 2))
    return undefined
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export function 读元(dir: string): 子运行元 | undefined {
  try {
    const v = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as 子运行元
    return typeof v?.agent === "string" && typeof v.task === "string" ? v : undefined
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
export function 读子转录(dir: string): RestoredItem[] | undefined {
  const f = 会话文件(dir)
  if (!f) return undefined
  return 消息转历史(分支转消息(SessionManager.open(f).getBranch()))
}

/** 这次调用下盘上有记录的那几个，按序号排 */
export function 子agent组(sessionDir: string, toolCallId: string): { index: number; 元: 子运行元 }[] {
  const 根 = join(sessionDir, "subagents", 安全段(toolCallId))
  if (!existsSync(根)) return []
  return readdirSync(根)
    .filter((n) => /^\d+$/.test(n))
    .map((n) => ({ index: Number(n), 元: 读元(join(根, n)) }))
    .filter((x): x is { index: number; 元: 子运行元 } => x.元 !== undefined)
    .sort((a, b) => a.index - b.index)
}

export const 没跑完 = "DAWN 关掉时它还在跑，没有跑完"

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
