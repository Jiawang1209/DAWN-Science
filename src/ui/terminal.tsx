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
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ])
      if (disposed) return
      instance = new Terminal({
        convertEol: true,
        // Spike C 的结论：scrollback 是内存的主控参数，不是显示偏好
        scrollback: 5000,
        fontSize: 12,
      })
      const addon = new FitAddon()
      instance.loadAddon(addon)
      instance.open(el)
      addon.fit()
      instance.onData((d) => inputRef.current?.(d))
      term.current = instance
      fit.current = addon
      // 挂载前已经堆着的历史要补写，否则打开 dock 只能看到之后的输出
      flush()
    })()

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

  return <div className="term-host" ref={host} />
}
