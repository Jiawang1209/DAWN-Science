/**
 * 补上**丢掉的那一下 `mouseup`**（2026-09-08 作者报的第 ③ 条）。
 *
 * 作者的话：*「有时候我鼠标不在 DAWN 了，分析的新内容竟然不往下弹，
 * 我需要点击之后才会弹到最新内容。」*
 *
 * ## 根因在依赖里，而它是一个模块级全局
 *
 * `use-stick-to-bottom@1.1.6`（贴底跟随，坐在它上面的是对话区）开头就是这几行：
 *
 * ```js
 * let mouseDown = false
 * document.addEventListener("mousedown", () => { mouseDown = true })
 * document.addEventListener("mouseup",   () => { mouseDown = false })
 * document.addEventListener("click",     () => { mouseDown = false })
 * ```
 *
 * 它的用途是善意的：**人正在划词时不要把视线拽走**。判据是
 * 「鼠标按着 + 转录里有选区」。
 *
 * 问题在于**那两下是会丢的**：
 *
 *   - 右键弹出系统菜单——菜单吃掉了 `mouseup`；
 *   - 按住之后拖到窗口外面松手，或者按着的时候切走应用；
 *   - HTML5 拖拽（拖完根本不发 `mouseup`）。
 *
 * 丢掉之后 `mouseDown` 永远是 true。只要转录里还留着一个选区（在正文上点一下就有），
 * `isSelecting()` 就恒为真，而贴底动画每一帧都问它一次：
 *
 * ```js
 * if (isSelecting()) return next()   // 空转，一直不滚
 * ```
 *
 * 于是新内容长出来、视图不动；**下一次点击**把标志清掉，那个还在空转的动画立刻跑完——
 * 这就是作者看到的「点一下才弹到最新」。1.1.6 是上游最新版，没有修过这条。
 *
 * ## 我们的处置：只在**能证明没有按键**的时刻，补发一次 `mouseup`
 *
 * 拿不到那个模块变量，但它听的是 `document`——补发一次事件就能把它掰回来。
 * 四个时刻，每一个都是「按着」这件事已经确定为假：
 *
 *   1. `mousemove` 且 `e.buttons === 0`——**浏览器直接告诉你一个键都没按**；
 *   2. 窗口 `blur`——应用都不在前台了，这个窗口里不可能还在拖选；
 *   3. `contextmenu` 之后的下一拍——右键菜单正是吃掉 `mouseup` 的那一个；
 *   4. `dragend` / `drop`——拖拽结束不补发 `mouseup`。
 *
 * **只有我们自己看见过一次没配对的 `mousedown` 才补**，否则什么也不做：
 * 平白往 document 上撒事件是另一种病。
 *
 * 补发的事件 `bubbles: false`：那个库的监听器直接挂在 `document` 上，够用了；
 * 不冒泡就不会滑进别人的处理器里。（本仓库此刻没有任何一处听 document 的
 * `mouseup` / `click`——菜单收起来听的都是 `mousedown` / `pointerdown`。）
 *
 * 判据是量出来的：`e2e/stick-to-bottom.spec.ts` 里，修之前新内容到达后离底 228px，
 * 修之后 < 20px；而**人真的按着鼠标划词时仍然不许抢视线**，那是同一个文件里的第二条。
 */

let 有一次没配对的按下 = false

function 记下按下(): void {
  有一次没配对的按下 = true
}

function 记下抬起(): void {
  有一次没配对的按下 = false
}

/** 补发一次 `mouseup`。**没见过没配对的按下就什么都不做** */
function 补一下(): void {
  if (!有一次没配对的按下) return
  有一次没配对的按下 = false
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: false }))
}

/**
 * 装上。返回卸载函数（给测试用；应用里装上就不摘）。
 *
 * 全部用**捕获阶段**：我们只是在旁边记账，不该受别人 `stopPropagation` 的影响。
 */
export function 装上补丢掉的抬起(): () => void {
  const 动了 = (e: MouseEvent) => {
    if (e.buttons === 0) 补一下()
  }
  const 右键了 = () => {
    // 系统菜单是在这一拍之后弹的：等下一拍再补，免得把「真的还按着」误判成松开
    setTimeout(补一下, 0)
  }
  document.addEventListener("mousedown", 记下按下, true)
  document.addEventListener("mouseup", 记下抬起, true)
  document.addEventListener("click", 记下抬起, true)
  document.addEventListener("mousemove", 动了, true)
  document.addEventListener("contextmenu", 右键了, true)
  document.addEventListener("dragend", 补一下, true)
  document.addEventListener("drop", 补一下, true)
  window.addEventListener("blur", 补一下)
  return () => {
    document.removeEventListener("mousedown", 记下按下, true)
    document.removeEventListener("mouseup", 记下抬起, true)
    document.removeEventListener("click", 记下抬起, true)
    document.removeEventListener("mousemove", 动了, true)
    document.removeEventListener("contextmenu", 右键了, true)
    document.removeEventListener("dragend", 补一下, true)
    document.removeEventListener("drop", 补一下, true)
    window.removeEventListener("blur", 补一下)
    有一次没配对的按下 = false
  }
}
