/**
 * 带 ANSI 颜色的一段文字 → 一串 `<span>`（2026-09-25）。解析在 `ansi.ts`，这里只管画。
 *
 * 颜色是类名（`.ansi-fg-red` 等），色值在 styles.css 里指向令牌——明暗、主题色都跟着走。
 * DOM 里只有文字，所以**选中复制出来的就是纯文本**，不带任何转义码。
 */
import { useMemo } from "react"
import { parseAnsi } from "./ansi.js"

export function AnsiText({ text }: { text: string }) {
  const 片 = useMemo(() => parseAnsi(text), [text])
  return (
    <>
      {片.map((p, i) => {
        if (!p.fg && !p.bg && !p.bold) return p.text
        const 类 = [
          p.fg ? `ansi-fg-${p.fg}` : "",
          p.bg ? `ansi-bg-${p.bg}` : "",
          p.bold ? "ansi-bold" : "",
        ]
          .filter(Boolean)
          .join(" ")
        return (
          <span key={i} className={类}>
            {p.text}
          </span>
        )
      })}
    </>
  )
}
