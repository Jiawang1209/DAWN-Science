/**
 * 设计契约的**自动强制**（Task 3.2）。
 *
 * `docs/DESIGN.md` 里每条可判定的规则，在这里配一个扫描。
 *
 * 理由两处都写着，措辞几乎一样：
 *
 * > Hermes `components/ui/__tests__/no-native-title.test.ts` —— 任何 `<button>`
 * > 还带 `title=` 就测试失败。
 *
 * > Rho `AGENTS.md`：*"Prefer automated enforcement over remembered convention.
 * > When a governance rule can be checked deterministically, add it to repository
 * > validation or CI **in the same workstream**."*
 *
 * **靠记性维护的规范会腐烂**，而且腐烂的时候没有声音。本项目已经证明过一次：
 * 「不要用 `window.prompt`」是我自己写下的，然后我自己违反了它，
 * 直到作者打开发现白屏。那条现在也在这里。
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const UI_DIR = join(import.meta.dirname, "../../src/ui")

const read = (f: string) => readFileSync(join(UI_DIR, f), "utf8")
const tsxFiles = () => readdirSync(UI_DIR).filter((f) => f.endsWith(".tsx"))

/**
 * 注释行不算违规。
 *
 * **这条不是放水，是必要的**：文档要能引用它禁止的东西。
 * 本文件第一版把 `primitives.tsx` 里一句解释「不要写字面加载中」的**注释**
 * 判成了违规——那会逼着规则的解释者不许提到规则本身。
 */
const isComment = (line: string) => /^\s*(\/\/|\/\*|\*)/.test(line)

/** 逐行扫描并给出「行号: 内容」，报错时能直接跳过去 */
function findLines(text: string, pred: (line: string) => boolean): string[] {
  return text
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !isComment(line) && pred(line))
    .map(({ line, n }) => `${n}: ${line.trim()}`)
}

describe("设计契约 · 颜色只从令牌来", () => {
  it("组件里没有裸色值", () => {
    for (const f of tsxFiles()) {
      const hits = findLines(read(f), (l) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(l))
      expect(hits, `${f} 出现裸色值。颜色一律用 var(--dawn-*)`).toEqual([])
    }
  })

  it("styles.css 里没有裸色值 —— tokens.css 是唯一允许写死颜色的地方", () => {
    const hits = findLines(read("styles.css"), (l) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(l))
    expect(hits, "styles.css 出现裸色值。它应当只引用 --dawn-*").toEqual([])
  })

  it("tokens.css 里所有语义令牌都以 --dawn- 或 --theme- 或 --z- 或 --mix- 开头", () => {
    // 命名前缀是唯一让「这是不是一个令牌」可判定的东西。
    // 前缀一乱，扫描规则就再也写不出来了
    const bad = findLines(read("tokens.css"), (l) => {
      const m = /^\s*(--[a-z0-9-]+):/.exec(l)
      return m !== null && !/^--(dawn|theme|mix|z|radius-scalar)/.test(m[1]!)
    })
    expect(bad).toEqual([])
  })
})

describe("设计契约 · primitive 不被调用点覆写", () => {
  const OVERRIDE = /className=["'`][^"'`]*\b(p[xytblr]?-|h-|w-\d|rounded|border-|shadow-)/

  it("没有调用点用 className 重新指定 primitive 的内距/高度/圆角/描边", () => {
    for (const f of tsxFiles()) {
      const hits = findLines(read(f), (l) => OVERRIDE.test(l))
      expect(hits, `${f}：改 primitive 本身，不要在调用点覆写`).toEqual([])
    }
  })

  it("功能组件不直接写 <button>，一律走 Button primitive", () => {
    // 例外只有两处，且都有硬理由：
    //   primitives.tsx —— 它就是 Button 的定义处
    //   ErrorBoundary.tsx —— 它在 React 树已经崩了之后渲染，
    //     此时不能再依赖任何可能同样崩掉的组件
    const exempt = new Set(["primitives.tsx", "ErrorBoundary.tsx"])
    for (const f of tsxFiles()) {
      if (exempt.has(f)) continue
      const hits = findLines(read(f), (l) => /<button[\s>]/.test(l))
      expect(hits, `${f}：用 <Button> 而不是裸 <button>`).toEqual([])
    }
  })
})

describe("设计契约 · 可访问性与文案", () => {
  it("按钮不用原生 title= —— 无样式、约 500ms 系统延迟、与主题不符", () => {
    for (const f of tsxFiles()) {
      const hits = findLines(read(f), (l) => /<[Bb]utton[^>]*\stitle=/.test(l))
      expect(hits, `${f}：改用 aria-label，或做成可见文案`).toEqual([])
    }
  })

  it("不出现字面「加载中」/「Loading…」 —— 必须走 Loader 并说明在等什么", () => {
    for (const f of tsxFiles()) {
      const hits = findLines(read(f), (l) => /加载中|Loading…|Loading\.\.\./.test(l))
      expect(hits, `${f}：用 <Loader label="…" />，label 要回答「在等什么」`).toEqual([])
    }
  })
})

describe("设计契约 · 已经踩过的坑", () => {
  it("不使用 window.prompt / alert / confirm —— Electron 里它们直接抛错", () => {
    // 2026-08-08：`window.prompt` 抛 "prompt() is not supported."，
    // 打死了整个 React 根 —— 界面上表现为「点什么都没反应」。
    // 这条规则我自己写过，然后我自己违反了它。所以它现在在这里。
    for (const f of tsxFiles()) {
      const hits = findLines(read(f), (l) => /\b(window\.)?(prompt|alert|confirm)\s*\(/.test(l))
      expect(hits, `${f}：用应用内对话框或 pickDirectory 这类原生桥接`).toEqual([])
    }
  })

  it("z-index 不写字面量 —— 跨组件层级一律从 tokens.css 的梯子取", () => {
    const hits = findLines(read("styles.css"), (l) => /z-index:\s*\d/.test(l))
    expect(hits, "styles.css：用 var(--z-*)").toEqual([])
  })
})
