import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FilePreview } from '../../src/ui/files.js'
import { resolveMarkdownFile } from '../../src/ui/markdown-files.js'

afterEach(cleanup)
const image = { kind: 'image' as const, mediaType: 'image/png', base64: 'cG5n', bytes: 3 }
const content = (text: string) => ({ kind: 'text' as const, mediaType: 'text/markdown', text, bytes: text.length })

describe('Markdown workspace file references', () => {
  it('normalizes document-relative paths and rejects encoded escape or URL schemes', () => {
    expect(resolveMarkdownFile('reports/记录.md', '../figures/图%20一.png#caption')).toBe('figures/图 一.png')
    expect(resolveMarkdownFile('reports/记录.md', '%2e%2e/%2e%2e/private.png')).toBeUndefined()
    expect(resolveMarkdownFile('report.md', '%2fetc/passwd')).toBeUndefined()
    expect(resolveMarkdownFile('report.md', 'https://example.com/figure.png')).toBeUndefined()
    expect(resolveMarkdownFile('report.md', 'javascript%3Aalert(1)')).toBeUndefined()
    expect(resolveMarkdownFile('report.md', '#methods')).toBeUndefined()
  })
  it('reads encoded local images relative to the document and opens step scripts without executing', async () => {
    const readFile = vi.fn(async () => image)
    const onOpenFile = vi.fn()
    render(<FilePreview path="results/reports/分析记录.md" content={content('![结果图](../../figures/结果%20一.png)\n\n[第一步脚本](../../analysis/scripts/01_clean.py)')} readFile={readFile} onOpenFile={onOpenFile} />)
    await waitFor(() => expect(readFile).toHaveBeenCalledWith('figures/结果 一.png'))
    expect((await screen.findByRole('img', { name: '结果图' })).getAttribute('src')).toBe('data:image/png;base64,cG5n')
    fireEvent.click(screen.getByRole('link', { name: '第一步脚本' }))
    expect(onOpenFile).toHaveBeenCalledWith('analysis/scripts/01_clean.py')
  })

  it('reports missing images and ignores a response from a previous document', async () => {
    let finish!: (value: typeof image) => void
    const readFile = vi.fn(() => new Promise<typeof image>(resolve => { finish = resolve }))
    const { rerender, container } = render(<FilePreview path="old.md" content={content('![旧图](old.png)')} readFile={readFile} onOpenFile={vi.fn()} />)
    await waitFor(() => expect(readFile).toHaveBeenCalledWith('old.png'))
    rerender(<FilePreview path="new.md" content={content('# 新文档')} readFile={readFile} onOpenFile={vi.fn()} />)
    finish(image)
    await waitFor(() => expect(container.querySelector('img')).toBeNull())
    rerender(<FilePreview path="missing.md" content={content('![缺失图](missing.png)')} readFile={vi.fn(async () => { throw new Error('找不到：missing.png') })} onOpenFile={vi.fn()} />)
    expect(await screen.findByText(/找不到：missing.png/)).toBeTruthy()
  })

  it('does not read traversal, executable URLs or absolute filesystem links', () => {
    const readFile = vi.fn(async () => image)
    const { container } = render(<FilePreview path="report.md" content={content('![越界](../secret.png)\n\n[执行](javascript:alert%281%29)\n\n[绝对](file:///etc/passwd)')} readFile={readFile} onOpenFile={vi.fn()} />)
    expect(readFile).not.toHaveBeenCalled()
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(container.querySelector('a[href^="file:"]')).toBeNull()
  })

  it('replaces a reader when the same document exists in a different session', async () => {
    let finish!: (value: typeof image) => void
    const first = vi.fn(() => new Promise<typeof image>(resolve => { finish = resolve }))
    const second = vi.fn(async () => ({ ...image, base64: 'bmV3' }))
    const text = content('![结果](figure.png)\n\n[代码][step]\n\n[step]: 01.py')
    const openFirst = vi.fn(), openSecond = vi.fn()
    const { rerender } = render(<FilePreview path="report.md" content={text} readFile={first} onOpenFile={openFirst} />)
    await waitFor(() => expect(first).toHaveBeenCalledWith('figure.png'))
    rerender(<FilePreview path="report.md" content={text} readFile={second} onOpenFile={openSecond} />)
    await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toBe('data:image/png;base64,bmV3'))
    finish(image)
    fireEvent.click(screen.getByRole('link', {name: '代码'}))
    expect(openSecond).toHaveBeenCalledWith('01.py')
    expect(openFirst).not.toHaveBeenCalled()
    expect(screen.getByRole('img').getAttribute('src')).toBe('data:image/png;base64,bmV3')
  })
})
