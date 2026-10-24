import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import python from 'shiki/langs/python.mjs'
import r from 'shiki/langs/r.mjs'
import bash from 'shiki/langs/bash.mjs'
import javascript from 'shiki/langs/javascript.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import json from 'shiki/langs/json.mjs'
import sql from 'shiki/langs/sql.mjs'
import yaml from 'shiki/langs/yaml.mjs'
import { plain } from './presentation.js'

// Semantic colors use the terminal palette so both desktop themes remain readable.
const colors: Record<string, number> = { '#000001': 35, '#000002': 32, '#000003': 90, '#000004': 34, '#000005': 36, '#000006': 33 }
let highlighter: ReturnType<typeof createHighlighterCoreSync> | undefined
export function highlightCliCode(code: string, language: string | undefined, color: boolean): string[] {
  const clean = plain(code), lines = clean.split('\n'), lang = language?.trim().split(/\s+/)[0]?.toLowerCase()
  if (!color || !lang || clean.length > 30_000) return lines
  try {
    highlighter ??= createHighlighterCoreSync({
      engine: createJavaScriptRegexEngine(), langs: [python, r, bash, javascript, typescript, json, sql, yaml],
      themes: [{ name: 'dawn-terminal', fg: '#000000', bg: '#ffffff', settings: [
        { scope: ['keyword', 'storage'], settings: { foreground: '#000001' } },
        { scope: ['string'], settings: { foreground: '#000002' } },
        { scope: ['comment'], settings: { foreground: '#000003' } },
        { scope: ['constant.numeric', 'constant.language'], settings: { foreground: '#000004' } },
        { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#000005' } },
        { scope: ['entity.name.type', 'support.type'], settings: { foreground: '#000006' } },
      ] }],
    })
    const aliases: Record<string, string> = { python3: 'python', rscript: 'r', shell: 'bash', zsh: 'bash', js: 'javascript', ts: 'typescript' }
    const selected = aliases[lang] ?? lang
    if (!highlighter.getLoadedLanguages().includes(selected)) return lines
    return highlighter.codeToTokens(clean, { lang: selected, theme: 'dawn-terminal' }).tokens.map(tokens => tokens.map(token => {
      const ansi = token.color && colors[token.color.toLowerCase()]
      return ansi ? `\x1b[${ansi}m${token.content}\x1b[39m` : token.content
    }).join(''))
  } catch { return lines }
}
