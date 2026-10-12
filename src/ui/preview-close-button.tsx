import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './primitives.js'
import { 关闭图标 } from './icons.js'
import { t } from './i18n/index.js'

/** 同一颗收起入口，提示挂到 body，避免被代码和图片的滚动容器裁掉。 */
export function PreviewCloseButton({ onClose }: { onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<{ top: number; right: number }>()
  const show = () => {
    const rect = button.current?.getBoundingClientRect()
    if (rect) setPosition({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
  }
  useEffect(() => {
    if (!position) return
    const hide = () => setPosition(undefined)
    window.addEventListener('resize', hide)
    document.addEventListener('scroll', hide, true)
    return () => { window.removeEventListener('resize', hide); document.removeEventListener('scroll', hide, true) }
  }, [position])
  return <>
    <Button ref={button} variant="ghost" size="icon" className="preview-close-button" aria-label={t("收起预览")}
      onMouseEnter={show} onMouseLeave={() => setPosition(undefined)} onFocus={show} onBlur={() => setPosition(undefined)}
      onClick={() => { setPosition(undefined); onClose() }}><关闭图标 /></Button>
    {position ? createPortal(<span role="tooltip" className="preview-close-tooltip" style={position}>{t("收起预览")}</span>, document.body) : null}
  </>
}
