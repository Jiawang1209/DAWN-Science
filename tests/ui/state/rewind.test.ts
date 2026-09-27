/**
 * 回退这一轮 · 确认框内容与流程（2026-09-27，spec §2.2、§2.3）。
 * 确认框说什么由纯函数定；App 只把它摆进 `ConfirmDialog`——所以这里验的就是屏幕上会出现的每一句。
 */
import { describe, expect, it, vi } from "vitest"
import { 回退确认, 回退这一轮, 找这句, 最后一句, $回退中, type 回退预览 } from "../../../src/ui/state/rewind.js"
import type { TranscriptItem } from "../../../src/protocol/index.js"

const 上限 = { fileBytes: 50 * 1024 * 1024, totalBytes: 2 * 1024 ** 3 }
const 预览 = (over: Partial<回退预览> = {}): 回退预览 => ({
  files: { ok: true, restore: ["a.py"], remove: ["fig3.png"], keep: [{ path: "n.md", reason: "changed_after" }], cannot: [{ path: "big.parquet", reason: "too_large", size: 1 }] },
  kernels: [],
  limits: 上限,
  ...over,
})

describe("确认框内容（spec §2.2）", () => {
  it("四种去向各有标签，按「改回去 / 挪走 / 不动 / 退不回」的顺序", () => {
    const c = 回退确认(预览(), "把图重画一遍")
    expect(c.title).toBe("回到「把图重画一遍」之前？")
    expect(c.行们.map((x) => `${x.标} ${x.path}`)).toEqual(["改回去 a.py", "挪走 fig3.png", "不动 n.md", "退不回 big.parquet"])
    expect(c.行们[3]!.注).toBe("超过 50 MB，没存旧版本")
    expect(c.主).toEqual({ label: "文件和对话一起回退", 做法: "both" })
    expect(c.次).toEqual({ label: "只回退文件", 做法: "files" })
  })
  it("退不回的另外三种缘故各有各的话", () => {
    const c = 回退确认(
      预览({
        files: {
          ok: true,
          restore: [],
          remove: [],
          keep: [],
          cannot: [
            { path: "x", reason: "over_budget" },
            { path: "data/raw/a.csv", reason: "raw_data" },
            { path: "y", reason: "not_stored" },
          ],
        },
      }),
      "x",
    )
    expect(c.行们.map((x) => x.注)).toEqual(["存档满了（2 GB），没存旧版本", "data/raw/ 是原始数据，回退不碰它", "没存上旧版本"])
  })
  it("有活内核：内核那句一定在", () => {
    expect(回退确认(预览({ kernels: ["python", "R"] }), "x").内核).toBe("内核里的变量不会回退：python、R 内核还是现在的样子。")
    expect(回退确认(预览(), "x").内核).toBeUndefined()
  })
  it("文件退不了也照样说内核那句", () => {
    expect(回退确认(预览({ files: { ok: false, reason: "remote" }, kernels: ["R"] }), "x").内核).toMatch(/R 内核/)
  })
  it("没动过文件：说一句，不画空表", () => {
    const c = 回退确认(预览({ files: { ok: true, restore: [], remove: [], keep: [], cannot: [] } }), "x")
    expect(c.行们).toEqual([])
    expect(c.说明).toContain("这句之后 agent 没有动过文件。")
  })
  it("文件退不了：说缘故，只剩「只撤掉对话」一颗", () => {
    for (const reason of ["remote", "before_archive", "gap", "too_many_files", "no_archive"] as const) {
      const c = 回退确认(预览({ files: { ok: false, reason } }), "x")
      expect(c.主).toEqual({ label: "只撤掉对话", 做法: "conversation" })
      expect(c.次).toBeUndefined()
      expect(c.说明[0]).toMatch(/^文件回退不了：/)
    }
  })
  it("附过图：说图放不回输入框", () => {
    expect(回退确认(预览({ images: 2 }), "x").说明.join("")).toContain("附的 2 张图放不回输入框")
  })
  it("标题里那句太长就截断，截断要看得出来", () => {
    expect(回退确认(预览(), "一".repeat(40)).title).toBe(`回到「${"一".repeat(24)}…」之前？`)
  })
  it("截断按字（码点）数，不把 emoji 劈成半个代理对", () => {
    const 句 = "🧪".repeat(30)
    const title = 回退确认(预览(), 句).title
    expect(title).toBe(`回到「${"🧪".repeat(24)}…」之前？`)
    expect(title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
    // 刚好 24 个：不加省略号
    expect(回退确认(预览(), "🧪".repeat(24)).title).toBe(`回到「${"🧪".repeat(24)}」之前？`)
  })
  it("多行的那句在标题里压成一行", () => {
    expect(回退确认(预览(), "第一行\n\n第二行").title).toBe("回到「第一行 第二行」之前？")
  })
  it("那句没有字（只附了图）：标题不出现空的「」", () => {
    const title = 回退确认(预览({ images: 1 }), "").title
    expect(title).not.toContain("「」")
    expect(title).toBe("回到那句之前？")
  })
})

describe("回退流程", () => {
  it("预览 → 问 → 选了哪种就执行哪种 → editorText 放回输入框", async () => {
    const 执行 = vi.fn(async () => ({ restored: [], removed: [], keep: [], cannot: [], failed: [], kernels: [], editorText: "那句" }))
    const 放回 = vi.fn()
    await 回退这一轮({
      会话: "s-a",
      这句: "那句",
      预览: async () => 预览(),
      问: (_c, 选了) => 选了("both"),
      执行,
      放回输入框: 放回,
      note: () => {},
    })
    await vi.waitFor(() => expect(放回).toHaveBeenCalledWith("那句"))
    expect(执行).toHaveBeenCalledWith("both")
  })
  it("只回退文件：没有 editorText 就不碰输入框", async () => {
    const 放回 = vi.fn()
    const 执行 = vi.fn(async () => ({ restored: ["a.py"], removed: [], keep: [], cannot: [], failed: [], kernels: [] }))
    await 回退这一轮({ 会话: "s-c", 这句: "x", 预览: async () => 预览(), 问: (_c, 选了) => 选了("files"), 执行, 放回输入框: 放回, note: () => {} })
    await vi.waitFor(() => expect(执行).toHaveBeenCalledWith("files"))
    expect(放回).not.toHaveBeenCalled()
  })
  it("预览失败 / 执行失败都出声", async () => {
    const note = vi.fn()
    await 回退这一轮({ 会话: "s-d", 这句: "x", 预览: async () => { throw new Error("还在跑") }, 问: () => {}, 执行: vi.fn(), 放回输入框: () => {}, note })
    expect(note).toHaveBeenCalledWith("回退没成：还在跑")
    await 回退这一轮({ 会话: "s-e", 这句: "x", 预览: async () => 预览(), 问: (_c, 选了) => 选了("files"), 执行: async () => { throw new Error("EACCES") }, 放回输入框: () => {}, note })
    await vi.waitFor(() => expect(note).toHaveBeenCalledWith("回退没成：EACCES"))
  })
})

describe("找那一句（审查 e：找不到就不开框）", () => {
  const u = (id: string, text: string) => ({ type: "turn", id, who: "user", text, final: true }) as TranscriptItem
  const a = (id: string) => ({ type: "turn", id, who: "agent", text: "好", final: true }) as TranscriptItem
  it("按 id 找自己说的那句；找不到、或那条不是自己说的：undefined", () => {
    const items = [u("u1", "一"), a("a1"), u("u2", "二")]
    expect(找这句(items, "u2")).toEqual({ id: "u2", text: "二" })
    expect(找这句(items, "a1")).toBeUndefined()
    expect(找这句(items, "nope")).toBeUndefined()
  })
  it("最后一句自己说的话；一句都没说过：undefined", () => {
    expect(最后一句([u("u1", "一"), a("a1"), u("u2", "二"), a("a2")])).toEqual({ id: "u2", text: "二" })
    expect(最后一句([a("a1")])).toBeUndefined()
    expect(最后一句([])).toBeUndefined()
  })
})

describe("正在回退（审查 Important + g）：按会话记着，从预览开始到做完 / 失败 / 取消", () => {
  const 等 = () => {
    let 放行!: () => void
    const p = new Promise<void>((r) => (放行 = r))
    return { p, 放行 }
  }
  it("连点两下：第二下不发第二次预览；key 是 sessionId", async () => {
    const 预览们 = vi.fn(async () => 预览())
    const 问 = vi.fn()
    const 一 = 回退这一轮({ 会话: "s1", 这句: "x", 预览: 预览们, 问, 执行: vi.fn(), 放回输入框: () => {}, note: () => {} })
    const 二 = 回退这一轮({ 会话: "s1", 这句: "x", 预览: 预览们, 问, 执行: vi.fn(), 放回输入框: () => {}, note: () => {} })
    expect($回退中.get()).toEqual({ s1: true })
    await Promise.all([一, 二])
    expect(预览们).toHaveBeenCalledTimes(1)
    expect(问).toHaveBeenCalledTimes(1)
    // 另一段不受这一段牵连
    expect($回退中.get()["s2"]).toBeUndefined()
    // 收尾：框没选就关了
    问.mock.calls[0]![2]()
    expect($回退中.get()["s1"]).toBeUndefined()
  })
  it("预览失败：放开", async () => {
    await 回退这一轮({ 会话: "s3", 这句: "x", 预览: async () => { throw new Error("坏") }, 问: vi.fn(), 执行: vi.fn(), 放回输入框: () => {}, note: () => {} })
    expect($回退中.get()["s3"]).toBeUndefined()
  })
  it("选了：执行期间一直记着，执行完才放开", async () => {
    const g = 等()
    const 执行 = vi.fn(async () => {
      await g.p
      return { restored: [], removed: [], keep: [], cannot: [], failed: [], kernels: [] }
    })
    await 回退这一轮({ 会话: "s4", 这句: "x", 预览: async () => 预览(), 问: (_c, 选了) => 选了("files"), 执行, 放回输入框: () => {}, note: () => {} })
    expect($回退中.get()["s4"]).toBe(true)
    g.放行()
    await vi.waitFor(() => expect($回退中.get()["s4"]).toBeUndefined())
  })
  it("执行失败：出声并放开", async () => {
    const note = vi.fn()
    await 回退这一轮({ 会话: "s5", 这句: "x", 预览: async () => 预览(), 问: (_c, 选了) => 选了("both"), 执行: async () => { throw new Error("EACCES") }, 放回输入框: () => {}, note })
    await vi.waitFor(() => expect($回退中.get()["s5"]).toBeUndefined())
    expect(note).toHaveBeenCalledWith("回退没成：EACCES")
  })
  it("选了之后框关掉（onDismiss 也会来）：不因为「没选」提前放开", async () => {
    const g = 等()
    let 没选: (() => void) | undefined
    await 回退这一轮({
      会话: "s6", 这句: "x", 预览: async () => 预览(),
      问: (_c, 选了, 算了) => { 选了("both"); 没选 = 算了 },
      执行: async () => { await g.p; return { restored: [], removed: [], keep: [], cannot: [], failed: [], kernels: [] } },
      放回输入框: () => {}, note: () => {},
    })
    没选!()
    expect($回退中.get()["s6"]).toBe(true)
    g.放行()
    await vi.waitFor(() => expect($回退中.get()["s6"]).toBeUndefined())
  })
})
