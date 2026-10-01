import { describe, expect, it } from "vitest"
import { 思考段落摘要 } from "../../src/ui/thinking-summary.js"

describe("思考段落摘要", () => {
  it("流式时只展示最近一段已结束段落的首行", () => {
    expect(思考段落摘要("第一段首行\n第一段续行\n\n第二段首行\n尚未写完", false)).toBe("第一段首行")
    expect(思考段落摘要("第一段首行\n第一段续行\n\n第二段首行\n第二段续行\n\n第三段首行\n进行中", false)).toBe("第二段首行")
  })

  it("首段还没结束时不提前暴露内容；空白分隔完成段落", () => {
    expect(思考段落摘要("正在形成的一段\n还在继续", false)).toBeUndefined()
    expect(思考段落摘要("\n  第一段首行  \r\n第二行\r\n\r\n当前段", false)).toBe("第一段首行")
  })

  it("思考结束时把最后一段也视为完成，并取它的首行", () => {
    expect(思考段落摘要("前文\n续行\n\n最终段首行\n最终段续行", true)).toBe("最终段首行")
    expect(思考段落摘要("\n \n", true)).toBeUndefined()
  })
})
