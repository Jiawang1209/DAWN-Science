/**
 * 笔记本导出（2026-08-27，fix-notebook）：把派生出来的 cell 写成 `.ipynb` 或 `.md`。纯函数。
 *
 * 纪律只有一条：**如实**。
 * - 混用 Python 与 R 的对话不硬塞进一个 kernelspec——顶上一格 markdown 说明，与 kernelspec 不同语言的 cell 首行注明。
 * - 截断 / 太大要说清省了多少（规格 7.5），不是「已截断」三个字。
 * - 孤儿 cell（只有输出、没记录代码）不假装有代码。
 * - 图内嵌 base64：单文件带走，代价是文件大——作者定的。
 */
import type { TranscriptItem } from "../protocol/index.js"
import type { Cell, 语言 } from "../protocol/notebook-cells.js"
import { 导出文件名 } from "./export.js"

export interface 笔记本头 {
  title: string
  agentId: string
  createdAt: string
  workspace?: string | undefined
}

type 输出 = Extract<TranscriptItem, { type: "kernelOutput" }>["output"]

const 语言名: Record<语言, string> = { python: "Python", R: "R" }
const KB = (n: number) => `${Math.round(n / 1024)} KB`
const 截断句 = (t: { originalBytes: number; keptBytes: number }) => `（已截断：原 ${KB(t.originalBytes)}，保留 ${KB(t.keptBytes)}）`
const 太大句 = (bytes: number) => `（输出太大未保留：${KB(bytes)}）`
const 去ANSI = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")

/** 多数 cell 用的那门语言；平手或没有已知语言时 Python */
function 主语言(cells: readonly Cell[]): 语言 {
  let py = 0
  let r = 0
  for (const c of cells) {
    if (!c.languageKnown) continue
    if (c.language === "R") r += 1
    else if (c.language === "python") py += 1
  }
  return r > py ? "R" : "python"
}

/** nbformat 的 `source` 是按行切、每行保留 `\n` 的数组 */
function 按行(s: string): string[] {
  if (s === "") return []
  const 行 = s.split("\n")
  return 行.map((l, i) => (i < 行.length - 1 ? `${l}\n` : l)).filter((l) => l !== "")
}

/** 源码前面要不要加一行注释：语言与 kernelspec 不同、语言未记录、孤儿 */
function 源码(c: Cell, 主: 语言): string {
  const 注: string[] = []
  if (c.orphan) 注.push("# （未记录代码）")
  if (!c.languageKnown) 注.push("# [语言未记录]")
  else if (c.language !== undefined && c.language !== 主) 注.push(`# [${语言名[c.language]} 内核]`)
  return 注.length ? `${注.join("\n")}\n${c.code}` : c.code
}

function ipynb输出(o: 输出, n: number): Record<string, unknown> {
  switch (o.kind) {
    case "stream":
      return { output_type: "stream", name: o.stream, text: 按行(o.truncated ? `${o.text}\n${截断句(o.truncated)}` : o.text) }
    case "error":
      return { output_type: "error", ename: o.ename, evalue: o.evalue, traceback: o.traceback }
    case "result":
    case "display": {
      if (o.tooLarge) return { output_type: "stream", name: "stderr", text: [太大句(o.bytes)] }
      // 文字类 mime 按 nbformat 惯例切行；二进制（base64）整段一个字符串
      const 文字 = o.mediaType.startsWith("text/") || o.mediaType === "application/json"
      const data = { [o.mediaType]: 文字 ? 按行(o.truncated ? `${o.data}\n${截断句(o.truncated)}` : o.data) : o.data }
      return o.kind === "result"
        ? { output_type: "execute_result", execution_count: n, data, metadata: {} }
        : { output_type: "display_data", data, metadata: {} }
    }
  }
}

export function cells成ipynb(头: 笔记本头, cells: readonly Cell[]): string {
  const 主 = 主语言(cells)
  const 混排 = cells.some((c) => c.languageKnown && c.language !== undefined && c.language !== 主)
  const 说明 = [
    `# ${头.title}`,
    "",
    `- 时间：${头.createdAt}`,
    `- agent：${头.agentId}`,
    ...(头.workspace ? [`- 工作目录：\`${头.workspace}\``] : []),
    ...(混排 ? ["", `这段对话混用了 Python 与 R；kernelspec 按多数取了 ${语言名[主]}，另一门语言的 cell 首行注明了语言。`] : []),
  ].join("\n")
  const 出: Record<string, unknown>[] = []
  // 只有混排时才值得占一格说明；单一语言的 notebook 顶上不放东西——打开就是代码
  if (混排) out(出, { cell_type: "markdown", id: "dawn-note", metadata: {}, source: 按行(说明) })
  for (const c of cells) {
    const dawn: Record<string, unknown> = { who: c.who }
    if (c.startedAt !== undefined) dawn.startedAt = c.startedAt
    if (c.runId !== undefined) dawn.runId = c.runId
    if (c.interrupted) dawn.interrupted = true
    out(出, {
      cell_type: "code",
      id: c.id,
      execution_count: c.n,
      metadata: { dawn },
      source: 按行(源码(c, 主)),
      outputs: c.outputs.map((o) => ipynb输出(o.output, c.n)),
    })
  }
  const kernelspec =
    主 === "R" ? { name: "ir", display_name: "R", language: "R" } : { name: "python3", display_name: "Python 3", language: "python" }
  return `${JSON.stringify(
    {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { kernelspec, dawn: { title: 头.title, agentId: 头.agentId, createdAt: 头.createdAt, ...(头.workspace ? { workspace: 头.workspace } : {}) } },
      cells: 出,
    },
    null,
    1,
  )}\n`
}

function out(arr: Record<string, unknown>[], cell: Record<string, unknown>): void {
  arr.push(cell)
}

function 围栏(lang: string, body: string): string[] {
  return [`\`\`\`${lang}`, body.replace(/\n$/, ""), "```", ""]
}

function md输出(o: 输出, n: number): string[] {
  switch (o.kind) {
    case "stream":
      return 围栏("text", o.truncated ? `${o.text}\n${截断句(o.truncated)}` : o.text)
    case "error":
      return 围栏("text", 去ANSI(o.traceback.length ? o.traceback.join("\n") : `${o.ename}: ${o.evalue}`))
    case "result":
    case "display": {
      if (o.tooLarge) return [太大句(o.bytes), ""]
      const 尾 = o.truncated ? [截断句(o.truncated), ""] : []
      if (o.mediaType.startsWith("image/")) return [`![输出 ${n}](data:${o.mediaType};base64,${o.data})`, "", ...尾]
      if (o.mediaType === "text/markdown") return [o.data, "", ...尾]
      if (o.mediaType === "text/html") return [...围栏("html", o.data), ...尾]
      if (o.mediaType.startsWith("text/") || o.mediaType === "application/json") return [...围栏("text", o.data), ...尾]
      return [`（${o.mediaType}，${o.bytes} 字节）`, ""]
    }
  }
}

function 时刻(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function cells成markdown(头: 笔记本头, cells: readonly Cell[]): string {
  const 行: string[] = [`# ${头.title}`, "", `- 时间：${头.createdAt}`, `- agent：${头.agentId}`, ...(头.workspace ? [`- 工作目录：\`${头.workspace}\``] : []), ""]
  for (const c of cells) {
    const 语 = c.languageKnown && c.language !== undefined ? 语言名[c.language] : "语言未知"
    const 谁 = c.who === "you" ? "你" : "agent"
    const 时 = c.startedAt !== undefined ? ` · ${时刻(c.startedAt)}` : ""
    行.push(`### [${c.n}] ${语} · ${谁}${时}`, "")
    if (c.orphan) 行.push("（未记录代码）", "")
    else 行.push(...围栏(c.language === "R" ? "r" : "python", c.code))
    for (const o of c.outputs) 行.push(...md输出(o.output, c.n))
    if (c.interrupted) 行.push("（已中断）", "")
  }
  return 行.join("\n")
}

/** 「笔记本-」前缀，与对话导出（同标题同秒）不撞名 */
export function 笔记本文件名(title: string, id: string, ext: "ipynb" | "md", when: Date = new Date()): string {
  return `笔记本-${导出文件名(title, id, when).replace(/\.md$/, `.${ext}`)}`
}
