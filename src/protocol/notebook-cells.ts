/**
 * 笔记本的 cell 派生（2026-08-26 Task 6；2026-08-27 从 `src/ui/notebook.tsx` 搬来；坐在 `protocol/` 是因为 UI 只许跨到这一层，而后端也要用）：
 * 把转录里「你自己敲的」与「agent 跑的」代码执行，派生成一叠 cell。
 *
 * **纯函数、不碰 React**——界面的笔记本格与后端的 `exportNotebook`（.ipynb / .md）共用这一份。
 */
import type { TranscriptItem } from "./index.js"

/** 笔记本能跑的语言。`App.tsx` 也用它——别再抄一份 */
export type 语言 = "python" | "R"

/** 一格代码 + 它的输出。派生自转录，不是持久化状态 */
export interface Cell {
  n: number
  id: string
  who: "agent" | "you"
  /**
   * 语言。**孤儿 cell（没有 `kernelOutput.language`）可以没有这个字段**——
   * 那时我们真的不知道，不能替它猜一个 `"python"` 出来（见 `languageKnown`）。
   */
  language?: "python" | "R"
  /**
   * 语言是不是真的记录下来的，还是我们兜底猜的。
   *
   * `run_code` 认不出语言时仍落 `language: "python"`（代码前加注「语言未记录」，
   * 界面要有个语言可显示），但那是**猜的**——`languageKnown: false`。
   * 孤儿 cell 没有 `language` 字段时同理为 `false`；`kernelOutput` 带了 `language`
   * 或者是你自己敲的 `cell` 项时才是 `true`。
   */
  languageKnown: boolean
  code: string
  status: "running" | "ok" | "error"
  startedAt?: number
  runId?: string
  /** 被人按「中断」停下的（协议 7.27）。没被中断就没有这个键 */
  interrupted?: true
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
  language?: "python" | "R" | undefined
  languageKnown: boolean
  code: string
  status: "running" | "ok" | "error"
  startedAt?: number | undefined
  runId?: string | undefined
  interrupted?: true | undefined
  orphan?: true
}

/**
 * 把转录派生成一叠 cell。
 *
 * - `tool` 且 `name === "run_code"` → 开一个新 cell（who: agent）。
 *   语言认不出就落 `"python"`（`languageKnown: false`），代码前面加一行
 *   注明「语言未记录」——**别猜，但界面总得有个语言可显示**。
 * - `cell` → 开一个新 cell（who: you），status/runId 原样带过去，语言已知。
 * - `kernelOutput` → 挂到当前打开的 cell；但**两台内核并存**时（当前打开的 cell
 *   语言已知，且这条输出自带的 `language` 跟它不一样），改成挂到「自上一条
 *   `turn` 以来开过的 cell」里最近那个语言匹配的——不是硬塞进当前打开的那个。
 *   找不到匹配、或者压根没有打开的 cell，就开一个孤儿 cell（`orphan: true`，
 *   code 为空；`language` 取输出自带的那个，没带就没有这个字段），输出不丢。
 * - `turn`，或者不是 `run_code` 的 `tool` → 关掉当前 cell；`turn` 还清空
 *   「本轮开过的 cell」这个窗口。
 * - 别的条目类型（`notice`、`subagents`）既不开也不关。
 */
export function cells(items: readonly TranscriptItem[]): Cell[] {
  const result: Cell[] = []
  let open: Cell | undefined
  /** 自上一条 turn 以来开过的 cell，最旧的在前——两台内核并存时靠它找回正确的那个 */
  let 本轮窗口: Cell[] = []
  let n = 0

  const push = (input: 待开cell) => {
    n += 1
    const c: Cell = {
      n,
      id: input.id,
      who: input.who,
      languageKnown: input.languageKnown,
      code: input.code,
      status: input.status,
      outputs: [],
    }
    if (input.language !== undefined) c.language = input.language
    if (input.startedAt !== undefined) c.startedAt = input.startedAt
    if (input.runId !== undefined) c.runId = input.runId
    if (input.interrupted) c.interrupted = true
    if (input.orphan) c.orphan = true
    open = c
    本轮窗口.push(c)
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
            languageKnown: 认得语言,
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
          languageKnown: true,
          code: item.code,
          status: item.status,
          startedAt: item.startedAt,
          runId: item.runId,
          interrupted: item.interrupted,
        })
        break
      }
      case "kernelOutput": {
        // 当前打开的 cell 语言已知、且跟这条输出自带的语言对不上 → 两台内核并存，
        // 别硬塞给它——去本轮窗口里找最近那个语言匹配的
        if (open && open.languageKnown && item.language !== undefined && open.language !== item.language) {
          // 从后往前找最近那个语言匹配的——不复制、不 reverse：
          // 你自己敲的 `cell` 项不带 `turn`，两台内核并存的笔记本会话里这个窗口不会重置，
          // 每条输出都拷一遍窗口就是 O(n²)
          let 匹配: Cell | undefined
          for (let i = 本轮窗口.length - 1; i >= 0; i--) {
            const c = 本轮窗口[i]!
            if (c.languageKnown && c.language === item.language) {
              匹配 = c
              break
            }
          }
          if (匹配) {
            匹配.outputs.push(item)
            break
          }
          push({
            id: item.id,
            who: "agent",
            language: item.language,
            languageKnown: true,
            code: "",
            status: "ok",
            orphan: true,
          })
          open!.outputs.push(item)
          break
        }
        if (!open) {
          push({
            id: item.id,
            who: "agent",
            language: item.language,
            languageKnown: Boolean(item.language),
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
        本轮窗口 = []
        break
      }
      default:
        // notice / subagents：既不开也不关
        break
    }
  }

  return result
}

