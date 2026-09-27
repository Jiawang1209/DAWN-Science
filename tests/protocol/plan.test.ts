/**
 * 先出方案的共用纯函数（2026-09-27，spec `2026-09-27-先出方案-design.md` §2.3、§2.2 对照）。
 */
import { describe, expect, it } from "vitest"
import { 缺的小节, 方案产物, 对得上, 方案对照, 方案文件名, 执行那句, 必填小节 } from "../../src/protocol/plan.js"

const 齐的 = [
  "## 问题与假设", "吸烟者 FEV1 更低。",
  "## 数据与切分", "`data/raw/lung.csv`，7:3。",
  "## 统计检验与模型", "Welch t；线性模型。",
  "## 图", "箱线图。",
  "## 产物",
  "- `results/tables/summary.csv` —— 分组汇总",
  "- `figures/roc_*.png` —— 每折一张",
  "- 用 `pandas` 算（不是路径，不算）",
  "## 风险与备选", "`figures/不算.png` 不在产物那一节",
].join("\n")

describe("五节检查", () => {
  it("齐了：一个都不缺", () => expect(缺的小节(齐的)).toEqual([]))
  it("缺的按规定顺序点名", () => {
    expect(缺的小节("## 图\n## 问题与假设")).toEqual(["数据与切分", "统计检验与模型", "产物"])
  })
  it("三级标题、行内提到都不算", () => {
    expect(缺的小节("### 产物\n说说产物")).toEqual([...必填小节])
  })
})

describe("## 产物 解析", () => {
  it("只取这一节里反引号包着、像路径的；去重；去掉 ./", () => {
    expect(方案产物(`${齐的}\n`)).toEqual(["results/tables/summary.csv", "figures/roc_*.png"])
    expect(方案产物("## 产物\n- `./a/b.csv`\n- `a/b.csv`")).toEqual(["a/b.csv"])
  })
  it("没有这一节：空", () => expect(方案产物("## 图\n- `figures/a.png`")).toEqual([]))
})

describe("通配与对照", () => {
  it("`*` 不跨目录；`**` 跨", () => {
    expect(对得上("figures/roc_*.png", "figures/roc_1.png")).toBe(true)
    expect(对得上("figures/*.png", "figures/sub/a.png")).toBe(false)
    expect(对得上("figures/**.png", "figures/sub/a.png")).toBe(true)
    expect(对得上("a.csv", "a.csv")).toBe(true)
    expect(对得上("a.csv", "b/a.csv")).toBe(false)
  })

  it("已生成 / 还没有 / 计划外；批准之前生成的不算", () => {
    const 批准于 = Date.parse("2026-09-27T10:00:00Z")
    const 产物 = [
      { path: "results/tables/summary.csv", bornAt: "2026-09-27T10:05:00Z" },
      { path: "figures/roc_1.png", bornAt: "2026-09-27T10:06:00Z" },
      { path: "figures/roc_2.png", bornAt: "2026-09-27T10:06:30Z" },
      { path: "figures/qq.png", bornAt: "2026-09-27T10:07:00Z" },
      { path: "figures/早就有的.png", bornAt: "2026-09-27T09:00:00Z" },
    ]
    const r = 方案对照(["results/tables/summary.csv", "figures/roc_*.png", "results/models/lmm.rds"], 产物, 批准于)
    expect(r.计划).toEqual([
      { 路径: "results/tables/summary.csv", 生成了: ["results/tables/summary.csv"] },
      { 路径: "figures/roc_*.png", 生成了: ["figures/roc_1.png", "figures/roc_2.png"] },
      { 路径: "results/models/lmm.rds", 生成了: [] },
    ])
    expect(r.计划外).toEqual(["figures/qq.png"])
  })
})

describe("文件名与执行那句", () => {
  it("日期 + 标题；不能进文件名的字符换成 -；空标题叫「方案」", () => {
    const d = new Date(2026, 8, 27, 14, 2)
    expect(方案文件名("吸烟与肺功能：分层线性模型", d)).toBe("2026-09-27-吸烟与肺功能-分层线性模型.md")
    expect(方案文件名("a/b c?", d)).toBe("2026-09-27-a-b-c.md")
    expect(方案文件名("  ", d)).toBe("2026-09-27-方案.md")
    // 2026-09-28 审查：按码位截（不把代理对切成半个），NUL 与控制字符去掉
    const 表情 = "📊".repeat(45)
    const 名 = 方案文件名(表情, d)
    expect(名).toBe(`2026-09-27-${"📊".repeat(40)}.md`)
    expect(名.isWellFormed()).toBe(true)
    expect(方案文件名("a\u0000b\u0007c\u001bd\u007f", d)).toBe("2026-09-27-abcd.md")
    expect(方案文件名("\u0000\u0001", d)).toBe("2026-09-27-方案.md")
    // 截完落在分隔处：尾巴上不留「-」
    expect(方案文件名(`${"a".repeat(39)} b`, d)).toBe(`2026-09-27-${"a".repeat(39)}.md`)
  })
  it("执行那句：都带「照批准的方案做」与路径；改过的多一句「以文件为准」", () => {
    expect(执行那句("analysis/plans/x.md", false)).toMatch(/^照批准的方案做：`analysis\/plans\/x\.md`/)
    const 改过 = 执行那句("analysis/plans/x.md", true)
    expect(改过).toContain("照批准的方案做")
    expect(改过).toContain("以文件为准")
  })
})
