import { expect, it } from 'vitest'
import { visibleWidth } from '@earendil-works/pi-tui'
import { CliTranscript } from '../../src/cli/tui-transcript.js'
import { plain } from '../../src/cli/presentation.js'

it.each(['python', 'py', 'r', 'bash', 'sh', 'javascript', 'typescript', 'json', 'sql', 'yaml'])('highlights fenced %s code without changing source text', language => {
  const view = new CliTranscript(true)
  const code = language === 'r' ? '# 注释\nx <- "value"\nprint(x)' : language === 'json' ? '{"value": 42}' : language === 'yaml' ? 'value: 42' : language === 'sql' ? "SELECT 'value' FROM sample;" : ['bash', 'sh'].includes(language) ? '# 注释\nprintf "value"' : '# 注释\nimport pandas as pd\nvalue = "sample"'
  view.reply('```' + language + '\n' + code + '\n```'); view.finish()
  const lines = view.render(140)
  expect(plain(lines.join('\n'))).toContain('```' + language)
  const body = lines.filter(line => !plain(line).includes('```') && plain(line).trim())
  expect(body.join('\n')).toMatch(/\x1b\[(?:3[0-6]|90)m/)
  for (const source of code.split('\n')) expect(plain(lines.join('\n'))).toContain(source)
})
it('distinguishes Python keywords, strings and comments, preserving indentation and Markdown fences', () => {
  const view = new CliTranscript(true)
  view.reply('```python\nimport pandas as pd\n# 中文注释\ndef describe():\n    return "value"\n```')
  const text = view.render(100).join('\n')
  expect(text).toContain('\x1b[35mimport'); expect(text).toContain('\x1b[32m"value"'); expect(text).toContain('\x1b[90m# 中文注释')
  expect(plain(text)).toContain('    return "value"'); expect(plain(text).match(/```/g)).toHaveLength(2)
})
it('keeps incomplete streams and unknown languages readable, with no ANSI when colors are disabled', () => {
  for (const color of [true, false]) {
    const view = new CliTranscript(color)
    view.reply('```unknown\n    未知语法 A=42\n'); expect(plain(view.render(38).join('\n'))).toContain('未知语法 A=42')
    view.reply('```\n\n```python\nprint("safe")\n```')
    const lines = view.render(38)
    expect(lines.every(line => visibleWidth(line) <= 38)).toBe(true)
    if (!color) expect(lines.join('\n')).not.toContain('\x1b')
  }
})
