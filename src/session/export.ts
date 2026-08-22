/**
 * 把一段对话的转录写成 markdown（codex-polish ④，2026-08-22，学自 dsh-codex-ui 的「Session log」）。
 * 纯函数：转录条目 → 文本。科研场景里它是「把这段讨论塞进实验记录」那一步。
 *
 * 写什么：标题、时间、模型；每一轮（你 / 助手）原文；工具调用只留一行摘要（名字、状态、耗时），
 * 输出不全抄——那是账本的事；通知条目照抄；末尾用量合计。
 */
import type { TranscriptItem } from "../protocol/index.js"

export interface 导出头 {
  title: string
  agentId: string
  createdAt: string
  workspace?: string | undefined
}

export function 转录成markdown(头: 导出头, items: readonly TranscriptItem[]): string {
  const 行: string[] = [`# ${头.title}`, "", `- 时间：${头.createdAt}`, `- agent：${头.agentId}`, ...(头.workspace ? [`- 工作目录：\`${头.workspace}\``] : []), ""]
  let 轮 = 0
  let input = 0
  let output = 0
  let cache = 0
  for (const it of items) {
    if (it.type === "turn") {
      if (it.who === "user") {
        轮 += 1
        行.push(`## 第 ${轮} 轮`, "", `**你：**`, "", it.text.trim(), "")
      } else {
        行.push(`**${it.by ?? 头.agentId}：**`, "", it.text.trim(), "")
        if (it.usage) {
          input += it.usage.input ?? 0
          output += it.usage.output ?? 0
          cache += it.usage.cacheRead ?? 0
        }
      }
    } else if (it.type === "tool") {
      const 耗 = it.startedAt !== undefined && it.endedAt !== undefined ? `，${Math.max(0, it.endedAt - it.startedAt)} ms` : ""
      行.push(`> 工具 ${it.name}（${it.status}${耗}）`, "")
    } else if (it.type === "notice") {
      行.push(`> 提示：${it.text.trim()}`, "")
    }
  }
  行.push("---", `用量合计：输入 ${input} · 输出 ${output} · 缓存 ${cache} token`, "")
  return 行.join("\n")
}

/** 文件名：标题去掉不能进文件名的字符，空了用 id */
export function 导出文件名(title: string, id: string): string {
  const 净 = title.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60)
  return `${净 || id}.md`
}
