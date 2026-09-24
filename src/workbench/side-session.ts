/**
 * 侧边对话（2026-09-24，学自 Codex；spec `2026-09-24-侧边对话-design.md`）。
 *
 * 两样东西，都是纯的、只存内存：
 * - `侧边对照`：此刻坞里挂的是哪段、主区是哪段。**权威在界面**——它在「挂上 / 拿下 / 主区换了」时
 *   发 `setSideSession`，启动时重发一次；后端只记最后一次说的。
 * - `主对话摘要`：`read_main_session` 工具回给模型的那段字。
 */
import type { SessionId } from "../runtime/types.js"
import type { TranscriptItem, QueuedMessage } from "../protocol/index.js"

export class 侧边对照 {
  private 侧边: SessionId | undefined
  private 主: SessionId | undefined

  /** 返回谁「进」了坞、谁「出」了坞——运行时据此启用 / 停用工具 */
  设(v: { side: SessionId | undefined; main: SessionId | undefined }): { 进: SessionId | undefined; 出: SessionId | undefined } {
    // 同一段只在一处：侧边与主是同一段 = 没有侧边
    const 新侧边 = v.side && v.side !== v.main ? v.side : undefined
    const 旧侧边 = this.侧边
    this.侧边 = 新侧边
    this.主 = v.main
    if (新侧边 === 旧侧边) return { 进: undefined, 出: undefined }
    return { 进: 新侧边, 出: 旧侧边 }
  }

  /** `sideId` 此刻是侧边时，它的主对话是谁；否则 undefined */
  主对话of(sideId: SessionId): SessionId | undefined {
    return this.侧边 === sideId ? this.主 : undefined
  }

  当前侧边(): SessionId | undefined {
    return this.侧边
  }

  /** 一段会话没了（归档 / 删除 / 关闭）。它是侧边 → 出；它是主 → 只清主 */
  忘掉(id: SessionId): { 出: SessionId | undefined } {
    if (this.主 === id) this.主 = undefined
    if (this.侧边 !== id) return { 出: undefined }
    this.侧边 = undefined
    return { 出: id }
  }
}

const 最多轮 = 6
const 每条最多字 = 600
const 最多产出 = 30

export function 主对话摘要(v: {
  title?: string | undefined
  items: readonly TranscriptItem[]
  queued: readonly QueuedMessage[]
  产出: readonly string[]
  /** 有几次工具调用没记下写了哪些文件（`artifactsOf().unknown` 的条数）。缺省 = 0 */
  未记录?: number
  /** 毫秒时间戳；测试里给定值 */
  现在: number
}): string {
  const 行: string[] = []
  行.push(`主对话${v.title ? `「${v.title}」` : ""}此刻的状态：`)

  // 按用户发言切轮：一轮 = 一句用户的话 + 其后到下一句用户话之前的所有 agent 发言
  const 轮: { 问: string; 答: { text: string; final: boolean }[] }[] = []
  for (const it of v.items) {
    if (it.type !== "turn") continue
    if (it.who === "user") 轮.push({ 问: it.text, 答: [] })
    else if (轮.length) 轮.at(-1)!.答.push({ text: it.text, final: it.final })
    else 轮.push({ 问: "", 答: [{ text: it.text, final: it.final }] })
  }
  if (轮.length === 0) {
    行.push("主对话还没有任何发言。")
  } else {
    const 省轮 = Math.max(0, 轮.length - 最多轮)
    if (省轮) 行.push(`（更早的 ${省轮} 轮没有列出）`)
    let 省字 = 0
    const 截 = (s: string) => {
      if (s.length <= 每条最多字) return s
      省字 += s.length - 每条最多字
      return `${s.slice(0, 每条最多字)}…`
    }
    for (const r of 轮.slice(省轮)) {
      if (r.问) 行.push(`你：${截(r.问)}`)
      for (const a of r.答) if (a.text) 行.push(`agent：${截(a.text)}${a.final ? "" : "（还在说）"}`)
    }
    if (省字) 行.push(`（长发言截断，共省了 ${省字} 字）`)
  }

  const 在跑 = v.items.filter((i): i is Extract<TranscriptItem, { type: "tool" }> => i.type === "tool" && i.status === "running")
  if (在跑.length === 0) 行.push("没有工具在跑。")
  for (const t of 在跑) {
    const 秒 = t.startedAt ? Math.round((v.现在 - t.startedAt) / 1000) : undefined
    const 入 = JSON.stringify(t.input ?? {})
    行.push(`正在跑：${t.name} ${入.length > 200 ? `${入.slice(0, 200)}…` : 入}${秒 === undefined ? "" : `（已跑 ${秒} 秒）`}`)
  }

  if (v.queued.length) {
    行.push(`待发条上还排着 ${v.queued.length} 句：`)
    for (const q of v.queued) 行.push(`- [${q.behavior === "steer" ? "插队" : "排队"}] ${q.text}`)
  }
  if (v.产出.length) {
    // 截断要说清省了多少（规格 7.5）
    const 省 = Math.max(0, v.产出.length - 最多产出)
    行.push(`这一段生成过的文件：${v.产出.slice(0, 最多产出).join("、")}${省 ? `（另有 ${省} 个没有列出）` : ""}`)
  }
  // 「没列出来」不等于「没写过」：记不下的那几次如实说
  if (v.未记录) 行.push(`另有 ${v.未记录} 次工具调用没有记下它写了哪些文件`)
  return 行.join("\n")
}
