import { describe, expect, it } from "vitest"
import { 回退通知 } from "../../src/workbench/rewind-notice.js"

const 空 = { restored: [], removed: [], keep: [], cannot: [], failed: [] }

describe("回退之后对话里那句（spec §2.4）", () => {
  it("一起回退：数得出改回去几个、挪走几个、放在哪；撤对话那句；有活内核就说「文件已回退，内核里的变量没有回退」", () => {
    const 话 = 回退通知({
      这句: "把 out/ 里的图按期刊格式重画一遍",
      做法: "both",
      结果: { ...空, restored: ["a.py", "b.csv"], removed: ["fig3.png"], trash: ".dawn/trash/rewind-x" },
      内核们: ["python"],
      图数: 0,
    })
    expect(话).toContain("已回到「把 out/ 里的图按期刊格式重画一遍」之前")
    expect(话).toContain("改回去 2 个文件、挪走 1 个（放在 .dawn/trash/rewind-x/）")
    expect(话).toContain("这句和它之后的对话已撤掉，这句放回了输入框")
    expect(话).toContain("文件已回退，内核里的变量没有回退：python 内核里还是回退前算出来的东西。")
  })
  it("你改过的、退不回的、没退成的，一个个点名", () => {
    const 话 = 回退通知({
      这句: "x",
      做法: "files",
      结果: { ...空, keep: [{ path: "n.md", reason: "changed_after" }], cannot: [{ path: "big.csv", reason: "too_large", size: 9 }], failed: [{ path: "c.txt", message: "EACCES" }] },
      内核们: [],
      图数: 0,
    })
    expect(话).toContain("n.md 你后来改过，没动。")
    expect(话).toContain("big.csv 退不回（旧版本没存）。")
    expect(话).toContain("c.txt 没退成（EACCES）。")
    expect(话).not.toContain("内核")
  })
  it("没动过文件就直说；只撤对话时内核那句换个说法；附过图要说图没放回来", () => {
    expect(回退通知({ 这句: "x", 做法: "both", 结果: 空, 内核们: [], 图数: 0 })).toContain("这句之后 agent 没有动过文件")
    const 话 = 回退通知({ 这句: "x", 做法: "conversation", 结果: undefined, 内核们: ["R"], 图数: 2 })
    expect(话).toContain("文件没有回退")
    expect(话).toContain("附的 2 张图没放回来，要的话重新附")
    expect(话).toContain("内核里的变量没有回退：R 内核")
  })
  it("对话没撤掉要出声", () => {
    expect(回退通知({ 这句: "x", 做法: "both", 结果: 空, 内核们: [], 图数: 0, conversationError: "boom" })).toContain("对话没撤掉（boom）")
  })
})
