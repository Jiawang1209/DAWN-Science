# DeepSeek Harness（dsh）Web GUI：对话过程中「界面怎么告诉用户正在发生什么」

根目录：`/Users/liuyue/Desktop/Github_repos/code_learn_from_github/deepseek-harness-master/packages/client/`（下文路径都相对于它）。只读，没改动。

总体印象：dsh 的反馈体系靠一套小而统一的原语撑起来，分别是 **`StateDot`（五态点）+ `TextShimmer`（文字扫光）+ `DisclosureRow`（可折叠行）+ `Toast`**。每一处状态都**配一段屏幕阅读器文案**（`role="status"` / visually-hidden）。它不做逐条消息的重试或编辑，把精力放在三件事上：「正在做什么」讲清楚，「在等你」讲清楚，「失败在哪一轮」钉在转录里。

---

## 1. 运行状态指示

### 发送 → 第一个 token 之间
- **本地回显气泡**：点发送的那一刻，`PendingSubmissionBubble` 就按最终用户气泡的样子渲染出草稿文字和图片预览（object URL），一直留到 Host 的持久 `user/message` 到来再被替换。只有一个不可见的标记 `data-submission-echo`（`ui-chat/src/client/chat/MessageItem.tsx:265-306`、`:189-192`）。**没有「发送中」的灰色态**，看起来和真消息一模一样。
- **转录尾部的全局运行条**：`RunningStatus`（`ui-chat/src/client/chat/RunningStatus.tsx:20-41`），在 `ChatView.tsx:280` 以 `{running && <RunningStatus …/>}` 挂在所有内容下面。组成是：一条分隔线、一个**鲸尾 APNG 动画**（`RunningWhaleTail.tsx`，在 `prefers-reduced-motion` 或 `forced-colors` 下退成静态 SVG，见 `ChatView.module.css:179-189`），再加一段扫光文字「**深度求索中，用时 12秒 ···**」（`locale.ts:89-90`）。计时器**每秒 tick 一次**（`message-chrome.ts:13` `LIVE_RUN_CLOCK_INTERVAL_MS = 1000`），组件用 `memo` 隔离，不会带着整条转录重渲。读屏只念一次「深度求索中」，**不念每秒的变化**（`RunningStatus.tsx:33`）。
- **没有流式 token 计数**，也**没有 spinner**。运行中只有一个「计时 + 品牌动画 + 扫光」。

### 工具 / 步骤在跑
- **分组标题是活的动词短语**：一段连续工具调用折成一个 process group，标题按当前活动实时切换，例如「准备读取文件 → 正在读取文件 → 正在运行命令 → 等待你的操作」（`locale.ts:8-34`；`ChatGroupSeat.tsx:108-110`）。组闭合后改成完成态摘要，取前三类拼起来，比如「已读取文件，执行了命令并修改了文件」（`step-process.ts` `processTitle`）。
- **防闪烁**：`useStableLiveProcessTitle` 保证每个标题至少停留 `PROCESS_TITLE_MINIMUM_MS = 150`ms（`ChatGroupSeat.tsx:27, 57-80`）。
- 在「详细」档下，标题后面还会拼上当前细节，例如文件名（`ChatGroupSeat.tsx:111-112`，`policy.liveProcessDetail`）。
- **单个工具行**（`ui-tool/src/client/tool/components/ToolRow.tsx`）的状态有 `preparing | running | ok | error | stopped` 几种。running 和 preparing 时整行 `TextShimmer` 扫光（`:177`、`DisclosureRow running`），preparing 时不可展开（`PreparingToolRow.tsx`）。每种状态都有隐藏文案「运行中 / 失败 / 已停止」（`:105-113, 357`）。**单个工具没有计时器**，耗时只在会话统计里汇总。
- 思考块 `ReasoningRow`：流式时摘要显示「最近一段已完成段落的首行」，同时扫光（`ReasoningRow.tsx:56-65`）。

### 完成之后
- **每轮一个可点的「过程」按钮**：`TurnProcessNodeView`（`TurnProcessNodeView.tsx:18-58`）。完成显示「**已完成，用时 1分23秒**」，数字单独套 class 做等宽；中止显示「已停止」，失败显示「处理失败」，这两种情况**不显示时长**（`:23-29`）。点它能折叠或展开这一轮的全部过程。已完成的轮次默认把过程收起来（`foldCompletedTurns`）。按钮上带 `data-turn-process-tool-calls` 和 `-subagents` 计数。
- **轮尾动作行**：`TurnTailNodeView` + `MessageIconActions`，依次是复制、插件动作（👍👎）、分支、**用量 pill**「用量 12.3K tok」和时钟。点用量 pill 弹出 dialog，列出提供方/模型、缓存命中率、未缓存输入、缓存读、缓存写、输出（含推理 token）（`TurnUsagePanel.tsx:31-110`）。用量 pill 只在设置「性能与用量 = 详细」时出现（`TurnTailNodeView.tsx:31, 73-75`）。**不显示费用（cost）**。
- **输入框下常驻统计**：`StatsPills`（`StatsPills.tsx:316-372`）挂在 composer dock 里。
  - 简洁档：`⏲ 42 tok/s` 和 `🗄 缓存命中 87%`。
  - 详细档：「12 轮 48 步 · 42 tok/s」，点开是模型用时、工具调用用时、**平均首 token（TTFT）**、TPS（`:137-233`）；另有一个 Token 用量 pill。两个 dialog 互斥，打开一个另一个就关（`:321`）。
- **上下文仪表**：`ContextMeter` 是一个 14px 圆环加百分比，点开后分成系统提示词、工具定义、对话消息三段着色（`ui-conversation/src/client/skeleton/ContextMeter.tsx:1-5, 90-145`）。provider 没报容量时**什么都不画**。

## 2. 停止 / 中止 / 排队 / 插话

- **发送键在运行中变成停止键**：composer 为空时，主按钮换成圆角方块停止图标，tooltip 带快捷键（`InputBar.tsx:303-316, 476-489`）。一旦**输入框里有字**，主按钮又变回发送，文案按设置变成「**排队发送**」或「**插话发送**」（`:309-312`，`locales.ts:28-31`）。子 agent 会话则是停止键独立一颗，发送键照常（`:460-474`）。
- **Esc 连按两次停止**：`StopSequence` 要求 500ms 内（`shortcuts/src/config.ts:12`）在**同一会话、同一轮、同一焦点区**按两次 Esc 才会取消（`ui-conversation/src/client/stop-sequence.ts:38-51`；`stop-shortcut.ts:31-40`）。有 IME 组字、有修饰键、在终端区、有模态框时都不生效。停止**保留队列**（`stop-shortcut.ts:15`）。
- **Enter 的语义可以配**：`resolveSubmitMode`（`input/submission-policy.ts:30-39`）。运行中按 Enter 走用户偏好（queue 或 steer），Cmd/Ctrl+Enter 走另一种。输入框为空但有排队消息时，占位符提示「**Cmd/Ctrl+Enter 插话发送全部排队消息**」（`locales.ts:25`；`InputBar.tsx:155, 351`）。
- **排队条 `QueueDock`**：「N 条排队消息」默认折叠；只有 1 条时直接显示。每条可以编辑（仅纯文本）、删除、单条插话。编辑或删除时**如果它已经开始发送，会失败并用 toast 说「这条消息可能已经开始发送」**（`queue/QueueDock.tsx:179-215`，`locales.ts:354-368`）。
- **待入的插话**：`PendingSteeringBubble` 用和用户气泡相同的视觉，加 `data-pending-steering` 表示「已提交、尚未被模型吸收」（`MessageItem.tsx:241-262`）。
- **中止之后**：轮过程按钮显示「已停止」且不显示时长；被中止的工具行 summary 变**琥珀色**（`ToolRow.tsx:180-183, 233`）；中止时冻结下来的半截回复**没有 messageId，所以不出复制/分支/反馈等动作**（`TurnTailNodeView.tsx:50-55`）；中止或失败的轮次，其过程组**强制展开**（`ChatGroupSeat.tsx:146-147`）。

## 3. 错误

- **模型重试（可恢复）**：`ModelRetryItem` 是转录里的一条 `<details>` 行，文字形如「正在重试模型请求（2/5）· 8s」，**250ms 刷新一次倒计时**并扫光；展开能看到重试延迟 ms 和失败原因（`MessageItem.tsx:61-127`；`locale.ts:157-162`）。无限重试时分母显示「∞」。倒计时以**本浏览器首次渲染的时刻**为锚点，避开 Host 与浏览器的时钟差（`:66-68`）。
- **轮级终止错误**：`TurnErrorItem` 是**红点 + 标题「本轮运行失败」+ 人话原因 + 等宽错误码**，`role="status"`，钉在出错的那一轮（`MessageItem.tsx:130-144`）。`failureMessage` 把 auth、quota、signedOut 等错误码翻成产品文案。
- **输出截断**：`TurnMaxTokensItem` 是琥珀点加「已达到输出 token 上限——回答被截断，已有输出保留……发送“继续”可让模型接着输出」（`:147-159`；`locale.ts:169-170`），**直接告诉你下一步怎么做**。
- **额度耗尽**：做成全局 Toast，由 `QuotaNoticeHost` 在 `shell.overlay` 层持有，离开对话面板也不会丢（`QuotaNoticeHost.tsx:1-27`）。
- **发送失败**：用 composer 的 Toast，**草稿保留在输入机里**，用户可以直接重发（`InputBar.tsx:87-110`）。
- **工具错误**：行 summary 换成**结果的第一行错误**并变红，展开后 OUT 区域 `data-error`（`ToolRow.tsx:180-184, 331`）。
- **断线 / 重连**：`ConnectionIndicator`（`ui-primitives/src/ConnectionIndicator.tsx`）是一颗**胶囊按钮**，挂在侧栏底部设置入口那一行（`ui-settings-general/src/client/SettingsRoot.tsx:205-240`）。共三态：
  - 断开：「连接异常，点击立即重连」，琥珀色，点一下立刻重连；
  - 连接中：「重新连接中」后面跟逐个出现的三个点，**至少显示 800ms 防闪烁**（`SettingsRoot.tsx:29, 179-195`）；
  - 恢复：绿勾「连接成功」停 2 秒后淡出（150ms），见 `:26, 160-177`。
  底层是指数退避，离线时暂停重试，网络恢复就重置退避（`connection/src/client/connection.ts:73-172`）。**不是顶部横幅**，是一颗小而明确、可以点的胶囊。
- **历史加载失败**：转录顶部一行「历史加载失败：{message}（{code}）」（`ChatView.tsx:243-246`）。

响度排序：Toast（最响，但 3 秒后淡出）> 转录内红点行（持久）> 行内变色 > 侧栏点。

## 4. 审批与 agent 提问

- **都是「接管 composer」，不是弹窗，也不是转录里的卡片**。`ChatView.tsx:281-283` 的注释写明：审批和提问都接管输入区，转录里不再画占位卡，免得同一个等待画两遍。
- **审批 `ApprovalPanel`**（`ui-approval/src/client/ApprovalPanel.tsx`）：顶部一条「琥珀点 + 等待审批」，正文是原因（缺省为「工具 X 请求越权执行」）加工具提供的详情，比如命令本身。按钮只有两个：「拒绝」「允许一次」。**键盘：焦点在面板内时 Enter = 允许一次，Esc = 拒绝**，并严格排除 IME 组字、长按重复和修饰键（`:46-58`）。点下之后点变成 ongoing 转圈、按钮禁用、`aria-busy`；提交失败会回滚成可再点（`:36-45, 66`）。
- **提问 `QuestionComposer`**（`ui-user-questions/src/client/QuestionComposer.tsx`）：多题分页（上一题/下一题），每题可以跳过、填自定义答案，选项带「推荐」徽标（从 label 后缀 `(推荐)` 解析，`:36-42`）。**超时倒计时是亮点**：「**30 秒后继续工作**」旁边一颗「**慢慢回答**」按钮，按了就变成「会一直等你回答」；用户开始编辑时自动暂停，显示「已暂停 · 剩余 N 秒」；超时之后 agent 继续跑，卡片改成「已继续工作，仍可回答」（`:446-463`；`locales.ts:10-14`）。倒计时归载体所有，**关掉面板也不停**，可以从工具行重新打开（`:226-229`）。面板能最小化成标题条，让上面的对话可读（`:231-232`）。
- **计划审阅 `PlanReviewPanel`**：「计划待审」加三个按钮「同意执行 / 要求修改 / 拒绝」（`locales.ts:32-35`）。
- 回答过的提问在转录里留一行 `QuestionReplyView`，可以展开看问答（`reply.*` 文案）。

## 5. 逐条消息的操作

- **复制**：点完图标换成对勾 1 秒，期间重复点击无效（`MessageIconActions.tsx:53-76`）。
- **分支（fork）**：「在新对话中分支」。只有已完成轮次的最后一条消息可以分支；不可用时**保持可聚焦**，tooltip 解释原因，没有用原生 disabled（原生 disabled 收不到 hover）（`:91-109`；`MessageIconActions.module.css:94-100`）。
- **👍👎**（`ui-message-feedback/src/client/MessageFeedbackActions.tsx`）：点击打开反馈对话框，里面有 7 个分类 chip 和详情文本框，并提示「提交内容会包括当前对话的日志」（`locales.ts:9-19`）。已记录的评分显示实心图标，再点一次撤回。反馈数据**在首次 hover 或 focus 时才懒加载**（`:30-36`）。失败原因写在按钮旁边（`role="status"`）。反馈只写日志，**不进模型上下文**（`docs/subsystems/feedback.zh.md`）。
- **时间戳**：用户消息的时钟在图标前，助手消息的在图标后；按日历日自动切换「HH:mm / M月D日 / Y年M月D日」（`message-chrome.ts` `formatMessageClock`，`locale.ts:196-197`）。
- **没有**重试/重新生成，也**没有**编辑后重发（全仓 grep `regenerate|resend|rewind` 在对话 UI 里没有命中）。
- 显隐：只有**最后一轮、以正文收尾**的动作行常驻，其余 hover 或 focus-within 时才出现（opacity 80ms）；**没有 hover 的设备全部常驻**（`TurnTailNodeView.tsx:60`；`MessageIconActions.module.css:40-56`）。

## 6. 会话层面的状态

- **侧栏会话行的五态点**（`ui-workspace/src/client/rows/Rows.tsx:346-396`），优先级是 **等待交互 > 运行中 > 子 agent 在跑 > 完成未读 > 空闲**：
  - 待审批 / 计划待审 / 待回答：琥珀点，**行尾的更新时间换成「待审批」这类短字**（`trailingLabel`）；
  - 运行中：转圈；「N 个子智能体运行中」可以和主状态叠加；
  - **完成未读**：绿点。`completionUnread` 的规则是「非当前主视图的会话由运行转为停止」时置位，一旦成为主视图就清掉（`ui-session/src/client/index.ts:483-511`）。
  - hover 卡片列出全部状态文字（`Rows.tsx:425-460`）。
- **后台任务 `JobListAction`**（`ui-jobs/src/client/JobListAction.tsx`）放在会话头部：「转圈点 + 2 个后台任务运行中 ⌄」。弹层分「进行中 / 已结束 N / 清空」，每条有状态点、时长、进度或结束原因，**可以展开看实时终端输出**。**停止要按两下**：第一下变成带字的「确认停止」胶囊，3 秒不确认就自动撤销；失败提示保留 4 秒（`:52-56, 169-174, 241-282, 419-446`）。
- **Todo**：`TodoPanel` 停在 composer 上方，默认折叠，标题摘要形如「3 已完成 · 1 进行中 · 2 待处理」，数量为 0 的段省略；展开后每项一个 StateDot（`skeleton/TodoPanel.tsx:50-97`）。
- **Goal**：`GoalBar` 同样停在 composer 上方，显示阶段（active / 已解除 / paused / blocked）、截断后的目标、恢复/编辑/清除。操作失败时显示「message (code)」（`ui-goal/src/client/GoalBar.tsx:1-80`）。
- **Workflow run**：阶段和成员带状态点。**运行中或异常时自动展开，干净完成后自动收起**（`ui-workflow-run/src/client/WorkflowRunPanel.tsx:72-125`）。
- **轮次导航 rail**：`TurnNavigator`，「跳转到第 N 轮」。

## 7. Toast / 通知 / 空态 / 加载

- **Toast**（`ui-primitives/src/Toast.tsx:46-60`）：顶部居中，可以锚在 composer 卡片上方居中；从上方 6px 滑入，停留 3 秒，再用 1 秒淡出。**停留时长由调用方按内容长短决定**，并通过同一个 CSS 变量同时驱动计时器和淡出，保证两者不会不一致。支持像句子一样接在后面的内联动作（「或 撤销」）。同一条文案重复出现时用 seq 作 key 重启计时。
- **系统通知**：只在桌面端**下载好更新**时发，macOS 弹 dock、Windows 闪任务栏（`apps/desktop/src/update-attention.ts`）。**任务完成不发系统通知**，只靠侧栏的「完成未读」绿点。
- **空态**：hero 是品牌鱼加「探索未至之境」，旁边有「选择工作区」按钮（`skeleton/EmptyHero.tsx:128-155`）；没有工作区时，composer 本身就是选择器的触发器（`InputBar.tsx:147-151`）。
- **加载**：**没有骨架屏**，只有文字「载入历史…」和「加载更早」按钮（`ChatView.tsx:243-252`）。离开底部时出现一颗「回到底部」圆钮（`:287-297`）。

## 8. 微反馈

- **扫光 `TextShimmer`**：文字被复制成一层 inert、裁剪过的装饰层，动画只作用在这一层，**原文仍可选中、可读屏**。动画是 1.5s、`steps(48)`、无限循环；`prefers-reduced-motion` 下关闭（`ui-primitives/src/TextShimmer.module.css:41-86`）。嵌套时共用外层的 active 状态。
- **StateDot 的转圈**挂载时把 `animation.startTime = 0`，**所有转圈同相**，不会各转各的（`StateDot.tsx:11-23`）。
- **按钮**：hover 和 `:active` 分别用 `interactive-bg-hover` / `-active` token，工具栏另有一套 token（`Button.module.css:41-68`）。全仓约 190 处 `:focus-visible`，统一写 `outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color)`，offset 3px。程序代为聚焦的元素标 `data-dsh-automatic-focus`，**不显示焦点环**（`ui-theme/src/styles/base.css:29-32`）。
- **hover 揭示不占布局**：工具行的 Inspect 按钮靠 opacity 100ms 出现，`:focus-visible` 也能让它出现（`ToolRow.module.css:124-165`）。diff 的 +/- 统计平时是灰的，**hover 或展开时才上红绿色**（`:71-75`）。
- 连接胶囊有入场 keyframe，三个点依次出现；reduced-motion 下关闭（`ConnectionIndicator.module.css:17-116`）。

## 9. 值得抄的

1. **「过程按钮」**：一轮结束后，所有过程折成一行「已完成，用时 1分23秒 ⌄」，停止或失败时文案替换掉时长。
2. **活标题 150ms 最短停留**：动词短语切换不闪。
3. **问题倒计时加「慢慢回答」**：agent 不会被一个问题无限卡住，用户也能一键说「等我」；超时后仍然可以回答。
4. **危险操作按两下确认，第一下变成带字的胶囊**（不是只换颜色），3 秒自动撤销。停止任务就是这么做的。
5. **重连胶囊**：断开态本身就是按钮；连接中至少显示 800ms；恢复后绿勾停 2 秒。
6. **状态优先级**：等交互 > 运行 > 完成未读 > 空闲。等交互时行尾时间直接换成「待审批」这类字。
7. **不可用的按钮保持可聚焦**，用 tooltip 讲原因，不用原生 disabled。
8. **截断和错误都给出下一步**：「发送“继续”可让模型接着输出」；错误码用等宽字体附在人话后面。
9. **动作行只在最后一轮常驻**，其余 hover 才出现；触屏设备全部常驻。
10. **读屏纪律**：计时每秒 tick 但只播报一次，所有颜色信号都配隐藏文字。
11. **统计分两档**：简洁档只给 tok/s 和缓存命中率，详细档给轮/步、TTFT、分段用时、分桶 token。
