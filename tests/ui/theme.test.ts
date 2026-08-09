/**
 * 主题选择（①-B″ · V2）。
 *
 * **在这之前，用户想强制暗色是做不到的**——`tokens.css` 只认
 * `prefers-color-scheme`，也就是说主题归操作系统管，应用自己没有话语权。
 * 桌面应用不该是这样：同一台机器上，人可能希望终端是暗的、文档是亮的。
 *
 * ## 为什么把「跟随系统」在 JS 里解析掉
 *
 * 强制切换的直觉写法是两个入口：
 *
 * ```css
 * @media (prefers-color-scheme: dark) { :root:not(.dawn-light) { …暗色种子… } }
 * :root.dawn-dark                     { …同一批暗色种子…          }
 * ```
 *
 * **CSS 没有办法让这两个选择器共用一个声明块**，于是暗色种子必须写两遍。
 * 而 `tokens.css` 的文件头恰好警告过这件事：*「逐个改 `--dawn-*` 会立刻
 * 退化成两套各自维护的颜色表」*——两份种子是同一个病的另一种形态，
 * 而且更隐蔽：它们一开始是一样的。
 *
 * 所以「跟随系统」在这一层就被解析成 `dark` 或 `light`，
 * CSS 只剩 `:root.dawn-dark` 一个入口。**没有第二份，就不会漂移。**
 *
 * ## jsdom 测不到的那一半
 *
 * 这里的 `matchMedia` 是 `tests/ui/setup.ts` 里的假货。
 * **「系统主题真的变了、界面真的跟着变」只能靠 Playwright 验证**——
 * 与 `ResizeObserver` 那处是同一类边界，同样如实写在这里。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  $theme,
  THEME_STORAGE_KEY,
  applyTheme,
  loadTheme,
  resolveTheme,
  setTheme,
} from "../../src/ui/state/theme.js"
import { setSystemPrefersDark } from "./setup.js"

const html = () => document.documentElement

beforeEach(() => {
  setSystemPrefersDark(false)
  html().className = ""
  $theme.set("system")
  localStorage.clear()
})

describe("主题选择 · 三态", () => {
  it("默认跟随系统 —— 没选过就不该替人做主", () => {
    expect($theme.get()).toBe("system")
  })

  it("选暗色 → html 上挂 .dawn-dark", () => {
    setTheme("dark")
    expect(html().classList.contains("dawn-dark")).toBe(true)
  })

  it("选亮色 → html 上挂 .dawn-light", () => {
    setTheme("light")
    expect(html().classList.contains("dawn-light")).toBe(true)
  })

  it("**互斥** —— 换一个，前一个必须摘掉", () => {
    setTheme("dark")
    setTheme("light")
    expect(html().classList.contains("dawn-dark")).toBe(false)
    expect(html().classList.contains("dawn-light")).toBe(true)
  })
})

describe("主题选择 · 跟随系统被解析成明确的类", () => {
  // 「跟随系统」不是第三种外观，它是"去问系统要一个答案"。
  // 解析发生在这里，CSS 那边只认 .dawn-dark —— 因此没有第二份暗色种子
  it("系统是暗的 → 解析成 dark", () => {
    setSystemPrefersDark(true)
    expect(resolveTheme("system")).toBe("dark")
    setTheme("system")
    expect(html().classList.contains("dawn-dark")).toBe(true)
  })

  it("系统是亮的 → 解析成 light", () => {
    setSystemPrefersDark(false)
    setTheme("system")
    expect(html().classList.contains("dawn-light")).toBe(true)
  })

  it("明确选过之后，系统偏好不再有发言权", () => {
    setSystemPrefersDark(true)
    setTheme("light")
    // 系统说暗，但人说亮 —— 人赢。这正是这个 Task 存在的理由
    expect(html().classList.contains("dawn-light")).toBe(true)
    expect(html().classList.contains("dawn-dark")).toBe(false)
  })

  it("**没有 matchMedia 时不崩，按亮色处理并出声**", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const saved = window.matchMedia
    // @ts-expect-error 故意拆掉，模拟极老的宿主
    delete window.matchMedia
    expect(resolveTheme("system")).toBe("light")
    expect(spy).toHaveBeenCalled()
    window.matchMedia = saved
    spy.mockRestore()
  })
})

describe("主题选择 · 持久化", () => {
  it("**key 里声明作用域** —— 主题是应用级的，不属于某个窗口或项目", () => {
    // 规格与 Hermes 同一条：作用域搞错，就是一个 profile 的设置渗进另一个。
    // 主题恰好是全局的，那就必须在 key 里说出来，而不是靠"大家都知道"
    expect(THEME_STORAGE_KEY).toMatch(/global/)
  })

  it("选过之后能读回来", () => {
    setTheme("dark")
    $theme.set("system")
    html().className = ""
    expect(loadTheme()).toBe("dark")
    expect(html().classList.contains("dawn-dark")).toBe(true)
  })

  it("**没选过时返回 system，而不是猜一个** —— 缺失不等于某个具体值", () => {
    expect(loadTheme()).toBe("system")
  })
})

describe("主题选择 · 坏数据与不可用的存储", () => {
  it("存了不认识的值 → 回落到跟随系统，**且出声**", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    localStorage.setItem(THEME_STORAGE_KEY, "深色模式")
    expect(loadTheme()).toBe("system")
    // 静默回落会让"我明明选过暗色"变成一个查不出来的怪事
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it("localStorage 写不进去时，不把界面带崩，但要说清没记住", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const saved = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError")
    }
    expect(() => setTheme("dark")).not.toThrow()
    // 本次切换仍然生效 —— 记不住是下次的问题，不该连这次都不给切
    expect(html().classList.contains("dawn-dark")).toBe(true)
    expect(spy).toHaveBeenCalled()
    Storage.prototype.setItem = saved
    spy.mockRestore()
  })

  it("localStorage 读不出来时，回落到跟随系统并出声", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const saved = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error("SecurityError")
    }
    expect(loadTheme()).toBe("system")
    expect(spy).toHaveBeenCalled()
    Storage.prototype.getItem = saved
    spy.mockRestore()
  })
})

describe("主题选择 · applyTheme 可以作用在任意元素上", () => {
  it("给定元素时不去动 document —— 便于测试与将来的多窗口", () => {
    const el = document.createElement("div")
    applyTheme("dark", el)
    expect(el.classList.contains("dawn-dark")).toBe(true)
    expect(html().classList.contains("dawn-dark")).toBe(false)
  })
})
