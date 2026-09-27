/**
 * 用 **pi 自己的** `SessionManager` 写一段记录（2026-09-27，会话全文搜索的测试夹具）。
 * 不手拼 JSONL：记录的形状（header、id / parentId 链、版本号）归 pi 管，手拼的会在 pi 升级时悄悄变成「旧版本」。
 */
import { join } from "node:path"
import { SessionManager } from "@earendil-works/pi-coding-agent"

export type 一句 =
  | { who: "user"; text: string }
  | { who: "agent"; text: string; 调?: { id: string; name: string; args: Record<string, unknown>; 出: string } }

/** 写进 `<sessionDir>/pi/sessions/`（与 `NativeRuntime.start` 的 `记录目录` 同一处）。返回文件路径 */
export function 写一段pi记录(sessionDir: string, 句们: readonly 一句[], opts: { cwd?: string; 起?: number } = {}): string {
  const sm = SessionManager.create(opts.cwd ?? "/w", join(sessionDir, "pi", "sessions"))
  let t = opts.起 ?? Date.parse("2026-08-20T10:00:00Z")
  for (const s of 句们) {
    t += 60_000
    if (s.who === "user") {
      sm.appendMessage({ role: "user", content: s.text, timestamp: t } as never)
      continue
    }
    sm.appendMessage({
      role: "assistant",
      content: [
        { type: "text", text: s.text },
        ...(s.调 ? [{ type: "toolCall", id: s.调.id, name: s.调.name, arguments: s.调.args }] : []),
      ],
      stopReason: s.调 ? "toolUse" : "stop",
      timestamp: t,
    } as never)
    if (s.调) {
      sm.appendMessage({
        role: "toolResult",
        toolCallId: s.调.id,
        toolName: s.调.name,
        content: [{ type: "text", text: s.调.出 }],
        isError: false,
        timestamp: t + 1,
      } as never)
    }
  }
  const f = sm.getSessionFile()
  if (!f) throw new Error("pi 没给记录文件路径——夹具写不出来")
  return f
}
