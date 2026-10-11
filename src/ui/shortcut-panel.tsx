import { useEffect, useRef, type RefObject } from "react"
import { createPortal } from "react-dom"
import { Button } from "./primitives.js"
import { 关闭图标, 键盘图标 } from "./icons.js"
import { 优化输入快捷键 } from "./enhance.js"
import { 在组词 } from "./ime.js"
import { t } from "./i18n/index.js"

/** 只展示已有绑定及生效范围，不接入业务动作或新增键位。 */
export function ShortcutPanel({ onClose, returnFocusRef }: {
  onClose: () => void
  returnFocusRef?: RefObject<HTMLButtonElement | null>
}) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const trigger = returnFocusRef?.current ?? document.activeElement as HTMLElement | null
    close.current?.focus()
    return () => {
      // Cmd/Ctrl+K 已把焦点交给命令面板时，退出速查不能再把它抢回入口。
      if (trigger?.isConnected && document.activeElement === document.body) trigger.focus()
    }
  }, [returnFocusRef])
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  const mod = mac ? "⌘" : "Ctrl"
  const groups = [
    { title: t("通用导航"), rows: [
      { title: t("命令面板"), keys: `${mod} K` },
      { title: t("文件面板"), keys: `${mod} P` },
      { title: t("审阅面板"), keys: mac ? "⌃ ⇧ G" : "Ctrl Shift G" },
    ] },
    { title: t("对话输入"), rows: [
      { title: t("发送；运行中排到后面"), keys: "Enter" },
      { title: t("输入换行"), keys: "Shift Enter" },
      { title: t("运行中调整方向"), keys: `${mod} Enter` },
      { title: t("优化输入"), keys: 优化输入快捷键, hint: t("主对话输入框有可优化的草稿时") },
      { title: t("中止当前回合"), keys: "Esc", hint: t("仅在对话输入框中生效") },
      { title: t("采纳灰色建议"), keys: "Tab", hint: t("输入框为空且有建议时") },
      { title: t("翻阅输入历史"), keys: "↑ ↓", hint: t("光标在第一行／最后一行时") },
    ] },
    { title: t("笔记本与终端"), rows: [
      { title: t("运行笔记本代码"), keys: `${mod} Enter`, hint: t("焦点在笔记本代码框中") },
      { title: t("中断终端进程"), keys: "Ctrl C", hint: t("焦点在终端中，由终端程序处理") },
    ] },
  ]
  return createPortal(
    <div className="search-backdrop" role="dialog" aria-modal="true" aria-label={t("快捷键速查")}
      onMouseDown={e => { if (e.target === e.currentTarget) { e.preventDefault(); onClose() } }}
      onKeyDown={e => {
        if (在组词(e)) return
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose() }
        if (e.key === "Tab") { e.preventDefault(); close.current?.focus() }
      }}>
      <div className="search-panel shortcut-panel">
        <div className="shortcut-panel-head">
          <键盘图标 /><h2>{t("快捷键速查")}</h2>
          <Button ref={close} variant="ghost" size="icon" aria-label={t("收起浮层")} onClick={onClose}><关闭图标 /></Button>
        </div>
        <div className="shortcut-panel-body">
          {groups.map(group => <section className="shortcut-group" key={group.title}>
            <h3>{group.title}</h3>
            <dl>{group.rows.map(row => <div className="shortcut-row" key={row.title}>
              <dt>{row.title}{"hint" in row ? <small>{row.hint}</small> : null}</dt>
              <dd><kbd>{row.keys}</kbd></dd>
            </div>)}</dl>
          </section>)}
          <p className="shortcut-panel-note">{t("焦点在终端时，命令面板和文件快捷键交给终端。")}</p>
        </div>
      </div>
    </div>, document.body)
}
