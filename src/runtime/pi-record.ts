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
import { createReadStream, readFileSync } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { join, resolve } from "node:path"
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
 * 续接时 pi 读的是哪个文件——**与 pi `findMostRecentSession` 同一条规则**：目录里的 `.jsonl` 按 mtime 从新到旧，
 * 头一个 header 里 `cwd` 等于这段对话工作目录的（`continueRecent(spec.workspace, 记录目录)` 用的是自己的目录，所以 pi 会按 cwd 过滤）。
 *
 * 2026-09-28 审查补上 cwd 过滤：此前只挑 mtime 最新，`rehome` 之后搜的与续接读的可能是两个文件——
 * 搜到的 `itemId` / `nth` 落在另一份转录里，点过去就跳歪。现在两边读同一个；
 * 真对不上时（文件在两次之间变了）界面的 `定位命中` 找不到就说「没找到」，不乱跳。
 * `cwd` 缺省 = 不过滤（只给测试与没有工作目录的调用方）。
 *
 * **没有目录 / 没有文件 / 没有 cwd 对得上的 → undefined**：这段对话还没有一轮说完（pi 等第一条 assistant 才落盘），
 * 或者续接也读不到它——不是「读不了」。
 */
export async function 最新记录(sessionDir: string, cwd?: string): Promise<记录文件 | undefined> {
  const dir = pi记录目录(sessionDir)
  let 名们: string[]
  try {
    名们 = (await readdir(dir)).filter((n) => n.endsWith(".jsonl"))
  } catch {
    return undefined
  }
  const 文件们: 记录文件[] = []
  for (const n of 名们) {
    const p = join(dir, n)
    try {
      const s = await stat(p)
      文件们.push({ path: p, mtimeMs: s.mtimeMs, size: s.size })
    } catch {
      // 列目录与 stat 之间被删了：当它不在
    }
  }
  文件们.sort((a, b) => b.mtimeMs - a.mtimeMs)
  if (cwd === undefined) return 文件们[0]
  const 要 = resolve(cwd)
  for (const f of 文件们) {
    const 头 = await 读头(f.path)
    if (头 !== undefined && 头 !== "" && resolve(头) === 要) return f
  }
  return undefined
}

/** header 最多往前看这么多字节（pi 的 `MAX_SESSION_HEADER_SCAN_BYTES` 同一个量级）；只读头，不把整份读进来 */
const 头扫描上限 = 64 * 1024

/** 记录头里的 `cwd`。读不出 / 没有 header → undefined（pi 的发现也是「当它不是一段会话」） */
async function 读头(path: string): Promise<string | undefined> {
  let 文 = ""
  try {
    for await (const 块 of createReadStream(path, { encoding: "utf8", start: 0, end: 头扫描上限 - 1 })) {
      文 += 块 as string
      if (文.includes("\n")) break
    }
  } catch {
    return undefined
  }
  for (const 行 of 文.split("\n")) {
    if (!行.trim()) continue
    try {
      const h = JSON.parse(行) as { type?: unknown; cwd?: unknown }
      if (h.type === "session") return typeof h.cwd === "string" ? h.cwd : undefined
    } catch {
      // 坏行：pi 跳过，接着找
    }
  }
  return undefined
}

/** 读出来、还原成条目。**只读**——见文件头 */
export async function 读记录(path: string): Promise<RestoredItem[]> {
  return 从文本还原(await readFile(path, "utf8"))
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
