import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { 扫引用, 扫内核指令 } from "../files/mentions.js"
import type { DraftToken } from "./draft-highlighter.js"
import { t } from "./i18n/index.js"

/** 只负责镜像着色；输入、光标、选区和组词仍由原生textarea拥有。 */
export function ComposerHighlight({ text, scrollTop }: { text: string; scrollTop: number }) {
  const layer = useRef<HTMLDivElement>(null)
  const markdown = /[`*_~]|\[[^\]\n]*\]\(|^ {0,3}(?:#{1,6}\s|>|[-+]\s|\d+[.)]\s)/m.test(text)
  const [result, setResult] = useState<{ text: string; tokens?: DraftToken[]; failed?: boolean }>()
  useEffect(() => {
    if (!markdown) return
    let active = true
    const timer = setTimeout(() => {
      void import("./draft-highlighter.js").then(({ highlightDraft }) => highlightDraft(text)).then(tokens => {
        if (active) setResult({ text, tokens })
      }).catch((error: unknown) => {
        if (active) {
          console.error("[composer-highlight]", error)
          setResult({ text, failed: true })
        }
      })
    }, 90)
    return () => { active = false; clearTimeout(timer) }
  }, [text, markdown])
  useEffect(() => { if (layer.current) layer.current.scrollTop = scrollTop })
  const current = markdown && result?.text === text ? result : undefined
  const tokens = current?.tokens ?? []
  const references = [...扫引用(text), ...扫内核指令(text)].sort((a, b) => a.start - b.start)
  if (!markdown && !references.length) return null
  let tokenIndex = 0
  function colored(start: number, end: number): ReactNode[] {
    const nodes: ReactNode[] = []
    let position = start
    while (tokenIndex < tokens.length && tokens[tokenIndex]!.end <= start) tokenIndex++
    while (tokenIndex < tokens.length && tokens[tokenIndex]!.start < end) {
      const token = tokens[tokenIndex]!
      if (token.start > position) nodes.push(text.slice(position, token.start))
      const until = Math.min(end, token.end)
      nodes.push(<span key={position} data-draft-token="" data-marker={token.marker ? "true" : undefined} style={{
        "--draft-code-light": token.light, "--draft-code-dark": token.dark,
      } as CSSProperties}>{text.slice(Math.max(position, token.start), until)}</span>)
      position = until
      if (token.end > end) break
      tokenIndex++
    }
    if (position < end) nodes.push(text.slice(position, end))
    return nodes
  }
  const nodes: ReactNode[] = []
  let position = 0
  for (const reference of references) {
    if (reference.start < position) continue
    nodes.push(...colored(position, reference.start))
    nodes.push(<span key={`ref-${reference.start}`} className="hl-ref">{colored(reference.start, reference.end)}</span>)
    position = reference.end
  }
  nodes.push(...colored(position, text.length))
  return <>
    <div ref={layer} className="control composer-field composer-hl" aria-hidden="true" data-highlighted={Boolean(current?.tokens)}>{nodes}</div>
    {current?.failed ? <span className="composer-highlight-error hint" role="status">{t("语法高亮暂不可用，已显示原文。")}</span> : null}
  </>
}
