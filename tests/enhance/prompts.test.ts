/**
 * 提示词是这个功能的核心——锁住关键句，改一个字测试要知道。
 * 措辞是自己写的（参考项目无 LICENSE），这里锁的是**意思必须在**。
 */
import { describe, expect, it } from "vitest"
import { 纪律, 纪律标记, 方法, 参考规则, 判定标记, 相关性判定, 开发意图判定, 文档挑选, 拼system, 拼user, 包原文 } from "../../src/enhance/prompts.js"

describe("纪律层", () => {
  it("是最高优先级，带着 mock 认得出的标记句", () => {
    expect(纪律).toContain("最高优先级")
    expect(纪律).toContain(纪律标记)
  })
  it("四条输出纪律 + 四条保真纪律都在", () => {
    for (const 句 of ["不加导语", "不复述", "不用代码块", "不写你的思考", "原意不丢", "明确化要有原文依据", "语言跟随输入", "稳定"]) {
      expect(纪律, `少了「${句}」`).toContain(句)
    }
  })
  it("疑问句可转为请求但焦点不变；陈述句不得改成反问", () => {
    expect(纪律).toMatch(/疑问句.*明确的请求/)
    expect(纪律).toContain("陈述句不得改成反问")
  })
})

describe("方法层", () => {
  it("五步法 + 长度服从保真 + 中英例子各有", () => {
    for (const 步 of ["拆解", "盘点", "重组", "明确化", "自检"]) expect(方法).toContain(步)
    expect(方法).toContain("800 字")
    expect(方法).toMatch(/原文：.*\n改写：/)
    expect(方法).toMatch(/Input:.*\nRewrite:/)
  })
})

describe("拼装", () => {
  it("不带参考时没有参考规则；带了才追加——省 token", () => {
    expect(拼system(false)).not.toContain(参考规则)
    expect(拼system(true)).toContain(参考规则)
    expect(拼system(true).indexOf(纪律)).toBe(0)
  })
  it("user：参考块在前、原文在三引号里", () => {
    const u = 拼user("把图画好看点", ["【对话背景】\n[用户] 之前那张图"])
    expect(u.startsWith("【对话背景】")).toBe(true)
    expect(u.endsWith(包原文("把图画好看点"))).toBe(true)
    expect(包原文("x")).toContain('"""\nx\n"""')
  })
  it("参考规则分两类：对话是背景、文档代码是事实；冲突以原文为准", () => {
    expect(参考规则).toContain("对话历史")
    expect(参考规则).toContain("项目事实")
    expect(参考规则).toContain("以原文为准")
  })
})

describe("判定模板", () => {
  it("都只回一个 JSON、宁可漏判；把输入原样嵌进去", () => {
    const r = 相关性判定("历史ABC", "当前XYZ")
    expect(r).toContain(判定标记)
    expect(r).toContain("宁可漏判")
    expect(r).toContain("历史ABC")
    expect(r).toContain("当前XYZ")
    expect(r).toContain('"related"')
    const d = 开发意图判定("当前Q", "背景B")
    expect(d).toContain(判定标记)
    expect(d).toContain('"isDevIntent"')
    expect(d).toContain("含糊不清的也算否")
    const f = 文档挑选("📄 a.md\n片段", "当前Q")
    expect(f).toContain('"relatedDocs"')
    expect(f).toContain('"hasProjectMap"')
    expect(f).toContain("📄 a.md")
  })
})
