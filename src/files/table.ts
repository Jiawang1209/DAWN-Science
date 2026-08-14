/**
 * 分隔文本（CSV / TSV）读成一张表（2026-08-14）。
 *
 * ## 它补的是「数据不是一等公民」这个洞
 *
 * 这个应用叫 DAWN **Science**，而在此之前打开一个 `.csv`
 * 走的是 `text` 那一支——屏幕上是一坨逗号原文。首页那张起手卡写着
 * *「读一份数据」*，点下去底下却没有任何数据能力接着。
 *
 * ## 三条纪律
 *
 * 1. **不起内核。** 打开就见，不用先选 R 还是 Python。
 *    一个只想看一眼数据的人，不该被要求先配好一个解释器。
 * 2. **类型是推断的，就得说它是推断的**（见 `列类型`）。
 *    CSV 没有 schema——把猜出来的东西摆成事实，
 *    下一步就会有人拿它当依据（不变式 5）。
 * 3. **上界要出声**（规格 7.5）：只读前若干行时，
 *    必须说清「一共多少行、只读了多少」。一份被砍过的表和完整的长得一模一样。
 */

/** 预览的行数上界。**够看清形状，不至于把一个 2GB 的文件读进内存** */
export const 预览行数 = 200

/** 读进内存的字节上界。超过就只读前面这么多——**并说清** */
export const 表格字节上界 = 8 * 1024 * 1024

/**
 * 一列是什么。**这几个是推断出来的**，不是声明的。
 *
 * `空` 是一个真实的答案：整列都是缺失时，说「它是文本」是编的。
 */
export type 列类型 = "数值" | "整数" | "布尔" | "日期" | "文本" | "空"

export interface 列摘要 {
  name: string
  /** **推断**出来的类型。CSV 没有 schema，这一列的名字里就写着「推断」 */
  inferred: 列类型
  /** 这一列在读到的那些行里缺了多少个 */
  missing: number
}

export interface 表格 {
  columns: 列摘要[]
  /** 前若干行。**每格都是原文**，不做任何转换——转换过的东西不该冒充原始数据 */
  rows: string[][]
  /** 读到的行数（不含表头） */
  rowsRead: number
  /**
   * 整个文件一共多少行。**只有完整读完才给**——
   * 没读完却报一个数，那个数是假的。
   */
  totalRows?: number
  /** 分隔符。**认出来的**，不是假定的 */
  delimiter: "," | "\t" | ";"
  /** 被截断时说清是怎么截的。缺席 = 完整读完了 */
  truncated?: string
}

/**
 * 认分隔符。**看第一行里谁最多**，不按扩展名猜——
 * 「叫 .csv 的分号文件」在欧洲区域设置下遍地都是，
 * 按扩展名认的话，整张表会被读成**一列**。
 */
export function 认分隔符(第一行: string): "," | "\t" | ";" {
  const 数 = (c: string) => 第一行.split(c).length - 1
  const 候选: ["," | "\t" | ";", number][] = [
    [",", 数(",")],
    ["\t", 数("\t")],
    [";", 数(";")],
  ]
  候选.sort((a, b) => b[1] - a[1])
  // 一个都没有 → 当成逗号（单列文件），**不报错**：单列也是一张表
  return 候选[0]![1] > 0 ? 候选[0]![0] : ","
}

/**
 * 切一行。**认引号**——`"北京, 中国"` 是一个字段，不是两个。
 *
 * 不引三方库：这一层只需要 RFC4180 的那几条，
 * 而多一个依赖就要多回答一次「它坐在哪一层、放弃了什么」（规格 §4）。
 */
export function 切一行(行: string, 分隔符: string): string[] {
  const 出: string[] = []
  let 当前 = ""
  let 引号里 = false
  for (let i = 0; i < 行.length; i++) {
    const c = 行[i]!
    if (引号里) {
      if (c === '"') {
        // `""` 是一个转义的引号，不是引号结束
        if (行[i + 1] === '"') {
          当前 += '"'
          i++
        } else 引号里 = false
      } else 当前 += c
    } else if (c === '"') {
      引号里 = true
    } else if (c === 分隔符) {
      出.push(当前)
      当前 = ""
    } else 当前 += c
  }
  出.push(当前)
  return 出
}

const 整数样 = /^-?\d+$/
const 数值样 = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/
const 布尔样 = /^(true|false|TRUE|FALSE|True|False|T|F|是|否)$/
/** 日期：**只认没有歧义的那些**。`03/04/2026` 是三月四号还是四月三号，没人答得上来 */
const 日期样 = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/

/** 空的判定。**`NA` / `NaN` / `null` 都算缺失**——R 和 Python 的惯例都在这儿 */
function 是空的(v: string): boolean {
  const t = v.trim()
  return t === "" || t === "NA" || t === "N/A" || t === "NaN" || t === "null" || t === "NULL" || t === "None"
}

/** 一列的类型。**整列都空就说空**，不编一个「文本」出来 */
export function 推断列类型(值们: string[]): 列类型 {
  const 有值 = 值们.filter((v) => !是空的(v))
  if (有值.length === 0) return "空"
  if (有值.every((v) => 整数样.test(v.trim()))) return "整数"
  if (有值.every((v) => 数值样.test(v.trim()))) return "数值"
  if (有值.every((v) => 布尔样.test(v.trim()))) return "布尔"
  if (有值.every((v) => 日期样.test(v.trim()))) return "日期"
  return "文本"
}

/**
 * 这段文本**像不像一张表**（2026-08-14，作者要的 `.txt` 支持）。
 *
 * ## 为什么不能按扩展名认
 *
 * 科研数据里 `.txt` 常是制表符分隔的表；但日志、README、笔记也都是 `.txt`。
 * 按扩展名一律当表的话，**一个日志文件会被读成一张乱七八糟的表**——
 * 而它不会报错，只会在屏幕上摆出一堆看起来像数据的东西。
 *
 * ## 判据：前几行的列数**一致**，且不止一列
 *
 * 一致性是关键。散文的每一行逗号数量是随机的；一张表的每一行必然对齐。
 * 只看「有没有分隔符」的话，任何一段中文都会因为顿号、逗号被判成表。
 */
export function 像表格吗(正文: string): boolean {
  const 行 = 正文
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim() !== "")
    .slice(0, 10)
  // **少于两行说明不了任何事**：一行没法验证「对齐」，而对齐才是判据
  if (行.length < 2) return false

  const 分隔符 = 认分隔符(行[0]!)
  const 列数 = 行.map((l) => 切一行(l, 分隔符).length)
  // 单列不算表——那就是普通文本，一行一句
  if (列数[0]! < 2) return false
  return 列数.every((n) => n === 列数[0])
}

/**
 * 把一段分隔文本读成表。
 *
 * `完整` 表示这段文本是不是整个文件——**不完整时不报总行数**，
 * 因为那时我们并不知道总共多少行。
 */
export function 读成表(正文: string, 完整: boolean): 表格 {
  // **`\r\n` 与 `\r` 都要认**：Excel 存出来的 CSV 在 Windows 上是 `\r\n`
  const 全部行 = 正文.split(/\r\n|\r|\n/)
  // 末尾那个空行是分割产生的，不是一行数据
  while (全部行.length > 0 && 全部行[全部行.length - 1] === "") 全部行.pop()
  if (全部行.length === 0) {
    return { columns: [], rows: [], rowsRead: 0, delimiter: ",", ...(完整 ? { totalRows: 0 } : {}) }
  }

  const 分隔符 = 认分隔符(全部行[0]!)
  const 表头 = 切一行(全部行[0]!, 分隔符)
  const 数据行 = 全部行.slice(1)
  const 取的行 = 数据行.slice(0, 预览行数).map((l) => 切一行(l, 分隔符))

  const columns: 列摘要[] = 表头.map((name, i) => {
    const 这列 = 取的行.map((r) => r[i] ?? "")
    return {
      // **没有列名就如实说没有**，不编一个 `V1`——那会被当成真的列名
      name: name.trim() === "" ? `（第 ${i + 1} 列没有名字）` : name.trim(),
      inferred: 推断列类型(这列),
      missing: 这列.filter(是空的).length,
    }
  })

  const 截断说明 =
    !完整
      ? `文件太大，只读了前 ${Math.round(表格字节上界 / 1024 / 1024)} MB；总行数未知`
      : 数据行.length > 取的行.length
        ? `只显示前 ${取的行.length} 行，共 ${数据行.length} 行`
        : undefined

  return {
    columns,
    rows: 取的行,
    rowsRead: 取的行.length,
    ...(完整 ? { totalRows: 数据行.length } : {}),
    delimiter: 分隔符,
    ...(截断说明 ? { truncated: 截断说明 } : {}),
  }
}
