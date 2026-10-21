import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "./primitives.js"
import { 下拉图标, 上传图标, 文件夹描边图标 } from "./icons.js"
import { t } from "./i18n/index.js"
export function FileUploadMenu({ onFile, onFolder }: { onFile: () => void; onFolder?: (() => void) | undefined }) {
  const anchor = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number }>()
  const close = () => { setPosition(undefined); anchor.current?.focus() }
  useEffect(() => { if (position) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus() }, [position])
  return <>
    <Button ref={anchor} variant="primary" size="sm" aria-expanded={Boolean(position)} aria-haspopup="menu" onClick={() => {
      if (!onFolder) return onFile()
      if (position) return close()
      const rect = anchor.current!.getBoundingClientRect()
      setPosition({ top: Math.min(rect.bottom + 4, window.innerHeight - 100), left: Math.min(rect.left, window.innerWidth - 190) })
    }}><上传图标 />{t("上传")}{onFolder ? <下拉图标 /> : null}</Button>
    {position ? createPortal(<>
      <div className="menu-scrim" onClick={close} />
      <div ref={menu} className="menu file-upload-menu" role="menu" aria-label={t("上传选项")} style={position} onKeyDown={event => {
        const items = [...menu.current!.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        const index = items.indexOf(document.activeElement as HTMLElement)
        if (event.key === "Escape") { event.preventDefault(); close() }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus() }
        if (event.key === "Tab") close()
      }}>
        <Button variant="ghost" size="sm" role="menuitem" onClick={() => { close(); onFile() }}><上传图标 />{t("上传文件")}</Button>
        <Button variant="ghost" size="sm" role="menuitem" onClick={() => { close(); onFolder?.() }}><文件夹描边图标 />{t("上传文件夹")}</Button>
      </div>
    </>, document.body) : null}
  </>
}
