/**
 * 表格文件在审阅那一屏上的**结构化摘要**（2026-08-18）。
 *
 * ## 为什么 diff 上面还要多一句话
 *
 * 作者定的是甲：*「排版学 Codex，表格文件在 diff 上方加结构化摘要。」*
 * 逐行 diff 是为代码发明的，用在数据表上会骗人——设计文档第一节那张表：
 *
 * | 你干了什么 | 逐行 diff 说什么 | 你其实想知道什么 |
 * |---|---|---|
 * | 改一个列名 | **每一行都变了** | 就一个表头变了 |
 * | 某列单位 g → mg | 每一行都变了 | **一列被整体乘了 1000** |
 * | 重新排序 | 全文件重写 | **一行都没少，只是顺序变了** |
 *
 * 判定本身在 `files/table-diff.ts` 的 `比两张表()`（纯函数，不碰 IO）。
 * **这个文件负责的是「两张表从哪儿来」**：新的一张来自工作区，
 * 旧的一张来自 `git show HEAD:`。
 *
 * ## 一条纪律：**只比完整读进来的两张表**
 *
 * `读成表` 默认只取前 200 行（够看清形状）。拿 200 行去断言
 * *「一行都没少，只是顺序变了」*，在一个一万行的文件上就是**一句假话**——
 * 前 200 行互为置换，后面九千八百行可以完全不同。
 *
 * 所以这里把行上限抬到 `表格比较行上限`，并且**只要有一边没读全就不给摘要**，
 * 改成明说「太大，没比」。**编一个可能错的结论，比不给结论更坏**——
 * 这与「数不完就说『至少 N 个』」是同一条（规格 7.5）。
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { resolveInWorkspace, 分类预览 } from "../files/access.js"
import { 比两张表 } from "../files/table-diff.js"
import { fileAtHead } from "./git-facts.js"

/**
 * 比较时读多少行。
 *
 * 比预览那 200 行大两个数量级：这一层要答「有没有整行少掉」，而那个问题
 * 只有把两张表都读全了才答得出。真正的上界仍是 `表格字节上界`（8 MB）——
 * 这个数只是防住「8 MB 的单列文件有几百万行」那种形状。
 */
export const 表格比较行上限 = 20_000

/** 与 `protocol/operations.ts` 里 `fileDiff.response.table` 一字不差 */
export type 表格摘要 =
  | {
      kind: "diff"
      rows: { before: number; after: number; added: number; removed: number }
      columns: { kind: "added" | "removed" | "renamed"; name: string; from?: string }[]
      scaled: { column: string; factor: number }[]
      cells: { row: number; column: string; from: string; to: string }[]
      cellsTotal: number
      reordered?: true
    }
  | { kind: "skipped"; reason: string }

/** 读全了没有。`totalRows` 缺席 = 字节被截；`rowsRead < totalRows` = 行被截 */
const 读全了 = (t: { rowsRead: number; totalRows?: number }) =>
  t.totalRows !== undefined && t.rowsRead >= t.totalRows

/**
 * 算一个文件的表格摘要。
 *
 * 返回 `undefined` 的三种情形，**都是「这里本来就没有摘要可说」**，不是失败：
 * ① 工作区里没有这个文件（删掉了）；② 它不是一张表；
 * ③ `HEAD` 里没有它——**新增的文件没有「旧的那一张」**，
 * 而「所有行都是新加的」这句话正确但毫无信息量。
 */
export async function 表格摘要(workspace: string, path: string): Promise<表格摘要 | undefined> {
  /**
   * **先问「它还在不在」，再过路径守卫。**
   *
   * 顺序反了就分不开两件事：`resolveInWorkspace` 对「文件不存在」与
   * 「路径越界」抛的是同一种错。而这两件事的处置完全相反——
   * 前者是**正常情形**（审阅表里本来就列着被删掉的文件），
   * 后者必须**响亮地抛**，不能被当成「这里没有摘要」悄悄咽掉。
   */
  if (!existsSync(join(workspace, path))) return undefined
  const 全 = resolveInWorkspace(workspace, path)
  const st = statSync(全)
  if (st.isDirectory()) return undefined
  const 字节 = st.size

  /**
   * **分类走同一份 `分类预览`**：本地、远端、审阅三处对同一个 `.csv`
   * 必须说同一句话。自己在这儿判一次扩展名，就是第二份分类。
   */
  const 新 = 分类预览(
    path,
    字节,
    (最多) => {
      const buf = readFileSync(全)
      return 最多 === undefined ? buf : buf.subarray(0, 最多)
    },
    表格比较行上限,
  )
  if (新.kind !== "table") return undefined

  const 旧正文 = await fileAtHead(workspace, path)
  if (旧正文 === undefined) return undefined

  const 旧字节 = Buffer.byteLength(旧正文, "utf8")
  const 旧buf = Buffer.from(旧正文, "utf8")
  const 旧 = 分类预览(
    path,
    旧字节,
    (最多) => (最多 === undefined ? 旧buf : 旧buf.subarray(0, 最多)),
    表格比较行上限,
  )
  /**
   * 旧版不是表而新版是（或反过来）——**这不是「没有摘要」，这是一件大事**：
   * 一个 `.txt` 从散文变成了一张表，或者一张表被写坏了。如实说，别沉默。
   */
  if (旧.kind !== "table") {
    return { kind: "skipped", reason: `上一版不是一张表（${旧.kind === "other" ? 旧.reason : "读不成表"}），没法逐列比` }
  }

  if (!读全了(新.table) || !读全了(旧.table)) {
    return {
      kind: "skipped",
      reason: `表太大，只读了旧版 ${旧.table.rowsRead} 行、新版 ${新.table.rowsRead} 行——只比前面一段会得出错的结论，所以没比。下面仍是逐行差异。`,
    }
  }

  const d = 比两张表(旧.table, 新.table)
  return {
    kind: "diff",
    rows: { before: d.行.旧, after: d.行.新, added: d.行.增, removed: d.行.减 },
    columns: d.列.map((c) => ({ kind: c.kind, name: c.name, ...(c.from !== undefined ? { from: c.from } : {}) })),
    scaled: d.整列缩放.map((s) => ({ column: s.column, factor: s.factor })),
    cells: d.单元格.map((c) => ({ row: c.row, column: c.column, from: c.from, to: c.to })),
    cellsTotal: d.单元格总数,
    ...(d.只是重排 ? { reordered: true as const } : {}),
  }
}
