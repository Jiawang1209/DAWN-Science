import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { AgentMarkdown } from '../../src/ui/markdown.js'

const show = (text: string, streaming = false) => render(<AgentMarkdown text={text} streaming={streaming} />)

describe('Markdown 数学公式', () => {
  it('中文段落中的单美元公式有可读的 MathML，原始 LaTeX 保留在注释中', () => {
    const { container } = show('模型为 $y = \\beta_0 + \\beta_1 x^2$，继续分析。')
    expect(container.querySelectorAll('.katex')).toHaveLength(1)
    expect(container.querySelector('math')).not.toBeNull()
    expect(container.querySelector('annotation')?.textContent).toBe('y = \\beta_0 + \\beta_1 x^2')
    expect(container.textContent).toContain('继续分析。')
  })

  it('独立公式支持分数和求和', () => {
    const { container } = show('$$\n\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i\n$$')
    expect(container.querySelectorAll('.katex-display')).toHaveLength(1)
    expect(container.querySelector('math')?.getAttribute('display')).toBe('block')
    expect(container.querySelector('mfrac')).not.toBeNull()
  })

  it('矩阵不丢失行列结构', () => {
    const { container } = show('$$\n\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}\n$$')
    expect(container.querySelectorAll('mtable mtr')).toHaveLength(2)
    expect(container.querySelectorAll('mtable mtd')).toHaveLength(4)
  })

  it('同一段回复可同时包含行内、独立公式和 Markdown 表格', () => {
    const { container } = show('$a^2+b^2=c^2$\n\n$$\nx=\\sqrt{2}\n$$\n\n| 参数 | 值 |\n|---|---|\n| n | 30 |')
    expect(container.querySelectorAll('.katex')).toHaveLength(2)
    expect(container.querySelectorAll('.katex-display')).toHaveLength(1)
    expect(container.querySelector('table')?.textContent).toContain('30')
  })

  it('流式中不完整公式补齐后只留下最新完整公式', () => {
    const view = show('前文\n\n$$\n\\frac{1}{', true)
    view.rerender(<AgentMarkdown text={'前文\n\n$$\n\\frac{1}{2}\n$$\n\n后文'} streaming />)
    view.rerender(<AgentMarkdown text={'前文\n\n$$\n\\frac{1}{2}\n$$\n\n后文'} streaming={false} />)
    expect(view.container.querySelectorAll('.katex')).toHaveLength(1)
    expect(view.container.querySelector('annotation')?.textContent).toBe('\\frac{1}{2}')
    expect(view.container.querySelector('.katex-error')).toBeNull()
    expect(view.container.textContent).toContain('后文')
  })

  it('行内代码和围栏代码保留美元及 LaTeX 原文', () => {
    const text = '`$x^2$`\n\n```python\nlabel = r"$\\alpha$"\n```'
    const { container } = show(text, true)
    expect(container.querySelector('.katex')).toBeNull()
    expect(container.querySelector('p code')?.textContent).toBe('$x^2$')
    expect(container.querySelector('pre')?.textContent).toContain('label = r"$\\alpha$"')
  })

  it('转义的美元金额保持普通文字', () => {
    const { container } = show('价格为 \\$5 和 \\$10。')
    expect(container.querySelector('.katex')).toBeNull()
    expect(container.textContent).toBe('价格为 $5 和 $10。')
  })

  it('无效公式局部报错，后续有效公式和正文仍然可读', () => {
    const { container } = show('无效：$\\frac{1}{$\n\n有效：$x^2$\n\n结论仍在。')
    expect(container.querySelector('.katex-error')).not.toBeNull()
    expect(container.querySelectorAll('.katex')).toHaveLength(1)
    expect(container.textContent).toContain('结论仍在。')
  })

  it('不信任公式中的 HTML 和外部链接指令', () => {
    const { container } = show('$\\href{javascript:alert(1)}{click}$\n\n$\\htmlClass{injected}{x}$')
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(container.querySelector('.injected')).toBeNull()
    expect(container.querySelectorAll('math')).toHaveLength(2)
  })
})
