import { expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { AgentMarkdown } from '../../src/ui/markdown.js'
import { cells成markdown } from '../../src/session/export-notebook.js'
import type { Cell } from '../../src/protocol/notebook-cells.js'

const header = { title: 'Notebook export', agentId: 'test', createdAt: '2026-11-24T00:00:00Z' }
const literal = 'before\n```\n## literal heading\n``````\nafter'

it('导出含Markdown围栏的Python源码，预览仍完整显示为一段代码', () => {
  const code = `report = """${literal}"""`
  const cell: Cell = { n: 1, id: 'code', who: 'you', language: 'python', languageKnown: true, code, status: 'ok', outputs: [] }
  const markdown = cells成markdown(header, [cell])
  expect(markdown).toContain(code)
  const { container } = render(<AgentMarkdown text={markdown} streaming={false} />)
  expect(container.querySelectorAll('pre')).toHaveLength(1)
  // Shiki represents line breaks with line spans in jsdom's textContent.
  expect(container.querySelector('pre')?.textContent?.replace(/\n/g, '').trim()).toBe(code.replace(/\n/g, ''))
  expect(container.querySelector('h2')).toBeNull()
})

it.each(['stream', 'error', 'display'] as const)('导出含Markdown围栏的%s输出，预览保留原文并与后续格分开', kind => {
  const output = kind === 'stream' ? { kind, stream: 'stdout' as const, text: literal }
    : kind === 'error' ? { kind, ename: 'Error', evalue: 'example', traceback: [literal] }
    : { kind, mediaType: 'text/plain', data: literal, bytes: literal.length, alsoAvailable: [] }
  const cell: Cell = { n: 1, id: 'output', who: 'you', language: 'python', languageKnown: true, code: 'example()', status: 'ok',
    outputs: [{ type: 'kernelOutput', id: 'o1', kernelInstanceId: 'k1', kernelRevision: 0, output }] }
  const next: Cell = { ...cell, n: 2, id: 'next', code: 'print("next")', outputs: [] }
  const markdown = cells成markdown(header, [cell, next])
  expect(markdown).toContain(literal)
  const { container } = render(<AgentMarkdown text={markdown} streaming={false} />)
  expect(Array.from(container.querySelectorAll('pre'), pre => pre.textContent?.replace(/\n/g, '').trim())).toEqual(['example()', literal.replace(/\n/g, ''), 'print("next")'])
  expect(container.querySelectorAll('h3')).toHaveLength(2)
  expect(container.querySelector('h2')).toBeNull()
})
