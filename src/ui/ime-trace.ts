/**
 * 输入法诊断（2026-09-08 作者报的第 ① 条）。
 *
 * 作者的话：*「打到了 zh 之后就不能继续打中文了，输入法是中文，
 * 但是被迫变成英文了。」*
 *
 * ## 为什么要留这么一段代码
 *
 * 这一条**在自动化里复现不出来**：CDP 的 `Input.imeSetComposition` 走的不是
 * macOS 那条真实的输入法通路（NSTextInputClient ↔ 渲染进程），
 * 用它逐字组 `z→zh→zho→zhon→zhong`，流式回复到达时组词照旧活着，一个字母不丢。
 * 也量过主线程：那一轮 **0 次长任务**、打字到出字 5–11ms——「卡到输入法超时」也不是。
 *
 * 剩下的嫌疑都属于同一类：**组词途中有东西把焦点抢走了**
 * （异步弹出的确认框、权限询问、某个 `autoFocus`、右侧坞那个 `WebContentsView`
 * 挂上来的一瞬、会话状态抖动把输入框禁用了一下）。
 * 这类事情只在真人面前发生，而**它一定会在事件序列里留下痕迹**。
 *
 * 所以这里不猜，装一台记录仪：**焦点去哪了、组词什么时候断的、断的那一刻框里是什么**。
 *
 * ## 怎么用
 *
 * 开发者工具（⌥⌘I）的控制台里：
 *
 * ```js
 * localStorage.setItem("dawn.debug.ime", "1"); location.reload()
 * // …复现一次「打到 zh 就变英文」…
 * dawnImeTrace()        // 打出全部记录
 * copy(dawnImeTrace())  // 或者直接拷走
 * ```
 *
 * 关掉：`localStorage.removeItem("dawn.debug.ime"); location.reload()`
 *
 * **默认不装**：没开关的时候这个模块只做一次 `localStorage` 读取，
 * 一个监听器都不挂——诊断本身不该变成新的性能问题。
 */

const 开关键 = "dawn.debug.ime"
const 上限 = 400

let 记录: string[] = []
let 起点 = 0

/** 一个元素长什么样，够我们在记录里认出它 */
function 说元素(n: EventTarget | null): string {
  if (!(n instanceof Element)) return n === window ? "window" : "?"
  const 类 = n.className && typeof n.className === "string" ? `.${n.className.trim().split(/\s+/).join(".")}` : ""
  const 名 = n.getAttribute("aria-label") ?? n.getAttribute("placeholder") ?? ""
  return `${n.tagName.toLowerCase()}${类}${名 ? `「${名.slice(0, 20)}」` : ""}`
}

/** 文本框里此刻是什么（只取前 40 个字符；长草稿不必全记） */
function 说值(n: EventTarget | null): string {
  if (n instanceof HTMLTextAreaElement || n instanceof HTMLInputElement) {
    return ` value=${JSON.stringify(n.value.slice(0, 40))}`
  }
  return ""
}

function 记一条(条: string): void {
  const t = Math.round(performance.now() - 起点)
  const 行 = `+${String(t).padStart(6)}ms  ${条}`
  记录.push(行)
  if (记录.length > 上限) 记录 = 记录.slice(-上限)
  // 也实时打出来：作者复现的那一刻，控制台里就能看见断在哪儿
  console.info(`[ime] ${行}`)
}

export function 输入诊断开着吗(): boolean {
  try {
    return localStorage.getItem(开关键) === "1"
  } catch {
    return false
  }
}

/** 装上记录仪。**只在开关打开时调用**；返回卸载函数 */
export function 装上输入诊断(): () => void {
  起点 = performance.now()
  记录 = []

  const 组词事件 = (e: Event) => {
    const d = (e as CompositionEvent).data
    记一条(`${e.type} data=${JSON.stringify(d ?? "")} 目标=${说元素(e.target)}${说值(e.target)}`)
  }
  const 输入 = (e: Event) => {
    const ie = e as InputEvent
    记一条(`input isComposing=${String(ie.isComposing)} type=${ie.inputType ?? "?"} 目标=${说元素(e.target)}${说值(e.target)}`)
  }
  const 焦点进 = (e: FocusEvent) => {
    记一条(`focusin  ${说元素(e.target)}${说值(e.target)}  ←来自 ${说元素(e.relatedTarget)}`)
  }
  const 焦点出 = (e: FocusEvent) => {
    记一条(`focusout ${说元素(e.target)}${说值(e.target)}  →去往 ${说元素(e.relatedTarget)}`)
  }
  const 按键 = (e: KeyboardEvent) => {
    // 只记「与组词有关」的那些：普通打字每个字母都记会把记录冲掉
    if (!e.isComposing && e.keyCode !== 229 && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) return
    记一条(`keydown key=${e.key} code=${e.code} keyCode=${e.keyCode} isComposing=${String(e.isComposing)} 目标=${说元素(e.target)}`)
  }
  const 窗口失焦 = () => 记一条(`window blur   活跃元素=${说元素(document.activeElement)}`)
  const 窗口得焦 = () => 记一条(`window focus  活跃元素=${说元素(document.activeElement)}`)

  document.addEventListener("compositionstart", 组词事件, true)
  document.addEventListener("compositionupdate", 组词事件, true)
  document.addEventListener("compositionend", 组词事件, true)
  document.addEventListener("input", 输入, true)
  document.addEventListener("focusin", 焦点进, true)
  document.addEventListener("focusout", 焦点出, true)
  document.addEventListener("keydown", 按键, true)
  window.addEventListener("blur", 窗口失焦)
  window.addEventListener("focus", 窗口得焦)

  /**
   * **输入框被禁用 / 被换掉也要留痕。**
   *
   * 两件都会让组词当场死掉，而它们不发任何事件：
   *   - `disabled` 被打开（会话状态抖一下就会）——焦点直接没了；
   *   - textarea 节点被 React 重建（父层重挂）——焦点也没了，草稿还在。
   */
  const 观察 = new MutationObserver((rs) => {
    for (const r of rs) {
      if (r.type === "attributes" && r.attributeName === "disabled") {
        记一条(`！输入框 disabled=${String((r.target as HTMLTextAreaElement).disabled)}`)
      }
      if (r.type === "childList") {
        for (const n of r.removedNodes) {
          if (n instanceof HTMLTextAreaElement) 记一条("！输入框节点被移除了（组件重挂）")
        }
      }
    }
  })
  观察.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled"] })

  const w = window as unknown as { dawnImeTrace?: () => string }
  w.dawnImeTrace = () => 记录.join("\n")
  记一条("诊断已装上——现在去复现「打到 zh 就变英文」，然后运行 dawnImeTrace()")

  return () => {
    document.removeEventListener("compositionstart", 组词事件, true)
    document.removeEventListener("compositionupdate", 组词事件, true)
    document.removeEventListener("compositionend", 组词事件, true)
    document.removeEventListener("input", 输入, true)
    document.removeEventListener("focusin", 焦点进, true)
    document.removeEventListener("focusout", 焦点出, true)
    document.removeEventListener("keydown", 按键, true)
    window.removeEventListener("blur", 窗口失焦)
    window.removeEventListener("focus", 窗口得焦)
    观察.disconnect()
    delete w.dawnImeTrace
  }
}
