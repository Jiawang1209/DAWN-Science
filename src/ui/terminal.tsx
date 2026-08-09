/**
 * 终端窗格（Task 2.20）。
 *
 * **用 xterm.js，不用 `<pre>`。** 裸 `pre` 渲染 claude / codex 的 TUI
 * 就是一团 ANSI 乱码——光标移动、清屏、颜色全变成可见的转义字符，
 * 等于没做。终端的价值恰恰在于它能正确解释这些控制序列。
 *
 * 组件只做三件事：建实例、把字节写进去、把键盘敲的送出来。
 * **不解析、不过滤字节**——那是 xterm 的职责，中间再加一层只会引入第二套解释。
 */
import { useEffect, useRef } from "react"
// xterm 的样式必须随组件一起进包。**静态 import 而非动态**——
// 样式晚于实例到达会让首帧的行高算错，进而 fit() 出错误的列数
import "@xterm/xterm/css/xterm.css"

export function TerminalPane({
  chunks,
  onInput,
}: {
  /** 累积的字节片段。已写过的不重复写——靠下标游标记住写到哪了 */
  chunks: readonly string[]
  onInput?: (data: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<import("@xterm/xterm").Terminal | undefined>(undefined)
  const fit = useRef<import("@xterm/addon-fit").FitAddon | undefined>(undefined)
  /** 已经写进 xterm 的片段数。**不是字符数**——片段是原子的 */
  const written = useRef(0)
  const inputRef = useRef(onInput)
  inputRef.current = onInput

  useEffect(() => {
    const el = host.current
    if (!el) return
    let disposed = false
    let instance: import("@xterm/xterm").Terminal | undefined

    // 动态 import：xterm 只在真的要显示终端时才加载。
    // 它带样式与字体度量，放进首屏包会拖慢启动，而多数会话根本没有终端。
    void (async () => {
      const [{ Terminal }, { FitAddon }, { Unicode11Addon }, { WebLinksAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-unicode11"),
        import("@xterm/addon-web-links"),
      ])
      if (disposed) return
      instance = new Terminal({
        convertEol: true,
        /**
         * **Unicode11Addon 用的是 proposed API，不开这个开关它会抛。**
         *
         * 2026-08-09 由第一条 PTY e2e 撞出来。此前的表现是
         * **一个尺寸正常、但永远空白的终端**——因为异常被上面那个没有 catch 的
         * 异步 IIFE 吞掉了。作者报的「claude / codex 在 app 里不好使」，
         * 最深的一层就是它：**终端从来没有渲染过任何东西。**
         *
         * 讽刺的是这行开关的缺失，恰恰是「补齐 CJK 宽度」那次改动引入的——
         * 一个为中文而加的 addon，把整个终端弄哑了，而且没人听见。
         */
        allowProposedApi: true,
        // Spike C 的结论：scrollback 是内存的主控参数，不是显示偏好
        scrollback: 5000,
        fontSize: 12,
      })
      const addon = new FitAddon()
      instance.loadAddon(addon)
      /**
       * **CJK 宽度。** 没有它，中文与 emoji 按一格算，
       * 而终端里它们占两格——整行会错位，claude/codex 的 TUI 框线会散架。
       * 本项目界面全中文，这条不是可选项。
       */
      const unicode = new Unicode11Addon()
      instance.loadAddon(unicode)
      instance.unicode.activeVersion = "11"
      // 输出里的 URL 可点。agent 经常吐出文档链接与报错页地址
      instance.loadAddon(new WebLinksAddon())
      instance.open(el)
      addon.fit()
      instance.onData((d) => inputRef.current?.(d))
      term.current = instance
      fit.current = addon
      // 挂载前已经堆着的历史要补写，否则打开 dock 只能看到之后的输出
      flush()
    })().catch((err: unknown) => {
      /**
       * **失败必须出声**（规格 7.5）。
       *
       * 2026-08-09：这里此前是 `void (async () => {…})()`，**一个 catch 都没有**。
       * 于是 xterm 的动态 import 或初始化只要失败一次，表现就是
       * **一个尺寸正常、但永远空白的终端**——没有报错、没有提示、什么都没有。
       * 而 PTY 会话的全部内容都在那块空白里。
       *
       * 这是本项目反复栽的那一类：**丢东西而不出声**。
       */
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[终端] xterm 初始化失败：", msg)
      if (el && !disposed) {
        el.textContent = `终端加载失败：${msg}`
        el.setAttribute("data-term-error", msg)
      }
    })

    const onResize = () => fit.current?.fit()
    window.addEventListener("resize", onResize)

    return () => {
      disposed = true
      window.removeEventListener("resize", onResize)
      instance?.dispose()
      term.current = undefined
      fit.current = undefined
      written.current = 0
    }
    // 只在挂载时建一次实例。chunks 的增量由下面那个 effect 负责写入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function flush() {
    const t = term.current
    if (!t) return
    for (let i = written.current; i < chunks.length; i++) t.write(chunks[i]!)
    written.current = chunks.length
  }

  // 只写新增的部分。整份重写会让光标位置与滚动全部错乱
  useEffect(flush, [chunks])

  /**
   * 从隐藏变回可见时重新 `fit()`。
   *
   * **隐藏的元素尺寸是 0**，此间到达的 resize 会把终端算成 0 列。
   * 不重算的话展开后看到的是一团按错误宽度折行的内容——
   * 这正是「不卸载」换来的新问题，得一并处理。
   */
  useEffect(() => {
    const el = host.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      if (el.offsetParent !== null) fit.current?.fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return <div className="term-host" ref={host} />
}
