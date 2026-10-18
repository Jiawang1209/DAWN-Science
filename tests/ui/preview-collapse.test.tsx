import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FilePreview, FilesView, type FileContent, type Listing } from '../../src/ui/files.js'
import { ArtifactsPanel } from '../../src/ui/artifacts.js'

const script: FileContent = { kind: 'text', mediaType: 'text/x-python', text: 'print(1)', bytes: 8 }
const image: FileContent = { kind: 'image', mediaType: 'image/png', base64: 'ZZ', bytes: 2 }
const pdf: FileContent = { kind: 'pdf', mediaType: 'application/pdf', base64: 'ZZ', bytes: 2 }
const markdown: FileContent = { kind: 'text', mediaType: 'text/markdown', text: '# Review\n\nResult', bytes: 16 }
const table: FileContent = { kind: 'table', mediaType: 'text/csv', bytes: 2, table: { columns: [], rows: [], rowsRead: 0, delimiter: ',', totalRows: 0 } }

it.each([['out/a.R', script], ['out/review.md', markdown], ['out/data.csv', table]] as const)('产物 %s 共用文件预览卡片，单行标题与阅读操作，无重复路径和类型栏', async (path, content) => {
  const a = { path, kind: 'other' as const, bornRunId: 'r', bornAt: '2026-10-18T10:00:00Z', exists: true }
  const { container } = render(<ArtifactsPanel data={{ artifacts: [a], unknown: [] }} readFile={vi.fn().mockResolvedValue(content)} onOpenInFiles={vi.fn()} onOpenExternally={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: path }))
  await waitFor(() => expect(container.querySelector('.preview')).toBeTruthy())
  const preview = container.querySelector('.preview')!
  expect(preview.classList.contains(content === script ? 'preview-script' : 'preview-document')).toBe(true)
  expect(preview.querySelector('.preview-head .name')?.textContent).toBe(path.split('/').pop())
  expect(preview.querySelector('.sub')).toBeNull()
  expect(container.querySelector('.artifacts-head .name')).toBeNull()
  const list = container.querySelector<HTMLElement>('.artifacts-compact')!
  const navigation = container.querySelector<HTMLElement>('.artifacts-head')!
  expect(list.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '展开阅读' }))
  expect(list.hidden).toBe(true)
  expect(navigation.hidden).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '还原' }))
  expect(container.querySelector('.artifacts-compact')).toBe(list)
  expect(list.hidden).toBe(false)
  expect(navigation.hidden).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '收起预览' }))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: path }))
})

it.each([markdown, table])('文件入口的报告和表格沿用相同的展开阅读与还原', async content => {
  render(<FilesView selected="result" content={content} loadDir={vi.fn(async path => ({ path, entries: [], ignored: 0, omitted: 0 }))} onSelect={vi.fn()} onOpenExternally={vi.fn()} />)
  const where = document.querySelector<HTMLElement>('.files-where')!
  const tree = document.querySelector<HTMLElement>('.file-tree-box')!
  fireEvent.click(screen.getByRole('button', { name: '展开阅读' }))
  expect(where.hidden).toBe(true)
  expect(tree.hidden).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '还原' }))
  expect(where.hidden).toBe(false)
  expect(tree.hidden).toBe(false)
})

it.each([['analysis.py', script], ['figure.png', image], ['report.pdf', pdf], ['review.md', markdown], ['data.csv', table]] as const)('%s 预览有常驻图标收起入口，仍保留既有操作', (path, content) => {
  const close = vi.fn(), download = vi.fn()
  render(<FilePreview path={path} content={content} onOpenExternally={vi.fn()} onDownload={download} onClosePreview={close} />)
  const button = screen.getByRole('button', { name: '收起预览' })
  expect(button.textContent).toBe('')
  expect(button.getAttribute('title')).toBeNull()
  expect(button.querySelector('svg')).toBeTruthy()
  fireEvent.mouseEnter(button)
  expect(screen.getByRole('tooltip').textContent).toBe('收起预览')
  fireEvent.click(button)
  expect(close).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '下载' }))
  expect(download).toHaveBeenCalledWith(path)
})

it.each([false, true])('收起保留目录 DOM、展开和选中，重新点同一文件恢复普通预览（宽=%s）', async wide => {
  const loadDir = vi.fn((path: string): Promise<Listing> => Promise.resolve({ path, ignored: 0, omitted: 0, entries: [{ name: path ? 'analysis.py' : 'scripts', kind: path ? 'file' : 'dir', modifiedAt: '2026-10-12T10:00:00Z' }] }))
  function Harness() {
    const [open, setOpen] = useState(true)
    return <FilesView selected="scripts/analysis.py" content={script} loadDir={loadDir} onSelect={() => setOpen(true)} onOpenExternally={vi.fn()} previewOpen={open} onClosePreview={() => setOpen(false)} 铺开={wide} />
  }
  const { container } = render(<Harness />)
  fireEvent.click(await screen.findByRole('button', { name: 'scripts' }))
  const row = await screen.findByRole('button', { name: /^analysis.py/ })
  const tree = container.querySelector<HTMLElement>('.file-tree')!
  tree.scrollTop = 70
  // 与浏览器一致：display:none 时 getter 返回0，重新显示恢复内部滚动位置。
  let visibleScroll = tree.scrollTop
  Object.defineProperty(tree, 'scrollTop', {
    configurable: true,
    get: () => container.querySelector<HTMLElement>('.file-tree-box')!.hidden ? 0 : visibleScroll,
    set: (value: number) => { visibleScroll = value },
  })
  const originalLayout = container.querySelector('.files-view')!.getAttribute('style')
  fireEvent.click(screen.getByRole('button', { name: '展开阅读' }))
  expect(tree.scrollTop).toBe(0)
  screen.getByRole('button', { name: '收起预览' }).focus()
  fireEvent.click(screen.getByRole('button', { name: '收起预览' }))
  expect(container.querySelector('.file-tree')).toBe(tree)
  expect(container.querySelector<HTMLElement>('.file-tree-box')!.hidden).toBe(false)
  expect(container.querySelector<HTMLElement>('.files-where')!.hidden).toBe(false)
  expect(container.querySelector('.preview-text')).toBeNull()
  expect(screen.queryByRole('separator')).toBeNull()
  expect(row.classList.contains('active')).toBe(true)
  expect(document.activeElement).toBe(row)
  expect(tree.scrollTop).toBe(70)
  fireEvent.click(row)
  expect(screen.getByRole('button', { name: '展开阅读' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '还原' })).toBeNull()
  expect(container.querySelector('.files-view')!.getAttribute('style')).toBe(originalLayout)
  expect(tree.scrollTop).toBe(70)
  expect(loadDir).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: '收起预览' }))
  // 目录铺满后继续浏览，重开遵循此刻的位置，不能回跳到上次关闭前。
  tree.scrollTop = 200
  fireEvent.scroll(tree)
  fireEvent.click(row)
  expect(tree.scrollTop).toBe(200)
})

it.each([['out/a.py', script, 'code'], ['out/a.png', image, 'image'], ['out/review.md', markdown, 'document'], ['out/data.csv', table, 'table']] as const)('产物 %s 收起回到清单，焦点回原文件，可再次打开', async (path, content, kind) => {
  const artifact = { path, kind, bornRunId: 'r', bornToolCallId: 'c', bornAt: '2026-10-12T10:00:00Z', exists: true } as import('../../src/protocol/index.js').Artifact
  const { container } = render(<ArtifactsPanel data={{ artifacts: [artifact], unknown: [] }} readFile={vi.fn().mockResolvedValue(content)} onOpenInFiles={vi.fn()} onOpenExternally={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: path }))
  await waitFor(() => expect(container.querySelector('.preview, .visual-preview')).toBeTruthy())
  const close = screen.getByRole('button', { name: '收起预览' })
  expect(screen.getAllByRole('button', { name: '收起预览' })).toHaveLength(1)
  if (kind === 'code') fireEvent.click(screen.getByRole('button', { name: '展开阅读' }))
  close.focus()
  fireEvent.click(close)
  expect(container.querySelector('.artifacts-preview')).toBeNull()
  const row = screen.getByRole('button', { name: path })
  expect(document.activeElement).toBe(row)
  fireEvent.click(row)
  await screen.findByRole('button', { name: '收起预览' })
  if (kind === 'code') expect(screen.getByRole('button', { name: '展开阅读' })).toBeTruthy()
  await waitFor(() => expect(container.querySelector('.preview')).toBeTruthy())
})

it('产物读取中及失败后也能收起，迟到结果不会重开预览', async () => {
  let complete!: (content: FileContent) => void
  const readFile = vi.fn().mockImplementationOnce(() => new Promise<FileContent>(resolve => { complete = resolve }))
    .mockRejectedValueOnce(new Error('read failed'))
  const a = { path: 'out/review.md', kind: 'markdown' as const, bornRunId: 'r', bornToolCallId: 'c', bornAt: '2026-10-18T10:00:00Z', exists: true }
  const { container } = render(<ArtifactsPanel data={{ artifacts: [a], unknown: [] }} readFile={readFile} onOpenInFiles={vi.fn()} onOpenExternally={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: a.path }))
  expect(container.querySelector('.artifacts-head')!.compareDocumentPosition(container.querySelector('.loader, .state-block')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '收起预览' }))
  await act(async () => { complete(markdown); await Promise.resolve() })
  expect(container.querySelector('.artifacts-preview')).toBeNull()
  const row = screen.getByRole('button', { name: a.path })
  expect(document.activeElement).toBe(row)
  fireEvent.click(row)
  await screen.findByText('read failed')
  expect(container.querySelector('.artifacts-head')!.compareDocumentPosition(container.querySelector('.loader, .state-block')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getAllByRole('button', { name: '收起预览' })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '收起预览' }))
  expect(container.querySelector('.artifacts-preview')).toBeNull()
})

it.each([markdown, image])('产物读取完成后关闭入口保留键盘焦点', async content => {
  let complete!: (content: FileContent) => void
  const readFile = vi.fn(() => new Promise<FileContent>(resolve => { complete = resolve }))
  const a = { path: 'out/result', kind: 'other' as const, bornRunId: 'r', bornToolCallId: 'c', bornAt: '2026-10-18T10:00:00Z', exists: true }
  render(<ArtifactsPanel data={{ artifacts: [a], unknown: [] }} readFile={readFile} onOpenInFiles={vi.fn()} onOpenExternally={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: a.path }))
  screen.getByRole('button', { name: '收起预览' }).focus()
  await act(async () => { complete(content); await Promise.resolve() })
  const close = screen.getByRole('button', { name: '收起预览' })
  expect(document.activeElement).toBe(close)
  fireEvent.click(close)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: a.path }))
})

it.each([false, true])('关闭时目录高度增大导致滚动被夹限，立即重开恢复原位置；新滚动优先（展开=%s）', async expanded => {
  const loadDir = vi.fn((path: string): Promise<Listing> => Promise.resolve({ path, ignored: 0, omitted: 0, entries: [{ name: 'analysis.py', kind: 'file', modifiedAt: '2026-10-12T10:00:00Z' }] }))
  function Harness() {
    const [open, setOpen] = useState(true)
    return <FilesView selected="analysis.py" content={script} loadDir={loadDir} onSelect={() => setOpen(true)} onOpenExternally={vi.fn()} previewOpen={open} onClosePreview={() => setOpen(false)} />
  }
  const { container } = render(<Harness />)
  const row = await screen.findByRole('button', { name: /^analysis.py/ })
  const tree = container.querySelector<HTMLElement>('.file-tree')!
  let actualScroll = 700
  // 总内容900：普通预览树高200(max700)，收起后树高700(max200)。
  Object.defineProperty(tree, 'scrollTop', {
    configurable: true,
    get: () => {
      if (container.querySelector<HTMLElement>('.file-tree-box')!.hidden) return 0
      const max = container.querySelector('.files-preview-closed') ? 200 : 700
      actualScroll = Math.min(actualScroll, max)
      return actualScroll
    },
    set: (value: number) => {
      const max = container.querySelector('.files-preview-closed') ? 200 : 700
      actualScroll = Math.min(value, max)
    },
  })
  const close = () => {
    if (expanded) fireEvent.click(screen.getByRole('button', { name: '展开阅读' }))
    fireEvent.click(screen.getByRole('button', { name: '收起预览' }))
  }
  close()
  expect(tree.scrollTop).toBe(200)
  fireEvent.click(row)
  expect(tree.scrollTop).toBe(700)
  close()
  expect(tree.scrollTop).toBe(200)
  tree.scrollTop = 100
  fireEvent.scroll(tree)
  fireEvent.click(row)
  expect(tree.scrollTop).toBe(100)
})
