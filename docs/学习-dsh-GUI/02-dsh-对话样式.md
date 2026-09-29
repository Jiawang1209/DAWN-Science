# DeepSeek Harness（dsh）对话视图的视觉风格

仓库根：`/Users/liuyue/Desktop/Github_repos/code_learn_from_github/deepseek-harness-master`，下文 `P/` 指 `packages/client/`。

**先说总体印象**：这是一套「Figma 驱动、像素精确」的界面。CSS 注释里到处是 figma 节点号（如 `figma 43:32997`），几乎每个数值都写了理由。整体走**极简、文字优先**的路线：助手回复没有气泡，工具调用做成一行 24px 的灰字，边框一律用 0.5px 发丝线。强调色只有一个 DeepSeek 蓝，而且只出现在发送键、链接、"深度求索中"状态和光标上。

**关于截图**：仓库里没有对话界面的截图。`docs/user/guide/*.png` 只有 provider 设置页，`snapshots/` 下是测试用的红色方块，`website/` 里也没有图片。可以看的只有 onboarding 插画 `P/ui-settings-account/src/client/assets/onboarding-*.png` 和运行动画用的 `P/ui-chat/src/client/chat/running-whale@2x.png`。因此以下结论全部来自读 CSS 和 TSX。

---

## 1. 一轮对话的布局

**用户消息用气泡，靠右**（`P/ui-chat/src/client/chat/MessageItem.module.css:3-40`）：
```css
.userRow   { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
.userStack { max-width: min(calc(var(--dsh-chat-content-width, 748px) * 0.702), 82%); }
.bubble    { background: var(--dsw-specific-bubble);   /* 浅色 deepseek-50 淡蓝 / 深色 bluish-850 */
             border-radius: var(--dsw-radius-xl);       /* 20px */
             padding: 10px 16px; font-size:14px; line-height:22px; white-space:pre-wrap; }
```
- 气泡最大宽度 = 列宽 × 0.702（Figma 原稿是 525/748），所以列宽被拖宽时气泡也跟着变宽。单行气泡正好 42px 高（22 + 10×2）。
- 气泡下面是附件卡：240×64，0.5px 边框，20px 圆角，右对齐（`:312-332`）。
- 用户消息下的操作行（复制、时间等）只对**最后一条**用户消息常驻，更早的 hover 才显示（`MessageIconActions.module.css`，用 `:has(~ [data-chat-flow-kind='user'])` 判断"后面还有用户消息"，opacity 80ms）。

**助手消息没有气泡、没有头像，占满整列正文**（`AssistantMarkdown.module.css:9-21`）：14px/24px，块之间 `gap:16px`。回复结束后，操作图标行放在正文下方 `margin-top:16px; margin-left:-6px`，-6px 是为了和 28px 的点击热区做光学对齐（`:74-78`）。被中断的回复末尾贴一个 11px 的灰色小标签「已停止」（`:63-71`）。

**列宽**（`P/ui-conversation/src/client/skeleton/ConversationRoot.module.css:384-389`）：
```css
--dsh-chat-content-width: var(--dsh-chat-user-width,
   clamp(680px, calc(var(--dsh-conversation-column-width) * 0.64), 920px));
--dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px);
```
列宽是自适应的 680–920px（约占容器 64%），两侧有可拖动的手柄，用户可以手动改宽。输入卡比消息列宽 32px，两者居中在同一根轴上。

**纵向节奏**（`ChatView.module.css:68-95`）用一个变量 `--dsh-chat-flow-gap` 统一控制：
- 过程行（思考、工具）之间 **6px**；
- 助手正文与相邻内容之间 **12px**；
- 轮头（turn-process，"已完成，用时 12s"那一行）与上下内容之间 **16px**。

只有兄弟元素之间加 margin；隐藏的和空的 seat 不占间距（`:not([hidden]):not(:empty)` 选择器链）。

**宽表格溢出**：4 列及以上的 markdown 表格会冲出 748px 的消息列，铺满整个滚动区，但表格内容的起始 x 仍和正文对齐（`AssistantMarkdown.module.css:33-43`，用 `100cqw` 容器查询实现）。这是个很讲究的细节。

## 2. 字体与 Markdown

- 字体栈（`P/ui-theme/src/styles/base.css:7-11`）：系统 UI 字体（-apple-system / Segoe UI / PingFang SC / 微软雅黑）；代码字体 `'SF Mono','JetBrains Mono','Fira Code',Consolas…`，**有意不以裸 `monospace` 结尾**，避免 Windows 中文回落到宋体。品牌字 Montserrat 只用于 wordmark。
- **一根字号轴**（`gradient-shadow-text.css:52-58`）：设置里可以调正文字号（10–22px，默认 14）。所有尺寸都写成 `calc(Npx + var(--dsh-content-font-delta))`，行高、图标盒、行高度一起平移。次级字号是「正文 −1（≤14 时）/ 正文 −2（更大时）」，默认 13px，用于思考、工具行和各种标题。
- Markdown 字阶整体按 16→14 的 0.875 比例缩小（`:59-60` 注释）：h1 21/30、h2 19/28、h3 18/26，都是 700 字重；h4 14/24 600；正文 14/24；行内代码 12/19；代码块 11/19。
- 元素样式（`P/ui-primitives/src/markdown/MarkdownText.module.css`）：
  - 段落 `margin:16px 0`；h1–h3 `margin:32px 0 16px`；h4 以下 16px。
  - 列表 `padding-left:18px`，`li + li` 间距 6px，列表符号用 secondary 色。
  - `hr` 是 0.5px 发丝线，上下 32px。`blockquote` 左侧 2px caption 色竖线，缩进 14px。
  - 行内代码：`0.875em`，淡底色 + `0.5px solid border-l1`，8px 圆角，`padding:0 5px`。
  - 链接：DeepSeek 蓝，500 字重，**平时无下划线**，hover 才出现 `underline dotted`，偏移 3px。
  - 表格：无竖线；表头下方 0.5px `border-l3`，行下方 0.5px `border-l2`；单元格 `10px 16px`，首列左 padding 为 0（和正文左缘对齐）；列宽 100–320px。
  - 流式渲染用增量解析（`markdown/incremental.ts`）：只冻结前面已稳定的块，重新解析尾部，没有打字光标。
- **代码块外观**（`markdown/CodeBlock.module.css`）：16px 圆角，底色 `markdown-code-block`（浅色 bluish-50 / 深色 bluish-900），无边框。顶部 banner `padding:9px 14px`，11/18 字，左边显示语言名（mono），右边是**纯文字「复制」按钮**，点击后变成「已复制」（`CodeBlock.tsx:203-204`），没有图标。banner 是 `position:sticky; top:0`，长代码滚动时标题栏和复制按钮一直可见（`:24-31`）。`pre` 默认 `pre-wrap` 自动折行，padding 16px。
- 语法高亮用 **shiki**（`markdown/highlight.ts:21-26`）：同步 core + JS 正则引擎，ts/bash/json 启动时就加载，python/go 等语言动态 import；主题是 `createCssVariablesTheme`，颜色全部走 `--shiki-token-*` 变量，明暗两套（`ui-theme/src/styles/shiki.css`），配色接近 Open Color：keyword `#d6336c`、string `#2f9e44`、function `#6741d9`。

## 3. 工具调用

**单个工具 = 一行 24px 的灰字，不是卡片**（`P/ui-tool/src/client/tool/components/ToolRow.module.css:1-43`，共用 `P/ui-primitives/src/DisclosureRow.module.css`）：
```
[16px 图标盒 · 14px 字形] 6 [标题 13/24] 8 [2×2 圆点] 8 [摘要 FILL, 省略号截断]
```
- 静止时整行是 tertiary 色，hover 变 secondary（`color 100ms ease`），**没有背景、没有边框、没有选中框**（`ChatView.module.css:107-108` 的注释："tool rows match Think chrome (no selected ring)"）。
- **hover 时图标换成箭头**：业务图标 opacity 变 0，同一位置叠着的 chevron 变 1（`DisclosureRow.module.css:63-83`）。整行都能点击展开，不用单独的箭头列。
- 状态表达：运行中时摘要文字带扫光（TextShimmer，见 §6），失败时摘要换成错误首行、显示红色（`.errorSummary`），中断时显示警告色（`.stoppedSummary`）。**单个工具行上不显示耗时**，耗时只在整轮和 trajectory 里出现。
- 文件路径做成链接：dotted 下划线，宽度只到文字结束处，行的空白部分仍然是展开按钮（`:84-104`）。
- **diff 统计**：`+12 −3` 用 mono 字体、比次级字号小 2px、加 0.5px 下沉做基线校正；**只在 hover 或展开时显示红绿色**，平时是灰色（`:64-77`）。
- 展开后的正文（`:117-308`）：
  - 通用工具用 **IN/OUT 卡**：一张代码底色的圆角卡，左侧是 sticky 的 `IN`/`OUT` 小标签（caption 色）。IN、OUT 两段分别设 `max-height:150px`、各自滚动，中间一条 0.5px 分隔线。
  - shell 用 TerminalBlock（`P/ui-primitives/src/TerminalBlock.module.css`）：左侧留 30px 槽放运行状态点，banner 里是 `cwd` 和命令，banner 下方有分隔线，输出区最高 224px，支持 ANSI 着色（`ansi.ts`）。
  - 编辑用 DiffBlock（`DiffBlock.module.css`）：每行前面加 `+ `/`- ` 前缀，加删行有淡红/淡绿底，并在左侧画 **3px 内阴影色条**（`box-shadow: inset 3px 0 0 …`）。被省略的上下文显示为可点击展开的 tertiary 行。
  - 另外还有 Read（带行号的窗口）、Search（按文件分组的匹配）、Web（引用列表）、Image 各自一种 block。
  - 展开后 hover 时左下角浮出一个 11px 的「Inspect」胶囊，点击跳到 trajectory 里对应的记录。它的行高是预留的，出现时布局不跳（`:122-150`）。
- **连续工具自动分组**（`P/ui-chat/src/client/conversation-nodes/process-groups.ts:131-181` + `ChatGroupSeat.tsx/.module.css`）：
  - 一轮里相邻的思考和工具被收进一个「过程组」，遇到助手正文或用户消息就截断。
  - 组标题同样是一行灰字，由活动类别拼成句子，例如「已读取文件并搜索代码」「读取文件，搜索代码，修改了文件等」（`step-process.ts`，最多取前三类；zh 文案在 `locale.ts:35-52`）。
  - 运行中标题是现在进行时加实时细节：「正在运行命令 · npm test」；标题至少停留 150ms 才切换，防止闪烁（`ChatGroupSeat.tsx:27` `PROCESS_TITLE_MINIMUM_MS`）。
  - 组展开后内容区 `max-height:min(400px,50vh)` 内部滚动，上下缘有 24px 渐隐遮罩（`.fadeTop/.fadeBottom`，`ChatGroupSeat.module.css:86-117`）。
- **整轮折叠**（`TurnProcessNodeView.tsx` + `.module.css`）：一轮结束后，顶部出现一行「已完成，用时 1m 12s ⌄」，33px 高，底部有 0.5px 发丝线，数字用 mono + tabular-nums。点一下就把这轮所有过程行收起，只留最终回复。失败或中断时这一行显示「处理失败」或「已停止」。
- **四档「工作步骤展示」**（`P/ui-chat/src/client/presentation-policy.ts:24-53`）：简洁 / 标准 / 详细 / 完全展开。一张策略表决定四件事：是否折叠已完成的轮、分组对全部还是仅历史轮生效、组标题是否带实时细节、思考是否显示首行预览。渲染器只读策略字段，不比较模式枚举。

## 4. 思考（reasoning）

`P/ui-chat/src/client/chat/ReasoningRow.tsx` + `.module.css`：
- 默认折叠成一行 24px：`[思考图标] 思考 · <首行摘要>`，和工具行是同一套 DisclosureRow 外观。
- **流式预览的节奏**：流式时摘要显示**最近一个已完成段落的首行**（`latestCompletedParagraphFirstLine`），只在段落完成时推进，所以不会逐字抖动。摘要右端用 48px 的 `mask-image` 渐隐（`.summary[data-streaming]`，`:59-61`），文字上再叠 shimmer 扫光。
- 首行摘要会去掉 `**`。
- 展开后正文用 `variant="compact"` 的 markdown：13/20、tertiary 色，标题不放大只加粗，左缩进 22px 对齐标题文字。展开时标题行 sticky 置顶，便于收起（`:17-22`）。
- **没有逐块的「已思考 Xs」**：计时放在整轮的「已完成，用时 Xs」上。运行中列底部有一行蓝色的「深度求索中，用时 23s ···」，配一个鲸鱼尾巴 mask 动画和 shimmer（`RunningStatus.tsx`；`ChatView.module.css:116-193`）。它前面有一条 0.5px 分隔线，只在上一行是输出（而不是用户输入）时出现（`:129-134`，`:nth-last-child(2 of …)`）。

## 5. Trajectory（轨迹）是什么

`P/ui-trajectory/README.zh.md`：它是对话视图环里和 Chat **并列的第二个视图（标签页）**，面向调试和审计。
- 主体是一张**按轮次组织的事件记录表**（`TrajectoryTable.tsx`，3500 行）。每一行是一条 user / assistant / tool / 子工具 / compaction 记录，标出轮次和步骤边界。选中某行会在检查器里显示 token 用量、耗时、TTFT、吞吐、输入输出（JSON 树）和图片附件。
- 顶部固定一条 **Chrome Network 面板风格的时间概览**（`TrajectoryTimeline.tsx:1`）：按真实开始时间和耗时画横条，助手条区分 TTFT 段和解码段。支持拖选时间区间来过滤表格，滚轮缩放，右键平移，hover 500ms 显示精确时刻。
- Chat 和 Trajectory 读同一个事件窗口，但各有自己的 Definition，互不影响（`docs/subsystems/conversation.md` 的「Data model」一节）。Chat 工具行上的「Inspect」胶囊就是跳到这里。
- 流式时跟随尾部，向上滚动就暂停跟随；进行中的记录只画开始标记，「不虚构耗时」。

## 6. 令牌、主题、密度、边框与动效

- **三层令牌**（`P/ui-theme/src/styles/design-platform.css`）：`--dsw-static-*`（原色阶，含 `neutral-bluish-*` 带蓝的灰和 `deepseek-50…900` 品牌蓝）→ `--dsw-alias-*`（语义层：`label-primary/secondary/tertiary/caption`、`bg-base`、`border-l1…l4`、`interactive-bg-hover`、`state-*`、`file-diff-*`）→ `--dsw-specific-*`（组件层：`bubble`、`input-major`、`selector`）。
- **暗色模式**：切换 `body[data-ds-dark-theme]` 属性，覆盖同名变量（`:285+`）。
  - 浅色：`bg-base` = 白；正文 `#0F1115`；次级 bluish-700；三级 bluish-600。
  - 深色：底 `rgb(21,21,23)`；正文 bluish-50。
- **四级透明描边**：浅色 `border-l1..l4` = 黑色 4% / 10% / 12% / 16%，深色 = 白色 6% / 12% / 16% / 20%（`:178-181`，`:211-214`）。几乎所有线条都是 **0.5px** 发丝线。
- **边框为主，阴影为辅**：elevation 是「描边 + 投影」三件套，其中 **0.5px 描边画在 box-shadow 里**（`0 0 0 0.5px var(--dsw-elevation-stroke-color)`），不占布局（`gradient-shadow-text.css:17-44`）。分三档：panel、prominent、soft，投影透明度都只有 2–5%。深色下投影几乎看不见，靠描边来分层。只有浮层（输入卡、回到底部按钮、菜单）用 elevation；消息和工具行完全平面。菜单用 `backdrop-filter: blur(40px) saturate(150%)`。
- **圆角阶梯**（`base.css:16-21`）：xs 4 / sm 8 / md 12 / lg 16 / xl 20 / panel 28。对应关系：气泡、附件卡 20；代码块、IN/OUT 卡、终端 16；行内代码、按钮 hover 底 8；输入卡 28。
- **superellipse 圆角**（`corner-shape.css`）：`@supports` 时全局 `corner-shape: superellipse(1.5)`，效果介于圆弧和 squircle 之间。胶囊和圆形元素显式写 `corner-shape: round` 来退出，并且有测试强制检查这种配对。
- **动效**：`--ds-ease-in-out: cubic-bezier(0.4,0,0.2,1)`，时长 0.1 / 0.2 / 0.3s（`base.css:12-15`）。实际用到的几乎都是 **100ms 的颜色或透明度过渡**，chevron 旋转 100–120ms，没有位移或弹性动画。所有动效都有 `prefers-reduced-motion` 分支。
- **Shimmer 扫光**（`P/ui-primitives/src/TextShimmer.module.css`）：在文字上叠一层同样的文字，用 105° 的线性渐变 mask 平移扫过。周期 1.5s，延迟 0.3s，`steps(48)`（逐帧跳而不是连续插值，更省重绘）。两层反向 transform，保证字形不错位。
- **密度**：过程行 24px，行间距 6px；次级文字 13px；图标 14px 放在 16px 盒子里。整体偏紧凑，但正文行高 24/14 = 1.71，比较疏朗。
- **状态点**（`StateDot.module.css`）：10px 占位里画 6px 实心点（done 绿、warning 黄、error 红、idle 灰）。进行中换成细环加旋转弧，1.5s 同周期。

## 7. 输入框（Composer）

`P/ui-conversation/src/client/skeleton/InputBar.module.css` + `InputBar.tsx`：
- 一张**28px 大圆角的浮起卡片**：`background: specific-input-major`（浅色白 / 深色 bluish-850），`box-shadow: var(--dsw-elevation-soft)`，描边颜色重绑为 l2，`border:0`。卡片最大宽度 = 消息列宽 + 32px。
- 编辑器是 Lexical contenteditable（不是 textarea）：`padding:4px 8px 0 14px`，最小高 36px（空态 hero 下 52px），光标色为品牌蓝，最多 14 行后内部滚动。占位符用 caption 色，单行加省略号；hero 态下最多 2 行。
- **底栏**（`.row`，`padding:2px 8px 6px`，两端对齐，按容器宽度换行）：
  - 左侧：28px 圆形「＋」（`specific-selector` 底色），然后是权限 / plan 等 mode 胶囊，间距 12px（容器窄于 560px 时改为 8px）。
  - 右侧：模型选择器（透明底，13/20，500 字重，secondary 色，12px 下箭头用 data-URI SVG 画成背景图，hover 时出现 8px 圆角底）加发送键。容器窄时模型选择器只显示图标（`data-model-compact`）。
  - **发送键**：34px 圆形，`button-info-fill`（浅色 deepseek-500 `#4176E6` / 深色 deepseek-400），白色箭头，`translateY(-2px)` 做光学上提，空内容时 opacity 0.4。运行中且输入为空时，同一颗按钮变成「停止」；有草稿时是「发送（插队 / 排队）」，停止键另外单独出现（`InputBar.tsx:294-316`，`:461-485`）。
- 附件、@ 引用、斜杠菜单、队列坞都是 slot（`conversation.input.attachments`、`.overlay`、`.left/.right/.model` 等）。
- 输入区上方有**固定 36px 的渐隐带**：消息从 bg-base 的 0% 渐变到 100%，淡出到输入卡下面（`ConversationRoot.module.css:441-452`）。用 px 而不是百分比，所以草稿变高时渐隐带不会被拉伸。
- 上方可以停靠 dock（队列、计划等）；卡下方有 StatsPills 状态胶囊：12px、tertiary、tabular-nums，点击弹出面板（`StatsPills.module.css`）。
- 右侧有一条**轮次导航轨**（`TurnNavigator.module.css`）：28px 宽，竖向居中在「视口减去输入区」的范围内，每轮一个刻度，hover 显示预览，轨道两端有渐隐。
- 「回到底部」是 34px 圆形浮钮，用 elevation-panel 阴影，位置跟随输入区的实时高度（`ChatView.module.css:222-271`）。

## 8. 品牌规范

`BRAND_GUIDELINES.zh.md` **只讲商标使用**（衍生项目建议叫「DSH」，不要直接用 "DeepSeek Harness"，不要造成官方背书的误解），**不涉及任何视觉规范**。视觉上的「品牌」只体现在这几处：
- 单一品牌蓝 `deepseek-500 rgb(65,118,230)`，只用在发送键、链接、光标、焦点环和运行状态；
- `ui-brand-official`（只有 19 行的 Brand.tsx）提供 wordmark 和鱼形 logo；
- 运行态文案「深度求索中」配鲸鱼尾巴动画，是唯一带品牌趣味的地方，颜色是蓝和深蓝的 `color-mix`（`design-platform.css:215-216`）。

## 9. 值得学的地方

1. **正文字号只有一根轴**：所有尺寸写成 `calc(Npx + var(--dsh-content-font-delta))`，次级字号由公式派生。用户调字号时图标、行高、热区一起缩放，不会有某一处没跟上。
2. **过程降级为「一行灰字」，hover 才揭示**：工具和思考行没有底色和边框，hover 从 tertiary 变 secondary，图标换成 chevron。视觉重心全部留给最终回复。完成的轮再用一行「已完成，用时 X」整体收起。
3. **把工具按类别写成一句自然语言**，比如「已读取文件并搜索代码」，而不是显示「5 tool calls」。运行中切成现在进行时加实时细节，并设 150ms 的最短停留防闪。
4. **四档展示策略表**：用数据驱动，渲染器只读字段不比较枚举，以后加一档只需要改表。
5. **流式思考按段落推进，右端渐隐加 shimmer**：既能看出在动，又不会逐字跳。
6. **颜色只在需要时出现**：diff 的 `+/-` 统计 hover 或展开才上红绿，平时是灰的。
7. **0.5px 发丝线 + 画在 box-shadow 里的描边**：不占布局，深色下靠描边分层；阴影透明度压在 2–5%。
8. **sticky 的代码块 banner**、**IN/OUT 两段各自滚动**、**Inspect 胶囊预留行高、出现时不跳**，都是「长内容不迷路、布局不抖」的具体做法。
9. **输入框上方的固定 px 渐隐带**，以及**宽表格冲出消息列但内容起点对齐**。
10. **superellipse 圆角加测试强制的 round 配对**，以及 **`steps(48)` 的 shimmer**：细节上很讲究。
11. **Chat 和 Trajectory 双视图**：Chat 保持干净，完整的计时和参数都放进 Trajectory 的时间线和表格，两者通过 Inspect 互跳。
