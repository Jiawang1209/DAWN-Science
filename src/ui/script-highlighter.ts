import { createHighlighter, createJavaScriptRegexEngine, type BundledLanguage, type Highlighter } from "shiki"

// Electron保持script-src 'self'；用JS正则引擎，不要求WASM或放宽CSP。
let highlighter: Promise<Highlighter> | undefined
export async function highlightScript(text: string, language: BundledLanguage) {
  highlighter ??= createHighlighter({
    langs: [], themes: ["github-light", "github-dark"], engine: createJavaScriptRegexEngine(),
  }).catch(error => { highlighter = undefined; throw error })
  const instance = await highlighter
  await instance.loadLanguage(language)
  return instance.codeToTokensWithThemes(text, { lang: language, themes: { light: "github-light", dark: "github-dark" } })
}
