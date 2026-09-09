/**
 * 「回到底部」浮标（2026-09-08，规格 `2026-09-08-回到底部浮标-design.md`）。
 *
 * 作者报的是：*「分析的内容不更新，需要我手动往下挪动。」*
 * 同一天已经修掉一条真根因（丢掉的 `mouseup`，见 `mouse-stuck.ts`），
 * 但那句话里还剩一半没被回答——**跟随撒手之后没有出路**。
 *
 * 这个库撒手本身是对的：你主动上滚了，就不该被下一个 token 弹回底部。
 * 缺的是「撒手了」这件事**看得见**、并且**一键回得去**。
 * 「看不见的能力等于不存在」——2026-08-10 一天之内为这条栽过两次。
 */
import { useEffect, useRef, useState } from "react"
import { useStickToBottomContext } from "use-stick-to-bottom"
import { Button } from "./primitives.js"
import { 下箭头图标 } from "./icons.js"
import { t } from "./i18n/index.js"

/**
 * 这一刻该说什么。**返回值就是那句话**——两个可见状态的差别只有文案，
 * 那就让判据直接把文案给出来，别在组件里再翻译一次。
 *
 * **贴着底就什么都不画**：跟随好好的时候不该有东西挡着。
 */
export function 该说什么(贴底: boolean, 长过: boolean): "不画" | "回到底部" | "有新内容" {
  if (贴底) return "不画"
  return 长过 ? "有新内容" : "回到底部"
}

/**
 * 两句话的字面量**必须留在源码里**：`i18n.test.ts` 那条扫描是按字面量找调用点的，
 * 把中文原文写成变量传进翻译函数，英文表里这两条就会被判成「谁也不用的孤儿」
 * （2026-09-09 当场撞到）。这也是 `enhance.tsx` 里 `档名` 那张表的写法。
 *
 * （顺带记一件事实：那条扫描**也没抹注释**——上面这段话里但凡出现一次字面的
 * 翻译调用，它就会把它当成真调用点。与 `design-contract` 里裸 button 那条同一类，
 * 区别是这一条只会假阳性、不会漏判，所以这次没顺手改它。）
 */
const 文案: Record<"回到底部" | "有新内容", () => string> = {
  回到底部: () => t("回到底部"),
  有新内容: () => t("有新内容"),
}

/**
 * 「底下长出新东西了」这个标志怎么变。
 *
 * **抽成纯函数**的理由与 `carryDraft` 同一条：它发生在一场竞态里，
 * 而规则本身是确定的，可以直接验。
 *
 * 三条：贴回底就清零；没贴底时内容长高就立起来；其余保持原样
 * （**不许自己熄灭**——熄灭了人就永远看不到「底下有东西」这件事）。
 */
export function 下一个长过(前: boolean, { 贴底, 长了 }: { 贴底: boolean; 长了: boolean }): boolean {
  if (贴底) return false
  return 前 || 长了
}

/**
 * 放在 `<StickToBottom>` 里、`<StickToBottom.Content>` **外面**。
 *
 * 那一层不滚（真正在滚的是 `.Content` 自己造的 `height:100%` 那个 div，
 * 2026-09-08 在真产物上量过），所以绝对定位的浮标不会跟着内容滚走。
 * 外层需要 `position: relative`——`.turns` 与 `.nb-cells` 各加了一句。
 */
export function 回到底部() {
  const { isAtBottom, scrollToBottom, contentRef } = useStickToBottomContext()
  const [长过, 设长过] = useState(false)

  /**
   * 「底下长出新东西了」**组件自己看得出来**，不用调用方传记号进来。
   *
   * 两条理由：① 流式回复时条数不变、内容却在长——传条数会漏掉最常见的那一种，
   * 而那正是作者报的场景；② 对话区与笔记本因此是同一份代码、零配置，
   * 不会各自算一遍「什么算新内容」然后算得不一样。
   *
   * `贴底ref` 而不是依赖数组：观察器只装一次，回调里要读的是**此刻**贴没贴底。
   */
  const 贴底ref = useRef(isAtBottom)
  贴底ref.current = isAtBottom
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    let 上次高 = el.getBoundingClientRect().height
    const ro = new ResizeObserver((条目们) => {
      const 高 = 条目们[0]?.contentRect.height ?? 上次高
      const 长了 = 高 > 上次高 + 0.5 // 半个像素的抖动不算「长出东西」
      上次高 = 高
      设长过((前) => 下一个长过(前, { 贴底: 贴底ref.current, 长了 }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [contentRef])

  // 贴回底部就清零（滚回去、或者跟随自己追上了都算）
  useEffect(() => {
    if (isAtBottom) 设长过(false)
  }, [isAtBottom])

  /**
   * **两个状态都带字**（2026-09-09 作者定的，换成设计里的方案一：底部居中的带字药丸）。
   *
   * 上一版是右下角一颗光秃秃的圆点。作者一句「这个按钮太丑了」——而它还有一处
   * 说不过去的地方：设计契约禁原生 `title`（无样式、约 500ms 系统延迟、与主题不符），
   * 于是那颗圆点悬停什么都不出，**只有读屏能知道它是干嘛的**。
   * 带上字之后这条代价整个消失：**可见文字就是它的可访问名**，不需要 `aria-label`。
   *
   * 几何（高度、内距、全圆角）住在 `size="pill"` 里；`stick-pill` 只管
   * 「浮在哪儿」和「浮起来的那层面」。
   */
  const 说 = 该说什么(isAtBottom, 长过)
  if (说 === "不画") return null

  return (
    <Button
      variant="secondary"
      size="pill"
      className={`stick-pill${说 === "有新内容" ? " has-new" : ""}`}
      onClick={() => {
        设长过(false)
        void scrollToBottom()
      }}
    >
      <下箭头图标 className="row-icon" />
      <span className="stick-pill-say">{文案[说]()}</span>
    </Button>
  )
}
