/**
 * 主题选择。**渲染进程自有的状态**，但作用域是「整个应用」而非「这个窗口」。
 *
 * 在这之前，`tokens.css` 只认 `prefers-color-scheme`——也就是说主题归操作系统管，
 * 应用自己没有话语权。桌面应用不该是这样：同一台机器上，
 * 人完全可能希望系统是亮的而这个工作台是暗的。
 *
 * ## 「跟随系统」在这一层被解析掉，CSS 那边只剩一个入口
 *
 * 强制切换的直觉写法要两个 CSS 入口：
 *
 * ```css
 * @media (prefers-color-scheme: dark) { :root:not(.dawn-light) { …暗色种子… } }
 * :root.dawn-dark                     { …同一批暗色种子…          }
 * ```
 *
 * **CSS 没有办法让这两个选择器共用一个声明块**，于是暗色种子必须写两遍。
 * `tokens.css` 的文件头正好警告过这件事——*「逐个改 `--dawn-*` 会立刻退化成
 * 两套各自维护的颜色表」*。两份种子是同一个病，而且更隐蔽：**它们一开始是一样的。**
 *
 * 所以解析放在这里：`system` → 问 `matchMedia` → 落成 `dark` 或 `light`。
 * CSS 只需要 `:root.dawn-dark` 一处。**没有第二份，就不会漂移。**
 *
 * 代价是主题依赖 JS 先跑一步。这个代价是可接受的：整个界面本来就是 React，
 * JS 没跑起来的话没有界面可谈。`main.tsx` 在 `createRoot` **之前**调用
 * `loadTheme()`，因此不存在「先亮后暗」的闪跳。
 */
import { atom } from "nanostores"
import { setValue } from "./identity.js"

export type ThemeChoice = "system" | "light" | "dark"

/**
 * 持久化 key。**作用域写在 key 里。**
 *
 * Hermes 的原话：*"Persisted state must declare its scope in its own key: is this
 * global, or does it belong to a connection, a profile, a stored session, a
 * project, or a window? **Getting the scope wrong is how one profile's setting
 * bleeds into another.**"*
 *
 * 主题恰好是全局的——换项目、换窗口、换后端都不该把它带走。
 * 那就必须在 key 里说出来，而不是靠「大家都知道它是全局的」。
 */
export const THEME_STORAGE_KEY = "dawn.global.theme"

export const $theme = atom<ThemeChoice>("system")

const CHOICES: ReadonlySet<string> = new Set<ThemeChoice>(["system", "light", "dark"])

function isChoice(v: unknown): v is ThemeChoice {
  return typeof v === "string" && CHOICES.has(v)
}

/**
 * 把「跟随系统」问成一个确定答案。
 *
 * 拿不到 `matchMedia` 时按亮色处理，**并且出声**（规格 7.5：失败不静默）。
 * 静默按亮色会让「我系统明明是暗的」变成一个查不出原因的怪事。
 */
export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice
  if (typeof matchMedia !== "function") {
    console.error("[theme] 宿主没有 matchMedia，无法读取系统主题偏好，按亮色处理")
    return "light"
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/**
 * 把解析结果挂到元素上。
 *
 * **两个类都挂**，尽管 CSS 目前只用到 `.dawn-dark`：
 * `.dawn-light` 让「现在是哪个主题」在 DOM 上直接可读，
 * e2e 与视觉基线因此可以断言它，而不必去反推计算样式。
 */
export function applyTheme(
  choice: ThemeChoice,
  el: HTMLElement = document.documentElement,
): void {
  const resolved = resolveTheme(choice)
  el.classList.toggle("dawn-dark", resolved === "dark")
  el.classList.toggle("dawn-light", resolved === "light")
}

/**
 * 选一个主题。**立即生效，然后才尝试记住。**
 *
 * 顺序是刻意的：存储写不进去（配额满、隐私模式）不该连本次切换都不给切。
 * 记不住是下次的问题。
 */
export function setTheme(choice: ThemeChoice): void {
  setValue($theme, choice)
  applyTheme(choice)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch (e) {
    console.error("[theme] 无法保存主题选择，本次切换仍然生效，但重启后不会被记住：", e)
  }
}

let watching = false

/**
 * 系统主题变了、而用户选的是「跟随系统」时，跟着变。
 *
 * **只在 `system` 时才动。** 人明确选过之后，系统偏好就没有发言权了——
 * 那正是这个模块存在的理由，不能在这里把它还回去。
 */
function watchSystem(): void {
  if (watching || typeof matchMedia !== "function") return
  const mq = matchMedia("(prefers-color-scheme: dark)")
  if (typeof mq.addEventListener !== "function") return
  watching = true
  mq.addEventListener("change", () => {
    if ($theme.get() === "system") applyTheme("system")
  })
}

/**
 * 启动时读回上次的选择并立即应用。
 *
 * **没存过返回 `system`，而不是猜一个**——缺失不等于某个具体值。
 * 存了不认识的值同样回落到 `system`，**并且出声**：静默回落会让
 * 「我明明选过暗色」变成一个查不出来的怪事。
 */
export function loadTheme(): ThemeChoice {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY)
  } catch (e) {
    console.error("[theme] 无法读取已保存的主题，回落到跟随系统：", e)
  }

  let choice: ThemeChoice = "system"
  if (isChoice(stored)) {
    choice = stored
  } else if (stored !== null) {
    console.error(`[theme] 存储里的主题值无法识别：${JSON.stringify(stored)}，回落到跟随系统`)
  }

  $theme.set(choice)
  applyTheme(choice)
  watchSystem()
  return choice
}
