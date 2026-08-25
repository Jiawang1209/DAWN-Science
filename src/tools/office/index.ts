/**
 * Office 插件的装配层（2026-08-25，学自 dsh-office；解读见
 * `ccb_hive_code_learn/dsh-office-解读.md`，规格见 `docs/superpowers/specs/2026-08-25-office插件-design.md`）。
 *
 * **依赖决策（规格 §4）**：工具逻辑坐在天枢移植版之上（Apache-2.0，文件头保留来源），
 * 文档库用它选好的那几个（exceljs / pdfkit / pdf-lib / pdf-parse / pptxgenjs / jszip / docx / mammoth）；
 * 放弃了 cordis 注册壳与 schemastery（我们的工具面是 pi 的 `customTools`，见 `toolsFor`）。
 * 我们的不变式挂在两处：① 每个工具**只返回一段文本**（上游 textOutput 的契约照搬）；
 * ② 相对路径一律**解析进工作区**——agent 说 `report.xlsx`，落的就是工作区里的 `report.xlsx`。
 *
 * 边界（与「数据工具要走解释器」的定案的关系）：office 工具管**交付物**
 * （生成 / 读取 / 质检文档），数据计算仍走内核。
 */
import { isAbsolute, join } from "node:path"
import { excel工具 } from "./excel.js"
import { pdf工具 } from "./pdf.js"
import { pdfops工具 } from "./pdf-ops.js"
import { ppt工具 } from "./ppt.js"
import { docx工具 } from "./docx.js"
import type { Office工具定义, 参数格 } from "./shape.js"

export interface Office开关 {
  off: boolean
  xlsx: boolean
  pdf: boolean
  ppt: boolean
  docx: boolean
}

/** 四个族与它们的工具（界面上那张插件卡按这个画；pdf-ops 并进 pdf 族——上游也是这么装的） */
export const OFFICE族: readonly { 族: keyof Omit<Office开关, "off">; 名: string; 工具: readonly Office工具定义[] }[] = [
  { 族: "xlsx", 名: "电子表格", 工具: excel工具 },
  { 族: "pdf", 名: "PDF", 工具: [...pdf工具, ...pdfops工具] },
  { 族: "ppt", 名: "演示文稿", 工具: ppt工具 },
  { 族: "docx", 名: "Word 文档", 工具: docx工具 },
]

/** 上游参数 DSL → 标准 JSON Schema（required 收进父级数组；`json` 型 = 不限形状） */
export function 转JSONSchema(参数表: Record<string, 参数格>): Record<string, unknown> {
  const 转一格 = (g: 参数格): Record<string, unknown> => {
    const 出: Record<string, unknown> = {}
    if (g.type && g.type !== "json") 出.type = g.type
    if (g.description) 出.description = g.description
    if (g.enum) 出.enum = [...g.enum]
    if (g.items) 出.items = 转一格(g.items)
    if (g.properties) {
      const props: Record<string, unknown> = {}
      const required: string[] = []
      for (const [k, v] of Object.entries(g.properties)) {
        props[k] = 转一格(v)
        if (v.required) required.push(k)
      }
      出.properties = props
      if (required.length > 0) 出.required = required
    }
    if (g.additionalProperties !== undefined) {
      出.additionalProperties = typeof g.additionalProperties === "object" ? 转一格(g.additionalProperties) : g.additionalProperties
    }
    return 出
  }
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [k, v] of Object.entries(参数表)) {
    properties[k] = 转一格(v)
    if (v.required) required.push(k)
  }
  return { type: "object", properties, ...(required.length > 0 ? { required } : {}) }
}

/**
 * 各工具的路径参数（顶层）：相对路径解析进工作区。
 * **不猜**——名单照着上游 schema 抄，漏了的工具就按原样收（绝对路径仍然可用）。
 */
const 路径参数: Record<string, readonly string[]> = {
  xlsx_read: ["file_path"],
  xlsx_write: ["file_path"],
  xlsx_edit: ["file_path", "output_path"],
  xlsx_recalc: ["file_path"],
  xlsx_audit: ["file_path"],
  pdf_create: ["destination_path"],
  pdf_read: ["file_path"],
  pdf_merge: ["files", "output_path"],
  pdf_split: ["file_path", "output_dir"],
  pptx_create: ["destination_path"],
  pptx_read: ["file_path"],
  pptx_edit: ["file_path", "output_path"],
  docx_create: ["destination_path"],
  docx_read: ["file_path"],
}

interface ToolResult {
  content: { type: "text"; text: string }[]
  isError?: boolean
  details?: undefined
}

const text = (s: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: s }],
  ...(isError ? { isError: true } : {}),
  details: undefined,
})

/** 把一个插件定义包成 pi 的工具（与 `createRunCodeTool` 同一副形状）。browser 插件也用它（没列进 `路径参数` 的名字不做路径解析） */
export function 包成pi工具(定义: Office工具定义, workspace: string) {
  return {
    name: 定义.name,
    label: 定义.name,
    description: 定义.description,
    parameters: 转JSONSchema(定义.parameters),
    async execute(_toolCallId: string, params: Record<string, unknown>): Promise<ToolResult> {
      const 参 = { ...params }
      for (const k of 路径参数[定义.name] ?? []) {
        const v = 参[k]
        if (typeof v === "string" && v && !isAbsolute(v)) 参[k] = join(workspace, v)
        else if (Array.isArray(v)) 参[k] = v.map((x) => (typeof x === "string" && x && !isAbsolute(x) ? join(workspace, x) : x))
      }
      /**
       * **嵌套路径也要解析进工作区**(审查 debug E7)。`slides[].image` 藏在数组里的对象上,
       * 不在顶层 `路径参数` 名单里,此前完全没被解析——模型给对了相对路径,pptxgenjs 却按 cwd 找、
       * 报「图片不存在」。这是 pptx 唯一的嵌套路径字段(背景是颜色,不是图)。
       */
      if ((定义.name === "pptx_create" || 定义.name === "pptx_edit") && Array.isArray(参.slides)) {
        参.slides = 参.slides.map((s) => {
          if (s && typeof s === "object") {
            const img = (s as Record<string, unknown>).image
            if (typeof img === "string" && img && !isAbsolute(img)) return { ...s, image: join(workspace, img) }
          }
          return s
        })
      }
      try {
        const r = await 定义.execute(参)
        return text(r.content)
      } catch (e) {
        // 上游用 throw 表达用户可读的失败（文件不存在、sheet 名不对……）——如实转成出错文本，不吞
        return text(e instanceof Error ? e.message : String(e), true)
      }
    },
  }
}

/** 按开关取这一段会话要装的 office 工具（pi `customTools` 的一组） */
export function officeTools(workspace: string, 开: Office开关): unknown[] {
  if (开.off) return []
  const 出: unknown[] = []
  for (const { 族, 工具 } of OFFICE族) {
    if (!开[族]) continue
    for (const d of 工具) 出.push(包成pi工具(d, workspace))
  }
  return 出
}
