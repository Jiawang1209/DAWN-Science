/**
 * 只读地打开一段对话的 pi 记录（会话全文搜索，2026-09-27）。
 *
 * ## 依赖决策（规格 §4）
 *
 * - **坐在哪**：pi-coding-agent 的导出符号 `parseSessionEntries`（逐行 JSON，坏行跳过）+
 *   `SessionManager.inMemory(cwd, undefined, entries)` + `.getBranch()`；条目交给与续接同一个 `还原历史`。
 *   走 `getBranch()` 不走 `buildSessionContext()`（2026-09-27，与续接一起改的）：续接点开后转录里是**完整的那条路径**
 *   （压缩前的来往也在、压缩处一条标记），搜索数的第几条必须与它同一个数——所以压缩掉的话也搜得到，因为点开也看得到。
 * - **放弃了什么**：`SessionManager.open` / `continueRecent`——记录是旧版本时它们迁移完会**重写文件**
 *   （`_loadEntries` → `_rewriteFile`），空文件也会被写一个 header 进去；而那个文件此刻可能正被活着的会话追加。
 *   `inMemory` 的 `persist` 是 false，`_rewriteFile` 第一句就返回。
 *   也放弃 `SessionManager.list` 的 `allMessagesText`：它不含工具调用与输出，也没有逐条的位置。
 * - **不变式挂在**：本文件不出现会写盘的入口——`tests/ui/design-contract.test.ts`「全文搜索只读」。
 */
import { readFileSync } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { parseSessionEntries, SessionManager } from "@earendil-works/pi-coding-agent"
import { 还原历史, 换上方案卡 } from "./history.js"
import { 续接哪份 } from "./pi-resume.js"
import { 公开, 方案簿文件名, type 方案记录 } from "./plan-book.js"
import type { 方案 } from "../protocol/plan.js"
import type { RestoredItem } from "./types.js"

/** 一段对话的 pi 记录目录。与 `NativeRuntime.start` 里 `join(agentDir, "sessions")`、`agentDir = join(spec.sessionDir, "pi")` 同一处 */
export function pi记录目录(sessionDir: string): string {
  return join(sessionDir, "pi", "sessions")
}

export interface 记录文件 {
  path: string
  mtimeMs: number
  size: number
}

/**
 * 续接时读的是哪个文件——**与续接同一个函数**（`pi-resume.ts` 的 `续接哪份`）：目录里的 `.jsonl` 按 mtime 从新到旧、头一个读得出会话 header 的。
 *
 * 2026-09-28 审查让搜索与续接读同一个文件：此前各挑各的，搜到的 `itemId` / `nth` 落在另一份转录里，点过去就跳歪。
 * 2026-09-29 起续接不再按 cwd 过滤（搬过家的对话续不上，见 `pi-resume.ts`），这里跟着——**两边是同一个函数，不再是两份长得一样的规则**。
 * 真对不上时（文件在两次之间变了）界面的 `定位命中` 找不到就说「没找到」，不乱跳。
 *
 * **没有目录 / 没有文件 → undefined**：这段对话还没有一轮说完（pi 等第一条 assistant 才落盘）——不是「读不了」。
 */
export async function 最新记录(sessionDir: string): Promise<记录文件 | undefined> {
  const path = 续接哪份(pi记录目录(sessionDir))
  if (path === undefined) return undefined
  try {
    const s = await stat(path)
    return { path, mtimeMs: s.mtimeMs, size: s.size }
  } catch {
    // 挑中与 stat 之间被删了：当它不在
    return undefined
  }
}

/**
 * 读出来、还原成条目。**只读**——见文件头。
 * 给了 `sessionDir`（2026-09-28，搜索 × 先出方案）：再只读地读那段的方案簿，簿里有的 `propose_plan` 换成方案卡——
 * 与续接 `history()` 同一个 `换上方案卡`，搜到的 `plan:<id>` 与第几处才落在点开后的那一条上。
 */
export async function 读记录(path: string, sessionDir?: string): Promise<RestoredItem[]> {
  const 条 = 从文本还原(await readFile(path, "utf8"))
  if (sessionDir === undefined) return 条
  const 方案们 = await 读方案们(sessionDir)
  return 方案们.size === 0 ? 条 : 换上方案卡(条, (id) => 方案们.get(id))
}

/**
 * 一段会话方案簿里的每一版（按 planId），摘掉只给运行时用的指纹与存档（`公开`）。**只读**：不走 `方案簿` 类（它有写盘的入口）。
 * 没有簿 / 读不出来 → 空：与续接那边「簿读坏了就不换」同一个结果——不编状态。
 */
export async function 读方案们(sessionDir: string): Promise<Map<string, 方案>> {
  try {
    const 原 = JSON.parse(await readFile(join(sessionDir, 方案簿文件名), "utf8")) as { 方案们?: unknown }
    const 们 = Array.isArray(原.方案们) ? (原.方案们 as 方案记录[]) : []
    return new Map(们.filter((p) => p && typeof p.planId === "string").map((p) => [p.planId, 公开(p)]))
  } catch {
    return new Map()
  }
}

/**
 * 同一件事的同步版（2026-09-28）：子 agent 读盘重建（`subagent/run-dir.ts` `读子转录`）是同步的。
 * 此前它走 `SessionManager.open(f)`——旧版本或空的会话文件会被迁移重写 / 写进 header；与这里同一条只读路走。
 */
export function 读记录同步(path: string): RestoredItem[] {
  return 从文本还原(readFileSync(path, "utf8"))
}

function 从文本还原(text: string): RestoredItem[] {
  const entries = parseSessionEntries(text)
  // 旧版本记录：`_loadEntries` 在内存里迁移；`persist` 是 false，`_rewriteFile` 第一句就返回——盘上一字不动
  const sm = SessionManager.inMemory("/", undefined, entries)
  return 还原历史(sm.getBranch())
}
