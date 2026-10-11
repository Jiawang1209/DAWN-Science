import { Fragment, useEffect, useState, type CSSProperties } from "react"
import type { BundledLanguage, ThemedTokenWithVariants } from "shiki"
import { t } from "./i18n/index.js"

const languages: Record<string, BundledLanguage> = {
  r: "r", py: "python", pyw: "python", js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  ts: "typescript", tsx: "tsx", json: "json", ipynb: "json", yaml: "yaml", yml: "yaml",
  html: "html", htm: "html", css: "css", sh: "bash", bash: "bash", zsh: "shellscript",
  sql: "sql", toml: "toml", jl: "julia",
}
const mediaLanguages: Record<string, BundledLanguage> = {
  "text/x-r": "r", "text/x-python": "python", "text/javascript": "javascript",
  "text/typescript": "typescript", "application/json": "json", "text/yaml": "yaml", "text/html": "html",
}

/** 两个坞入口共用的只读脚本预览：异步上色，原文始终可读。 */
export function ScriptPreview({ path, text, mediaType }: { path: string; text: string; mediaType: string }) {
  const extension = path.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase() ?? ""
  const language = languages[extension] ?? mediaLanguages[mediaType]
  const [result, setResult] = useState<{ text: string; language: string; tokens?: ThemedTokenWithVariants[]; failed?: boolean }>()
  useEffect(() => {
    if (!language) return
    let active = true
    void import("./script-highlighter.js").then(({ highlightScript }) => highlightScript(text, language)).then(tokens => {
      if (active) setResult({ text, language, tokens: tokens.flat() })
    }).catch((error: unknown) => {
      if (active) {
        console.error("[script-preview]", error)
        setResult({ text, language, failed: true })
      }
    })
    return () => { active = false }
  }, [text, language])

  const current = result?.text === text && result.language === language ? result : undefined
  // token的offset指向原始文本，间隙照抄，保留CRLF、空行和末尾换行。
  let end = 0
  const colored = current?.tokens?.map((token, index) => {
    const gap = text.slice(end, token.offset)
    end = token.offset + token.content.length
    return <Fragment key={index}>{gap}<span data-code-token="" style={{
      "--preview-code-light": token.variants.light?.color,
      "--preview-code-dark": token.variants.dark?.color,
    } as CSSProperties}>{token.content}</span></Fragment>
  })
  return <>
    <pre className="preview-text preview-code" data-language={language} data-highlighted={Boolean(colored)}>
      <code>{colored ? <>{colored}{text.slice(end)}</> : text}</code>
    </pre>
    {current?.failed ? <p className="hint">{t("语法高亮暂不可用，已显示原文。")}</p> : null}
  </>
}
