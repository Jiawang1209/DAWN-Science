/** 裸文件名可能来自 Finder；查完附件后，文本仍属于粘贴发生时的选区。 */
import { useLayoutEffect, useRef } from 'react'
import type { ClipboardEvent } from 'react'

type Range = { start: number; end: number }
/** 每次 DOM 编辑移动待处理选区；重叠编辑已替换原选区时，保留人新输入的字。 */
function applyEdit(start: number, oldEnd: number, newEnd: number, range: Range) {
  if (oldEnd <= range.start) {
    range.start += newEnd - oldEnd
    range.end += newEnd - oldEnd
  } else if (start < range.end) {
    range.start = range.end = newEnd
  }
}
/** 外部换值 / 没有 beforeinput 的兼容路径；真实键入优先使用事件里的编辑区间。 */
function moveRange(before: string, after: string, range: Range) {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  let oldEnd = before.length, newEnd = after.length
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd-- }
  applyEdit(start, oldEnd, newEnd, range)
}

export function useFilenamePaste(
  scope: string,
  write: (value: string, caret: number) => void,
  attach: (paths: string[]) => void,
) {
  const generation = useRef(0)
  const pending = useRef(new Set<() => void>())
  const queue = useRef(Promise.resolve())
  useLayoutEffect(() => {
    generation.current++
    queue.current = Promise.resolve()
    return () => {
      generation.current++
      for (const cancel of pending.current) cancel()
      pending.current.clear()
    }
  }, [scope])

  return (event: ClipboardEvent<HTMLTextAreaElement>): boolean => {
    const data = event.clipboardData
    const text = data.getData('text/plain')
    if (data.files.length || !/^[^\s@]{1,255}\.[A-Za-z0-9]{1,8}$/.test(text.trim())) return false
    event.preventDefault()
    const el = event.currentTarget
    const version = generation.current
    const range = { start: el.selectionStart, end: el.selectionEnd }
    let previous = el.value
    let cancelled = false
    let edit: (Range & { type: string }) | undefined
    let deferred: Promise<void> | undefined
    let finishDeferred: (() => void) | undefined
    const track = () => {
      const delta = el.value.length - previous.length
      if (previous !== el.value) {
        if (edit && /^(?:insertText|insertFromPaste|insertLineBreak|insertParagraph|deleteContentBackward|deleteContentForward|deleteWordBackward|deleteWordForward|deleteByCut)$/.test(edit.type)) {
          let { start, end } = edit
          if (start === end && edit.type.startsWith('delete')) {
            if (edit.type.endsWith('Backward')) start += delta
            else end -= delta
          }
          applyEdit(start, end, end + delta, range)
        } else moveRange(previous, el.value, range)
      }
      previous = el.value
      edit = undefined
    }
    const beforeInput = (e: Event) => {
      track()
      edit = { start: el.selectionStart, end: el.selectionEnd, type: (e as InputEvent).inputType }
    }
    const valid = () => !cancelled && version === generation.current && el.isConnected
    const cancel = () => {
      cancelled = true
      el.removeEventListener('beforeinput', beforeInput)
      el.removeEventListener('input', track)
      el.removeEventListener('compositionend', afterComposition)
      pending.current.delete(cancel)
      finishDeferred?.()
    }
    const afterComposition = () => { queueMicrotask(insert) }
    const insert = (): void | Promise<void> => {
      if (!valid()) return cancel()
      // 输入法拥有组词文本；等它结束后再插入，不能用异步回退打断中文。
      if (el.dataset.composing === 'true') {
        el.addEventListener('compositionend', afterComposition, { once: true })
        return deferred ??= new Promise<void>(resolve => { finishDeferred = resolve })
      }
      track()
      const { start, end } = range
      cancel()
      // Chromium 的原生编辑命令保留撤销栈；jsdom / 未聚焦时用 textarea 原生选区接口。
      el.setSelectionRange(start, end)
      const native = document.activeElement === el && typeof document.execCommand === 'function'
        && document.execCommand('insertText', false, text)
      if (!native) el.setRangeText(text, start, end, 'end')
      write(el.value, el.selectionStart)
    }
    el.addEventListener('beforeinput', beforeInput)
    el.addEventListener('input', track)
    pending.current.add(cancel)
    // 并行查剪贴板，按粘贴顺序落下结果；失败就是普通文本，不能吞字。
    let paths: Promise<string[]>
    try { paths = Promise.resolve(window.dawn?.clipboardFiles?.() ?? []).catch(() => []) }
    catch { paths = Promise.resolve([]) }
    queue.current = queue.current.then(async () => {
      const files = await paths
      if (!valid()) return cancel()
      if (files.length) { cancel(); attach(files) }
      else await insert()
    })
    return true
  }
}
