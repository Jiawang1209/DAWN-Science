import { describe, expect, it } from "vitest"
import { 清洗 } from "../../src/enhance/clean.js"

describe("输出清洗——不信「请勿复述」", () => {
  it("导语 / 结语剥掉，正文留着", () => {
    expect(清洗("以下是改写后的提示词：\n\n请审查函数 foo。\n\n希望对你有帮助！")).toBe("请审查函数 foo。")
    expect(清洗("Here is the rewritten prompt:\nReview foo.")).toBe("Review foo.")
  })
  it("整段包在代码块 / 三引号 / 引号里的剥掉；内容自己带的不剥", () => {
    expect(清洗("```text\n请审查函数 foo。\n```")).toBe("请审查函数 foo。")
    expect(清洗('"""\n请审查函数 foo。\n"""')).toBe("请审查函数 foo。")
    expect(清洗("「请审查函数 foo。」")).toBe("请审查函数 foo。")
    const 带代码 = "请改写：\n```py\nprint(1)\n```\n并说明。"
    expect(清洗(带代码)).toBe(带代码)
  })
  it("把整条指令回显了：只留三引号里的", () => {
    expect(清洗('请改写下面这段提示词：\n\n"""\n真正的结果\n"""')).toBe("真正的结果")
  })
  it("多层嵌套最多剥三轮", () => {
    expect(清洗('改写结果：\n```\n"""\n内容\n"""\n```')).toBe("内容")
  })
  it("**不剥原文前缀**：结果以原句开头再展开是正当的", () => {
    const s = "把数据清洗一下：处理缺失值、去重、统一单位。"
    expect(清洗(s)).toBe(s)
  })
  it("空的就是空的", () => {
    expect(清洗("   \n")).toBe("")
    expect(清洗("改写结果：")).toBe("改写结果：")
  })
})
