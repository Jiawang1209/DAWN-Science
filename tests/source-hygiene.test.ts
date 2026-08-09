/**
 * 源码卫生的自动强制（全仓库）。
 *
 * ## 为什么不放进 `tests/ui/design-contract.test.ts`
 *
 * 那个文件有明确的两条边界：**只扫 `src/ui`**，且**只对应 `docs/DESIGN.md`
 * 里的规则**。这里的规则既不限于界面，也不属于视觉契约，
 * 塞进去会让那个文件的名字开始说谎。
 *
 * 准入规则 ②（`CLAUDE.md`）说的是「能判定的设计规则配一个扫描测试」，
 * 没说必须挤在同一个文件里。
 *
 * ## 规则一：源文件里不得有裸控制字符
 *
 * **2026-08-09 由 S1 第一片撞出来。** `subagent/definitions.ts` 里一个正则的
 * 字符类，我以为敲的是「空格 + 连字符」，实际写进文件的是 `\0` 与 `\x1f`
 * 两个**裸控制字节**。
 *
 * 它的恶劣之处不是行为——行为碰巧是对的——而是：
 *
 *   1. **`grep` 把整个文件当成二进制，一行都不返回。** 连 `grep -c ""` 都静默。
 *      一个搜不到的源文件，等于在仓库里挖了个洞
 *   2. 代码评审看不见它，diff 看不见它，`Read` 也把它渲染成看不出异常的样子
 *   3. 它是**碰巧**正确的：`\0-\x1f` 恰好是个合理的控制字符范围，
 *      而我本来想写的是别的东西。碰巧正确的代码下一次改动就会破
 *
 * 排除 `\t`（制表符）与 `\n`：前者在源码里合法，后者是行分隔符本身。
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOTS = [
  join(import.meta.dirname, "../src"),
  // **测试也扫。** 写这条规则的那个文件自己就先违反了它
  import.meta.dirname,
]

/** 递归收集 `src/` 下的 .ts / .tsx */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p))
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p)
  }
  return out
}

/** 允许的：制表符与换行。其余 C0 控制字符与 DEL 一律不许出现在源码里 */
const FORBIDDEN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/

describe("源文件里不得有裸控制字符", () => {
  it("扫到的每个 .ts / .tsx 都是纯文本", () => {
    const offenders: string[] = []
    for (const file of ROOTS.flatMap(sourceFiles)) {
      const text = readFileSync(file, "utf8")
      text.split("\n").forEach((line, i) => {
        const m = FORBIDDEN.exec(line)
        if (!m) return
        const code = m[0]!.charCodeAt(0).toString(16).padStart(2, "0")
        offenders.push(
          `${file}:${i + 1} 含控制字符 \\x${code}` +
            `（想表达控制字符请写成转义，例如 \\x1f）`,
        )
      })
    }
    expect(offenders).toEqual([])
  })

  it("**这条扫描本身是有效的** —— 拿一段带裸控制字符的文本喂它，必须被判违规", () => {
    // 空扫描永远绿。这条守的是「扫描器还活着」。
    //
    // **控制字符在这里是程序化构造的，不是敲进文件的。**
    // 写这个文件时我又犯了一次同样的失误：想敲「空格和连字符」，
    // 写进去的是两个裸控制字节——于是这份**用来禁止裸控制字符的测试**
    // 自己带着裸控制字符。这也是扫描范围包含 tests/ 的原因。
    const NUL = String.fromCharCode(0)
    const US = String.fromCharCode(0x1f)
    expect(FORBIDDEN.test(`const A = /[^${NUL}-${US}]/`)).toBe(true)
    // 而写成转义的那份是一串普通字符，不该被判违规
    expect(FORBIDDEN.test("const A = /[^\\x00-\\x1f]/")).toBe(false)
    // 制表符与普通文本不该被误判
    expect(FORBIDDEN.test("\tconst a = 1")).toBe(false)
    expect(FORBIDDEN.test("中文注释与 emoji 🎯 都不是控制字符")).toBe(false)
  })
})
