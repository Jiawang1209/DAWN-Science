/**
 * 两张表之间**改了什么**（2026-08-18）。
 *
 * ## 为什么不能用逐行 diff
 *
 * 逐行 diff 是为代码发明的，用在数据表上会骗人——设计文档第一节那张表：
 *
 * | 你干了什么 | 逐行 diff 说什么 | 你其实想知道什么 |
 * |---|---|---|
 * | 改一个列名 | **每一行都变了** | 就一个表头变了 |
 * | 某列单位 g → mg | 每一行都变了 | **一列被整体乘了 1000** |
 * | 重新排序 | 全文件重写 | **一行都没少，只是顺序变了** |
 *
 * 后两种是数据分析里天天发生的事，而逐行 diff 在那两种情况下信息量接近零。
 *
 * ## 这个文件只做判定，不碰 IO，也不碰界面
 *
 * 输入是两张已经解析好的表（`files/table.ts` 的 `读成表`——**不另写一个
 * CSV parser**：两份解析迟早会对同一个文件说两种话）。
 * 输出是「发生了什么」，怎么画由界面决定。
 */
import type { 表格 } from "./table.js"

export interface 列变化 {
  kind: "added" | "removed" | "renamed"
  name: string
  /** 改名时的旧名字 */
  from?: string
}

export interface 表格差异 {
  行: { 旧: number; 新: number; 增: number; 减: number }
  列: 列变化[]
  /**
   * **整列被同一个因子乘过**。
   *
   * 这是这个文件存在的主要理由：`g → mg` 会让逐行 diff 说「每一行都变了」，
   * 而真相是一句话——**这一列乘了 1000**。
   */
  整列缩放: { column: string; factor: number }[]
  /** 变了的单元格（**不含**被上面那两条解释掉的）。只给前若干个，多了没人看 */
  单元格: { row: number; column: string; from: string; to: string }[]
  /** 一共有多少个格变了。**给了上限就要说清总数**，不静默截断 */
  单元格总数: number
  /**
   * **只是重排了，一行都没少**。
   *
   * 单独标出来：那时逐行 diff 会说「全文件重写」，而人该知道数据没变。
   */
  只是重排?: true
}

/**
 * 一行拼成一个可比的键。**用原文**——规整过的东西不该冒充原始数据。
 *
 * 用 `JSON.stringify` 而不是拿某个字符去拼：任何印刷字符都可能出现在格子里，
 * 拼出来就有歧义；而**控制字符不许进源码**（设计契约里有一条扫描盯着，
 * 2026-08-18 当场把我写进去的一个 `\x00` 抓了出来）。
 */
const 行键 = (行: readonly string[]) => JSON.stringify(行)

/** 这一格看着像数吗。**空与非数都不算**——它们参与不了「乘了个因子」这件事 */
function 数(x: string | undefined): number | undefined {
  if (x === undefined) return undefined
  const s = x.trim()
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

/** 前若干个单元格。再多没人会看，而**说清一共多少个**比全给出来有用 */
const 单元格上限 = 50

export function 比两张表(旧: 表格, 新: 表格): 表格差异 {
  const 旧列 = 旧.columns.map((c) => c.name)
  const 新列 = 新.columns.map((c) => c.name)
  const 短 = Math.min(旧列.length, 新列.length)

  /**
   * **改名 = 同一个位置换了名字，而那一列的值大体没变**。
   *
   * 只看名字的话，「删了 A、加了 B」与「A 改名成 B」分不开——
   * 而这两句话对人的意义完全不同。
   */
  const 列: 列变化[] = []
  for (let i = 0; i < 短; i++) {
    const a = 旧列[i]!
    const b = 新列[i]!
    if (a === b) continue
    const 同位同值 = 旧.rows.slice(0, 20).every((r, k) => r[i] === 新.rows[k]?.[i])
    if (同位同值) {
      列.push({ kind: "renamed", name: b, from: a })
    } else {
      列.push({ kind: "removed", name: a })
      列.push({ kind: "added", name: b })
    }
  }
  for (const c of 旧列.slice(短)) 列.push({ kind: "removed", name: c })
  for (const c of 新列.slice(短)) 列.push({ kind: "added", name: c })

  // ── 行：先看是不是**只是重排**
  const 旧键 = 旧.rows.map(行键)
  const 新键 = 新.rows.map(行键)
  const 同一批 =
    旧键.length === 新键.length && [...旧键].sort().join("|") === [...新键].sort().join("|")
  const 只是重排 = 同一批 && 旧键.join("|") !== 新键.join("|")

  const 旧行数 = 旧.totalRows ?? 旧.rowsRead
  const 新行数 = 新.totalRows ?? 新.rowsRead

  /**
   * ── 整列缩放：**逐列看，比逐格看有意义得多**。
   *
   * 一列里只要有一格不是数，这一列就不谈缩放——**认不出不等于可以猜**。
   * `0` 那些格跳过：任何因子乘 0 都是 0，它不带信息。
   */
  const 整列缩放: { column: string; factor: number }[] = []
  const 被缩放的列 = new Set<number>()
  if (!只是重排) {
    const 上限 = Math.min(旧.rows.length, 新.rows.length)
    for (let i = 0; i < 短; i++) {
      const 比值: number[] = []
      let 全是数 = true
      for (let r = 0; r < 上限; r++) {
        const a = 数(旧.rows[r]?.[i])
        const b = 数(新.rows[r]?.[i])
        if (a === undefined || b === undefined) {
          全是数 = false
          break
        }
        if (a === 0) continue
        比值.push(b / a)
      }
      if (!全是数 || 比值.length < 2) continue
      const f = 比值[0]!
      // 浮点比值不会严格相等，**给一个相对容差**，而不是要求逐位一致
      const 一致 = 比值.every((x) => Math.abs(x - f) <= Math.abs(f) * 1e-9)
      if (一致 && f !== 1) {
        整列缩放.push({ column: 新列[i] ?? String(i), factor: f })
        被缩放的列.add(i)
      }
    }
  }

  // ── 剩下的逐格变化
  const 单元格: 表格差异["单元格"] = []
  let 总数 = 0
  if (!只是重排) {
    const 上限 = Math.min(旧.rows.length, 新.rows.length)
    for (let r = 0; r < 上限; r++) {
      for (let i = 0; i < 短; i++) {
        // **被「整列乘了个因子」解释掉的就不再逐格重复**——那正是噪声的来源
        if (被缩放的列.has(i)) continue
        const a = 旧.rows[r]?.[i] ?? ""
        const b = 新.rows[r]?.[i] ?? ""
        if (a === b) continue
        总数 += 1
        if (单元格.length < 单元格上限) {
          单元格.push({ row: r, column: 新列[i] ?? String(i), from: a, to: b })
        }
      }
    }
  }

  return {
    行: {
      旧: 旧行数,
      新: 新行数,
      增: Math.max(0, 新行数 - 旧行数),
      减: Math.max(0, 旧行数 - 新行数),
    },
    列,
    整列缩放,
    单元格,
    单元格总数: 总数,
    ...(只是重排 ? { 只是重排: true as const } : {}),
  }
}
