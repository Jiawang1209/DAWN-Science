/**
 * 打包版首启（2026-08-28）：默认配置只有 claude / codex（cli），填 key 合成的 native 追加在末尾，
 * 空态屏拿 `agents[0]` 开口——走的是 claude CLI。这条锁住「有 native 就先 native」。
 */
import { describe, expect, it } from "vitest"
import { 对话agent顺序 } from "../../src/ui/agent-order.js"

describe("对话 agent 顺序", () => {
  it("全新安装的形状：cli 在前、合成的 native 在后 → native 提到第一个", () => {
    const agents = [
      { agentId: "claude", kind: "cli" },
      { agentId: "codex", kind: "cli" },
      { agentId: "shell", kind: "pty" },
      { agentId: "deepseek", kind: "native" },
    ]
    expect(对话agent顺序(agents)).toEqual(["deepseek", "claude", "codex"])
  })

  it("同类之内保持配置里的次序；终端不进清单", () => {
    const agents = [
      { agentId: "ds-chat", kind: "native" },
      { agentId: "claude", kind: "cli" },
      { agentId: "kimi", kind: "native" },
      { agentId: "shell", kind: "pty" },
      { agentId: "codex-acp", kind: "acp" },
    ]
    expect(对话agent顺序(agents)).toEqual(["ds-chat", "kimi", "claude", "codex-acp"])
  })

  it("没有 native 时顺序不变——不替用户挑", () => {
    expect(对话agent顺序([{ agentId: "codex", kind: "cli" }, { agentId: "claude", kind: "cli" }])).toEqual(["codex", "claude"])
  })
})
