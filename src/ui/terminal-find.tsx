import { useEffect, useRef } from 'react'
import { Button } from './primitives.js'
import { t, tf } from './i18n/index.js'
export function TerminalFindBar({ text, result, onQuery, onNavigate, onClose }: {
  text: string; result: { resultIndex: number; resultCount: number }
  onQuery: (text: string) => void; onNavigate: (direction: 1 | -1) => void; onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  return <div className="terminal-find" role="search" aria-label={t('搜索终端历史内容')} onKeyDown={e => {
    e.stopPropagation()
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'Enter') { e.preventDefault(); onNavigate(e.shiftKey ? -1 : 1) }
  }}>
    <input ref={input} className="control" value={text} aria-label={t('搜索终端历史内容')} placeholder={t('搜索当前终端的历史内容')} onChange={e => onQuery(e.target.value)} />
    <span role="status">{!text ? t('输入关键词') : result.resultCount ? result.resultIndex < 0 ? tf('{0} 个匹配', result.resultCount) : `${result.resultIndex + 1}/${result.resultCount}` : t('没有匹配结果')}</span>
    <Button variant="ghost" size="icon" disabled={!result.resultCount} aria-label={t('上一个匹配')} onClick={() => onNavigate(-1)}>↑</Button>
    <Button variant="ghost" size="icon" disabled={!result.resultCount} aria-label={t('下一个匹配')} onClick={() => onNavigate(1)}>↓</Button>
    <Button variant="ghost" size="icon" aria-label={t('关闭终端搜索')} onClick={onClose}>×</Button>
  </div>
}
