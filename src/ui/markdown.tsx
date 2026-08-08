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
import { Streamdown, type Components } from "streamdown"

/**
 * 把语义标签换回真的 HTML 标签。
 *
 * **只覆盖行内语义那几个**，代码块与表格留给 streamdown——
 * 它在那里做了 shiki 高亮与复制/下载控件，那是我们选它的理由。
 */
const components: Components = {
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  // 外链在桌面应用里点开应当去系统浏览器，而不是把 Electron 窗口导航走。
  // rel 是必须的：noopener 防止被打开的页面拿到 window.opener
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
}

export function AgentMarkdown({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className="md">
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
    </div>
  )
}
