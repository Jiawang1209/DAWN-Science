/**
 * 「换一个 LLM」菜单里该放谁（2026-08-11）。
 *
 * 作者：*「同一个对话，我切换模型，依旧会弹出新的对话，而不是继续对话。」*
 *
 * 同一家在「就地换」和「新建会话」两组里各出现一次，而人是照着
 * 「换 LLM」这几个字点的——**同样的形状配不同的语义，最容易让人按错**。
 */
import { describe, expect, it } from "vitest"
import { 新建会话可选的 } from "../../src/ui/agents.js"

const kind = (id: string) => (id.endsWith("-cli") ? "cli" : "native")

describe("新建会话那一组", () => {
  it("**能就地换的就不再出现一次** —— 那正是被按错的那一个", () => {
    expect(新建会话可选的(["ds-chat", "kimi", "claude-cli"], kind, true)).toEqual(["claude-cli"])
  })

  it("**换不过去的仍然留着** —— 一个 API 会话没法半路变成 claude 会话", () => {
    expect(新建会话可选的(["ds-chat", "codex-cli"], kind, true)).toContain("codex-cli")
  })

  it("**没有「就地换」那一组时给全量** —— 否则 CLI 会话里一个选项都看不到", () => {
    expect(新建会话可选的(["ds-chat", "claude-cli"], kind, false)).toEqual(["ds-chat", "claude-cli"])
  })
})
