import { describe, expect, it } from "vitest"
import { 按类分组 } from "../../src/ui/agent-groups.js"

const kind = (id: string) =>
  id.endsWith("-acp") ? ("acp" as const) : id.endsWith("-cli") ? ("cli" as const) : id === "py" ? ("kernel" as const) : ("native" as const)
const label = (id: string) => ({ "ds-chat": "DeepSeek", kimi: "Kimi", bigmodel: "bigmodel" })[id] ?? id

describe("新建会话那一组：按 API / ACP / CLI 分组，组内按字母", () => {
  it("三路各成一组，顺序 API → ACP → CLI → 其它", () => {
    const g = 按类分组(["codex-acp", "kimi", "claude-cli", "ds-chat", "py", "claude-code-acp"], kind, label)
    expect(g.map((x) => x.kind)).toEqual(["native", "acp", "cli", "其它"])
  })
  it("组内按显示名的字母序，**不分大小写**", () => {
    const g = 按类分组(["kimi", "ds-chat", "bigmodel"], kind, label)
    expect(g[0]!.agentIds).toEqual(["bigmodel", "ds-chat", "kimi"])
    const acp = 按类分组(["codex-acp", "claude-code-acp"], kind, label)
    expect(acp[0]!.agentIds).toEqual(["claude-code-acp", "codex-acp"])
  })
  it("空的组不出现", () => {
    expect(按类分组(["ds-chat"], kind, label).map((x) => x.kind)).toEqual(["native"])
  })
})
