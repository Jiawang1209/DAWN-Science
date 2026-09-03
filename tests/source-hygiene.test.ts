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

/**
 * rxjs 只准出现在内核适配器里（②-A 计划 §7 的第一条防线）。
 *
 * ## 为什么这条要有扫描
 *
 * `@nteract/messaging` 要 rxjs **^6.6.0**，`enchannel-zmq-backend@10` 要 **^7.8.2**，
 * 两份都会装上，且两者的 `Observable` 类型结构互不兼容
 * （Spike D 实测 4 处 TS2345）。**这是消不掉的成本，只能隔离。**
 *
 * 隔离靠的是「只有适配器碰它」这条约定——而**靠记性维护的约定会腐烂，
 * 且腐烂时没有声音**：某天有人图省事在别处 `import { firstValueFrom } from "rxjs"`，
 * 一切照常工作，直到某次升级把两份 rxjs 撞在一起。
 */
describe("rxjs 不许渗出内核适配器", () => {
  /** 唯一允许碰 rxjs 的文件。**加白名单要有理由**，不是随手加 */
  const ALLOWED = new Set(["src/kernel/channel.ts"])

  it("`src/` 下只有适配器可以 import rxjs / nteract / enchannel", () => {
    const 违规: string[] = []
    for (const file of sourceFiles(join(import.meta.dirname, "../src"))) {
      const rel = file.slice(file.indexOf("src/"))
      if (ALLOWED.has(rel)) continue
      const text = readFileSync(file, "utf8")
      for (const [i, line] of text.split("\n").entries()) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue // 注释里可以提它
        // 静态 `from "..."` 与动态 `import("...")` 都要抓——ALLOWED 那份文件两种都在用
        if (/(from\s+|import\()\s*["'](rxjs|@nteract\/|enchannel-zmq-backend)/.test(line)) {
          违规.push(`${rel}:${i + 1}: ${line.trim()}`)
        }
      }
    }
    expect(违规, "只有 src/kernel/channel.ts 可以碰这三个包").toEqual([])
  })

  it("**适配器自己也不许把 Observable 漏出去** —— 它的对外类型里不该出现 rxjs", () => {
    /**
     * **注释不算违规。** 这不是放水：`types.ts` 的文件头正是在解释
     * 「这里为什么没有 rxjs」，规则的解释者必须能提到规则本身。
     * 本仓库为同一件事已经加过一次 `isComment`（见 design-contract.test.ts）。
     */
    const 代码行 = readFileSync(join(import.meta.dirname, "../src/kernel/types.ts"), "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n")
    expect(代码行).not.toMatch(/Observable|Subject|rxjs/)
  })
})
