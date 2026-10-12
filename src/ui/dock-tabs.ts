import { useLayoutEffect, useState, type RefObject } from "react"
import { 全部房客, 常用房客, type 坞房客 } from "./state/right-dock.js"

/** 保留常用入口优先级；展开、收回和切换时都沿用同一顺序。 */
export const dockTabOrder: readonly 坞房客[] = [...常用房客, ...全部房客.filter(who => !常用房客.includes(who))]

/** available 已扣除头部内距、关闭按钮及其间隙；仅在溢出时为更多留位。 */
export function fitDockTabs(widths: ReadonlyMap<坞房客, number>, available: number, moreWidth: number, gap: number, current: 坞房客): 坞房客[] {
  const total = dockTabOrder.reduce((sum, who) => sum + (widths.get(who) ?? 0), 0) + gap * (dockTabOrder.length - 1)
  if (total <= available) return [...dockTabOrder]
  let used = widths.get(current) ?? 0
  const picked = new Set<坞房客>([current])
  for (const who of dockTabOrder) {
    if (who === current) continue
    const next = used + gap + (widths.get(who) ?? 0)
    if (next <= available - moreWidth) { picked.add(who); used = next }
  }
  return dockTabOrder.filter(who => picked.has(who))
}

export function useDockTabs(current: 坞房客, head: RefObject<HTMLElement | null>): 坞房客[] {
  const [visible, setVisible] = useState<坞房客[]>(() => dockTabOrder.filter(who => 常用房客.includes(who) || who === current))
  useLayoutEffect(() => {
    const header = head.current
    if (!header) return
    const row = header.querySelector<HTMLElement>(".dock-tabs-row")!
    const tabs = [...row.querySelectorAll<HTMLButtonElement>("[data-dock-tab]")]
    const more = header.querySelector<HTMLButtonElement>(".dock-more > button")!
    const close = header.querySelector<HTMLButtonElement>(".dock-close")!
    const measure = () => {
      const headWidth = header.getBoundingClientRect().width
      if (!headWidth) return // 尚未布局时不以零宽度覆盖初始入口。
      const style = getComputedStyle(header)
      const gap = parseFloat(style.columnGap) || 0
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
      const widths = new Map(tabs.map(tab => [tab.dataset.dockTab as 坞房客, tab.getBoundingClientRect().width]))
      const next = fitDockTabs(widths, headWidth - padding - close.getBoundingClientRect().width - gap, more.getBoundingClientRect().width + gap, parseFloat(getComputedStyle(row).columnGap) || 0, current)
      const focused = document.activeElement as HTMLElement | null
      const focusedTab = focused?.dataset.dockTab as 坞房客 | undefined
      if ((focusedTab && !next.includes(focusedTab)) || (next.length === dockTabOrder.length && focused && header.querySelector(".dock-more")?.contains(focused))) {
        tabs.find(tab => tab.dataset.dockTab === current)?.focus({ preventScroll: true })
      }
      setVisible(previous => previous.length === next.length && previous.every((who, i) => who === next[i]) ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const el of [header, ...tabs, more, close]) observer.observe(el)
    return () => observer.disconnect()
  }, [current, head])
  // 切换的同一帧就显示当前标签，随后在 layout effect 中按真实尺寸收回其他项。
  return dockTabOrder.filter(who => visible.includes(who) || who === current)
}
