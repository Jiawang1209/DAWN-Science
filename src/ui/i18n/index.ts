/**
 * 双语（2026-08-13，作者：*「设置里面，其实可以增加一个双语模式，
 * 我们其实可以默认是英语模式，然后有中英双语的一个按钮。」*）。
 *
 * ## msgid 就是那句中文
 *
 * `t("新建任务")` —— 查表键**是原文本身**，不是 `sidebar.newTask` 这种代号。
 *
 * 这是 gettext 的老做法，选它有两条具体理由：
 *
 * 1. **这份代码是用中文写的**（标识符、注释、文案全是）。再发明一套英文代号，
 *    等于在每个调用点插进一层「这个键到底是哪句话」的翻译——
 *    而那正是代号制最常见的腐烂方式：`settings.model.hint2` 底下是什么，
 *    半年后没人说得出。
 * 2. **缺翻译时的回落是有意义的**：显示原文，而不是显示一个键名。
 *    一个漏网的中文串在英文界面上很刺眼，**刺眼就是它该有的样子**——
 *    `settings.model.hint2` 出现在界面上则谁都看不出发生了什么。
 *
 * 代价说清楚：**改中文原文 = 改 msgid**，得同步改 `en.ts` 里的键。
 * 这件事由 `tests/ui/i18n.test.ts` 那条扫描接住——它比对
 * 「代码里所有 `t()` 的实参」与「`en.ts` 的键集」，对不上就红。
 *
 * ## 缺翻译必须出声（规格 7.5）
 *
 * 英文模式下查不到就**回落到中文并且报一次错**。静默回落会让
 * 「这几句怎么还是中文」变成一个没人查得出的怪事。
 * 每个键只吼一次——一个在列表里渲染两百遍的串不该刷屏。
 */
import { atom } from "nanostores"
import { EN } from "./en.js"

/**
 * ## 双语管到哪儿为止（2026-08-13，作者定的边界）
 *
 * 作者：*「我们切换的是**软件界面**的中英文就可以了，
 * 我们提问和回复就按照大模型本身的意愿来就好了。」*
 *
 * 所以**对话区里的内容不翻**——模型说什么就是什么。
 *
 * **一处需要说清楚的例外，免得下一个人以为是漏翻**：
 * 有几句是**我们自己写进对话的**（不是模型说的），它们目前也是中文：
 *
 * ```
 * 已归入项目「…」——接下来它在这个目录里干活
 * 已换到 … ——上下文不变，接下来由它来答
 * 模型 … 的目录里没有声明支持图片，这 N 张可能不会被它看到。
 * [native runtime 错误] …
 * ```
 *
 * 它们从后端与运行时经事件流进来，**不走 `t()`**。按作者定的边界，
 * 这属于「对话区」而不是「软件界面」，所以**保持现状是有意的，不是遗漏**。
 *
 * 与之相应，`e2e/i18n.spec.ts` 那条「英文界面上没有汉字」**只走静态屏**——
 * 它证明不了运行时冒出来的话，而那正是上面这几句。
 * **这个边界写在这里，是为了让那条用例的绿色不被读成一句更大的承诺。**
 */
export type Lang = "en" | "zh"

export const LANG_KEY = "dawn.global.lang"

/**
 * **默认英文**（作者定的）。
 *
 * 注意这不是「跟随系统语言」——作者说的是*「默认是英语模式」*。
 * 与主题那边刻意不同：主题的缺省是「跟随系统」，因为亮暗是环境属性；
 * 语言在这里是**产品的选择**，所以它有一个确定的默认值。
 */
export const $lang = atom<Lang>("en")

const 吼过的 = new Set<string>()

/**
 * 取这句话在当前语言下的写法。
 *
 * @param zh 中文原文，同时就是查表键
 */
export function t(zh: string): string {
  if ($lang.get() === "zh") return zh
  const en = EN[zh]
  if (en !== undefined) return en
  吼一次(zh)
  return zh
}

function 吼一次(键: string): void {
  if (吼过的.has(键)) return
  吼过的.add(键)
  console.error(`[i18n] 英文里没有这一句，先按中文显示：${JSON.stringify(键)}`)
}

/**
 * **同一句中文，在两个地方是两个意思**（gettext 的 `msgctxt`，2026-08-16）。
 *
 * 起因是服务器那一行：状态词要写「连接」（英文 `alive`），
 * 而**同一行上那颗按钮本来就叫「连接」**（英文 `Connect`）。
 * msgid 就是原文，于是一个键给不出两个英文——这不是本项目的怪癖，
 * 是「拿原文当键」这套做法的固有代价，gettext 为它专门留了 `msgctxt`。
 *
 * ```ts
 * tc("连接", "服务器状态")   // en.ts 里的键是 "连接#服务器状态"
 * ```
 *
 * **中文那一侧永远只显示 `zh`**，上下文不会漏到屏幕上。
 * 查不到时**回落到中文并出声**——与 `t()` 同一条规矩，
 * 但回落的是「连接」而不是「连接#服务器状态」：**把内部的键摆到界面上，
 * 比显示一句没翻的中文更难看懂**。
 *
 * 分隔符用 `#`：`·` 不行，它在真实 msgid 里出现过
 * （`「{0} 列 · 行数未知」`），拿它当分隔符会把那些键劈开。
 *
 * @param zh 中文原文（屏幕上显示的就是它）
 * @param 上下文 只给翻译看的限定词，**别写成一句话**
 */
export function tc(zh: string, 上下文: string): string {
  if ($lang.get() === "zh") return zh
  const en = EN[`${zh}#${上下文}`]
  if (en !== undefined) return en
  吼一次(`${zh}#${上下文}`)
  return zh
}

/**
 * 带插值的那一种。**占位符是 `{0}` `{1}`**，不是把句子拆成几段拼。
 *
 * 拆开拼是本地化最经典的错：`"删掉 " + n + " 段对话"` 在英文里语序不同，
 * 拼出来就是别扭的半句话，而且**没有任何地方能看出这句话完整长什么样**。
 */
export function tf(zh: string, ...args: (string | number)[]): string {
  return t(zh).replace(/\{(\d+)\}/g, (m, i) => {
    const v = args[Number(i)]
    return v === undefined ? m : String(v)
  })
}

/**
 * **标记一句话是文案，但现在先不翻**（gettext 里的 `N_()`）。
 *
 * 用在**模块级常量表**上：
 *
 * ```ts
 * const TOOL_STATUS = { ok: { mark: "✓", label: msgid("成功") } }
 * ```
 *
 * 那里不能直接 `t()`——模块常量在 `loadLang()` **之前**就求值了，
 * 取到的会是默认语言，而且此后永远不变。所以表里存 msgid，**取用处再 `t()`**。
 *
 * 它在运行时什么也不做。它存在**只为让扫描看得见**：
 * `t()` 的实参是变量时，`i18n.test.ts` 那条「msgid 在英文表里都有」
 * 就抓不到了——而抓不住的扫描比没有更坏（本项目 2026-08-12 栽过两次）。
 */
export function msgid<T extends string>(zh: T): T {
  return zh
}

/** 立即生效，然后才尝试记住——与 `setTheme` 同一条顺序 */
export function setLang(lang: Lang): void {
  $lang.set(lang)
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch (e) {
    console.error("[i18n] 语言保存失败，本次切换仍然生效，但重启后不会被记住：", e)
  }
}

/**
 * 启动时读回。**在第一帧之前调**——晚一步就会先按英文画一帧再跳成中文。
 *
 * 没存过 → 英文（作者定的默认）。**存了不认识的值也回落到英文，并且出声**。
 */
export function loadLang(): Lang {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(LANG_KEY)
  } catch (e) {
    console.error("[i18n] 读不到已保存的语言，回落到英文：", e)
  }
  let lang: Lang = "en"
  if (stored === "en" || stored === "zh") lang = stored
  else if (stored !== null) {
    console.error(`[i18n] 存储里的语言无法识别：${JSON.stringify(stored)}，回落到英文`)
  }
  $lang.set(lang)
  return lang
}
