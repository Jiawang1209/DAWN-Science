/**
 * 坞里的输入卡跟主区同高（2026-09-29，作者报的）。
 *
 * 两张卡都贴着底，**卡高只差在附栏折不折行**：720 以下的对话格附栏强制折两行（styles.css「窄了附栏折成两行」），
 * 坞永远在 720 以下；主区在笔记本屏上（坞开着）也折两行，大屏上一行放得下。于是大屏上坞那张比主区高出一行（实测 203 vs 176）。
 * 作者选的是「底边对齐 + 同高」：**坞里的附栏跟着主区走**——主区一行，坞里也一行（「上传文件」只留图标）；主区两行，坞里照旧两行。
 *
 * 主区那张（对话里、或新建任务那一屏）量自己的附栏有几行、写在这里；坞里那张读它。**渲染进程自有、不落盘**：
 * 行数是此刻窗口宽度的结果，下次打开会重新量。登记带身份，卸下只清自己那份（与 `enhance.tsx` 同一条）。
 */
import { useEffect, useRef, useState } from "react"
import { atom } from "nanostores"

/** 主区附栏此刻几行。缺省 = 主区眼前没有输入卡（设置屏之类）——坞里照它自己的样子排 */
export const $主区附栏行数 = atom<number | undefined>(undefined)

let 谁在报: object | undefined

/** 附栏里看得见的子项排成了几行（按各自的上沿分组；折行的那条 `::before` 不是元素，不算） */
export function 数行(footer: HTMLElement): number {
  const 上沿 = new Set<number>()
  for (const c of Array.from(footer.children)) {
    const el = c as HTMLElement
    if (el.offsetWidth === 0 && el.offsetHeight === 0) continue
    上沿.add(Math.round(el.offsetTop / 8))
  }
  return Math.max(1, 上沿.size)
}

/**
 * 主区那张卡调：量附栏的行数，跟着尺寸变化重量。回一个 callback ref 挂到附栏上——
 * **不用 `useRef`**：新建任务那一屏的附栏第一拍还没画出来，按 ref 的 effect 只跑那一次、看到的是空，之后再也不量（实测漏过）。
 * `启用` 为假（坞里那张）什么都不做。
 */
export function use报主区附栏行数(启用: boolean): (el: HTMLElement | null) => void {
  const 我 = useRef({})
  const [el, 设el] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!启用 || !el) return
    const 自己 = 我.current
    谁在报 = 自己
    const 量 = () => {
      if (谁在报 === 自己) $主区附栏行数.set(数行(el))
    }
    量()
    const ro = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(量)
    ro?.observe(el)
    return () => {
      ro?.disconnect()
      if (谁在报 !== 自己) return
      谁在报 = undefined
      $主区附栏行数.set(undefined)
    }
  }, [el, 启用])
  return 设el
}
