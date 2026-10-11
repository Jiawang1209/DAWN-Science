import { describe, expect, it } from "vitest"
import { 数行 } from "../../src/ui/footer-rows.js"

function footer(items: Array<{ top: number; height: number; width?: number }>) {
  const node = document.createElement("div")
  for (const { top, height, width = 80 } of items) {
    const child = document.createElement("div")
    Object.defineProperties(child, {
      offsetTop: { value: top }, offsetHeight: { value: height }, offsetWidth: { value: width },
    })
    node.append(child)
  }
  return node
}

describe("底栏行数按居中排列的控件分组", () => {
  it("同一行的 29px 工具与 36px 发送控件不能误算为两行", () => {
    expect(数行(footer([{ top: 100, height: 29 }, { top: 96, height: 36 }]))).toBe(1)
  })
  it("实际折行仍能区分，隐藏控件不占一行", () => {
    expect(数行(footer([{ top: 100, height: 29 }, { top: 136, height: 36 }, { top: 0, height: 0, width: 0 }]))).toBe(2)
  })
})
