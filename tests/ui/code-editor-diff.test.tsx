import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodeEditorDiff } from '../../src/ui/code-editor-diff.js'
import type { ScriptEditRequest } from '../../src/ui/code-editor-ai.js'

const baseline = 'library(ggplot2)\np <- ggplot(iris)\nprint(p)\n'
const request: ScriptEditRequest = {
  id: 'request-a', documentId: 'doc-a', scopeKey: 'scope-a', sessionId: 'session-a',
  language: 'R', label: '/work/analysis.R', baseline,
  selection: { from: baseline.indexOf('print(p)'), to: baseline.indexOf('print(p)') + 8, text: 'print(p)', fromLine: 3, toLine: 3 },
  prompt: 'a complete source request',
}
const revised = baseline.replace('print(p)', 'print(p + theme_minimal())')

Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, writable: true, value() {} },
  close: { configurable: true, writable: true, value() {} },
})
beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})
afterEach(() => vi.restoreAllMocks())

describe('script modification review', () => {
  it('shows the original destination and actual line diff before allowing an explicit apply', () => {
    const onApply = vi.fn(), onClose = vi.fn()
    const { container } = render(<CodeEditorDiff request={request} code={revised} onApply={onApply} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: /^审阅脚本修改$/ })
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce()
    expect(within(dialog).getByText('修改目标：/work/analysis.R')).toBeTruthy()
    expect(within(dialog).getByText('原选区：L3–3')).toBeTruthy()
    expect(container.querySelector('.code-editor-diff')).toBeNull() // Modal is outside any clipped dock.
    expect(dialog.querySelector('[data-kind="del"]')?.textContent).toContain('print(p)')
    expect(dialog.querySelector('[data-kind="add"]')?.textContent).toContain('print(p + theme_minimal())')
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: /^应用到原脚本$/ }))
    expect(onApply).toHaveBeenCalledExactlyOnceWith('document')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('can explicitly treat a returned fragment as a replacement for just the selected range', () => {
    const onApply = vi.fn()
    render(<CodeEditorDiff request={request} code="print(p + theme_bw())" onApply={onApply} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: /^仅替换所选代码$/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelectorAll('[data-kind="del"]')).toHaveLength(1)
    expect(dialog.querySelector('[data-kind="context"]')?.textContent).toContain('library(ggplot2)')
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^应用到原脚本$/ }))
    expect(onApply).toHaveBeenCalledExactlyOnceWith('selection')
  })

  it('blocks unchanged candidates and stale draft errors without invoking apply', () => {
    const onApply = vi.fn()
    const panel = render(<CodeEditorDiff request={request} code={baseline} onApply={onApply} onClose={() => {}} />)
    expect(screen.getByText('AI 回复与原脚本相同，没有可应用的修改')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^应用到原脚本$/ }).hasAttribute('disabled')).toBe(true)
    panel.rerender(<CodeEditorDiff request={request} code={revised} onApply={onApply} onClose={() => {}} problem="草稿已改变，请重新带入对话" />)
    expect(screen.getByRole('alert').textContent).toBe('草稿已改变，请重新带入对话')
    fireEvent.click(screen.getByRole('button', { name: /^应用到原脚本$/ }))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('blocks oversized responses whose exact diff cannot be reviewed', () => {
    const onApply = vi.fn()
    render(<CodeEditorDiff request={request} code={'x'.repeat(2 * 1024 * 1024)} onApply={onApply} onClose={() => {}} />)
    expect(screen.getByRole('alert').textContent).toBeTruthy()
    expect(screen.getByRole('button', { name: /^应用到原脚本$/ }).hasAttribute('disabled')).toBe(true)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('closes on native Escape cancellation, backdrop and close button, restoring the opener focus', () => {
    function Host() {
      const [open, setOpen] = useState(false)
      return <><button onClick={() => setOpen(true)}>查看差异</button>{open ? <CodeEditorDiff request={request} code={revised} onApply={() => {}} onClose={() => setOpen(false)} /> : null}</>
    }
    render(<Host />)
    const opener = screen.getByRole('button', { name: /^查看差异$/ })
    opener.focus(); fireEvent.click(opener)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    fireEvent.click(opener)
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    fireEvent.click(opener)
    fireEvent.click(screen.getByRole('button', { name: /^收起差异预览$/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
