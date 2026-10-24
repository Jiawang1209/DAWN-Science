import { expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TerminalContextMeter } from '../../src/ui/terminal-context-meter.js'
import { $lang } from '../../src/ui/i18n/index.js'
$lang.set('zh')
it('reuses the context ring button and reads details from the bound native session', async () => {
  const element = document.createElement('div'); document.body.append(element)
  const get = vi.fn(async () => ({ usedTokens: 28000, contextWindow: 128000, compactAt: 111616, bytes: { system: 0, tools: 0, history: 0 } }))
  const view = render(<TerminalContextMeter element={element} revision={1} sessionId="original" client={{ get: get as never }} />)
  const button = await screen.findByRole('button', { name: '上下文 22%' })
  expect(button.querySelector('svg')).not.toBeNull(); fireEvent.click(button)
  expect((await screen.findByRole('dialog', { name: '上下文' })).textContent).toContain('28k / 128k tokens')
  expect(get).toHaveBeenCalledWith('getContextUsage', { sessionId: 'original' })
  view.rerender(<TerminalContextMeter element={element} revision={2} sessionId="original" client={{ get: get as never }} />)
  await waitFor(() => expect(get.mock.calls.length).toBeGreaterThanOrEqual(3))
  view.unmount(); element.remove()
})
it('does not show a previous session reading after switching the bound conversation', async () => {
  const element = document.createElement('div'); document.body.append(element)
  let resolve!: (value: unknown) => void
  const get = vi.fn(async (_op: string, input: any) => input.sessionId === 'old' ? new Promise(done => { resolve = done }) : { usedTokens: 64000, contextWindow: 128000, bytes: { system: 0, tools: 0, history: 0 } })
  const client = { get: get as never }, view = render(<TerminalContextMeter element={element} revision={1} sessionId="old" client={client} />)
  await waitFor(() => expect(get).toHaveBeenCalled())
  view.rerender(<TerminalContextMeter element={element} revision={2} sessionId="new" client={client} />)
  await screen.findByRole('button', { name: '上下文 50%' })
  resolve({ usedTokens: 120000, contextWindow: 128000, bytes: { system: 0, tools: 0, history: 0 } })
  await new Promise(done => setTimeout(done, 0))
  expect(screen.queryByRole('button', { name: '上下文 94%' })).toBeNull()
  expect(screen.getByRole('button', { name: '上下文 50%' })).not.toBeNull()
  view.unmount(); element.remove()
})
