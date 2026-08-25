/**
 * Office 插件（2026-08-25，学自 dsh-office）：每族一发**经装配层的往返**——
 * 走 `officeTools` 包出来的 pi 工具面（含 JSON Schema 转换与工作区路径解析），
 * 不直接戳内部函数：验的是模型将要摸到的那一面。
 */
import { mkdtempSync, existsSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { officeTools, OFFICE族, 转JSONSchema } from "../../src/tools/office/index.js"

const 全开 = { off: false, xlsx: true, pdf: true, ppt: true, docx: true }
interface 工具 {
  name: string
  parameters: Record<string, unknown>
  execute: (id: string, params: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
}
const 取 = (ws: string, name: string): 工具 => {
  const t = (officeTools(ws, 全开) as 工具[]).find((x) => x.name === name)
  if (!t) throw new Error(`没有 ${name}`)
  return t
}
const 文字 = (r: { content: { text: string }[] }) => r.content.map((c) => c.text).join("\n")

describe("office 插件", () => {
  it("14 个工具齐全；关一族少一族；off 全关", () => {
    expect((officeTools("/tmp", 全开) as 工具[]).map((t) => t.name).sort()).toEqual(
      [
        "docx_create", "docx_read",
        "pdf_create", "pdf_merge", "pdf_read", "pdf_split",
        "pptx_create", "pptx_edit", "pptx_read",
        "xlsx_audit", "xlsx_edit", "xlsx_read", "xlsx_recalc", "xlsx_write",
      ],
    )
    expect((officeTools("/tmp", { ...全开, xlsx: false }) as 工具[]).some((t) => t.name.startsWith("xlsx"))).toBe(false)
    expect(officeTools("/tmp", { ...全开, off: true })).toEqual([])
    expect(OFFICE族.reduce((n, f) => n + f.工具.length, 0)).toBe(14)
  })

  it("DSL → JSON Schema：required 收进父级，嵌套 items/properties 保留", () => {
    const s = 转JSONSchema({
      a: { type: "string", required: true, description: "甲" },
      b: { type: "array", items: { type: "object", properties: { c: { type: "integer", required: true } } } },
    }) as { type: string; required?: string[]; properties: Record<string, { type?: string; items?: { required?: string[] } }> }
    expect(s.type).toBe("object")
    expect(s.required).toEqual(["a"])
    expect(s.properties.b!.items!.required).toEqual(["c"])
  })

  it("xlsx：写 → 读（相对路径落进工作区）→ 改 → 重算 → 审计", async () => {
    const ws = mkdtempSync(join(tmpdir(), "dawn-office-"))
    const 写 = await 取(ws, "xlsx_write").execute("t1", {
      file_path: "报表.xlsx",
      data: [["名", "分"], ["甲", 1], ["乙", 2], ["和", { formula: "SUM(B2:B3)", result: 3 }]],
      header_bold: true,
    })
    expect(写.isError).toBeUndefined()
    expect(existsSync(join(ws, "报表.xlsx"))).toBe(true)
    const 读 = await 取(ws, "xlsx_read").execute("t2", { file_path: "报表.xlsx", sheet: "Sheet1" })
    expect(文字(读)).toContain("甲")
    expect(文字(读)).toContain("SUM(B2:B3)")
    const 改 = await 取(ws, "xlsx_edit").execute("t3", {
      file_path: "报表.xlsx",
      operations: [{ action: "update_cells", sheet: "Sheet1", cells: [{ cell: "A2", value: "丙" }] }],
    })
    expect(改.isError).toBeUndefined()
    const 算 = await 取(ws, "xlsx_recalc").execute("t4", { file_path: "报表.xlsx" })
    expect(写.isError ?? 算.isError).toBeUndefined()
    const 审 = await 取(ws, "xlsx_audit").execute("t5", { file_path: "报表.xlsx" })
    expect(审.content[0]!.text.length).toBeGreaterThan(0)
  })

  it("pdf：生成 → 读回 → 拆页；文件不存在时出错文本、isError 竖旗", async () => {
    const ws = mkdtempSync(join(tmpdir(), "dawn-office-"))
    const 造 = await 取(ws, "pdf_create").execute("t1", {
      destination_path: "说明.pdf",
      title: "Quarterly",
      content: [
        { type: "heading", text: "Summary" },
        { type: "paragraph", text: "hello pdf" },
        { type: "list", items: ["Alpha", "Beta"] },
      ],
      page_numbers: true,
    })
    expect(造.isError).toBeUndefined()
    const 读 = await 取(ws, "pdf_read").execute("t2", { file_path: "说明.pdf" })
    expect(文字(读)).toContain("hello pdf")
    const 拆 = await 取(ws, "pdf_split").execute("t3", { file_path: "说明.pdf", output_dir: "拆" })
    expect(拆.isError).toBeUndefined()
    expect(readdirSync(join(ws, "拆")).length).toBeGreaterThan(0)
    const 坏 = await 取(ws, "pdf_read").execute("t4", { file_path: "没有这个.pdf" })
    expect(坏.isError).toBe(true)
  })

  it("pdf_create 落到还不存在的子目录:自动建目录,不崩进程(审查 debug E1)", async () => {
    const ws = mkdtempSync(join(tmpdir(), "dawn-office-"))
    // reports/ 还不存在——旧实现在 emitter 回调里 writeFileSync 抛 ENOENT → uncaughtException + Promise 永挂
    const r = await 取(ws, "pdf_create").execute("t1", {
      destination_path: "reports/2026/q1.pdf",
      content: [{ type: "paragraph", text: "deep dir" }],
    })
    expect(r.isError).toBeUndefined()
    expect(existsSync(join(ws, "reports", "2026", "q1.pdf"))).toBe(true)
  })

  it("pptx：生成 → 读回 → 手术式改字 → 再读", async () => {
    const ws = mkdtempSync(join(tmpdir(), "dawn-office-"))
    const 造 = await 取(ws, "pptx_create").execute("t1", {
      destination_path: "路线图.pptx",
      slides: [
        { type: "title", title: "Roadmap 2026" },
        { type: "content", title: "Highlights", items: ["Plugin runtime", "Office tools"] },
      ],
    })
    expect(造.isError).toBeUndefined()
    const 读 = await 取(ws, "pptx_read").execute("t2", { file_path: "路线图.pptx" })
    expect(文字(读)).toContain("Roadmap 2026")
    const 改 = await 取(ws, "pptx_edit").execute("t3", { file_path: "路线图.pptx", operations: [{ find: "2026", replace: "2027" }] })
    expect(改.isError).toBeUndefined()
    const 再读 = await 取(ws, "pptx_read").execute("t4", { file_path: "路线图.pptx" })
    expect(文字(再读)).toContain("Roadmap 2027")
  })

  it("docx：生成（表格 + 水印）→ 读回", async () => {
    const ws = mkdtempSync(join(tmpdir(), "dawn-office-"))
    const 造 = await 取(ws, "docx_create").execute("t1", {
      destination_path: "报告.docx",
      content: [
        { type: "heading", text: "结论" },
        { type: "paragraph", text: "docx 往返成立" },
        { type: "table", headers: ["区", "量"], rows: [["华东", "120"]] },
      ],
      watermark: { text: "草稿" },
    })
    expect(造.isError).toBeUndefined()
    const 读 = await 取(ws, "docx_read").execute("t2", { file_path: "报告.docx" })
    expect(文字(读)).toContain("docx 往返成立")
    expect(文字(读)).toContain("华东")
  })
})
