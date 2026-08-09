/**
 * 工具输出的预算与溢出（①-B″ · R2）。
 *
 * **这是修一个正在生效的缺陷。**
 *
 * ```ts
 * // 修复前的 native.ts
 * text: content.map(c => c.text ?? "").join("").slice(0, 2000)
 * ```
 *
 * runtime 层硬砍 2000 字符，**不出声、不留路径**。它违反规格 7.5，
 * 而且与 Task 3.1 自相矛盾——界面层认真做了「还有 N 行」的出声，
 * 而更早的 runtime 层已经把内容砍掉了。**界面折叠里那个「全文」本身就是残缺品。**
 *
 * ## 双份的含义
 *
 * ```
 * 完整输出  →  写盘（<sessionDir>/tool-output/），用户可取回
 * 摘要      →  头 + 尾，进事件流
 * 字节数    →  真数，供界面说「还有多少」
 * ```
 *
 * 学自 wisp 的 `budget_tool_result`。**模型侧的上下文预算不归我们管**——
 * 那是 pi 的职责（它对 bash 已有 `fullOutputPath`），我们不越界重做一套。
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/**
 * 进事件流的字节上界。
 *
 * 16 KiB：够看清一次 `ls` 或一段编译错误，又不至于让一次 `cat` 大文件
 * 把整条事件流撑爆。**它是传输预算，不是显示偏好**——界面自己还会再折叠。
 */
export const TOOL_OUTPUT_BUDGET = 16 * 1024

export interface BudgetedOutput {
  /** 进事件流的正文。截断时是「头 + 说明 + 尾」 */
  text: string
  truncated: boolean
  /** **原始**字节数，不是截断后的。界面靠它说真话 */
  bytes: number
  /** 全文落盘位置。写盘失败时缺省——**那时更要在正文里说清楚** */
  fullOutputPath?: string
}

export interface BudgetOptions {
  /** 每会话隔离目录。沿用 pi 的 sessionDir，不新造顶层目录 */
  sessionDir: string
  toolName: string
  /** 覆盖上界，测试用 */
  budget?: number
  /** 可注入的时间戳，让文件名可预测。生产走 `Date.now()` */
  now?: () => number
}

/** 文件名里不能有路径分隔符。**MCP 工具名可能长成 `mcp/fs/read`** */
const safeName = (name: string) => name.replace(/[/\\:]/g, "_")

/**
 * 按字节预算截断，并把全文写盘。
 *
 * **写盘失败不连累主流程**：拿不到全文时返回没有路径的结果，
 * 但正文里仍然说明省略了多少——**丢内容而不出声是最坏的一种**。
 */
export function budgetToolResult(text: string, opts: BudgetOptions): BudgetedOutput {
  const bytes = Buffer.byteLength(text, "utf8")
  const budget = opts.budget ?? TOOL_OUTPUT_BUDGET
  if (bytes <= budget) return { text, truncated: false, bytes }

  const fullOutputPath = spill(text, opts)
  const omitted = bytes - budget

  // 头尾各一半。**尾巴必须留**——错误信息、退出码、最后一行的结论都在那里，
  // 只留头等于把最有用的部分砍掉
  const half = Math.floor(budget / 2)
  const head = sliceBytes(text, 0, half)
  const tail = sliceBytes(text, bytes - half, half)

  const marker = fullOutputPath
    ? `\n\n[… 省略约 ${omitted} 字节。完整输出已保存：${fullOutputPath} —— 用 read/grep 取窄范围，不要整份读回 …]\n\n`
    : `\n\n[… 省略约 ${omitted} 字节，且**未能写盘保存**。完整内容已丢失——请缩小范围或加过滤条件重跑 …]\n\n`

  return { text: head + marker + tail, truncated: true, bytes, ...(fullOutputPath ? { fullOutputPath } : {}) }
}

/** 写全文。失败返回 undefined —— 调用方负责在正文里说明 */
function spill(text: string, opts: BudgetOptions): string | undefined {
  try {
    const dir = join(opts.sessionDir, "tool-output")
    mkdirSync(dir, { recursive: true })
    const stamp = (opts.now ?? Date.now)()
    const path = join(dir, `${safeName(opts.toolName)}-${stamp}.txt`)
    writeFileSync(path, text, "utf8")
    return path
  } catch {
    return undefined
  }
}

/**
 * 按**字节**取一段，且不切断多字节字符。
 *
 * 直接用 `String.slice` 是按 UTF-16 码元切的，对中文会算错长度；
 * 直接切 Buffer 又会把一个汉字劈成两半、渲染成乱码。
 */
function sliceBytes(text: string, startByte: number, lengthBytes: number): string {
  const buf = Buffer.from(text, "utf8")
  const cut = buf.subarray(startByte, startByte + lengthBytes)
  // 末尾若落在多字节字符中间，Node 会解成替换字符——退一格直到干净
  let end = cut.length
  while (end > 0 && cut.toString("utf8", 0, end).endsWith("�")) end--
  let out = cut.toString("utf8", 0, end)
  // 开头同理（尾段可能从字符中间开始）
  while (out.startsWith("�")) out = out.slice(1)
  return out
}
