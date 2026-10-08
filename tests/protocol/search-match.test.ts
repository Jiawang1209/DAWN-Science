/**
 * 会话全文搜索的匹配规则（2026-09-27，spec §5）。后端找、界面跳用的是同一份——这里把规则钉住。
 */
import { describe, expect, it } from "vitest"
import { 取片段, 命中, 定位命中, 拆词, 够长, 片段字数 } from "../../src/protocol/search-match.js"
import type { TranscriptItem } from "../../src/protocol/events.js"

const 话 = (id: string, who: "user" | "agent", text: string): TranscriptItem => ({ type: "turn", id, who, text, final: true })
const 工具 = (id: string, name: string, input: unknown, result?: string): TranscriptItem =>
  ({ type: "tool", id, name, input, status: "ok", ...(result === undefined ? {} : { result }) }) as TranscriptItem
const 标出 = (p: { text: string; marks: [number, number][] }) => p.marks.map(([a, b]) => p.text.slice(a, b))

describe("拆词", () => {
  it("按空白切、小写、去重；最多 8 个；全是空白 → 空", () => {
    expect(拆词("  Cox   回归 cox ")).toEqual(["cox", "回归"])
    expect(拆词("a1 b1 c1 d1 e1 f1 g1 h1 i1 j1")).toHaveLength(8)
    expect(拆词("   ")).toEqual([])
  })
})

describe("命中", () => {
  it("**中文是子串**：「回归」命中「做Cox回归分析」（FTS5 unicode61 在这里是 0，spec §5）", () => {
    expect(命中(话("r0", "user", "帮我做Cox回归分析"), ["回归"])).toBe(true)
  })
  it("大小写不敏感", () => {
    expect(命中(话("r0", "agent", "COXPH 跑完了"), ["coxph"])).toBe(true)
  })
  it("多个词：**同一条里都要有**（spec §0 第 3 条）", () => {
    expect(命中(话("r0", "user", "做 Cox 回归"), ["cox", "回归"])).toBe(true)
    expect(命中(话("r0", "user", "做 Cox"), ["cox", "回归"])).toBe(false)
  })
  it("工具：名字、参数、输出算一条", () => {
    const x = 工具("c1", "run_code", { language: "R", code: "fit <- coxph(Surv(t, s) ~ age)" }, "HR = 1.02")
    expect(命中(x, ["coxph", "hr"])).toBe(true)
    expect(命中(x, ["run_code"])).toBe(true)
  })
  it("notice 不参与；空词表不命中", () => {
    expect(命中({ type: "notice", id: "n", text: "Cox 回归" } as TranscriptItem, ["cox"])).toBe(false)
    expect(命中(话("r0", "user", "Cox"), [])).toBe(false)
  })
})

describe("取片段", () => {
  it("短的不截；每个词都标出来", () => {
    const p = 取片段(话("r0", "user", "帮我做 Cox 回归"), ["cox", "回归"])!
    expect(p.where).toBe("user")
    expect(p.text).toBe("帮我做 Cox 回归")
    expect(标出(p)).toEqual(["Cox", "回归"])
  })
  it("长的截成 ≤ 片段字数、前后加 …，词仍在片段里", () => {
    const 长 = "前".repeat(300) + "关键的 Cox 回归" + "后".repeat(300)
    const p = 取片段(话("r0", "agent", 长), ["cox"])!
    expect(p.text.startsWith("…")).toBe(true)
    expect(p.text.endsWith("…")).toBe(true)
    expect(p.text.length).toBeLessThanOrEqual(片段字数 + 2)
    expect(标出(p)).toEqual(["Cox"])
  })
  it("空白压成一个空格（换行不进片段）", () => {
    expect(取片段(话("r0", "user", "第一行\n\n  Cox 回归"), ["cox"])!.text).toBe("第一行 Cox 回归")
  })
  it("工具：词在参数里 → toolInput；只在输出里 → toolResult", () => {
    const x = 工具("c1", "bash", { command: "echo coxph" }, "p = 0.003")
    expect(取片段(x, ["coxph"])!.where).toBe("toolInput")
    expect(取片段(x, ["0.003"])!.where).toBe("toolResult")
  })
})

describe("定位命中（界面跳过去用）", () => {
  const 条们 = [话("a1", "user", "先读数据"), 话("a2", "user", "Cox 回归"), 工具("t9", "bash", { command: "echo cox" }), 话("a3", "agent", "cox 做完了")]
  it("先按 id：id 对得上、那条也确实命中 → 就是它", () => {
    expect(定位命中(条们, { itemId: "t9", nth: 0, 词们: ["cox"] })).toBe("t9")
  })
  it("id 对不上（活会话的 id 是实时的）→ 数到第 nth 处", () => {
    expect(定位命中(条们, { itemId: "r5", nth: 2, 词们: ["cox"] })).toBe("a3")
  })
  it("id 对上了但那条不含这些词（内容变了）→ 也按 nth", () => {
    expect(定位命中(条们, { itemId: "a1", nth: 0, 词们: ["cox"] })).toBe("a2")
  })
  it("都不行 → undefined", () => {
    expect(定位命中(条们, { itemId: "r5", nth: 9, 词们: ["cox"] })).toBeUndefined()
  })
})

describe("边界（2026-09-27 补）", () => {
  it("NFKC 在命中**之前**改了长度（「㍿」→「株式会社」、「ﬁ」→「fi」）：片段是规整后的字，标记照样落在词上（2026-09-28）", () => {
    const p = 取片段(话("r0", "user", "㍿的ﬁle 里跑 Cox"), 拆词("cox"))!
    expect(p.text).toBe("株式会社的file 里跑 Cox")
    expect(标出(p)).toEqual(["Cox"])
    const q = 取片段(话("r0", "user", "㍿的ﬁle 里跑 Cox"), 拆词("file"))!
    expect(标出(q)).toEqual(["file"])
    expect(命中(话("r0", "user", "ﬁle"), 拆词("fi"))).toBe(true)
  })
  it("够长：去掉空白后按码点数到两个字（2026-09-28）", () => {
    expect(够长("回归")).toBe(true)
    expect(够长(" c ")).toBe(false)
    expect(够长("😀")).toBe(false)
    expect(够长("a b")).toBe(true)
    expect(够长("ﬁ")).toBe(true) // NFKC 之后是两个字：与后端匹配看到的同一份
  })
  it("搜的那份与点开的那份对不上（搜过之后变了）：id 不在、数不到第 nth 处 → undefined，界面说「没找到」，不乱跳（2026-09-28）", () => {
    const 点开的 = [话("r0", "user", "Cox 回归"), 话("r1", "agent", "好")]
    expect(定位命中(点开的, { itemId: "r6", nth: 3, 词们: ["cox"] })).toBeUndefined()
    // id 在、但那条已经不含这些词，且数不到 → 同样 undefined
    expect(定位命中(点开的, { itemId: "r1", nth: 1, 词们: ["cox"] })).toBeUndefined()
  })
  it("全角与半角算同一个字：查询与正文都过 NFKC（计划没说，这里定为统一成半角）", () => {
    expect(拆词("ＣＯＸ")).toEqual(["cox"])
    expect(命中(话("r0", "user", "做ＣＯＸ回归"), 拆词("cox"))).toBe(true)
    const p = 取片段(话("r0", "user", "做ＣＯＸ回归"), ["cox"])!
    expect(标出(p)).toEqual(["COX"])
  })
  it("拆词：全是空白（含全角空格、换行、制表符）→ 空，不搜", () => {
    expect(拆词("\u3000 \n\t ")).toEqual([])
    expect(拆词("")).toEqual([])
  })
  it("出现多次：片段从最早那处取；片段里的每一处都标", () => {
    const 长 = "cox 开头" + "中".repeat(300) + "cox 结尾"
    const p = 取片段(话("r0", "agent", 长), ["cox"])!
    expect(p.text.startsWith("cox 开头")).toBe(true)
    expect(p.text.endsWith("…")).toBe(true)
    expect(标出(p)).toEqual(["cox"])
    const q = 取片段(话("r0", "agent", "cox 与 COX 与 Cox"), ["cox"])!
    expect(标出(q)).toEqual(["cox", "COX", "Cox"])
  })
  it("几个词全标、重叠的并起来", () => {
    const p = 取片段(话("r0", "user", "coxph 回归分析"), ["cox", "coxph", "回归"])!
    expect(p.marks).toEqual([[0, 5], [6, 8]])
    expect(标出(p)).toEqual(["coxph", "回归"])
  })
  it("两个字的中文词在长文中间：窗口围住它", () => {
    const 长 = "甲".repeat(500) + "回归" + "乙".repeat(500)
    const p = 取片段(话("r0", "agent", 长), ["回归"])!
    expect(p.text.length).toBeLessThanOrEqual(片段字数 + 2)
    expect(标出(p)).toEqual(["回归"])
  })
  it("emoji：窗口边界不把代理对切成半个", () => {
    const 长 = "😀".repeat(100) + "cox" + "😀".repeat(100)
    for (const 字数 of [119, 120, 121]) {
      const p = 取片段(话("r0", "agent", 长), ["cox"], 字数)!
      const 身 = p.text.replace(/^…/, "").replace(/…$/, "")
      expect(/^[\uDC00-\uDFFF]/.test(身)).toBe(false)
      expect(/[\uD800-\uDBFF]$/.test(身)).toBe(false)
      expect(p.text.length).toBeLessThanOrEqual(字数 + 2)
      expect(标出(p)).toEqual(["cox"])
    }
  })
  it("没命中 → undefined；空词表 → undefined", () => {
    expect(取片段(话("r0", "user", "Cox"), ["回归"])).toBeUndefined()
    expect(取片段(话("r0", "user", "Cox"), [])).toBeUndefined()
  })
})

describe("方案卡也是一条（2026-09-28，搜索 × 先出方案）", () => {
  const 卡 = (planId: string, title: string, markdown: string): TranscriptItem =>
    ({ type: "plan", id: `plan:${planId}`, planId, version: 1, title, markdown, status: "approved" }) as TranscriptItem
  it("标题与正文都搜得到；片段落在 agent 那一侧（方案是 agent 交的）", () => {
    const x = 卡("c1", "吸烟与肺功能", "## 统计检验\nWelch t 检验 FEV1")
    expect(命中(x, 拆词("fev1"))).toBe(true)
    expect(命中(x, 拆词("肺功能"))).toBe(true)
    expect(取片段(x, 拆词("fev1"))!.where).toBe("agent")
  })
  it("按 id 定位到卡片；卡片之后那处按 nth 数也不歪（卡片参与计数）", () => {
    const 条们 = [话("r0", "user", "分析肺功能"), 卡("c1", "方案", "看 FEV1"), 话("r3", "user", "FEV1 再看一眼")]
    expect(定位命中(条们, { itemId: "plan:c1", nth: 0, 词们: ["fev1"] })).toBe("plan:c1")
    // 活会话的 id 与恢复的不同：按 nth 数，第 1 处是卡片之后那句
    const 活的 = [话("u1", "user", "分析肺功能"), 卡("c1", "方案", "看 FEV1"), 话("u2", "user", "FEV1 再看一眼")]
    expect(定位命中(活的, { itemId: "r3", nth: 1, 词们: ["fev1"] })).toBe("u2")
  })
})
it("问答转成卡片后，原题和用户自由答案仍可搜到", () => {
 const item: TranscriptItem = { type: "question", id: "question:c", requestId: "c", state: "answered", questions: [{ id: "q", question: "分析哪些样本？" }], answer: { answers: [{ id: "q", selected: [], custom: "健康组样本" }] } }
 expect(命中(item, 拆词("健康组"))).toBe(true)
 expect(命中(item, 拆词("哪些样本"))).toBe(true)
})
