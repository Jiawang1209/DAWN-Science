import { describe, expect, it } from "vitest"
import { 给模型的回退话 } from "../../src/runtime/rewind-note.js"

const 结果 = { restored: ["a.py"], removed: ["out/图.txt"], keep: [{ path: "n.md", reason: "changed_after" as const }], cannot: [], failed: [] }

describe("给模型的回退话（spec §4.4）", () => {
  it("只回退文件：总是留，点名退了哪些、哪些没动，并说前面的描述过时了", () => {
    const 话 = 给模型的回退话("files", "改两个文件", 结果, [])!
    expect(话).toContain("a.py")
    expect(话).toContain("out/图.txt")
    expect(话).toContain("n.md")
    expect(话).toMatch(/out of date/)
    expect(话).not.toMatch(/kernel/i)
  })
  it("只回退文件：退不回的与做到一半出事的也点名——它们还是现在的样子", () => {
    const 话 = 给模型的回退话("files", "x", { ...结果, cannot: [{ path: "big.bin", reason: "too_large" as const }], failed: [{ path: "w.csv", message: "EACCES" }] }, [])!
    expect(话).toMatch(/NOT rewound.*big\.bin.*w\.csv/)
  })
  it("一起回退：没有活内核就不留；有就说内核没回退", () => {
    expect(给模型的回退话("both", "x", 结果, [])).toBeUndefined()
    expect(给模型的回退话("both", "x", 结果, ["python"])).toMatch(/python kernel.*NOT rewound/i)
  })
  it("只撤对话：总是留，说文件**没有**回退", () => {
    expect(给模型的回退话("conversation", "x", undefined, [])).toMatch(/files were NOT rewound/i)
  })
})
