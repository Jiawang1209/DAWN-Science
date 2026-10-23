import type { TerminalMode } from '../protocol/terminal.js'

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

/** Execute in the existing interpreter; no new interpreter, kernel or script file. */
export function terminalCommand(mode: TerminalMode, code: string, token: string): string {
  if (!code.trim() || code.length > 32_000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(code)) {
    throw new Error('终端代码不能为空、超过32000字符或包含控制字符')
  }
  const marker = `\x1b]7777;dawn;${token};`
  if (mode === 'shell') {
    return `eval ${quote(code)}; printf '\\033]7777;dawn;${token};%s\\007' "$?"\r`
  }
  if (mode === 'python') {
    const program = `try:\n    exec(${JSON.stringify(code)}, globals())\nexcept Exception:\n    import traceback\n    traceback.print_exc()\n    print(${JSON.stringify(marker + '1\x07')}, end='', flush=True)\nelse:\n    print(${JSON.stringify(marker + '0\x07')}, end='', flush=True)`
    return `exec(${JSON.stringify(program)})\r`
  }
  const success = JSON.stringify(marker + '0\x07')
  const failure = JSON.stringify(marker + '1\x07')
  return `tryCatch(local({v <- withVisible(eval(parse(text=${JSON.stringify(code)}), envir=.GlobalEnv)); if(v$visible) print(v$value); cat(${success}); flush.console()}), error=function(e){message(conditionMessage(e)); cat(${failure}); flush.console()})\r`
}

export function readyPrompt(mode: TerminalMode, line: string, alternate: boolean): boolean {
  if (alternate) return false
  const text = line.trimEnd()
  if (mode === 'python') return /(?:^|\s)>>>$/.test(text)
  if (mode === 'R') return /^>$/.test(text.trim())
  return /[$#%]$/.test(text)
}
