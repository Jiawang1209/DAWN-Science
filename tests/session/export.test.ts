/** 对话导成 markdown（codex-polish ④）：轮、助手署名、工具一行、用量合计；文件名去掉不能进文件名的字符 */
import { describe, expect, it } from "vitest"
import { 转录成markdown, 导出文件名 } from "../../src/session/export.js"
import type { TranscriptItem } from "../../src/protocol/index.js"

describe("转录成markdown", () => {
  it("轮按你说的话数；助手用 by；工具只一行；末尾合计", () => {
    const items: TranscriptItem[] = [
      { type: "turn", id: "u1", who: "user", text: "看看数据", final: true },
      { type: "tool", id: "t1", name: "bash", status: "ok", startedAt: 1000, endedAt: 1800 } as TranscriptItem,
      { type: "turn", id: "a1", who: "agent", text: "看完了", final: true, by: "kimi", usage: { input: 100, output: 20, cacheRead: 50 } },
      { type: "notice", id: "n1", text: "换了模型" } as TranscriptItem,
      { type: "turn", id: "u2", who: "user", text: "再看一遍", final: true },
      { type: "turn", id: "a2", who: "agent", text: "一样", final: true, usage: { input: 30, output: 5 } },
    ]
    const md = 转录成markdown({ title: "早报", agentId: "ds-chat", createdAt: "2026-08-22T01:00:00Z", workspace: "/w" }, items)
    expect(md).toContain("# 早报")
    expect(md).toContain("- 工作目录：`/w`")
    expect(md).toContain("## 第 1 轮")
    expect(md).toContain("## 第 2 轮")
    expect(md).toContain("**kimi：**")
    expect(md).toContain("**ds-chat：**")
    expect(md).toContain("> 工具 bash（ok，800 ms）")
    expect(md).toContain("> 提示：换了模型")
    expect(md).toContain("用量合计：输入 130 · 输出 25 · 缓存 50 token")
  })
  it("文件名", () => {
    expect(导出文件名("湿地/蜻蜓: 第二次?", "s1")).toBe("湿地 蜻蜓 第二次.md")
    expect(导出文件名("   ", "s1")).toBe("s1.md")
  })
})
