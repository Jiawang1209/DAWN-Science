import { describe, expect, it } from "vitest"
import { 内核请求标记, 本轮内核语言 } from "../../src/kernel/shortcuts.js"
import { 护住粘贴的艾特, 请求内核语言, 扫内核指令 } from "../../src/files/mentions.js"

describe("内核快捷入口", () => {
  it("三种入口与组合；标点是边界，路径、邮箱、代码、受保护粘贴不触发", () => {
    expect(请求内核语言("@R 统计")).toEqual(["R"])
    expect(请求内核语言("请用 @Py，算一下")).toEqual(["python"])
    expect(请求内核语言("@RPython 分析")).toEqual(["R", "python"])
    expect(请求内核语言("```code```\n@R 实际运行")).toEqual(["R"])
    expect(请求内核语言("````code````\n@Py 实际运行")).toEqual(["python"])
    expect(请求内核语言("@py 和 @r")).toEqual(["R", "python"])
    for (const s of ["x@R", "@R.csv", "@Py/", "@./R", "`@R` 是入口", "`` @R ``", "```` @Py ````", "示例：\n\n    @R\n", "> @Py", "```R\n@Py\n```", 护住粘贴的艾特("@R 统计")]) {
      expect(请求内核语言(s), s).toEqual([])
    }
    expect(扫内核指令("看看 @Py。然后")[0]).toMatchObject({ token: "Py", start: 3, end: 6 })
  })
  it("只约束最后送达的用户消息，下一条普通消息清除，工具消息不会覆盖", () => {
    const r = { role: "user", content: [{ type: "text", text: "@R\n" + 内核请求标记(["R"]) }] }
    expect(本轮内核语言([r, { role: "assistant", content: "tool call" }])).toEqual(["R"])
    expect(本轮内核语言([r, { role: "user", content: "继续聊" }])).toBeUndefined()
    expect(本轮内核语言([r, { role: "user", content: "@Py\n" + 内核请求标记(["python"]) }])).toEqual(["python"])
    expect(本轮内核语言([{ role: "user", content: 内核请求标记(["R"]) + "\n缓冲\n" + 内核请求标记(["python"]) }])).toEqual(["python"])
    expect(本轮内核语言([])).toBeUndefined()
  })
})
