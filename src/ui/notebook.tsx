/**
 * 笔记本（Task 6，2026-08-26）：把转录里「你自己敲的」与「agent 跑的」代码执行，
 * 派生成一叠 cell。
 *
 * 这里只放纯函数派生——面板（Task 7）在这之上渲染，不在此文件。
 */
import type { TranscriptItem } from "../protocol/index.js"

/** 一格代码 + 它的输出。派生自转录，不是持久化状态 */
export interface Cell {
  n: number
  id: string
  who: "agent" | "you"
  language: "python" | "R"
  code: string
  status: "running" | "ok" | "error"
  startedAt?: number
  runId?: string
  outputs: Extract<TranscriptItem, { type: "kernelOutput" }>[]
  /**
   * 孤儿输出兜底出来的 cell——没有对应的 `run_code` 或 `cell` 条目，
   * 只有飘过来的 `kernelOutput`。界面据此显示「（未记录代码）」，而不是假装有代码。
   */
  orphan?: true
}

const 已知语言 = new Set(["python", "R"])

function 是已知语言(v: unknown): v is "python" | "R" {
  return typeof v === "string" && 已知语言.has(v)
}

/** push() 的输入：内部用，允许显式 undefined（exactOptionalPropertyTypes 下的写法） */
interface 待开cell {
  id: string
  who: "agent" | "you"
  language: "python" | "R"
  code: string
  status: "running" | "ok" | "error"
  startedAt?: number | undefined
  runId?: string | undefined
  orphan?: true
}

/**
 * 把转录派生成一叠 cell。
 *
 * - `tool` 且 `name === "run_code"` → 开一个新 cell（who: agent）。
 *   语言认不出就落 `"python"`，代码前面加一行注明「语言未记录」——**别猜**。
 * - `cell` → 开一个新 cell（who: you），status/runId 原样带过去。
 * - `kernelOutput` → 挂到当前打开的 cell；没有打开的 cell 就先开一个孤儿 cell
 *   （`orphan: true`，code 为空），输出不丢。
 * - `turn`，或者不是 `run_code` 的 `tool` → 关掉当前 cell。
 * - 别的条目类型（`notice`、`subagents`）既不开也不关。
 */
export function cells(items: readonly TranscriptItem[]): Cell[] {
  const result: Cell[] = []
  let open: Cell | undefined
  let n = 0

  const push = (input: 待开cell) => {
    n += 1
    const c: Cell = {
      n,
      id: input.id,
      who: input.who,
      language: input.language,
      code: input.code,
      status: input.status,
      outputs: [],
    }
    if (input.startedAt !== undefined) c.startedAt = input.startedAt
    if (input.runId !== undefined) c.runId = input.runId
    if (input.orphan) c.orphan = true
    open = c
    result.push(c)
  }
  const close = () => {
    open = undefined
  }

  for (const item of items) {
    switch (item.type) {
      case "tool": {
        if (item.name === "run_code") {
          const input = item.input as { language?: unknown; code?: unknown } | undefined
          const 认得语言 = 是已知语言(input?.language)
          const 原始代码 = typeof input?.code === "string" ? input.code : ""
          push({
            id: item.id,
            who: "agent",
            language: 认得语言 ? (input!.language as "python" | "R") : "python",
            code: 认得语言 ? 原始代码 : `# （语言未记录）\n${原始代码}`,
            status: item.status,
            startedAt: item.startedAt,
          })
        } else {
          close()
        }
        break
      }
      case "cell": {
        push({
          id: item.id,
          who: "you",
          language: item.language,
          code: item.code,
          status: item.status,
          startedAt: item.startedAt,
          runId: item.runId,
        })
        break
      }
      case "kernelOutput": {
        if (!open) {
          push({
            id: item.id,
            who: "agent",
            language: item.language ?? "python",
            code: "",
            status: "ok",
            orphan: true,
          })
        }
        open!.outputs.push(item)
        break
      }
      case "turn": {
        close()
        break
      }
      default:
        // notice / subagents：既不开也不关
        break
    }
  }

  return result
}
