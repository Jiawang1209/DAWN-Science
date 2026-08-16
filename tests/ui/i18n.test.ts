/**
 * 双语的扫描（2026-08-13）。
 *
 * 本项目的第二条准入规则：**能判定的设计规则，配一个扫描测试**。
 * 双语有三条是能判定的，它们都在这儿。
 *
 * 为什么非要扫：msgid 就是中文原文，于是**改一句中文文案 = 改一个键**。
 * 人一定会忘。忘了的后果是英文界面上冒出一句中文——
 * 它会在控制台吼一声，但那要等到有人真的切到英文并走到那一屏。
 * 扫描把这件事提前到提交之前。
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { EN } from "../../src/ui/i18n/en.js"

const UI = join(import.meta.dirname, "..", "..", "src", "ui")

function 界面文件(): string[] {
  const out: string[] = []
  const 走 = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== "i18n") 走(p)
      } else if (/\.tsx?$/.test(e.name)) out.push(p)
    }
  }
  走(UI)
  return out
}

/**
 * 抓出所有 `t("…")` / `tf("…", …)` / `msgid("…")` 的第一个实参。
 *
 * **`msgid()` 必须一起抓**：它是「这句话是文案，但求值太早、留到取用处再翻」的标记。
 * 不抓它的话，模块级常量表里那些句子在这条扫描眼里就不存在——
 * 而它们恰恰是最容易漏翻的一批。
 */
function 调用点的msgid(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/\b(?:tf?|msgid)\(\s*"((?:[^"\\]|\\.)*)"/g)) {
    out.push(JSON.parse(`"${m[1]}"`) as string)
  }
  return out
}

/**
 * **英文表里不许有重复的键**（2026-08-15 踩的）。
 *
 * 我加 MCP 那一屏的文案时重复定义了「换一个」——它早就存在。
 * **JS 的对象字面量对重复键是静默的**：后一个覆盖前一个，不报错、不警告。
 * 症状会是「另一处的翻译莫名其妙变了」，而那与你刚改的那一屏毫无关系。
 *
 * `tsc` 确实抓得住（TS1117），但它是在**别的原因**下才被跑到的——
 * 这条规则可判定，就该有一条扫描盯着它。
 */
describe("英文表 · 不重复", () => {
  it("**没有重复定义的 msgid**", () => {
    const src = readFileSync(join(UI, "i18n", "en.ts"), "utf8")
    const 见过 = new Map<string, number>()
    for (const m of src.matchAll(/^\s{2}"((?:[^"\\]|\\.)+)":/gm)) {
      见过.set(m[1]!, (见过.get(m[1]!) ?? 0) + 1)
    }
    const 重的 = [...见过].filter(([, n]) => n > 1).map(([k]) => k)
    expect(重的, "后一个会静默覆盖前一个，症状出现在别处").toEqual([])
  })
})

describe("双语 · 目录不许与调用点脱节", () => {
  it("**每一个 `t()` 的 msgid 在英文表里都有**", () => {
    const 缺的: string[] = []
    for (const f of 界面文件()) {
      for (const id of 调用点的msgid(readFileSync(f, "utf8"))) {
        if (!(id in EN)) 缺的.push(`${f.slice(UI.length + 1)}：${JSON.stringify(id)}`)
      }
    }
    expect(缺的, "这些句子切到英文会原样显示中文——补进 i18n/en.ts").toEqual([])
  })

  /**
   * 反过来那一面：**表里有、代码里没人用**。
   *
   * 它不像上一条那样会在界面上露馅，但它是**同一种脱节**：
   * 一句被改掉原文的话会在这里留下一条谁也够不着的旧翻译，
   * 而下一个人看见它会以为那句话还在用。
   */
  it("**英文表里没有谁也不用的孤儿**", () => {
    const 用到的 = new Set<string>()
    for (const f of 界面文件()) for (const id of 调用点的msgid(readFileSync(f, "utf8"))) 用到的.add(id)
    const 孤儿 = Object.keys(EN).filter((k) => !用到的.has(k))
    expect(孤儿, "没有任何调用点用它们——要么是原文改过了，要么该删").toEqual([])
  })
})

describe("双语 · 英文那一面也要守中文那边的规矩", () => {
  /**
   * **没有一个按钮文案是另一个的子串**——中文那条在 `design-contract.test.ts`。
   *
   * `getByRole(name)` 是子串匹配，**换成英文不会变成精确匹配**。
   * 中文那边守住了、英文这边没守，结果是「切到英文之后 e2e 才开始撞」，
   * 而那时没人会想到是文案的事。
   *
   * ## 只比按钮，这一点是必须的
   *
   * 第一版拿**整张表**的短值互相比，于是它报出
   * `"ok" ⊂ "took"`、`"running" ⊂ "running for"` 这种——
   * 那两个是状态标签和 tooltip，从来不是「按名字找」的对象。
   * **一条会持续报假警的扫描，最后一定被人无脑跳过**，
   * 那时它就什么都不证明了（本项目 2026-08-12 为「抓不住的扫描」栽过两次，
   * 这是同一枚硬币的另一面）。
   *
   * 所以判据跟中文那边对齐：**看 JSX 里 `<Button>` 真的渲染了哪些 msgid。**
   */
  /**
   * ## 有 `aria-label` 时，**名字是它，不是里面那行字**（2026-08-16）
   *
   * 上一版把 `<Button>` 块里所有 msgid 一股脑收进来，包括 `aria-label` 的。
   * 于是它抓出四条**假警**：
   *
   * ```
   * "Select" ⊂ "Select projects"   ← 同一颗按钮：可见文字 vs 它自己的 aria-label
   * "Select" ⊂ "Select chats"      ← 同上（另一列）
   * "Select" ⊂ "Select servers"    ← 同上
   * "Select" ⊂ "Select all"        ← 两颗按钮，但前者的名字是 "Select projects"
   * ```
   *
   * **有 `aria-label` 就以它为名字**——读屏、`getByRole(name)` 都是这么定的。
   * 所以「可见文字 ⊂ 自己的 aria-label」不是撞车，恰恰是 WCAG 2.5.3
   * （label in name）**要求**的形状：读屏念出的名字得包含眼睛看到的那几个字。
   * 上一版反着来，等于在奖励一个无障碍缺陷。
   *
   * 三颗「多选」按钮的可见文字本来就一模一样（三列各一颗），
   * 靠 `aria-label` 分开——这条设计早就在了，是这条扫描没跟上。
   */
  function 按钮里的msgid(src: string): string[] {
    const out: string[] = []
    for (const m of src.matchAll(/<Button\b[\s\S]*?<\/Button>/g)) {
      const 块 = m[0]
      const 名 = 块.match(/aria-label=(?:\{[^{}]*\}|"[^"]*")/)
      // 嵌套大括号会让上面这条漏掉整个 aria-label，那时它会退回「收全部」——
      // **退回的方向是多报，不是漏报**，所以不会把真撞车放过去
      for (const id of 调用点的msgid(名 ? 名[0] : 块)) out.push(id)
    }
    return out
  }

  it("按钮文案之间没有子串关系", () => {
    const 按钮 = new Set<string>()
    for (const f of 界面文件()) for (const id of 按钮里的msgid(readFileSync(f, "utf8"))) 按钮.add(id)
    /**
     * **带占位符的不参与比对**，理由要写清楚。
     *
     * `删除项目：{0}` 这种标签**永远带着一个对象的名字**
     * （「删除项目：论文数据」）。按名字找它的用例写的是那个完整值，
     * 而一个只写「删除」的用例本来就该带 `exact: true`——
     * **精确匹配不做子串**，那才是这条危险真正的边界。
     *
     * 把它们算进来的话，任何一个叫「删除」的菜单项都会与
     * 「删除项目：…」互撞，而这在中文那边一直是成立且无害的写法。
     * 一条会持续报假警的扫描最后一定被人无脑跳过——今天已经栽过一次
     * （`"ok" ⊂ "took"`），不再栽第二次。
     */
    const 英文 = [...按钮]
      .filter((k) => !k.includes("{"))
      .map((k) => EN[k])
      .filter((v): v is string => v !== undefined)
    const 撞上的: string[] = []
    for (const a of 英文) {
      for (const b of 英文) {
        if (a !== b && b.includes(a)) 撞上的.push(`${JSON.stringify(a)} ⊂ ${JSON.stringify(b)}`)
      }
    }
    expect([...new Set(撞上的)], "按名字找就找不准了——换一个说法").toEqual([])
  })

  /**
   * **英文里不许残留中文**。
   *
   * 抄一半、或者把中文原样粘过去，都会让「切到英文」变成一句空话，
   * 而且这种残留**不会触发 `t()` 的那声报错**——查不到才报，抄错了不报。
   */
  it("英文值里没有汉字", () => {
    const 带汉字的 = Object.entries(EN).filter(([, v]) => /[一-鿿]/.test(v))
    expect(带汉字的.map(([k]) => k), "这几条的英文没写完").toEqual([])
  })
})

