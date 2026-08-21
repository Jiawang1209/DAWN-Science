/**
 * 悬停卡（2026-08-15 生于侧栏，形态取自 Codex；2026-08-21 抽出来给坞里的文件树共用——
 * `files.tsx` 不该为一张卡去 import 整个 `views.tsx`）。
 */
import type React from "react"
import { 时钟图标, 对话图标, 文件夹图标, 文件图标, 服务器图标 } from "./icons.js"

/**
 * 悬停时在侧栏旁边浮出全文（2026-08-15 作者要的，形态取自 Codex）。
 *
 * ## 为什么要有它，而跑马灯还不够
 *
 * 跑马灯一次只能看见一小段，读一句长标题要等它跑完；而浮层是**一眼全见**。
 * 作者截图里那张卡还带着它属于哪个项目——**「哪一段对话」这个问题，
 * 光有标题有时答不了**（两个课题下都可能有「梳理数据中心介绍思路」）。
 *
 * ## 三件事定死
 *
 * 1. **`position: fixed`**。侧栏是 `overflow: auto` 的，绝对定位的子元素
 *    会跟着列表一起滚走——这个坑本仓库记过一次（那条缝的把手）。
 * 2. **要等一下再出**（`延时毫秒`）。鼠标从上往下扫过十条会话时，
 *    每条都弹一张卡是灾难。
 * 3. **短标题不弹**。看得全的东西再弹一张卡，只是挡住了它自己。
 */
const 浮层延时毫秒 = 420

export interface 悬停浮层 {
  全文: string
  副: string | undefined
  /**
   * 卡上的细节行（2026-08-21，作者：*「对话窗口仅仅保留题目，然后剩余的详细信息
   * 都放入鼠标滑动窗口里面」*，并给了 Codex 侧栏那张图）。
   * 行上只留标题，上次活动、目录、对话数这些挪到这儿。
   */
  详情?: readonly 详情行[] | undefined
  /** 标题前的图标：行上不再画图标了（作者要的），它在这儿说「这是对话 / 项目 / 服务器」 */
  标图?: "对话" | "文件夹" | "服务器" | "文件" | undefined
  上: number
  左: number
  /** 给了就贴屏幕右缘算（坞里那棵树：卡开在坞的左边），此时 `左` 不用 */
  右?: number | undefined
}

/** 卡上的一行细节：图标说类别，字说内容 */
export interface 详情行 {
  图: "文件夹" | "时钟" | "服务器" | "对话" | "文件"
  文: string
}

export function 详情图(图: 详情行["图"]) {
  switch (图) {
    case "文件":
      return <文件图标 className="row-icon" />
    case "文件夹":
      return <文件夹图标 className="row-icon" />
    case "时钟":
      return <时钟图标 className="row-icon" />
    case "服务器":
      return <服务器图标 className="row-icon" />
    case "对话":
      return <对话图标 className="row-icon" />
  }
}

/**
 * 计时器放在模块上，不放在每一行里。
 *
 * **同时只会浮一张卡**——从上往下扫过十条时，后一条本来就该顶掉前一条的等待。
 * 每行各存一个的话，还得挨个清，而漏清一个就是一张凭空冒出来的卡。
 */
let 浮层计时: ReturnType<typeof setTimeout> | undefined

export function 浮层事件(
  报: ((x: 悬停浮层 | undefined) => void) | undefined,
  全文: string,
  副?: string,
  详情?: readonly 详情行[],
  标图?: 悬停浮层["标图"],
  /**
   * 哪儿用（2026-08-21 起坞里的文件树也用这张卡）：标题是行里哪个元素、贴哪个容器的边、
   * 开在容器的右边（侧栏）还是左边（右坞——它贴着屏幕右缘，往右开就出屏了）。
   */
  哪儿: { 标题: string; 容器: string; 开在: "右边" | "左边" } = { 标题: ".sess-title", 容器: ".sidebar", 开在: "右边" },
) {
  if (!报) return {}
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      const 行 = e.currentTarget
      const 标题 = 行.querySelector(哪儿.标题) as HTMLElement | null
      const 被截了 = Boolean(标题 && 标题.scrollWidth - 标题.clientWidth > 1)
      /**
       * **没东西可补就不弹**：标题看得全、又没有细节行，再弹一张卡只是挡住它自己。
       * 有细节行时就弹——行上只留标题之后，那些信息只有这儿能看（2026-08-21）。
       */
      if (!被截了 && !(详情 && 详情.length > 0)) return
      clearTimeout(浮层计时)
      浮层计时 = setTimeout(() => {
        const r = 行.getBoundingClientRect()
        /**
         * **贴侧栏的右缘，不是这一行的右缘**（2026-08-15 判据当场抓到的）。
         *
         * 行比侧栏窄（左右都有内边距），按行的右缘放，卡就**落在侧栏里面**、
         * 压住旁边那几条会话。第一版就是这么写的，e2e 那条
         * 「卡压在侧栏上了」一次就红。
         */
        const 侧 = 行.closest(哪儿.容器)?.getBoundingClientRect()
        if (哪儿.开在 === "左边") 报({ 全文, 副, 详情, 标图, 上: r.top, 左: 0, 右: window.innerWidth - (侧?.left ?? r.left) + 8 })
        else 报({ 全文, 副, 详情, 标图, 上: r.top, 左: (侧?.right ?? r.right) + 8 })
      }, 浮层延时毫秒)
    },
    onMouseLeave: () => {
      clearTimeout(浮层计时)
      报(undefined)
    },
  }
}

/**
 * 悬停时那张全文卡（2026-08-15 作者要的，形态取自 Codex；2026-08-21 抽出来给坞里的文件树共用）。
 * `position: fixed` 是硬要求：列表是 `overflow: auto` 的，绝对定位的子元素会跟着滚走。
 * `aria-hidden`：它是那一行的重复，不是新信息。
 */
export function HoverCard({ 浮着的 }: { 浮着的: 悬停浮层 | undefined }) {
  if (!浮着的) return null
  return (
    <div
      className="sess-hover-card"
      style={浮着的.右 !== undefined ? { top: `${浮着的.上}px`, right: `${浮着的.右}px` } : { top: `${浮着的.上}px`, left: `${浮着的.左}px` }}
      aria-hidden="true"
    >
      <p className="sess-hover-title">
        {浮着的.标图 ? 详情图(浮着的.标图) : null}
        <span>{浮着的.全文}</span>
      </p>
      {浮着的.副 ? <p className="sess-hover-sub">{浮着的.副}</p> : null}
      {浮着的.详情 && 浮着的.详情.length > 0 ? (
        <ul className="sess-hover-details">
          {浮着的.详情.map((行, i) => (
            <li key={i}>
              {详情图(行.图)}
              <span>{行.文}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

