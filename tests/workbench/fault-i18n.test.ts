/**
 * 后端错误的双语（B15，2026-09-01）。
 *
 * 首启审计（2026-08-28）记的：英文界面上**每一条后端错误都是中文**。
 * 后端 `fault(code, message)` 抛的那句话被界面原样显示，`t()` 从来没见过它。
 *
 * 定案：`fault(code, msgid, ...args)`——msgid 是带 `{0}` 的中文原文（与界面 `tf` 同一套约定），
 * 服务端把 `{ msgid, args }` 放进 `error.details.i18n`，客户端再按当前语言 `tf` 一遍。
 * 中文那一面**逐字节不变**：日志、旧测试、旧读者都看不出差别。
 *
 * 下半部分是**扫描**（项目规则 2：能判定的规则配一个扫描）。它盯三件事：
 *   (a) `fault(` 的第二个实参不许是带 `${}` 的模板串——插值必须走 args，否则译不了；
 *   (b) 每一个字面 msgid 在英文表里都有；
 *   (c) 原样透传别人的话（`fault原样`）只许出现在下面那张名单里——多一处就是一次有意识的决定。
 */
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fault, fault原样 } from "../../src/workbench/server.js"
import { EN } from "../../src/ui/i18n/en.js"

describe("fault() · 中文照旧渲染，另外带上 msgid 与 args", () => {
  it("带参：message 是替换了 {0} 之后的中文；i18n 里是原样的 msgid 与 args", () => {
    const e = fault("not_found", "没有这个项目：{0}", "p1")
    expect(e.message).toBe("没有这个项目：p1")
    expect(e.workbenchCode).toBe("not_found")
    expect(e.i18n).toEqual({ msgid: "没有这个项目：{0}", args: ["p1"] })
  })

  it("两个实参的老写法照常：message 就是 msgid，args 为空", () => {
    const e = fault("internal_error", "本次运行没有装配设置")
    expect(e.message).toBe("本次运行没有装配设置")
    expect(e.i18n).toEqual({ msgid: "本次运行没有装配设置", args: [] })
  })

  it("数字也能当参数；同一个占位符可以出现多次；没给的占位符原样留着（与界面 tf 一致）", () => {
    const e = fault("invalid_request", "{0} 太大了（{1}MB），{0} 缩不下来 {2}", "a.png", 12)
    expect(e.message).toBe("a.png 太大了（12MB），a.png 缩不下来 {2}")
  })

  it("fault原样：别人的话原样带上去，**不带 i18n**——那句话本来就不在英文表里，带上只会让客户端白吼一声", () => {
    const e = fault原样("conflict", "All configured authentication methods failed")
    expect(e.message).toBe("All configured authentication methods failed")
    expect(e.workbenchCode).toBe("conflict")
    expect(e.i18n).toBeUndefined()
  })
})

/* ── 扫描 ───────────────────────────────────────────────────────────────── */

const SRC = join(import.meta.dirname, "..", "..", "src")

function 源文件(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...源文件(full))
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

/**
 * ## 为什么自己切实参，而不是拿 TypeScript 的解析器
 *
 * `typescript@7` 是 Go 移植版，npm 包里**没有 `createSourceFile`**（解析器在二进制里）。
 * 正则又会被字符串、注释里的括号骗。于是这里有一个够用的小扫描：
 * 认字符串（含模板串与其中的 `${}`）、认注释、数括号深度，把 `fault(` 的顶层实参按源码原文切出来。
 */
function 跳注释(src: string, i: number): number {
  if (src.startsWith("//", i)) {
    const j = src.indexOf("\n", i)
    return j < 0 ? src.length : j
  }
  if (src.startsWith("/*", i)) {
    const j = src.indexOf("*/", i + 2)
    return j < 0 ? src.length : j + 2
  }
  return i
}

/** `src[i]` 是引号；返回这个字符串结束之后的下标。模板串里的 `${…}` 递归按代码读 */
function 跳字符串(src: string, i: number): number {
  const q = src[i]!
  i++
  while (i < src.length) {
    const c = src[i]
    if (c === "\\") {
      i += 2
      continue
    }
    if (c === q) return i + 1
    if (q === "`" && c === "$" && src[i + 1] === "{") {
      i = 读到(src, i + 2, "}") + 1
      continue
    }
    i++
  }
  return i
}

/**
 * `src[i]` 是 `/`，而且不是注释：它是正则还是除号？看前一个非空字符——
 * 跟在 `( , = : [ ! & | ? { } ;` 或 `return` 后面的是正则（老办法，够用）。
 */
function 跳正则(src: string, i: number): number {
  const 前 = src.slice(0, i).trimEnd()
  const 是正则 = 前 === "" || /[(,=:[!&|?{};]$/.test(前) || /\breturn$/.test(前)
  if (!是正则) return i
  i++
  let 在方括号里 = false
  while (i < src.length) {
    const c = src[i]
    if (c === "\\") {
      i += 2
      continue
    }
    if (c === "[") 在方括号里 = true
    else if (c === "]") 在方括号里 = false
    else if (c === "/" && !在方括号里) return i + 1
    else if (c === "\n") return i
    i++
  }
  return i
}

/** 从 i 起，若正站在注释、字符串或正则上，返回跳过它之后的下标；否则原样返回 */
function 跳过非代码(src: string, i: number): number {
  const c = src[i]
  if (c === "/") {
    const j = 跳注释(src, i)
    return j !== i ? j : 跳正则(src, i)
  }
  if (c === '"' || c === "'" || c === "`") return 跳字符串(src, i)
  return i
}

/** 从 i 起按代码读，直到括号深度为 0 时碰到 `停在` 里的某个字符；返回那个字符的下标 */
function 读到(src: string, i: number, 停在: string): number {
  let 深 = 0
  while (i < src.length) {
    const j = 跳过非代码(src, i)
    if (j !== i) {
      i = j
      continue
    }
    const c = src[i]!
    if (深 === 0 && 停在.includes(c)) return i
    if ("([{".includes(c)) 深++
    else if (")]}".includes(c)) 深--
    i++
  }
  return i
}

/** 一个调用点：在哪、各实参的源码原文（去掉首尾空白） */
type 调用 = { 位置: string; 实参们: string[] }

/** 找出 `名(` 的所有调用（注释与字符串里的不算），切出顶层实参 */
function 找调用(file: string, 名: string): 调用[] {
  return 找调用于(readFileSync(file, "utf8"), 名, relative(SRC, file))
}

function 找调用于(src: string, 名: string, 标签: string): 调用[] {
  const out: 调用[] = []
  const 头 = 名 + "("
  let i = 0
  while (i < src.length) {
    const j = 跳过非代码(src, i)
    if (j !== i) {
      i = j
      continue
    }
    // 前面紧挨着标识符字符的不算（`this.fault(`、`myfault(`）；`function fault(` 那是声明，也不算
    if (src.startsWith(头, i) && !/[\w.$\u4e00-\u9fff]/.test(src[i - 1] ?? "") && !/\bfunction$/.test(src.slice(Math.max(0, i - 12), i).trimEnd())) {
      const line = src.slice(0, i).split("\n").length
      const 实参们: string[] = []
      let k = i + 头.length
      for (;;) {
        const 止 = 读到(src, k, ",)")
        const 文 = src.slice(k, 止).trim()
        if (文) 实参们.push(文)
        k = 止 + 1
        if (src[止] !== ",") break
      }
      out.push({ 位置: `${标签}:${line}`, 实参们 })
      i = k
      continue
    }
    i++
  }
  return out
}

const 串 = String.raw`"(?:[^"\\]|\\.)*"`
const 只有字面串 = new RegExp(`^${串}$`)
const 字面串的三元 = new RegExp(`^[^"'\`]+\\?\\s*(${串})\\s*:\\s*(${串})$`)

/**
 * msgid 实参里的字面串。**只认字面串与字面串的三元**（`cond ? "a" : "b"`）。
 * 带 `${}` 的模板串、变量、拼接——一律不认，返回 undefined 让调用方报错。
 */
function 字面msgid(文: string | undefined): string[] | undefined {
  if (!文) return undefined
  if (只有字面串.test(文)) return [JSON.parse(文) as string]
  if (/^`[^`$]*`$/.test(文)) return [文.slice(1, -1)]
  const m = 字面串的三元.exec(文)
  if (m) return [JSON.parse(m[1]!) as string, JSON.parse(m[2]!) as string]
  return undefined
}

/**
 * **原样透传的名单**（规则 c）。键是第二个实参的源码原文，值是它出现的次数。
 *
 * 这些地方抛的是**别人的话**——ssh2、内核、守卫（`UserFacingError`）、技能导入的预检、
 * 定时计划的校验——它们不在英文表里，也不该硬塞进去（那些话有的本来就是英文，有的
 * 是另一个模块的责任）。多一处、少一处都要来这里改数字：这是「有意识的决定」的形状。
 */
const 原样透传名单: Record<string, number> = {
  "e instanceof Error ? e.message : String(e)": 9,
  "err instanceof Error ? err.message : String(err)": 4,
  "没续上因为 ?? (err instanceof Error ? err.message : String(err))": 1,
  "err.message": 3,
  "e.message": 5,
  "r.why": 3,
  "消息": 5,
  "毛病": 2,
  "msg": 1,
}

describe("扫描 · 后端错误都译得了", () => {
  const 文件们 = 源文件(SRC).filter((f) => /\b(fault|fault原样|i18n消息)\(/.test(readFileSync(f, "utf8")))

  it("扫描到了调用点（否则这条测试是空转的）", () => {
    expect(文件们.some((f) => f.endsWith("workbench/backend.ts"))).toBe(true)
    expect(找调用(join(SRC, "workbench", "backend.ts"), "fault").length).toBeGreaterThan(100)
  })

  it("切实参的小扫描本身靠得住：字符串里的逗号与括号、模板串里的 `${}`、注释行都不会骗到它", () => {
    const 样本 = [
      "// fault(\"x\", \"注释里的不算\")",
      "/** 文档注释里的也不算\n * fault(\"y\") */",
      "throw fault(\"not_found\", `a, b) ${x(1, \"y)\")} c`, z) // 行尾注释 fault(",
      "  if (!p) throw fault原样(\"conflict\", err instanceof Error ? err.message : String(err))",
      "const s = \"fault(\" + 1",
      "if (/未持有|租约/.test(消息)) throw fault(\"conflict\", \"a\")",
      "const n = 4 / 2 / 1; fault(\"conflict\", \"b\")",
    ].join("\n")
    expect(找调用于(样本, "fault", "样本")).toEqual([
      { 位置: "样本:4", 实参们: ['"not_found"', '`a, b) ${x(1, "y)")} c`', "z"] },
      { 位置: "样本:7", 实参们: ['"conflict"', '"a"'] },
      { 位置: "样本:8", 实参们: ['"conflict"', '"b"'] },
    ])
    expect(找调用于(样本, "fault原样", "样本")).toEqual([
      { 位置: "样本:5", 实参们: ['"conflict"', "err instanceof Error ? err.message : String(err)"] },
    ])
    expect(字面msgid('"没有这个项目：{0}"')).toEqual(["没有这个项目：{0}"])
    expect(字面msgid('增强中.has(requestId) ? "增强超时了，这次没改" : "已取消"')).toEqual(["增强超时了，这次没改", "已取消"])
    expect(字面msgid("`读不了 ${p}`")).toBeUndefined()
    expect(字面msgid("消息")).toBeUndefined()
  })

  it("(a) fault( 的 msgid 不许带 `${}`、不许是变量——插值走 args，别人的话走 fault原样", () => {
    const 违规: string[] = []
    for (const f of 文件们) {
      for (const c of 找调用(f, "fault")) {
        if (字面msgid(c.实参们[1]) === undefined) 违规.push(`${c.位置}：${c.实参们[1] ?? "（没有第二个实参）"}`)
      }
    }
    expect(违规, "msgid 必须是字面中文，插值用 {0} 放进第三个实参起；原样透传改用 fault原样").toEqual([])
  })

  it("(b) 每一个 msgid 在英文表里都有", () => {
    const 缺的: string[] = []
    for (const f of 文件们) {
      for (const [c, 位] of [...找调用(f, "fault").map((c) => [c, 1] as const), ...找调用(f, "i18n消息").map((c) => [c, 0] as const)]) {
        for (const id of 字面msgid(c.实参们[位]) ?? []) if (!(id in EN)) 缺的.push(`${c.位置}：${JSON.stringify(id)}`)
      }
    }
    expect(缺的, "这些错误在英文界面上会照旧是中文——补进 src/ui/i18n/en.ts").toEqual([])
  })

  it("(b′) 占位符与实参数对得上——写了 {1} 却只给一个参数，英文里会露出一个 {1}", () => {
    const 对不上: string[] = []
    for (const f of 文件们) {
      for (const [c, 位] of [...找调用(f, "fault").map((c) => [c, 1] as const), ...找调用(f, "i18n消息").map((c) => [c, 0] as const)]) {
        const 给了 = c.实参们.length - 位 - 1
        for (const id of 字面msgid(c.实参们[位]) ?? []) {
          const 要 = Math.max(-1, ...[...id.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]))) + 1
          if (要 !== 给了) 对不上.push(`${c.位置}：${JSON.stringify(id)} 要 ${要} 个，给了 ${给了} 个`)
        }
      }
    }
    expect(对不上).toEqual([])
  })

  it("(c) fault原样 只出现在名单里，次数也对得上——多一处就是一次有意识的决定", () => {
    const 见到 = new Map<string, number>()
    const 在哪: string[] = []
    for (const f of 文件们) {
      for (const c of 找调用(f, "fault原样")) {
        const 签名 = (c.实参们[1] ?? "").replace(/\s+/g, " ")
        见到.set(签名, (见到.get(签名) ?? 0) + 1)
        在哪.push(`${c.位置}：${签名}`)
      }
    }
    const 差异: string[] = []
    for (const [签名, n] of 见到) if (原样透传名单[签名] !== n) 差异.push(`${JSON.stringify(签名)}：名单 ${原样透传名单[签名] ?? 0}，实际 ${n}`)
    for (const 签名 of Object.keys(原样透传名单)) if (!见到.has(签名)) 差异.push(`${JSON.stringify(签名)}：名单 ${原样透传名单[签名]}，实际 0`)
    expect(差异, `原样透传的地方变了。现在有：\n${在哪.join("\n")}`).toEqual([])
  })
})
