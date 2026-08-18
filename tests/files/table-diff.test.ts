/**
 * 表格之间改了什么（2026-08-18）。
 *
 * 这一层的全部价值在于**它说的话与逐行 diff 不一样**——
 * 设计文档第一节那三种情况，逐行 diff 的信息量接近零：
 * 改列名「每一行都变了」、换单位「每一行都变了」、重排「全文件重写」。
 */
import { describe, expect, it } from "vitest"
import { 读成表 } from "../../src/files/table.js"
import { 比两张表 } from "../../src/files/table-diff.js"

const 表 = (csv: string) => 读成表(csv, true)

describe("列", () => {
  /**
   * **改名与「删一个加一个」必须分得开。**
   * 只看名字的话两者一样，而这两句话对人的意义完全不同。
   */
  it("同一位置换了名字、值没变 → 说「改名」", () => {
    const d = 比两张表(表("样本,值\nA,1\nB,2\n"), 表("样本,值(mg)\nA,1\nB,2\n"))
    expect(d.列).toEqual([{ kind: "renamed", name: "值(mg)", from: "值" }])
    // **改名不该顺带报出一堆格变了**——那正是逐行 diff 的毛病
    expect(d.单元格总数).toBe(0)
  })

  it("同一位置换了名字、值也变了 → 说「删一个、加一个」", () => {
    const d = 比两张表(表("样本,甲\nA,1\n"), 表("样本,乙\nA,9\n"))
    expect(d.列.map((c) => c.kind)).toEqual(["removed", "added"])
  })

  it("多一列、少一列都说得出来", () => {
    expect(比两张表(表("a\n1\n"), 表("a,b\n1,2\n")).列).toEqual([{ kind: "added", name: "b" }])
    expect(比两张表(表("a,b\n1,2\n"), 表("a\n1\n")).列).toEqual([{ kind: "removed", name: "b" }])
  })
})

describe("整列缩放", () => {
  /**
   * **这是这个文件存在的主要理由。**
   * `g → mg` 会让逐行 diff 说「每一行都变了」，而真相是一句话：这一列乘了 1000。
   */
  it("一列整体乘了 1000 → 说「乘了 1000」，而不是报一堆格", () => {
    const d = 比两张表(表("样本,值\nA,1.2\nB,3.4\nC,5\n"), 表("样本,值\nA,1200\nB,3400\nC,5000\n"))
    expect(d.整列缩放).toEqual([{ column: "值", factor: 1000 }])
    // **被这条解释掉的格不再重复报**——那正是噪声的来源
    expect(d.单元格总数).toBe(0)
  })

  it("比值不一致就不是缩放，老老实实报格", () => {
    const d = 比两张表(表("样本,值\nA,1\nB,2\n"), 表("样本,值\nA,10\nB,30\n"))
    expect(d.整列缩放).toEqual([])
    expect(d.单元格总数).toBe(2)
  })

  /** **有一格不是数就不谈缩放**——认不出不等于可以猜 */
  it("列里混着非数时不报缩放", () => {
    /**
     * **数的那些必须够两行、而且比值一致**——否则「跳过非数」这个变异
     * 也照样不报缩放，判据就分辨不出对错（2026-08-18 变异测试抓到的假绿）。
     */
    const d = 比两张表(表("样本,值\nA,1\nB,2\nC,缺\n"), 表("样本,值\nA,2\nB,4\nC,缺\n"))
    expect(d.整列缩放, "有一格不是数就不该谈缩放——认不出不等于可以猜").toEqual([])
  })

  /** 只有一行能算比值时不下结论：**一个点连不成一条线** */
  it("只有一行时不报缩放", () => {
    const d = 比两张表(表("值\n2\n"), 表("值\n4\n"))
    expect(d.整列缩放).toEqual([])
    expect(d.单元格总数).toBe(1)
  })
})

describe("重排", () => {
  /**
   * **一行都没少，只是顺序变了。**
   * 那时逐行 diff 会说「全文件重写」，而人该知道数据没变。
   */
  it("只换了行的顺序 → 说「只是重排」，且不报任何格", () => {
    const d = 比两张表(表("a,b\n1,x\n2,y\n"), 表("a,b\n2,y\n1,x\n"))
    expect(d.只是重排).toBe(true)
    expect(d.单元格总数).toBe(0)
    expect(d.行).toMatchObject({ 增: 0, 减: 0 })
  })

  it("顺序没变就不是重排", () => {
    expect(比两张表(表("a\n1\n2\n"), 表("a\n1\n2\n")).只是重排).toBeUndefined()
  })
})

describe("行增删", () => {
  it("删了两行，说得出旧多少新多少", () => {
    const d = 比两张表(表("a\n1\n2\n3\n"), 表("a\n1\n"))
    expect(d.行).toEqual({ 旧: 3, 新: 1, 增: 0, 减: 2 })
  })
})

describe("上限", () => {
  /** **给了上限就要说清总数**，不静默截断（规格 7.5） */
  it("变的格超过上限时，总数仍然是真的", () => {
    const 旧 = ["v", ...Array.from({ length: 80 }, (_, i) => String(i))].join("\n")
    const 新 = ["v", ...Array.from({ length: 80 }, (_, i) => `x${i}`)].join("\n")
    const d = 比两张表(表(`${旧}\n`), 表(`${新}\n`))
    expect(d.单元格.length).toBe(50)
    expect(d.单元格总数).toBe(80)
  })
})
