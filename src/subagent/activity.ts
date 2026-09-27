/**
 * chip 上那一句（2026-09-27，spec §2.1 / D5）：在跑的子 agent 最近在干什么。
 * 工具名 + 最能说明它在干什么的那个参数；**一行、≤ 120 字**（协议 `activity` 的上界）。认不出参数就只写工具名，不编。
 */
export function 活动一句(toolName: string, input: unknown): string {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const 参 = [o.command, o.path, o.file_path, o.pattern, o.url].find((v): v is string => typeof v === "string" && v.trim() !== "")
  const 句 = 参 ? `${toolName} ${参.split("\n")[0]!.trim()}` : toolName
  return 句.length > 120 ? `${句.slice(0, 119)}…` : 句
}
