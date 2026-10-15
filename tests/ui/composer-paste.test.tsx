import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConversationView, EmptyConversation } from '../../src/ui/views.js'
import { $drafts, setDraft } from '../../src/ui/state/view.js'
import type { SessionSummary } from '../../src/protocol/index.js'

const session: SessionSummary = { sessionId: 'paste-A', projectId: 'p1', agentId: 'ds-chat', kind: 'native', pinned: false, sortOrder: 0, state: 'alive', createdAt: '2026-10-15' }
afterEach(() => { delete window.dawn })

function mount(kind: 'welcome' | 'conversation') {
  const onSend = vi.fn()
  const view = render(kind === 'welcome'
    ? <EmptyConversation agents={['ds-chat']} onStart={onSend} onOpenSettings={() => {}} />
    : <ConversationView session={session} items={[]} onSend={onSend} />)
  const box = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
  fireEvent.change(box, { target: { value: '前段后段尾部' } })
  return { ...view, box, onSend }
}
function paste(box: HTMLTextAreaElement, text = 'data.csv', start = 2, end = start) {
  box.focus(); box.setSelectionRange(start, end)
  fireEvent.paste(box, { clipboardData: { files: [], items: [], getData: (type: string) => type === 'text/plain' ? text : '' } })
}
function bridge(read: () => Promise<string[]>) {
  window.dawn = { clipboardFiles: read } as NonNullable<typeof window.dawn>
}

for (const kind of ['welcome', 'conversation'] as const) {
  describe(`文件名文本粘贴 · ${kind}`, () => {
    it('在光标处插入，光标停在新文字之后', async () => {
      bridge(async () => [])
      const { box } = mount(kind)
      paste(box)
      await waitFor(() => expect(box.value).toBe('前段data.csv后段尾部'))
      expect([box.selectionStart, box.selectionEnd]).toEqual([10, 10])
    })
    it('替换选区，保留前后文字', async () => {
      bridge(async () => [])
      const { box } = mount(kind)
      paste(box, 'data.csv', 2, 4)
      await waitFor(() => expect(box.value).toBe('前段data.csv尾部'))
    })
    it('系统读取失败也按原选区回退', async () => {
      bridge(async () => { throw new Error('clipboard unavailable') })
      const { box } = mount(kind)
      paste(box, 'data.csv', 2, 4)
      await waitFor(() => expect(box.value).toBe('前段data.csv尾部'))
    })
    it('真正的系统文件仍进入附件栏，保留等待期间输入的新字', async () => {
      let resolve!: (paths: string[]) => void
      bridge(() => new Promise(r => { resolve = r }))
      const { box } = mount(kind)
      paste(box)
      fireEvent.change(box, { target: { value: '前段后段尾部新字' } })
      await act(async () => resolve(['/tmp/data.csv']))
      expect(box.value).toBe('前段后段尾部新字 @data.csv ')
      expect(document.querySelectorAll('.at-rail-row')).toHaveLength(1)
    })
    it('没有桌面桥接时也不能吞文字', async () => {
      const { box } = mount(kind)
      paste(box)
      await waitFor(() => expect(box.value).toBe('前段data.csv后段尾部'))
    })
    it('等待期间继续输入并移动光标，不覆盖新字，也不改粘贴位置', async () => {
      let resolve!: (paths: string[]) => void
      bridge(() => new Promise(r => { resolve = r }))
      const { box } = mount(kind)
      paste(box)
      fireEvent.change(box, { target: { value: '前段后段尾部新字' } })
      box.setSelectionRange(8, 8)
      await act(async () => resolve([]))
      expect(box.value).toBe('前段data.csv后段尾部新字')
    })
    it('卸载后的迟到粘贴不能写进新输入框', async () => {
      let resolve!: (paths: string[]) => void
      bridge(() => new Promise(r => { resolve = r }))
      const { box, unmount } = mount(kind)
      paste(box); unmount()
      const fresh = mount(kind)
      await act(async () => resolve([]))
      expect(fresh.box.value).toBe('前段后段尾部')
    })
    it('异步结果返回时不打断中文组词，组词结束后再落下粘贴', async () => {
      let resolve!: (paths: string[]) => void
      bridge(() => new Promise(r => { resolve = r }))
      const { box } = mount(kind)
      paste(box)
      fireEvent.compositionStart(box)
      box.value = '前段后段尾部zh'
      await act(async () => resolve([]))
      expect(box.value).toBe('前段后段尾部zh')
      box.value = '前段后段尾部中文'
      fireEvent.compositionEnd(box)
      await waitFor(() => expect(box.value).toBe('前段data.csv后段尾部中文'))
    })
    it('等待期间在粘贴位置前插字，原选区跟着移动', async () => {
      let resolve!: (paths: string[]) => void
      bridge(() => new Promise(r => { resolve = r }))
      const { box } = mount(kind)
      paste(box, 'data.csv', 2, 4)
      fireEvent.change(box, { target: { value: '新前段后段尾部' } })
      await act(async () => resolve([]))
      expect(box.value).toBe('新前段data.csv尾部')
    })
    it('重复字符中的实际编辑位置由 beforeinput 选区决定', async () => {
      let resolve!: (paths: string[]) => void
      bridge(() => new Promise(r => { resolve = r }))
      const { box } = mount(kind)
      fireEvent.change(box, { target: { value: 'aaaaX' } })
      paste(box, 'a.csv')
      box.setSelectionRange(0, 0)
      fireEvent(box, new InputEvent('beforeinput', { inputType: 'insertText', data: 'a', bubbles: true }))
      fireEvent.input(box, { target: { value: 'aaaaaX', selectionStart: 1, selectionEnd: 1 }, inputType: 'insertText', data: 'a' })
      await act(async () => resolve([]))
      expect(box.value).toBe('aaaa.csvaaX')
    })
    it('两次粘贴即使查询逆序返回，也按粘贴顺序插入', async () => {
      const resolves: ((paths: string[]) => void)[] = []
      bridge(() => new Promise(r => { resolves.push(r) }))
      const { box } = mount(kind)
      paste(box, 'a.csv'); paste(box, 'b.csv')
      await act(async () => resolves[1]!([]))
      expect(box.value).toBe('前段后段尾部')
      await act(async () => resolves[0]!([]))
      expect(box.value).toBe('前段a.csvb.csv后段尾部')
    })
  })
}

it('同一个 ConversationView 切换会话后，旧请求不能污染新草稿', async () => {
  let resolve!: (paths: string[]) => void
  bridge(() => new Promise(r => { resolve = r }))
  const { box, rerender } = mount('conversation')
  paste(box)
  setDraft('paste-B', '另一段草稿')
  rerender(<ConversationView session={{ ...session, sessionId: 'paste-B' }} items={[]} onSend={() => {}} />)
  await act(async () => resolve([]))
  expect(box.value).toBe('另一段草稿')
  expect($drafts.get()['paste-B']).toBe('另一段草稿')
})
