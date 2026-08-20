/**
 * 能拖的缝（2026-08-13 生于侧栏；2026-08-17 右坞复用；2026-08-21 搬出 `views.tsx`
 * 并加了横向——坞里「文件树 ↔ 预览」要用，而 `files.tsx` 不该为一条缝去 import 整个 `views.tsx`）。
 */
import { useRef, useState } from "react"
import { t } from "./i18n/index.js"

/**
 * 侧栏与正文之间那条可以拖的缝（2026-08-13，作者：*「侧边栏其实可以挪动，
 * 往左挪动，可以看到更少的信息，往右挪动，可以看到更多的信息」*）。
 *
 * ## 量出来的（CDP 连运行中的 WorkBuddy，`_sash_`）
 *
 * ```
 * width: 4px   cursor: col-resize   position: absolute   z-index: 10
 * 背景透明；::before 是居中的 1px 细线，平时也透明
 * hover / 拖动中 细线才亮起来
 * ```
 *
 * **4px 宽、1px 可见**这件事是刻意的：命中区要比看得见的那条粗，
 * 否则拖它成了一件靠手稳的事。（Fitts 定律的老结论，它那儿是照做的。）
 *
 * ## 它是 `separator`，不是 `button`
 *
 * ARIA 的窗格分隔条模式：`role="separator"` + `aria-valuenow/min/max`，
 * 并且**可聚焦、方向键能调**。
 * 「拖」是鼠标独占的动作——只给拖的话，这个能力对键盘用户等于不存在，
 * 而那正是本项目已经踩过两次的那条（*「看不见的能力等于不存在」*）。
 */
export function SideSash({
  width,
  min,
  max,
  onResize,
  side = "left",
  label,
  orientation = "vertical",
  attach = "offset",
}: {
  width: number
  min: number
  max: number
  onResize: (px: number) => void
  /**
   * 竖缝（左右拖，默认）还是横缝（上下拖）。**2026-08-21 为坞里「树 ↔ 预览」加的**：
   * 坞窄时两者上下摆，那条缝得横着；逻辑与竖的一模一样，只是换了轴。
   */
  orientation?: "vertical" | "horizontal"
  /**
   * 这条缝怎么定位：`offset` = 按 `width` 算离容器边的距离（侧栏、右坞那两条）；
   * `edge` = 贴在**父元素的尾边**（右边或下边）——父元素自己就是被拖的那个，
   * 宽高由它的样式给，缝不用知道数字。树 ↔ 预览那两条是这样。
   */
  attach?: "offset" | "edge"
  /**
   * 这条缝贴着哪一边（2026-08-17，右侧坞要用）。
   *
   * **不另写一份拖拽实现**：抓指针、锚点不累加、键盘一步 16px 这三件
   * 两边一模一样，而它们各自都栽过（不抓指针 → 手滑出 4px 就断；
   * 累加 → 越界那几十像素被吃掉，拖回来不跟手）。
   * 复制一份等于把这三个坑复制一遍。
   *
   * 两边真正的差别只有两处：**贴哪一边**，以及**往哪个方向拖是变宽**。
   */
  side?: "left" | "right"
  label?: string
}) {
  const [dragging, setDragging] = useState(false)
  /**
   * **记下按下那一刻的锚点，不用每次事件的增量累加。**
   * 累加会在夹到上下界时丢步：手往左推过了头再推回来，
   * 侧栏不跟手——因为越界的那几十像素被吃掉了，没人记得它们。
   */
  const 锚 = useRef({ x: 0, w: width })

  const 横 = orientation === "horizontal"
  const 位置 =
    attach === "edge"
      ? undefined
      : side === "left"
        ? { left: `${width - 2}px` }
        : { right: `${width - 2}px` }
  // 横缝读的是 Y；「往哪个方向拖是变大」的取反规则一样适用（side=right 时是下边那条往上拖）
  const 读 = (e: { clientX: number; clientY: number }) => (横 ? e.clientY : e.clientX)

  return (
    <div
      className={`side-sash${横 ? " horizontal" : ""}${attach === "edge" ? " edge" : ""}${dragging ? " dragging" : ""}`}
      {...(位置 ? { style: 位置 } : {})}
      role="separator"
      aria-orientation={横 ? "horizontal" : "vertical"}
      aria-label={label ?? t("调整侧栏宽度")}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        锚.current = { x: 读(e), w: width }
        setDragging(true)
        // **抓住指针**：不抓的话手一滑出这 4px，拖动就断在半路
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!dragging) return
        // 右边那条：手往左推才是变宽，所以取反
        const 走了 = 读(e) - 锚.current.x
        onResize(锚.current.w + (side === "left" ? 走了 : -走了))
      }}
      onPointerUp={(e) => {
        setDragging(false)
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        // 一步 16px：够看得出来，又不至于两下就撞到界
        const 变 = (d: number) => onResize(width + (side === "left" ? d : -d))
        const 减 = 横 ? "ArrowUp" : "ArrowLeft"
        const 加 = 横 ? "ArrowDown" : "ArrowRight"
        if (e.key === 减) {
          变(-16)
          e.preventDefault()
        } else if (e.key === 加) {
          变(16)
          e.preventDefault()
        }
      }}
    />
  )
}
