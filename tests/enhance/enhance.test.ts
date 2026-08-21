/**
 * 三档编排：依赖全假，验「什么时候带、带什么、不带时说没说原因」。
 */
import { describe, expect, it, vi } from "vitest"
import { 增强, type EnhanceDeps } from "../../src/enhance/enhance.js"
import { 纪律标记, 判定标记 } from "../../src/enhance/prompts.js"

/** 假模型：改写请求回「改写：原文」并复述带了哪些块；判定按正文答 */
function 假问(规则: { 相关?: (历史: string) => boolean; 开发?: boolean; 选文档?: string[]; 地图?: string[] } = {}) {
  const 调用: { system?: string; user: string }[] = []
  const 问: EnhanceDeps["问"] = async ({ system, user }) => {
    调用.push({ ...(system ? { system } : {}), user })
    if (user.includes(判定标记)) {
      if (user.includes('"related"')) {
        const 历史 = user.split("当前输入")[0] ?? ""
        return JSON.stringify({ related: 规则.相关?.(历史) ?? false })
      }
      if (user.includes("isDevIntent")) return JSON.stringify({ isDevIntent: 规则.开发 ?? false })
      return JSON.stringify({ relatedDocs: 规则.选文档 ?? [], hasProjectMap: Boolean(规则.地图?.length), codePaths: 规则.地图 ?? [] })
    }
    const 带 = ["【对话背景", "【项目文档", "【相关代码"].filter((k) => user.includes(k))
    const m = /"""\n([\s\S]*?)\n"""/.exec(user)
    return `以下是改写后的提示词：\n${带.length ? `（带了 ${带.length} 块）` : ""}改写：${m?.[1] ?? user}`
  }
  return { 问, 调用 }
}

const 历史 = async () => [
  { who: "user" as const, text: "第1轮：聊天气" },
  { who: "agent" as const, text: "晴" },
  { who: "user" as const, text: "第2轮：做相关的图" },
  { who: "agent" as const, text: "好" },
  { who: "user" as const, text: "第3轮：随便" },
  { who: "agent" as const, text: "嗯" },
]

const 工作区 = {
  列文件: async (后缀: RegExp) => ["README.md", "docs/plot-guide.md", "docs/other.md", "src/plot/draw.py", "src/io/load.py", "node_modules/x/plot.md"].filter((p) => 后缀.test(p)),
  读文件: async (p: string) =>
    ({
      "README.md": "# 项目\n目录树：src/\n- src/plot 画图模块\n",
      "docs/plot-guide.md": "plot 的用法\n1\n2\n3",
      "docs/other.md": "无关",
      "src/plot/draw.py": "def plot():\n    pass\n",
      "src/io/load.py": "x",
    })[p] ?? "",
}

describe("基础档", () => {
  it("只调一次，system 带纪律标记、不带参考规则；结果经过清洗", async () => {
    const { 问, 调用 } = 假问()
    const r = await 增强("把图画好看点", "basic", { 问, 历史, ...工作区 })
    expect(r).toEqual({ text: "改写：把图画好看点", usedContext: null })
    expect(调用).toHaveLength(1)
    expect(调用[0]!.system).toContain(纪律标记)
    expect(调用[0]!.system).not.toContain("参考材料怎么用")
  })
  it("空草稿抛；模型回空抛「什么都没给」", async () => {
    await expect(增强("  ", "basic", { 问: async () => "x", 历史, ...工作区 })).rejects.toThrow(/空的/)
    await expect(增强("x", "basic", { 问: async () => "改写结果：", 历史, ...工作区 })).rejects.toThrow(/什么都没给/)
  })
})

describe("标准档", () => {
  it("逐窗判定，命中 [1,2]（第 2 轮里有「相关」）→ 带那一窗；system 多了参考规则", async () => {
    const { 问, 调用 } = 假问({ 相关: (h) => h.includes("相关") })
    const 进度: string[] = []
    const r = await 增强("再画一张", "standard", { 问, 历史, ...工作区, 进度: (s) => 进度.push(s) })
    expect(r.usedContext).toEqual({ rounds: [1, 2] })
    expect(r.note).toBeUndefined()
    expect(r.text).toBe("（带了 1 块）改写：再画一张")
    expect(调用.at(-1)!.system).toContain("参考材料怎么用")
    expect(调用.at(-1)!.user).toMatch(/【对话背景[\s\S]*第2轮：做相关的图/)
    expect(进度).toEqual(["读对话", "判定相关 1/3", "改写中"])
  })
  it("全不相关 → 不带，note 说没命中；历史读不到 → 不带，note 说原因", async () => {
    const { 问 } = 假问()
    const r = await 增强("x", "standard", { 问, 历史, ...工作区 })
    expect(r.usedContext).toBeNull()
    expect(r.note).toContain("没有相关的轮次")
    const r2 = await 增强("x", "standard", { 问, 历史: async () => { throw new Error("会话没了") }, ...工作区 })
    expect(r2.note).toContain("会话没了")
  })
})

describe("专家档", () => {
  it("开发意图 → 扫 .md（忽略目录跳过、按关键词挑）→ 挑文档 → 有地图再扫代码；片段是一手的", async () => {
    const { 问, 调用 } = 假问({ 相关: () => false, 开发: true, 选文档: ["README.md", "docs/plot-guide.md"], 地图: ["src/"] })
    const r = await 增强("给 plot 模块加个导出 svg 的功能", "expert", { 问, 历史, ...工作区 })
    expect(r.usedContext).toEqual({ docs: ["docs/plot-guide.md", "README.md"], code: ["src/plot/draw.py"] })
    const u = 调用.at(-1)!.user
    expect(u).toContain("【项目文档")
    expect(u).toContain("📄 docs/plot-guide.md\nplot 的用法")
    expect(u).toContain("【相关代码")
    expect(u).toContain("def plot()")
    expect(u).not.toContain("node_modules")
    expect(r.note).toContain("没有相关的轮次")
  })
  it("不是开发意图 → 不扫工作区，说出来", async () => {
    const { 问 } = 假问({ 开发: false })
    const r = await 增强("翻译这段话", "expert", { 问, 历史, ...工作区 })
    expect(r.usedContext).toBeNull()
    expect(r.note).toContain("不像开发任务")
  })
  it("关键词打不中任何文档 → **不带**、不充数，说出来；README 内容命中但模型说不相关也不带", async () => {
    const { 问 } = 假问({ 开发: true })
    const r = await 增强("重构 zzzqq 那一块", "expert", { 问, 历史, ...工作区 })
    expect(r.usedContext).toBeNull()
    expect(r.note).toMatch(/没有命中/)
    // README 里有「模块」二字会进候选，但假模型一个都不选 → 仍然不带，且说清
    const r2 = await 增强("重构 zzzqq 模块", "expert", { 问, 历史, ...工作区 })
    expect(r2.usedContext).toBeNull()
    expect(r2.note).toMatch(/不相关/)
  })
  it("取消信号一路传给模型调用", async () => {
    const 控 = new AbortController()
    const 问 = vi.fn(async ({ signal }: { signal?: AbortSignal }) => {
      expect(signal).toBe(控.signal)
      return "改写：x"
    })
    await 增强("x", "basic", { 问, 历史, ...工作区, signal: 控.signal })
    expect(问).toHaveBeenCalled()
  })
})
