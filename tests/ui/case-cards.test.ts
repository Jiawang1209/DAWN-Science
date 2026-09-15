/**
 * 案例卡片（2026-09-15）：从这一轮 MLAI 工具返回里收案例、按正文提到的先后出卡。
 *
 * 作者：*「能否每一个案例，不要显示是链接形式的，而是……一个一个真实内容的效果呢？」*
 * 第二版的理由：真机上模型没读技能、没附清单——**数据要从一定在的工具返回里取**。
 */
import { describe, expect, it } from "vitest"
import { 从工具结果收案例, 本轮提到的案例, 图廊根, 封面地址, 详情地址, 选这篇的话 } from "../../src/ui/case-cards.js"

const 检索结果 = `[mlai-science] ${JSON.stringify([
  { case_id: "20191101-sxbxy3b71-deseq2", title: "R包DESeq2作差异基因分析", language: "r", cover: "figures/1.preview.png", task: ["differential_expression"], figure_types: ["ma_plot", "volcano_plot"] },
  { case_id: "20251019-xacaaee-python-mantel", title: "Python Mantel 蝴蝶状热图", language: "python", task: ["eda"] },
])}`
const 图检索结果 = `[mlai-science] ${JSON.stringify([
  { case_id: "20191101-sxbxy3b71-deseq2", case_title: "别的标题不该覆盖", file: "figures/2.pdf", preview: "figures/2.preview.png", caption: "火山图" },
  { case_id: "20260222-xeefbe8-xgboost-shap", case_title: "XGBoost 与 SHAP", preview: "figures/9.preview.png", caption: "SHAP 热图" },
])}`
const 工具们 = [
  { name: "mlai-science__search_cases", result: 检索结果 },
  { name: "mlai-science__search_figures", result: 图检索结果 },
  { name: "bash", result: '{"case_id":"不是 MLAI 的工具不算"}' },
  { name: "mlai-science__recommend_figures", result: "[mlai-science] {被截断的 JSON" },
]

describe("从工具结果收案例", () => {
  const 表 = 从工具结果收案例(工具们)

  it("**认 MLAI 的案例工具，按 case_id 合并；非 MLAI 工具、解析不了的（截断）都跳过**", () => {
    expect([...表.keys()].sort()).toEqual(["20191101-sxbxy3b71-deseq2", "20251019-xacaaee-python-mantel", "20260222-xeefbe8-xgboost-shap"])
    expect(表.get("20191101-sxbxy3b71-deseq2")?.服务器).toBe("mlai-science")
  })

  it("先到的字段不被后到的覆盖；缺的由后到的补上", () => {
    const d = 表.get("20191101-sxbxy3b71-deseq2")!.案例
    expect(d.title).toBe("R包DESeq2作差异基因分析")
    expect(d.cover).toBe("figures/1.preview.png")
    // 图级检索只给 case_title / preview / caption：照样拼出一张卡
    const x = 表.get("20260222-xeefbe8-xgboost-shap")!.案例
    expect(x).toMatchObject({ title: "XGBoost 与 SHAP", cover: "figures/9.preview.png", summary: "SHAP 热图" })
  })

  it("没有 caption 时，一句话由 task / figure_types 拼出来", () => {
    expect(表.get("20191101-sxbxy3b71-deseq2")!.案例.summary).toBe("differential_expression · ma_plot · volcano_plot")
  })
})

describe("本轮提到的案例", () => {
  const 表 = 从工具结果收案例(工具们)

  it("**按正文里首次出现的先后出卡**；没提到的不出", () => {
    const 正文 = "先看 `20260222-xeefbe8-xgboost-shap`，再看 `20191101-sxbxy3b71-deseq2`。"
    expect(本轮提到的案例(正文, 表).map((c) => [c.n, c.案例.case_id])).toEqual([
      [1, "20260222-xeefbe8-xgboost-shap"],
      [2, "20191101-sxbxy3b71-deseq2"],
    ])
  })

  it("**模型把长 id 截短了**（真机里见过 `20251019-xacaaee`）：唯一前缀也认", () => {
    expect(本轮提到的案例("`20251019-xacaaee` Python Mantel", 表).map((c) => c.案例.case_id)).toEqual(["20251019-xacaaee-python-mantel"])
  })

  it("前缀太短或对得上不止一篇 → 不猜", () => {
    expect(本轮提到的案例("`20191101-sx`", 表)).toEqual([])
  })

  it("正文一个都没提 → 不出卡", () => {
    expect(本轮提到的案例("库里热图很多，你想画哪种？", 表)).toEqual([])
  })
})

describe("地址与那句话", () => {
  const 根 = 图廊根("http://127.0.0.1:8765/mcp/")
  const c = { case_id: "20191101-deseq2", title: "R包DESeq2作差异基因分析", cover: "figures/1.preview.png" }

  it("MCP 地址去掉 /mcp 是图廊根；封面、详情地址照图廊的路由拼", () => {
    expect(根).toBe("http://127.0.0.1:8765")
    expect(封面地址(根, c)).toBe("http://127.0.0.1:8765/gallery/asset/20191101-deseq2/figures/1.preview.png")
    expect(详情地址(根, c)).toBe("http://127.0.0.1:8765/gallery/case/20191101-deseq2")
  })

  it("**「照这篇做」发出去的话带着 case_id**；没有标题时只带 id", () => {
    expect(选这篇的话(c)).toBe("照这篇做：《R包DESeq2作差异基因分析》（case_id: 20191101-deseq2）")
    expect(选这篇的话({ case_id: "x-1" })).toBe("照这篇做：case_id: x-1")
  })
})
