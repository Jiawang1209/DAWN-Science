import { expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TerminalFindBar } from '../../src/ui/terminal-find.js'
it('shows matches and routes editing and navigation only to search, never terminal input', () => {
  const query = vi.fn(), next = vi.fn(), close = vi.fn(), send = vi.fn()
  const view = render(<div onKeyDown={send}><TerminalFindBar text="old" result={{ resultIndex: 1, resultCount: 3 }} onQuery={query} onNavigate={next} onClose={close} /></div>)
  const input = screen.getByRole('textbox', { name: '搜索终端历史内容' })
  expect(screen.getByRole('status').textContent).toContain('2/3')
  fireEvent.change(input, { target: { value: '中文查询' } }); expect(query).toHaveBeenCalledWith('中文查询')
  fireEvent.keyDown(input, { key: 'Enter' }); expect(next).toHaveBeenCalledWith(1)
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true }); expect(next).toHaveBeenCalledWith(-1)
  fireEvent.keyDown(input, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce(); expect(send).not.toHaveBeenCalled()
  view.rerender(<TerminalFindBar text="old" result={{ resultIndex: -1, resultCount: 3 }} onQuery={query} onNavigate={next} onClose={close} />)
  expect(screen.getByRole('status').textContent).toContain('3 个匹配')
  view.rerender(<TerminalFindBar text="absent" result={{ resultIndex: -1, resultCount: 0 }} onQuery={query} onNavigate={next} onClose={close} />)
  expect(screen.getByRole('status').textContent).toContain('没有匹配结果')
})
