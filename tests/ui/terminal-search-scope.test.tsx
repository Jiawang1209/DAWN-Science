import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TerminalDock } from '../../src/ui/dock.js'
vi.mock('../../src/ui/terminal.js', () => ({ TerminalPane: ({ searchRequest }: any) => <div data-testid="terminal-pane" data-search={searchRequest?.kind ?? ''} /> }))
it('does not replay an earlier terminal search request after A to B to A', () => {
  const terminals = ['A', 'B'].map(sessionId => ({ sessionId, projectId: 'p', agentId: 'shell', kind: 'pty' as const, state: 'alive' as const, pinned: false, sortOrder: 0, createdAt: '2026-10-24T00:00:00Z' }))
  const props = { terminals, canOpen: true, onPick: vi.fn(), onNew: vi.fn(), onClose: vi.fn(), onCloseDock: vi.fn(), onInput: vi.fn() }
  const view = render(<TerminalDock {...props} currentId="A" />)
  fireEvent.click(screen.getByRole('button', { name: '找回输入' }))
  expect(screen.getByTestId('terminal-pane').getAttribute('data-search')).toBe('input')
  view.rerender(<TerminalDock {...props} currentId="B" />)
  expect(screen.getByTestId('terminal-pane').getAttribute('data-search')).toBe('')
  view.rerender(<TerminalDock {...props} currentId="A" />)
  expect(screen.getByTestId('terminal-pane').getAttribute('data-search')).toBe('')
})
