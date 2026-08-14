/**
 * 分隔文本读成表（2026-08-14）。
 *
 * 这一层最容易出的两种错，两种都是**不报错的错**：
 *
 * 1. **叫 `.csv` 的分号文件**（欧洲区域设置下遍地都是）被按扩展名读成**一列**；
 * 2. **引号里的逗号**被切开，于是 `"北京, 中国"` 变成两个字段，整行错位。
 *
 * 两种都不会抛异常，只会让屏幕上出现一张看起来正常、其实是错的表。
 */
import { describe, expect, it } from "vitest"
import { 认分隔符, 切一行, 推断列类型, 读成表, 像表格吗, 预览行数 } from "../../src/files/table.js"

describe("认分隔符 · 看内容，不看扩展名", () => {
  it("逗号", () => expect(认分隔符("a,b,c")).toBe(","))
  it("制表符", () => expect(认分隔符("a\tb\tc")).toBe("\t"))
  /** **欧洲区域设置的 Excel 存出来就是这样**，按扩展名认的话整张表会变成一列 */
  it("**分号也认**", () => expect(认分隔符("a;b;c")).toBe(";"))
  it("一个都没有 → 当成逗号（单列文件也是一张表，不报错）", () => {
    expect(认分隔符("只有一列")).toBe(",")
  })
  it("谁多算谁 —— 一行里几种都有时不猜错", () => {
    expect(认分隔符("a,b;c;d;e")).toBe(";")
  })
})

describe("切一行 · 认引号", () => {
  it("**引号里的逗号不是分隔符**", () => {
    expect(切一行('北京,"北京, 中国",3', ",")).toEqual(["北京", "北京, 中国", "3"])
  })

  it("`\"\"` 是一个转义的引号，不是引号结束", () => {
    expect(切一行('a,"他说""好""",c', ",")).toEqual(["a", '他说"好"', "c"])
  })

  it("空字段保留 —— 缺失是一个值，不该被吞掉", () => {
    expect(切一行("a,,c", ",")).toEqual(["a", "", "c"])
  })
})

describe("推断列类型 · 猜出来的东西要能说清是猜的", () => {
  it("整数与数值分开 —— 「1,2,3」和「1.5」不是一回事", () => {
    expect(推断列类型(["1", "2", "3"])).toBe("整数")
    expect(推断列类型(["1.5", "2", "3e4"])).toBe("数值")
  })

  it("布尔认几种常见写法", () => {
    expect(推断列类型(["true", "FALSE", "T"])).toBe("布尔")
    expect(推断列类型(["是", "否"])).toBe("布尔")
  })

  /** **只认没有歧义的日期**：`03/04/2026` 是三月四号还是四月三号，没人答得上来 */
  it("日期只认 ISO 那种，不猜 03/04/2026", () => {
    expect(推断列类型(["2026-08-14", "2026-01-01"])).toBe("日期")
    expect(推断列类型(["03/04/2026"])).toBe("文本")
  })

  it("**整列都空就说空** —— 不编一个「文本」出来", () => {
    expect(推断列类型(["", "NA", "NaN", "null"])).toBe("空")
  })

  it("NA / NaN / null 不影响类型判定 —— 它们是缺失，不是文本", () => {
    expect(推断列类型(["1", "NA", "3"])).toBe("整数")
  })

  it("混着就是文本", () => {
    expect(推断列类型(["1", "abc"])).toBe("文本")
  })
})

describe("读成表", () => {
  const 样本 = "name,age,score\n小明,12,1.5\n小红,,2.5\n"

  it("列名、行数、每列类型与缺失都对", () => {
    const t = 读成表(样本, true)
    expect(t.columns.map((c) => c.name)).toEqual(["name", "age", "score"])
    expect(t.totalRows).toBe(2)
    expect(t.columns[0]!.inferred).toBe("文本")
    expect(t.columns[1]!.inferred).toBe("整数")
    expect(t.columns[1]!.missing, "小红那行的 age 是空的").toBe(1)
  })

  it("每格是原文 —— 转换过的东西不该冒充原始数据", () => {
    expect(读成表(样本, true).rows[0]).toEqual(["小明", "12", "1.5"])
  })

  /** Excel 在 Windows 上存出来是 `\\r\\n`。不认的话每行末尾都会多一个 `\\r` */
  it("认 CRLF", () => {
    const t = 读成表("a,b\r\n1,2\r\n", true)
    expect(t.rows[0]).toEqual(["1", "2"])
    expect(t.columns[1]!.name, "列名末尾混进了 \\r").toBe("b")
  })

  /**
   * **没读完就不报总行数。**
   * 报一个出来的话，那个数是假的——而它看起来和真的一模一样。
   */
  it("文件没读完时不给 totalRows，并说清为什么", () => {
    const t = 读成表("a,b\n1,2\n", false)
    expect("totalRows" in t, "没读完却报了总行数").toBe(false)
    expect(t.truncated).toBeTruthy()
  })

  it("**行数超上界要出声**（规格 7.5）", () => {
    const 多 = ["a,b", ...Array.from({ length: 预览行数 + 50 }, (_v, i) => `${i},x`)].join("\n")
    const t = 读成表(多, true)
    expect(t.rows).toHaveLength(预览行数)
    expect(t.totalRows).toBe(预览行数 + 50)
    expect(t.truncated, "砍过的表和完整的长得一模一样，必须说").toBeTruthy()
  })

  it("**没有列名就如实说没有** —— 不编一个 V1，那会被当成真列名", () => {
    expect(读成表("a,,c\n1,2,3\n", true).columns[1]!.name).toMatch(/没有名字/)
  })

  it("空文件不炸", () => {
    const t = 读成表("", true)
    expect(t.columns).toEqual([])
    expect(t.totalRows).toBe(0)
  })

  it("分号文件读出来是三列，不是一列", () => {
    const t = 读成表("a;b;c\n1;2;3\n", true)
    expect(t.columns).toHaveLength(3)
    expect(t.delimiter).toBe(";")
  })
})

/**
 * `.txt` 要**看内容**决定是不是表（2026-08-14，作者要的）。
 *
 * 科研数据里 `.txt` 常是制表符分隔的表；但日志、README、笔记也是 `.txt`。
 * 按扩展名一律当表的话，**一个日志会被读成一张乱表，而且不报任何错**。
 */
describe("像表格吗 · 判据是「每行对齐」，不是「有分隔符」", () => {
  it("制表符分隔的数据 → 是表", () => {
    expect(像表格吗("gene\texpr\tp\nTP53\t1.2\t0.01\nEGFR\t2.4\t0.03")).toBe(true)
  })

  /** **散文里的逗号是随机的**，而表的每一行必然对齐 */
  it("**一段中文散文 → 不是表**，哪怕里面全是逗号", () => {
    expect(
      像表格吗("今天天气不错，我们出去走走。\n他说，这个结果有问题，需要再看。\n于是又跑了一遍。"),
    ).toBe(false)
  })

  it("**日志 → 不是表**", () => {
    expect(
      像表格吗("[10:00:01] INFO 启动完成\n[10:00:02] WARN 磁盘快满了，剩 3%\n[10:00:05] INFO 就绪"),
    ).toBe(false)
  })

  it("单列文本 → 不是表 —— 那就是一行一句", () => {
    expect(像表格吗("第一行\n第二行\n第三行")).toBe(false)
  })

  it("**只有一行说明不了对齐** —— 不足以判成表", () => {
    expect(像表格吗("a,b,c")).toBe(false)
  })

  it("列数不齐 → 不是表", () => {
    expect(像表格吗("a,b,c\n1,2\n3,4,5,6")).toBe(false)
  })
})
