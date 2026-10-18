/** 子面板的展示投影；不修改转录、工具调用或交回文本。 */
import type { TranscriptItem } from "../protocol/index.js"
import { t } from "./i18n/index.js"
type Tool = Extract<TranscriptItem, {type: "tool"}>
type ResourceLabel = {name?: string; description?: string; kind?: string}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function result(tool: Tool): Record<string, unknown> {
  try {return record(JSON.parse(tool.result ?? ""))} catch {return {}}
}
const text = (value: unknown) => typeof value === "string" ? value : ""
export function resourceLabels(items: readonly TranscriptItem[]): Map<string, ResourceLabel> {
  const labels = new Map<string, ResourceLabel>()
  for (const item of items) if (item.type === "tool" && item.name === "resource_search") {
    const rows = result(item).items
    if (Array.isArray(rows)) for (const row of rows) {
      const r = record(row)
      if (typeof r.id === "string") labels.set(r.id, {name: text(r.name), description: text(r.description), kind: text(r.kind)})
    }
  }
  return labels
}
export function subagentToolSummary(item: Tool, labels: ReadonlyMap<string, ResourceLabel>): {label: string; detail: string} | undefined {
  const input = record(item.input), output = result(item)
  if (item.name === "resource_search") return {label: input.kind === "skill" ? t("查询相关技能") : input.kind === "memory" ? t("查询相关记忆") : t("查询可用资源"), detail: text(input.query)}
  if (item.name === "resource_read") {
    const known = labels.get(text(input.id))
    const kind = text(output.kind) || known?.kind
    const heading = text(output.content).match(/^#\s+(.+)$/m)?.[1]?.trim()
    return {label: kind === "skill" ? t("读取技能") : kind === "memory" ? t("读取相关记忆") : t("读取资源正文"),
      detail: kind === "skill" ? heading || text(output.name) || known?.name || "" : known?.description || text(output.name)}
  }
  if (item.name === "read") return {label: t("读取文件"), detail: text(input.path)}
  if (item.name === "bash") return {label: t("运行命令"), detail: text(input.command)}
  return undefined
}
export function subagentAnswerIds(items: readonly TranscriptItem[]): Set<string> {
  const answers = new Set<string>()
  let candidate: string | undefined
  for (const item of items) {
    if (item.type === "turn" && item.who === "user") {
      if (candidate) answers.add(candidate)
      candidate = undefined
    } else if (item.type === "tool" || (item.type === "notice" && item.failed)) candidate = undefined
    else if (item.type === "turn" && item.who === "agent" && item.final && item.text.trim()) candidate = item.id
  }
  if (candidate) answers.add(candidate)
  return answers
}
