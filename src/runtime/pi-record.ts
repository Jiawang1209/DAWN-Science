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
import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { parseSessionEntries, SessionManager } from "@earendil-works/pi-coding-agent"
import { 还原历史 } from "./history.js"
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
 * 续接时 pi 读的是哪个文件：目录里 mtime 最新的 `.jsonl`（pi `findMostRecentSession` 的规则）。
 *
 * pi 另按 header 里的 `cwd` 过滤一次；同一个会话目录里的文件 cwd 都是这段对话的，
 * 只有 `rehome` 之后才可能不同——那时搜索仍搜最新那份（宁可搜得到）。
 *
 * **没有目录 / 没有文件 → undefined**：这段对话还没有一轮说完（pi 等第一条 assistant 才落盘），不是「读不了」。
 */
export async function 最新记录(sessionDir: string): Promise<记录文件 | undefined> {
  const dir = pi记录目录(sessionDir)
  let 名们: string[]
  try {
    名们 = (await readdir(dir)).filter((n) => n.endsWith(".jsonl"))
  } catch {
    return undefined
  }
  let 最新: 记录文件 | undefined
  for (const n of 名们) {
    const p = join(dir, n)
    try {
      const s = await stat(p)
      if (!最新 || s.mtimeMs > 最新.mtimeMs) 最新 = { path: p, mtimeMs: s.mtimeMs, size: s.size }
    } catch {
      // 列目录与 stat 之间被删了：当它不在
    }
  }
  return 最新
}

/** 读出来、还原成条目。**只读**——见文件头 */
export async function 读记录(path: string): Promise<RestoredItem[]> {
  const entries = parseSessionEntries(await readFile(path, "utf8"))
  // 旧版本记录：`_loadEntries` 在内存里迁移；`persist` 是 false，`_rewriteFile` 第一句就返回——盘上一字不动
  const sm = SessionManager.inMemory("/", undefined, entries)
  return 还原历史(sm.getBranch())
}
