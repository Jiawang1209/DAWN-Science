import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TerminalPermissionControl } from '../../src/ui/terminal-permissions.js'

it('reads the terminal Agent identity, reuses the conversation tiers, and reads back successful writes', async () => {
  let current = 'inherit', effective = 'ask-risky'
  const get = vi.fn(async (op: string, input: any) => {
    if (op === 'getSessionPermission') return { current, effective }
    if (op === 'setSessionConfigOption') { current = input.value; effective = input.value; return {} }
    return {}
  })
  render(<TerminalPermissionControl client={{ get: get as never }} sessionId="terminal-agent" />)
  fireEvent.click(await screen.findByRole('button', { name: '请求批准' }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: /自动拦截/ }))
  await screen.findByRole('button', { name: '自动拦截' })
  expect(get).toHaveBeenCalledWith('setSessionConfigOption', { sessionId: 'terminal-agent', configId: 'dawn.permission', value: 'deny-risky' })
  expect(get.mock.calls.every(([op, input]) => op === 'setPermissionMode' || input.sessionId === 'terminal-agent')).toBe(true)
  expect(get.mock.calls.some(([op]) => op === 'setPermissionMode')).toBe(false)
  // A GUI change is authoritative, including inherited global changes.
  current = 'inherit'; effective = 'allow-all'
  await waitFor(() => expect(screen.getByRole('button', { name: '完全访问' })).toBeTruthy(), { timeout: 1800 })
})

it('shows a failed write without pretending to have switched or silently setting the global default', async () => {
  const get = vi.fn(async (op: string) => {
    if (op === 'getSessionPermission') return { current: 'ask-risky', effective: 'ask-risky' }
    throw Error('权限更改失败')
  })
  render(<TerminalPermissionControl client={{ get: get as never }} sessionId="a" />)
  fireEvent.click(await screen.findByRole('button', { name: '请求批准' }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: /完全访问权限/ }))
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: '请求批准' })).toBeTruthy()
  expect(get.mock.calls.some(([op]) => op === 'setPermissionMode')).toBe(false)
})

it('drops stale reads after unmount and never shows another terminal tier during loading', async () => {
  let resolve!: (value: unknown) => void
  const get = vi.fn((_: string, input: any) => input.sessionId === 'a' ? new Promise(r => { resolve = r }) : Promise.resolve({ current: 'deny-risky', effective: 'deny-risky' }))
  const view = render(<TerminalPermissionControl key="a" client={{ get: get as never }} sessionId="a" />)
  view.rerender(<TerminalPermissionControl key="b" client={{ get: get as never }} sessionId="b" />)
  await screen.findByRole('button', { name: '自动拦截' })
  resolve({ current: 'allow-all', effective: 'allow-all' })
  await new Promise(r => setTimeout(r, 0))
  expect(screen.queryByRole('button', { name: '完全访问' })).toBeNull()
})

it('writes the global default only when explicitly checked and disables repeated picks until canonical readback', async () => {
  let finish!: () => void, current = 'inherit', effective = 'ask-risky'
  const get = vi.fn(async (op: string, input: any) => {
    if (op === 'getSessionPermission') return { current, effective }
    if (op === 'setSessionConfigOption') { await new Promise<void>(r => { finish = r }); current = input.value; effective = input.value }
    return {}
  })
  render(<TerminalPermissionControl client={{ get: get as never }} sessionId="a" />)
  fireEvent.click(await screen.findByRole('button', { name: '请求批准' }))
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('menuitemradio', { name: /完全访问权限/ }))
  expect((screen.getByRole('button', { name: '请求批准' }) as HTMLButtonElement).disabled).toBe(true)
  finish()
  await screen.findByRole('button', { name: '完全访问' })
  expect(get).toHaveBeenCalledWith('setPermissionMode', { mode: 'allow-all' })
})

it('an old in-flight read cannot revert a successful tier change', async () => {
  let reads = 0, oldRead!: (v: unknown) => void
  const get = vi.fn(async (op: string) => {
    if (op !== 'getSessionPermission') return {}
    if (++reads === 1) return { current: 'ask-risky', effective: 'ask-risky' }
    if (reads === 2) return new Promise(r => { oldRead = r })
    return { current: 'deny-risky', effective: 'deny-risky' }
  })
  render(<TerminalPermissionControl client={{ get: get as never }} sessionId="a" />)
  await screen.findByRole('button', { name: '请求批准' })
  await waitFor(() => expect(reads).toBe(2), { timeout: 1600 })
  fireEvent.click(screen.getByRole('button', { name: '请求批准' }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: /自动拦截/ }))
  await screen.findByRole('button', { name: '自动拦截' })
  oldRead({ current: 'allow-all', effective: 'allow-all' })
  await new Promise(r => setTimeout(r, 0))
  expect(screen.queryByRole('button', { name: '完全访问' })).toBeNull()
})
