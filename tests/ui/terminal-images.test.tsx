import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TerminalImageShell } from '../../src/ui/terminal-images.js'
import { $lang } from '../../src/ui/i18n/index.js'
$lang.set('zh')
vi.mock('../../src/ui/terminal.js', () => ({ TerminalPane: ({ onInput }: any) => <textarea aria-label="Shell 输入" onKeyDown={e => { if (e.key === 'Enter') onInput('\r') }} /> }))
const id = '58b52380-f46a-4a64-8450-f66a696571c4'
const thumb = 'data:image/png;base64,iVBORw0KGgo='
const state = { mode: 'dawn' as const, sessionId: 'agent' }

function mount(mode = state) {
  let revision = 0, pending: any[] = []
  const get = vi.fn(async (op: string, p: any) => {
    if (op === 'updateTerminalAgentAttachments') { revision++; pending = p.action === 'add' ? [{ id, name: '截图.png', thumbnail: thumb }] : []; }
    if (op === 'getTerminalAgentImage') return { id, name: '截图.png', dataUrl: thumb, thumbnail: thumb }
    return { sessionId: 'agent', revision, ...(p.afterRevision === revision ? {} : { pending }) }
  })
  const onInput = vi.fn()
  const view = render(<TerminalImageShell client={{ get: get as never }} terminalId="terminal" state={mode} chunks={[]} onInput={onInput} />)
  const box = screen.getByRole('textbox', { name: 'Shell 输入' })
  return { ...view, get, box, onInput }
}

it('stages pasted images for this Agent, previews and removes them without sending a message', async () => {
  const { get, box, onInput } = mount()
  const image = new File(['png'], '截图.png', { type: 'image/png' })
  fireEvent.paste(box, { clipboardData: { items: [], files: [image] } })
  const preview = await screen.findByRole('button', { name: '放大 截图.png' })
  expect(get).toHaveBeenCalledWith('updateTerminalAgentAttachments', expect.objectContaining({ terminalId: 'terminal', sessionId: 'agent', action: 'add' }))
  expect(onInput).not.toHaveBeenCalled()
  fireEvent.click(preview)
  await screen.findByRole('dialog', { name: '图片预览' })
  fireEvent.click(screen.getByRole('button', { name: '关闭图片预览' }))
  fireEvent.click(screen.getByRole('button', { name: '移除 截图.png' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: '放大 截图.png' })).toBeNull())
})

it('takes dropped images once and blocks Enter while the attachment is being accepted', async () => {
  const { box, get, onInput } = mount()
  fireEvent.drop(box, { dataTransfer: { files: [new File(['png'], '截图.png', { type: 'image/png' })] } })
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(onInput).not.toHaveBeenCalled()
  await screen.findByRole('button', { name: '放大 截图.png' })
  expect(get.mock.calls.filter(x => x[0] === 'updateTerminalAgentAttachments')).toHaveLength(1)
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(onInput).toHaveBeenCalledWith('\r')
})

it('does not attach pictures in Normal mode or forward them to a hidden composer', async () => {
  const { box, get } = mount({ mode: 'normal' } as never)
  const hiddenComposer = vi.fn()
  document.addEventListener('paste', hiddenComposer)
  try {
    fireEvent.paste(box, { clipboardData: { items: [], files: [new File(['png'], 'a.png', { type: 'image/png' })] } })
    expect(get.mock.calls.filter(x => x[0] === 'updateTerminalAgentAttachments')).toHaveLength(0)
    expect(hiddenComposer).not.toHaveBeenCalled()
  } finally { document.removeEventListener('paste', hiddenComposer) }
})
