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
const isComment = (line: string) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(line)

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

describe("设计契约 · 主题体系不许退化成两套颜色表", () => {
  /**
   * 这一组是 ①-B″ · V2 的验收。
   *
   * `tokens.css` 的文件头写着*「只覆盖种子与混合比例，不覆盖派生令牌——
   * 逐个改 `--dawn-*` 会立刻退化成两套各自维护的颜色表」*。
   * **那句话此前没有任何东西强制它。** 现在有了。
   */
  const tokens = () => read("tokens.css")

  /** 取出 `:root.dawn-dark { … }` 里声明的全部令牌名 */
  function darkBlockTokens(): string[] {
    const text = tokens()
    const start = text.indexOf(":root.dawn-dark")
    if (start < 0) return []
    const open = text.indexOf("{", start)
    const end = text.indexOf("\n}", open)
    const body = text.slice(open, end)
    return [...body.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]!)
  }

  it("暗色块存在 —— 强制切换全靠它", () => {
    expect(darkBlockTokens().length).toBeGreaterThan(0)
  })

  it("**暗色块只覆盖种子**，不重新定义任何派生令牌", () => {
    // 派生令牌一旦在暗色里被单独指定，它与亮色那一支就再也不会一起变了。
    // 例外只有两类，且都无法从种子算出来：
    //   语义色 —— warning 在亮色下是橙的、暗色下是黄的，不是同一个色相
    //   阴影   —— 暗色靠内嵌白发丝线，亮色靠投影，形状根本不同
    const ALLOWED = /^--(theme-|mix-|dawn-(danger|success|warning|on-accent|shadow-|stroke-float))/
    const bad = darkBlockTokens().filter((t) => !ALLOWED.test(t))
    expect(
      bad,
      "暗色块里出现了派生令牌。改种子，不要改派生结果 —— 见 tokens.css 头注",
    ).toEqual([])
  })

  it("**暗色不靠 prefers-color-scheme** —— 那样人就没法强制切换了", () => {
    // 媒体查询版与强制类版没法共用一个声明块，两份种子一定会漂移。
    // 「跟随系统」在 state/theme.ts 里解析成明确的类，这里只留一个入口
    const hits = findLines(tokens(), (l) => /@media[^{]*prefers-color-scheme/.test(l))
    expect(hits, "改用 :root.dawn-dark，由 state/theme.ts 解析「跟随系统」").toEqual([])
  })

  it("语义令牌不用色名命名 —— 名字要说用途", () => {
    // `--dawn-yellow` 没有地方安放「亮色下它其实是橙的」这个事实。
    // 灰阶 --theme-gray-* 不在此列：它是刻度本身，不是语义
    const bad = findLines(tokens(), (l) =>
      /^\s*--dawn-(red|green|yellow|blue|orange|purple|gray|grey)\b/.test(l),
    )
    expect(bad, "用 --dawn-danger / -success / -warning 这类说用途的名字").toEqual([])
  })

  it("组件与样式表里不残留旧色名", () => {
    const stale = /--dawn-(red|green|yellow)\b/
    for (const f of [...tsxFiles(), "styles.css"]) {
      expect(findLines(read(f), (l) => stale.test(l)), `${f}：旧语义色名`).toEqual([])
    }
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

describe("设计契约 · 一个动作一个家", () => {
  /**
   * Hermes：
   * > ***"One action, one home."*** *A command may have keyboard, palette, and visible
   * > affordances, but they **invoke the same action and state**.
   * > **Do not fork behavior per entry point.**"*
   *
   * **这句话此前只写在文档里，没有任何东西强制它。** 做 U1 之前，
   * `App.tsx` 里 `() => setView("settings")` 写了四遍，中止与打开项目还各自带着实现——
   * 命令面板再加一个入口就是第五份。
   *
   * 现在动作只有 `Actions` 这一份定义，下面两条把它钉住。
   */
  it("**命令的 run 只许转发，不许自己实现** —— 自己实现一遍就是第二个家", () => {
    // commands.ts 只负责"有哪些命令、什么时候可用"，行为一律来自传进来的 Actions
    const FORBIDDEN = /\bclient\.|\bawait\b|\.then\(|\bsetView\(|\bsetActive|\bfetch\(/
    const hits = findLines(readFileSync(join(UI_DIR, "commands.ts"), "utf8"), (l) =>
      FORBIDDEN.test(l),
    )
    expect(hits, "commands.ts 出现了实现。run 只许调用 actions.*").toEqual([])
  })

  it("**导航状态只在 App.tsx 里改** —— 叶子组件走回调", () => {
    // 叶子组件自己 setView 的话，同一个跳转就会有两个来源，
    // 而"谁先谁后"取决于渲染顺序——位置依赖是最坏的一种耦合
    const MUTATE = /\bset(View|DockOpen|ActiveSessionId|ActiveProjectId)\(/
    for (const f of tsxFiles()) {
      if (f === "App.tsx") continue
      const hits = findLines(read(f), (l) => MUTATE.test(l))
      expect(hits, `${f}：把它做成 prop 回调，动作的家在 App 的 actions 里`).toEqual([])
    }
  })
})

describe("设计契约 · 表单控件一律走 .control", () => {
  /**
   * **2026-08-09 由一张截图撞出来的生产缺陷。**
   *
   * 全应用最主要的那个输入框——composer 的 textarea——`className` 是空的。
   * 它的样式来自 `.composer textarea`，而那条规则是 `.control` **七条属性的逐字复制**。
   *
   * 抄到了长相，**漏掉了行为**：`:focus-visible` 的聚焦环只挂在 `.control` 上。
   * 于是它退回 Chromium 默认聚焦环，那个环取的是**操作系统强调色**——
   * 与主题无关，在琥珀色系统上看着像警告态。
   *
   * 侧栏的 `<select>` 是同一个毛病。三个控件里两个中招，
   * 说明这不是一次疏忽，是缺一条规则。
   */
  it("组件里的 textarea / input / select 都带 control 类", () => {
    const OPEN = /<(textarea|input|select)(\s|$)/
    /**
     * **勾选框与单选框不在此列**（2026-08-12 加的例外）。
     *
     * 这条规则守的是**文本录入控件**：`.control` 给的是盒子
     * （高度、内距、背景、描边）与那个跟着主题走的聚焦环。
     * 把它套在 `type="checkbox"` 上，得到的是一个**被撑成文本框大小的方块**——
     * 那不是「遵守规则」，是把规则用在它不适用的地方。
     *
     * 勾选框的外观由 UA 画、由 `accent-color` 上色，**聚焦环也是 UA 自带的**，
     * 所以这条规则要防的那个洞（退回 Chromium 默认环、取操作系统强调色）
     * 在这里不存在——它本来就该用系统那一套。
     */
    const 非文本录入 = /type=["'](checkbox|radio)["']/
    for (const f of tsxFiles()) {
      const lines = read(f).split("\n")
      const bad: string[] = []
      lines.forEach((line, i) => {
        if (isComment(line) || !OPEN.test(line)) return
        // 开标签可能跨行，往下看到 `>` 为止
        const tag = lines.slice(i, i + 12).join(" ")
        const head = tag.slice(0, tag.indexOf(">") + 1)
        if (非文本录入.test(head)) return
        if (!/className=["'][^"']*\bcontrol\b/.test(head)) bad.push(`${i + 1}: ${line.trim()}`)
      })
      expect(bad, `${f}：表单控件必须带 className="control"，否则聚焦环不跟主题`).toEqual([])
    }
  })

  it("**.control 的盒子属性只在一处定义** —— 复制它就会漏掉它的行为", () => {
    // `.composer textarea` 与 `.proj-switch select` 都曾把这七条抄了一遍。
    // 抄的人拿不到 `:focus-visible`，因为那一条挂在类上而不是元素上
    const css = read("styles.css")
    const owners = [...css.matchAll(/^([^{\n]*\b(textarea|select|input)\b[^{\n]*)\{([^}]*)\}/gm)]
    const bad = owners
      .filter(([, sel, , body]) => !/^\.control/.test(sel!.trim()) && /\bbackground:|\bborder:/.test(body!))
      .map(([, sel]) => sel!.trim())
    expect(bad, "这些选择器在重新定义 .control 的盒子。加 class，不要抄属性").toEqual([])
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

/**
 * 几何层是 2026-08-09 才建起来的（规范 §3/§4/§6，只取几何不取颜色）。
 *
 * **这一组规则的由来是一个真实的洞**：`styles.css` 里有五个几何变量以
 * `var(--dawn-topbar-h, 46px)` 的形式被引用，而它们**从来没有被定义过**；
 * 与此同时 `layout-constants.ts` 里躺着同一个 46px，没有任何地方 import 它。
 * 一个值三个家，两个是死的，而**界面看起来完全正常**——
 * 回退值就是这样把「令牌不存在」这件事藏住的。
 */
describe("设计契约 · 几何只从令牌来", () => {
  it("**`var()` 不许带回退值** —— 回退值是同一个数的第二个家，而且是悄悄生效的那个", () => {
    const offenders = ["styles.css", "tokens.css"].flatMap((f) =>
      findLines(read(f), (l) => /var\(\s*--[a-z0-9-]+\s*,/.test(l)).map((x) => `${f} ${x}`),
    )
    expect(offenders).toEqual([])
  })

  it("border-radius 一律走 --dawn-radius-* —— `999px` 这种字面量会绕过全局圆角标量", () => {
    const offenders = findLines(
      read("styles.css"),
      (l) => /border-radius:/.test(l) && !/--dawn-radius-/.test(l) && !/border-radius:\s*0\b/.test(l),
    )
    expect(offenders).toEqual([])
  })

  it("font-family 一律走 --dawn-font-* —— 字体族写两遍就会有两套等宽字回退链", () => {
    const offenders = findLines(
      read("styles.css"),
      (l) => /font-family:/.test(l) && !/--dawn-font-/.test(l),
    )
    expect(offenders).toEqual([])
  })

  it("**圆角标量只在 tokens.css 里出现** —— 在调用点再缩放一次就没人知道最终值是多少", () => {
    const offenders = findLines(read("styles.css"), (l) => /--radius-scalar/.test(l))
    expect(offenders).toEqual([])
  })

  it("几何令牌都定义过 —— 引用了却没定义，正是上面那个洞的形状", () => {
    const tokens = read("tokens.css")
    const styles = read("styles.css")
    const used = new Set(
      [...styles.matchAll(/var\(\s*(--dawn-(?:space|radius|topbar|statusbar|sidebar|row|thread|page|ui|chat|code|font|weight|unit|corner)[a-z0-9-]*)\s*\)/g)].map(
        (m) => m[1] as string,
      ),
    )
    const missing = [...used].filter((t) => !new RegExp(`^\\s*${t}:`, "m").test(tokens))
    expect(missing).toEqual([])
  })
})

describe("设计契约 · 只用形状表达含义是不够的", () => {
  /**
   * 2026-08-09：用户发言变成了一颗有底色的气泡，agent 的是通栏正文。
   * **那是给眼睛的**——读屏用户拿到的是一串没有说话人的段落。
   * 所以「谁说的」必须同时留在文字里，用 `.sr-only` 藏起来而不是删掉。
   *
   * 而 `.sr-only` 有一种经典的写坏方式：**用 `display: none` 实现它**。
   * 那样确实看不见了，代价是**读屏也读不到**——等于把标签删了，
   * 只是删得不明显。
   */
  it("**`.sr-only` 不许用 display:none / visibility:hidden** —— 那样读屏也读不到", () => {
    const css = read("styles.css")
    const rule = /\.sr-only\s*\{([^}]*)\}/.exec(css)
    expect(rule, "styles.css 里应当有 .sr-only").not.toBeNull()
    expect(rule![1]).not.toMatch(/display:\s*none|visibility:\s*hidden/)
  })

  it("用户发言仍然带着文字身份标签 —— 气泡是给眼睛的，标签是给读屏的", () => {
    // 气泡的底色由 `.turn.user .bubble` 给；标签若被删掉，这里就该红
    expect(read("views.tsx")).toMatch(/who.*sr-only|sr-only.*who/)
  })

  /**
   * **图标不许用 emoji**（2026-08-12）。
   *
   * 作者：*「我们的图标也没有 workbuddy 好看……他们的图标质感非常的棒。」*
   * 量出来的根因不是画得好不好，是**用错了材料**：
   * 我们那几个 `💬` `📁` `＋` 是**彩色字形**——
   *
   *   1. 它吃不到 `currentColor`，于是永远脱离 `.7 / .5 / .3` 那四档层次；
   *   2. 它跟着操作系统的字体走，**同一份代码在两台机器上长得不一样**；
   *   3. 它的基线与粗细由字体决定，与旁边的字对不齐。
   *
   * 所以规则不是「画好看点」（那不可判定），是**材料只许用内联 SVG**
   * ——`src/ui/icons.tsx`。这一条判得了，就该有扫描。
   *
   * **只扫装饰位**：`aria-label` / 文案里出现 emoji 是另一回事，
   * 那是内容，不是图标。
   */
  it("**装饰位不许出现 emoji** —— 它吃不到 currentColor，永远脱离那四档层次", () => {
    /**
     * **跨行匹配**（2026-08-12 修）。
     *
     * 第一版逐行扫，而 JSX 里装饰内容常常换行：
     *
     *     <span className="caret" aria-hidden="true">
     *       {open ? "▾" : "▸"}
     *     </span>
     *
     * 那一版**漏掉了远端连接那一行的 `▸`**，直到作者说「没有图标」才发现。
     * 与「按钮撞名」那条犯的是同一个错——**一条抓不住的扫描比没有更坏**。
     */
    const 装饰位 = /aria-hidden="true"\s*>([\s\S]{0,80}?)</g
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{FF0B}]/u
    for (const f of tsxFiles()) {
      const hits = [...read(f).matchAll(装饰位)]
        .map((m) => m[1]!.trim())
        .filter((t) => emoji.test(t))
      expect(hits, `${f} 的装饰位用了 emoji 当图标。图标一律走 src/ui/icons.tsx`).toEqual([])
    }
  })

  /**
   * **图标一律 16×16 的实心 SVG**（2026-08-12，CDP 实测 WorkBuddy）。
   *
   * 它全站 60 个 `<svg>`，主力是 `viewBox="0 0 16 16"` + `fill="currentColor"`
   * + `stroke="none"`。**我原本猜它是线性描边，量出来正好相反。**
   *
   * 实心比描边强在一处、且只在这一处：**它跟着文字色走**。
   * `stroke-width` 是绝对的，颜色一淡描边就先散掉；
   * 实心图形淡下去仍然是同一个形状。
   */
  /**
   * **确认框上那几个词是保留字**（2026-08-12）。
   *
   * 这个项目已经为「两处同名」栽过三次：
   *   1. 项目行上那颗 `＋` 一度叫「新建会话」，与侧栏顶上那颗撞名，
   *      一下子撞红大半套 e2e（2026-08-11）；
   *   2. agent pill 的菜单里「换服务」与「新建会话」各有一项写着同一家的名字，
   *      **作者照着字面点，点中了会新开对话的那个**；
   *   3. 工作目录那颗「取消」与确认框的「取消」撞上（今天）。
   *
   * 后果不只是测试：**屏幕阅读器也是按名字找按钮的**，
   * 而「按名字找」正是无障碍这条路的全部机制。
   *
   * 所以规则是：**别的按钮文案里不许出现确认框那几个词**。
   * 确认框自己（`confirm.tsx`）当然可以用。
   */
  it("**「取消」「确认」是确认框的保留字** —— 别处再叫这个，按名字就找不准了", () => {
    const 保留 = ["取消", "确认"]
    /**
     * **跨行匹配，不能逐行扫。**
     *
     * 第一版用的是 `findLines`，而 JSX 里按钮文案与 `</Button>` 常常分在两行：
     *
     *     <Button …>
     *       取消
     *     </Button>
     *
     * 那一版**验红时纹丝不动**——一条抓不住自己要抓的东西的扫描，
     * 比没有更坏：它会说「查过了」。
     */
    const 按钮文案 = />\s*([^<>{}]+?)\s*<\/Button>/g
    /**
     * **模态对话框可以用这两个词。**
     *
     * 界线不是「谁先占了这个名字」，而是**同一时刻屏幕上会不会出现两个**：
     * 模态开着的时候别的都点不到，所以它内部的「取消」不可能有歧义。
     * `confirm.tsx` 与 `remote.tsx` 的连接对话框都是这一类。
     *
     * 反过来，**常驻界面上的按钮不行**——确认框会开在它们上面。
     * 今天撞的正是这一种：对话头上那颗与确认框的「取消」同时在屏幕上。
     */
    const 模态 = new Set(["confirm.tsx", "remote.tsx"])
    for (const f of tsxFiles()) {
      if (模态.has(f)) continue
      const src = read(f)
      const hits = [...src.matchAll(按钮文案)]
        .map((m) => m[1]!.trim())
        .filter((t) => 保留.some((w) => t.includes(w)))
      expect(hits, `${f} 的按钮文案与确认框撞名。换成「按下去会变成什么」`).toEqual([])
    }
  })

  /**
   * **没有一个按钮的文案是另一个的子串**（2026-08-12）。
   *
   * 上面那条「取消/确认是保留字」只是这条的一个特例，而它挡不住别的撞法。
   * 同一天里我又撞了两次：
   *   - 工作目录那颗「取消」 vs 确认框的「取消」
   *   - 批量那颗「选择」 vs 输入卡上的「选择工作目录」
   *
   * **根因是一个机制**：按名字找按钮时，匹配是**子串**匹配——
   * 屏幕阅读器的「按标签跳转」、Playwright 的 `getByRole(name)`、
   * 甚至用户脑子里的「点那个写着 X 的」都是这样工作的。
   * 一个标签只要是另一个的一部分，**指向就不唯一**。
   *
   * 这条比「保留字」强，因为它不需要事先知道哪些词是危险的。
   */
  it("**没有一个按钮文案是另一个的子串** —— 按名字找就找不准了", () => {
    const 按钮文案 = />\s*([^<>{}]+?)\s*<\/Button>/g
    const 全部 = new Set<string>()
    for (const f of tsxFiles()) {
      for (const m of read(f).matchAll(按钮文案)) {
        const t = m[1]!.trim()
        // 只看纯文案的按钮：带表达式的（`{…}`）文案是动态的，静态判不了
        if (t && !t.includes("{") && t.length >= 2) 全部.add(t)
      }
    }
    const 撞的: string[] = []
    for (const a of 全部) {
      for (const b of 全部) {
        if (a !== b && b.includes(a)) 撞的.push(`「${a}」是「${b}」的一部分`)
      }
    }
    expect(撞的, "改掉其中一个：按名字找按钮时子串会指向两个东西").toEqual([])
  })

  it("**icons.tsx 只画实心 16×16** —— 描边图标在淡色档上会先散掉", () => {
    const src = read("icons.tsx")
    expect(src, "画布必须是 16×16").toMatch(/viewBox="0 0 16 16"/)
    expect(src).toMatch(/fill="currentColor"/)
    const 描边 = findLines(src, (l) => /stroke=|strokeWidth=/.test(l))
    expect(描边, "icons.tsx 出现了描边。实心才跟得住 .7/.5/.3 那四档").toEqual([])
  })
})

describe("设计契约 · 引用的令牌必须真的存在", () => {
  /**
   * **2026-08-10 当场踩的**：写文件浏览的样式时顺手写了
   * `var(--dawn-border)` / `var(--dawn-text-sm)` / `var(--dawn-bg-raised)`——
   * 五个名字全是我编的，仓库里一个都没有。
   *
   * CSS 的失败方式是**沉默**：未定义的自定义属性让整条声明作废，
   * 边框不见、字色继承，看起来只是「样式差一点」，不会有任何报错。
   *
   * 这与已经写过的「不许写 `var(--x, 回退值)`」是同一件事的两半：
   * 那条防的是「回退值掩盖了没定义」，这条防的是「压根没定义」。
   */
  it("styles.css 里每个 --dawn-* 都在 tokens.css 里定义过", () => {
    const tokens = read("tokens.css")
    const defined = new Set(tokens.match(/--dawn-[a-z0-9-]+(?=\s*:)/g) ?? [])
    const styles = read("styles.css")
    const used = new Set(styles.match(/var\(\s*(--dawn-[a-z0-9-]+)/g)?.map((m) => m.replace(/var\(\s*/, "")) ?? [])
    const missing = [...used].filter((t) => !defined.has(t))
    expect(missing, `styles.css 引用了 tokens.css 里没有的令牌：${missing.join("、")}`).toEqual([])
  })
})

describe("设计契约 · 令牌不能用错位置", () => {
  /**
   * **同一天踩的第二次**：`--dawn-hairline` 是**宽度**（`0.5px`），不是颜色。
   * 写成 `border-bottom: 1px solid var(--dawn-hairline)` 会展开成
   * `1px solid 0.5px`——**整条声明作废，一条线都不画**，而且不报错。
   *
   * 上一条扫描防的是「令牌根本不存在」，这条防的是「令牌存在但类型不对」。
   * 两者的症状完全一样：**看起来只是样式差一点。**
   */
  it("颜色位上不许出现长度令牌", () => {
    const tokens = read("tokens.css")
    /** 值是一个纯长度的令牌——它们只能用在尺寸位上 */
    const lengths = new Set(
      [...tokens.matchAll(/(--dawn-[a-z0-9-]+)\s*:\s*(-?[\d.]+(?:px|rem|em))\s*;/g)].map((m) => m[1]),
    )
    const styles = read("styles.css")
    // `border[-x]: <宽度> solid var(--t)` 里的 `--t` 处在颜色位上
    const bad = [...styles.matchAll(/border[a-z-]*:\s*[^;]*?\bsolid\s+var\(\s*(--dawn-[a-z0-9-]+)/g)]
      .map((m) => m[1]!)
      .filter((t) => lengths.has(t))
    expect(bad, `这些令牌是长度，却用在了颜色位上：${[...new Set(bad)].join("、")}`).toEqual([])
  })
})

describe("设计契约 · 第三方渲染器的挂点", () => {
  /**
   * **给 streamdown 写样式只许挂 `data-streamdown` 属性，不许挂它的 class。**
   *
   * 2026-08-10 的教训：我们用 `streamdown` 却从来没引它的样式，
   * 它那套 Tailwind 类（`my-4` / `flex` / `sticky` / `text-muted-foreground` …）
   * 在这个项目里一个都不存在——于是**代码块的换行整段塌成一行**，
   * 下载／复制／全屏三个按钮裸露地堆在左边。
   *
   * 修的时候如果顺手挂到它的 class 上，会换来一个更坏的东西：
   * **看起来好了，而它下一次构建就能悄悄换掉类名**。
   * `data-streamdown` 是它对外的稳定契约，挂那里。
   */
  it("styles.css 不引用 streamdown 的 Tailwind 类名", () => {
    const styles = read("styles.css")
    // 只看 `.md` 作用域内的选择器行
    const mdLines = styles.split("\n").filter((l) => l.trimStart().startsWith(".md "))
    /** Tailwind 的形态：`.md .flex`、`.md .text-xs`、`.md .my-4` 这类 */
    const 可疑 = mdLines.filter((l) =>
      /\.md\s+\.[a-z]+(-[a-z0-9/[\]]+)*[\s,{]/.test(l),
    )
    expect(
      可疑,
      `这些行挂在了第三方的 class 上，改用 [data-streamdown="…"]：\n${可疑.join("\n")}`,
    ).toEqual([])
  })
})
