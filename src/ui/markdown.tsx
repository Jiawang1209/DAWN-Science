/**
 * agent 发言的 markdown 渲染。
 *
 * 此前是 `<pre>` 纯文本：**列表是星号、标题是井号、代码块是三个反引号**。
 * 对一个以「读代码、给方案」为主要输出的工具来说，等于把它最主要的形态废掉了。
 *
 * ## 为什么是 `streamdown` 而不是普通 markdown 渲染器
 *
 * 流式的难点不在渲染，在**中间态**。模型一个 token 一个 token 地吐，
 * 任意时刻都可能停在一个**未闭合的代码围栏**上。天真的实现会在那一帧把后面
 * 所有内容都吞进代码块，下一帧又吐出来——界面一跳一跳地闪。
 * `parseIncompleteMarkdown` 就是为这件事存在的。
 *
 * ## 实测发现：streamdown 是 Tailwind 优先的（按此修正了接法）
 *
 * 它默认把 `**粗体**` 渲染成 `<span class="font-semibold" data-streamdown="strong">`，
 * 而不是 `<strong>`。两个后果：
 *
 *   1. **可访问性退化** —— 读屏软件把 `<strong>` 念成强调，
 *      一个带 class 的 `span` 只是普通文本。语义标签不是装饰。
 *   2. 它发的是 **Tailwind 类名**（`space-y-4` / `font-semibold`），
 *      而本项目**没有 Tailwind**（那是个「坐在哪一层」的决策，不在计划里）。
 *      那些类名在我们这儿什么都不做。
 *
 * 所以这里用 `components` 把行内语义标签换回真的 HTML 标签，
 * 样式由 `styles.css` 里的 `.md` 一段用我们自己的令牌给。
 * **代码块留给 streamdown**——那里有 shiki 高亮，是我们要它的主要理由。
 *
 * ## 为什么不引入 `@assistant-ui/react`
 *
 * Hermes 的 transcript 建在它上面，但那是一个**「坐在哪一层」的决策**：
 * 它会决定整个对话区的形态，而 DAWN 的 transcript 要显示 Run 与来源，
 * 与通用聊天不同。我们只取下层三件可替换的叶子依赖
 * （`streamdown` / `shiki` / `use-stick-to-bottom`），
 * 放弃项是自己维护消息、工具调用、审批三类渲染器——**那正是我们本来就要自己定的东西**。
 */
import { Component, useMemo, type ErrorInfo, type ReactNode } from "react"
import { Streamdown, type Components } from "streamdown"
import { t } from "./i18n/index.js"
import { 像本机地址吗 } from "../policy/local-url.js"

/**
 * 把语义标签换回真的 HTML 标签。
 *
 * **只覆盖行内语义那几个**，代码块与表格留给 streamdown——
 * 它在那里做了 shiki 高亮与复制/下载控件，那是我们选它的理由。
 */
/**
 * 组件表是**按调用点造的**（批 2，2026-08-18）。
 *
 * 以前它是模块级常量。现在链接要认得「本机地址点了进坞」，
 * 而那个动作是调用点给的回调——闭包得进得来。
 */
function 造组件(onOpenLocal?: (url: string) => void): Components {
  return {
    strong: ({ children }) => <strong>{children}</strong>,
    em: ({ children }) => <em>{children}</em>,
    /**
     * **本机地址点了进坞，其余去系统浏览器。**
     *
     * 外链那一半：`target="_blank"` + 主进程的 `setWindowOpenHandler`
     * （批 0 补的）把它交给系统浏览器。`rel` 是必须的——
     * `noopener` 防止被打开的页面拿到 `window.opener`。
     *
     * 本机那一半是这一批新加的：**当场拦下**，交给坞里那一格。
     * 判据用的是 `policy/local-url.ts`，与主进程那道门**同一份规则**——
     * 各写一份的话，一条链接会在「界面说能开」与「主进程说不能」之间打架。
     */
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(e) => {
          if (!href || !onOpenLocal || !像本机地址吗(href)) return
          e.preventDefault()
          onOpenLocal(href)
        }}
      >
        {children}
      </a>
    ),
  }
}

/**
 * 渲染塌了就退回纯文本（2026-08-13，作者撞到的）。
 *
 * ## 它塌的是什么
 *
 * 作者的窗口整屏变成「界面崩溃了」，报错是
 * `Failed to fetch dynamically imported module: …/highlighted-body-…js`。
 *
 * `streamdown` 把**代码块的语法高亮做成懒加载分片**。那次的直接原因是
 * 开发时反复重建：每次 `npm run build` 都把 `dist/ui/assets/` 换成新哈希，
 * 而**开着的那个窗口引的还是旧文件名**——取不到，`lazy()` 抛，
 * 一路冒到顶层 `ErrorBoundary`，整屏没了。
 *
 * ## 但根子不是「开发时重建」
 *
 * **应用更新之后窗口没关，在真实世界里一样会撞上。** 而那时的代价是：
 * 一个代码块高亮不了 → **整个界面塌掉**。
 * 这两件事的严重程度差着好几个量级，不该被同一个边界接住。
 *
 * 所以这里放一道**局部**的边界：塌了就把原文照直印出来。
 * **内容一个字都不会少**——丢的只是配色。
 *
 * `getDerivedStateFromError` 之外还留 `componentDidCatch`：
 * **失败必须出声**（规格 7.5），控制台要留得下那条真正的报错。
 */
class 渲染兜底 extends Component<
  { text: string; children: ReactNode },
  { 塌了: boolean }
> {
  override state = { 塌了: false }

  static getDerivedStateFromError(): { 塌了: boolean } {
    return { 塌了: true }
  }

  override componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error("[markdown] 渲染失败，已退回纯文本：", err, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.塌了) return this.props.children
    return (
      <>
        <p className="caveat">{t("这段内容没能排版，下面是原文")}</p>
        <pre className="md-raw">{this.props.text}</pre>
      </>
    )
  }
}

export function AgentMarkdown({
  text,
  streaming,
  className,
  onOpenLocal,
}: {
  text: string
  streaming: boolean
  /**
   * 点到**本机地址**时交给它（批 2）。不给就退回老样子：
   * 所有链接一律去系统浏览器。
   */
  onOpenLocal?: (url: string) => void
  /**
   * 额外的类名，落在**同一个元素**上（2026-08-14）。
   *
   * 用户那条气泡要带 `.text`——包一层 `<div class="text">` 的话，
   * 量 `scrollHeight` 时会把里面段落的外边距算进去，
   * 而 `composer-history-copy` 那条判据正是按「占几行」量的。
   */
  className?: string
}) {
  const components = useMemo(() => 造组件(onOpenLocal), [onOpenLocal])
  return (
    <div className={className ? `md ${className}` : "md"}>
      <渲染兜底 text={text}>
      <Streamdown
        mode={streaming ? "streaming" : "static"}
        // **半截围栏不吞掉后文。** 没有它，流式过程中界面会一跳一跳
        parseIncompleteMarkdown
        // 动效会跟流式更新抢帧；DESIGN.md：动效跟随状态，永不延迟状态
        animated={false}
        components={components}
      >
        {text}
      </Streamdown>
      </渲染兜底>
    </div>
  )
}
