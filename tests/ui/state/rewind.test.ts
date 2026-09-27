/**
 * 回退这一轮 · 确认框内容与流程（2026-09-27，spec §2.2、§2.3）。
 * 确认框说什么由纯函数定；App 只把它摆进 `ConfirmDialog`——所以这里验的就是屏幕上会出现的每一句。
 */
import { describe, expect, it, vi } from "vitest"
import { 回退确认, 回退这一轮, type 回退预览 } from "../../../src/ui/state/rewind.js"

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
})

describe("回退流程", () => {
  it("预览 → 问 → 选了哪种就执行哪种 → editorText 放回输入框", async () => {
    const 执行 = vi.fn(async () => ({ restored: [], removed: [], keep: [], cannot: [], failed: [], kernels: [], editorText: "那句" }))
    const 放回 = vi.fn()
    await 回退这一轮({
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
    await 回退这一轮({ 这句: "x", 预览: async () => 预览(), 问: (_c, 选了) => 选了("files"), 执行, 放回输入框: 放回, note: () => {} })
    await vi.waitFor(() => expect(执行).toHaveBeenCalledWith("files"))
    expect(放回).not.toHaveBeenCalled()
  })
  it("预览失败 / 执行失败都出声", async () => {
    const note = vi.fn()
    await 回退这一轮({ 这句: "x", 预览: async () => { throw new Error("还在跑") }, 问: () => {}, 执行: vi.fn(), 放回输入框: () => {}, note })
    expect(note).toHaveBeenCalledWith("回退没成：还在跑")
    await 回退这一轮({ 这句: "x", 预览: async () => 预览(), 问: (_c, 选了) => 选了("files"), 执行: async () => { throw new Error("EACCES") }, 放回输入框: () => {}, note })
    await vi.waitFor(() => expect(note).toHaveBeenCalledWith("回退没成：EACCES"))
  })
})
