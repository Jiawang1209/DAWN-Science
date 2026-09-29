# DAWN Science 对话界面现状（只读盘点，2026-09-29，分支 learn-deepseek-harness）

路径都相对仓库根 `/Users/liuyue/Desktop/Github_repos/dawn-science`。只写代码实际在做的事。

---

## A. 响应速度

### A1. 从 runtime 到渲染进程的传输

- **后端累积，推整条。** 中枢 `src/workbench/events.ts` 把 pi 的文本/思考增量累积成一条 `turn`（如 `thinking` 分支 `:619-647`，把旧的 `thinking` 加上 `event.delta` 拼起来），然后 `putItem`（`:1169`）→ `bump`（`:1177`）：revision +1、**每条更新都用 zod `SessionUpdateSchema.parse` 校验一次**（`:1193`），再同步回调给所有监听者（`:1215`）。
- **主进程这边不攒批。** `src/electron/main.ts:493-496`：`workbench.events.onUpdate` 每来一条就 `win.webContents.send(IPC_EVENT_CHANNEL, event)`。同一条 IPC 通道还承载远端状态、服务器名单、更新进度、「点通知回到那段」四种载荷（`:502-535`、`:710`），渲染进程按形状分派。preload 只暴露单向 `onEvent`（`src/electron/preload.ts:122`）。
- **协议形状**：`src/protocol/events.ts:642-686` 是 `item`（按 id 覆盖的整条）/ `dropItem` / `bytes` / `state` / `cwd` / `team` / `kernels` / `queued` / `subagent` / `snapshot` 的判别联合；信封带 `revision`，从 1 起。
- **渲染进程再校验一次 + 跳号自愈**：`src/ui/client.ts:247-275` 再做一次 `SessionUpdateSchema.safeParse`，检查协议版本；`revision !== prev+1` 时不交付这一条，改走 `onResync`→`resyncSession`（`src/ui/state/sync.ts:229-267`，重新 `subscribeSession` 取整份快照、用 `guard()` 丢弃过期结果）。
- **分派**：`src/ui/App.tsx:640-735`。`final` 时把不在看的会话标未读、重拉会话列表、退订后台会话（`:643-664`）；按 sessionId 分三条线：底部终端（`:667-676`）、坞里的侧边对话槽（`:682-695`）、主槽（`:699-729`）。
- 结果：**每个增量都会把「到目前为止的整段文字」经 IPC 发一遍、并在两端各做一次 zod 校验**——长回复的传输量随长度平方增长。主进程与后端都没有节流，唯一的节流在渲染进程（见下）。

### A2. 流式块怎么落进状态

- 状态库是 nanostores。转录住在一个「槽」工厂里：`src/ui/state/transcript-slot.ts:38`，主区与坞各一个实例（`transcript.ts:28`，`side-chat.ts`）。
- **33ms 合并**（`perf-render` 第 1 步）：`upsertItem`（`transcript-slot.ts:112-131`）只合并一种更新——已在列表里、`final:false` 的 agent 发言，存进 `攒着的` Map，`setTimeout(flush, 33)`（`:36`、`:113-117`）。其他任何更新（新条目、`final`、工具、`dropItem`、快照）先同步 `flush()` 再立即落，保证顺序与最后一个字不晚到（`:119`、`:135`）。快照/换会话直接丢掉攒着的（`:87-96`）。
- **只换一条、引用不变**：`next[i] = item`，其余元素身份不变；内容相同直接不写（`identity.ts` 的 `shallowEqual`，`:18-38`；`transcript-slot.ts:78,127`）。
- **壳不订阅 `$items`**：`App` 只读派生布尔 `$回合进行中`（`transcript.ts:47-49`，`App.tsx:779`）和 `$说过话`（`:74`）；笔记本 cell 清单是结构不变就复用同一个数组的 computed（`:83-91`）。`design-contract` 里有一条扫描禁止 `App.tsx` 出现 `useStore($items)`（spec `2026-09-22-回复时不卡-design.md` §四）。`ConversationView` 自己订阅（`views.tsx:4095-4096`）。

### A3. 流式期间的 markdown

- `src/ui/markdown.tsx:136-175`：`Streamdown`，`mode={streaming ? "streaming" : "static"}`、`parseIncompleteMarkdown`（半截代码围栏不吞后文）、`animated={false}`（「动效跟随状态」）。行内 `strong/em/a` 换回真 HTML 标签（`:54-84`），代码块与表格留给 streamdown（shiki 高亮 + 复制/下载）。本地 `渲染兜底` 错误边界，高亮懒加载分片取不到时退回 `<pre>` 原文（`:111-134`）。
- **没做**：流式中不高亮代码、`useDeferredValue` 包正文——spec 第 4 步列过，量完认为 JS 已不是瓶颈，没做（spec §七）。用户与 agent 两边都走 markdown（`views.tsx:6144-6149`，用户那条带 `className="text"`）。

### A4. memo

- `TranscriptRow = memo(TranscriptRowImpl, 行props相同)`（`views.tsx:5802-5833`）：逐键比身份，只有 `generated`（产物）与 `cases`（案例卡）按内容比。行回调走「稳定引用 + ref 取最新」（`行回调最新` `:4485`，`行回调 = useMemo` `:4531`）。
- `ToolGroupRow`（`:6821`）、`SessionUsage`（`:3775`，只比轮数/工具起止/usage，不看正文）、`TurnNavigator`（`turn-navigator.tsx:31`，只比用户轮的 id 与文字）、`SubagentList`（`subagent-pane.tsx:182`）都 memo。
- 结果（spec §七、§八）：30 轮历史时每次提交重跑 425 → 36 个组件；4× CPU 降速下 31 轮 10 → 45 帧/秒（中位数，三遍 43/45/89）。

### A5. 窗口化（最近 40 块）

- `src/ui/transcript-budget.ts:12` `默认转录预算 = 40`，单位是「转录块」（一条发言 / 一次工具 / 一组折叠工具），不是轮。
- `views.tsx:4553-4557`：`分组转录(items)`（`useMemo`，items 每变一次就重算整份）→ 只 `slice` 最后 `预算` 块；换会话重置。顶上常驻一行「更早的 N 条没有显示」+「显示更早的 40 条 /全部显示」（`:4791-4804`）。刻度尺或全文搜索点到预算外时先放进预算再滚（`确保可见`，`:4590-4610`）。
- **没用虚拟列表**（理由：与贴底滚动打架）。`content-visibility: auto` 试过、没上（11 轮时反而 83→62 帧，且行内浮层没有 portal，包含块会变）。

### A6. 贴底滚动

- `use-stick-to-bottom`：`<StickToBottom className="turns" resize="smooth" initial="smooth">`（`views.tsx:4771`）。贴底时跟随，用户上滚即撒手。全文搜索跳转前 `stopScroll()`（`:4573-4610`）。
- `.turns` 用 `overflow: clip`，只让库造的那层滚，避免两层滚动容器（`styles.css:819-842`，09-16 修的「大片空白」）。
- 「回到底部」浮标：`back-to-bottom.tsx:64-126`。`ResizeObserver` 看 content 高度，撒手后内容变高就从「回到底部」变成「有新内容」；底部居中的带字药丸（`.stick-pill`，`styles.css:7442-7456`，`shadow-float`）。贴回底即隐藏。

### A7. 输入框隔离

- `src/ui/composer-field.tsx`：**非受控 textarea**，DOM 是文字真身；只在外部真的换了内容（换会话、插入 `@`、发送后清空）且与框里不同时才写 DOM；组词期间一个字都不写，`compositionend` 主动冲一次（文件头 `:1-33`）。起因是 IME「只能打出 zh」。
- **但输入卡本身仍在 `ConversationView` 里**：`<form className="composer">` 与转录同一个组件（`views.tsx:4899` 起），所以流式时 composer 这一片跟着 33ms 一次重渲染；spec §五 明写「量了再看要不要把转录列表再拆出去」，目前没拆。

### A8. 乐观反馈

- **输入框乐观清空、失败还回去**：`views.tsx:5025-5046` 先清草稿/附图、`设等回话(items.length)` 立刻起「在等」记号，然后异步落盘附件、发送；失败把原话放回框、原因写在框下（`发送出错`，`:5441`）。
- **用户气泡不是本地乐观插入**：渲染进程里没有自己 upsert 用户那条；它是后端 `userTurn`（`events.ts:398-414`）推回来的 `u{n}` 条目。所以「字出现在转录里」要走一次 IPC 往返，在这之前屏幕上只有等待记号。

### A9. 启动与分包

- `main.tsx` 静态 import `App` 与全部 `styles.css`；`src/ui` 里没有 `React.lazy`。唯一的动态 import 是终端的 xterm（`terminal.tsx:81-84`）和 streamdown 内部的高亮/mermaid 分片。
- 现存构建产物 `dist/ui/assets/`：`index-*.js` 约 1.40 MB、`index-*.css` 约 166 KB、xterm 约 331 KB，其余是小分片。`App.tsx` 5947 行、`views.tsx` 7745 行、`styles.css` 7792 行，单包。

### A10. 已知仍在的性能问题

1. IPC 每个增量推整条累积文本，主/渲染两端各 zod 校验一次，无主进程侧节流（A1）。
2. 33ms 节流下仍约 113 次提交/回复（30 轮、1×），其中 shiki 高亮异步回来的提交约 41 次、空提交约 20 次，没动（spec §八「仍然留着的」）。
3. 31 轮 + 4× 帧率很飘（43–89）；剩下的是浏览器对整页长文的样式/布局。
4. `ConversationView`（含 composer）每次落字仍整体重跑；`分组转录`、`案例表`、`有回音了(items.slice(...))`、`在压缩(items)` 等每次 items 变化全量扫一遍。
5. 计时器：`useTick` 每秒 `setInterval`（`views.tsx:6596-6605`），等待记号、思考块（仅在想时）、在跑的工具行各自一个。
6. 无代码分割，单个 1.4 MB 主包。

---

## B. 对话样式

### B1. 布局与身份

- 内容列宽 `--dawn-thread-max-w: clamp(784px, 70cqi, 1200px)`（`tokens.css:374`），挂在 `.turns-inner`（`styles.css:873-876`）上，所以工具行、提示也被管住。
- 条与条之间 `margin-bottom: var(--dawn-space-10)`（40px，`styles.css:877-891`）。
- **用户**：靠右（`.turn.user` flex column `align-items:flex-end`，`:1887`），气泡最宽 82%、`padding 8px 12px`、圆角 `1rem 1rem 0`（右下角 0，有方向）、底色 `--dawn-surface-sidebar`（与侧栏同色）（`:1905-1911`）；名字标签 `.sr-only`（读屏可读）。动作行靠右，不撑宽气泡（`:3736-3741`）。
- **agent**：通栏正文，不套气泡（DESIGN.md「对话的三块可见形态」①）；顶上一行头像（名字首字母的圆，`.who-avatar` 1.5rem，`styles.css:3962`）+ 半粗名字（`.turn .who`，`:932`）。名字按这一轮的 `item.by`，换过模型的历史不被改写（`views.tsx:6071-6085`）。
- 新消息进场：只有最后一条 `.turn` 播 260ms、4px 上移淡入（`styles.css:903-930`），减弱动效时只淡入。

### B2. 排版

- 字体：系统无衬线（`-apple-system, PingFang SC, Segoe UI…`）、等宽 `ui-monospace, SF Mono, Menlo…`（`tokens.css:386-387`）。
- 对话正文 15px / 行高 26.25px（`:401`、`:410`），界面 13px（`:388`），元信息 12px、标题 18px、display 22px（`:466-470`）。
- markdown：段落间 12px，h1–h4 映射到 fs-title / fs-sub / ui / chat（`styles.css:1529-1546`）；列表标记用 text-3；行内 code 填充底 + 小圆角（`:1568-1574`）。

### B3. 代码块

- 按 streamdown 的 `data-streamdown` 属性挂样式，不挂 Tailwind 类（streamdown 输出的 Tailwind 类在本项目无效）：外框 `surface-panel` 底 + `radius-md` + `corner-shape: superellipse(1.5)` + `shadow-md`（`styles.css:1579-1586`）；28px 头部左语言名右动作（`:1594-1618`）；表格的复制/下载/全屏按钮按 `table-wrapper` 重排（`:1625` 起）。

### B4. 工具调用行

- 单条 `.tool`：12px、左侧 2px 发丝线、`padding 6px 10px`（`styles.css:1126-1132`），失败时线变 danger 红。整行是折叠开关；折叠时显示 `tool-peek`（入参/命令摘要），右边耗时（「已跑 Ns」随秒走）+ 状态字（`views.tsx:6639-6790`）。状态标记 `…` / `✓` / `✗`，被停下是 `■ 已中断`，不算失败（`:6565-6571`）。
- **默认折叠，报错默认展开**（组里的不自己弹开），长结果按行折叠并说明藏了多少行（`foldResult`，`:6878`）。
- **连续 ≥2 条工具折成一行**（`tool-group.ts` `分组转录`）：汇总「运行了 N 条命令 / 调用了 N 次工具」、失败数（只在汇总里标红，线不变红）、总耗时、在跑那条的摘要（`views.tsx:6821-6876`，`styles.css:1138-1161`）。

### B5. 思考

- `ThinkingBlock`（`views.tsx:3703-3740`）在气泡之上：一行「[Ns] 思考中 / 想了一下」，秒数放在等宽小方块里（`.thought-secs`，`styles.css:3801-3810`），默认收起，点开是左发丝线 + 淡色 0.9em 的预格式文本（`:3811-3818`）。只有思考没有正文的条目不画气泡（`.turn.thought-only`）。
- 还没说完的发言气泡末尾有三点跳动的 `Thinking`（`views.tsx:6194`，`styles.css:3209-3245`，减弱动效时改为透明度呼吸）。

### B6. 令牌、主题、阴影、动效

- 颜色全走 `--dawn-*` 令牌（两层：`--theme-*` 原料 → `--dawn-*` 语义），主题色默认 `#10a37f`，可在外观里换（`tokens.css:74-78`）；明暗两套，暗色覆写在 `:651` 起。
- 视觉重做（09-10）补的：阴影分档 `sm / md / lg / float`（`tokens.css:524-557`，多层 color-mix 低透明）、浮层 `stroke-float` 描边；**毛玻璃只给浮层**，且有 `@supports not (backdrop-filter)` 回退（`:750`）。
- 动效一条曲线 `cubic-bezier(0.22,1,0.36,1)`，时长 120 / 180 / 260ms（`:440-443`）。DESIGN.md「动效跟随状态，永不延迟状态」。

---

## C. 反馈

### C1. 发送到第一个字之间

- 按下发送即起 `等着` 记号（`views.tsx:3751-3765`）：放在转录末尾（`:4885`），`Loader` + 从按下那刻起算的秒数；模型开始思考后文案换成「模型正在思考」，不撤。
- 收起判据 `有回音了`（`transcript.ts:59-68`）：agent 说出字、内核吐一条输出，或一条 `failed` 的 notice；思考块和工具调用不算。按停止/Esc 时显式收起，并用 `喊停过` 挡住从转录推导回来（`views.tsx:5331-5335`、`:5562-5566`）。

### C2. 运行中的指示

- 发言未完：气泡末尾三点；思考中：秒数在走。
- 工具：在跑那条「…」+ 三点 + 「已跑 Ns」；工具组汇总行也显示在跑那条。
- 侧栏：在跑的会话行首圆点变 `--dawn-live`，时间那格换成「跑着」（`views.tsx:595-598`，`styles.css:4924`）；不在看的会话说完了打未读点（`App.tsx:645`，`.sess-unread`）；会话页签、坞里对话头同样有 running 点（`styles.css:6922`、`:7504`）。

### C3. 停止 / 调整方向 / 排队

- 发送键三态（`views.tsx:5533-5580`）：忙且框里有字 → 「排到后面」；忙且框空 → 「停止」；否则 → 发送。忙且有字时框下明写一行「回车排到这一轮后面 · Cmd/Ctrl+回车调整方向」（`:5453-5457`）。
- 回车 = `followUp`（排队），Cmd/Ctrl+回车 = `redirect`（只有 native 支持 `canRedirect`），判据在 `:5021-5022`，经 `writeToSession` 的 `behavior` 送出（`App.tsx:1976-2010`）。
- 待发条 `queued-strip.tsx`：「待发 · N」，每条「排队中」标签 + 「调整方向 / 到坞里问 / 取回」（`:52-70`），调整方向那次请求没回来时整条置灰。
- 停止走 `abortSession`，还排着的话退回输入框（`App.tsx:3862-3870`）；被停下的工具标「已中断」。

### C4. 错误

- 本轮失败：后端推一条 `failed` 的 notice，渲染成 `.caveat`（warning 色，`views.tsx:5923`，`styles.css:770`），同时收起等待记号。
- 发送失败：原话放回框里，框下 `⚠ 原因`（`views.tsx:5441`）。
- 全局非致命问题：`note()` 追加到 `$notes`（去重、限条数，`state/connection.ts:60-64`），画在底部状态栏的一串 `.hint`（`App.tsx:5939`）。协议不合、跳号处理失败也走这里（`client.ts:249,254,274`）。
- 工具失败无原因时明写「这次调用失败了，但没有给出原因」。markdown 渲染塌了退回原文并写一句。

### C5. 权限（三档）

- 附栏右侧 `PermissionPill`（`permission-pill.tsx`）：由低到高「自动拦截 / 请求批准 / 完全访问权限」，上拉菜单附每档说明与「也作为以后新会话的默认」，底部灰字写边界（不是沙箱、硬拒清单任何档都拒）。
- 「请求批准」档时 native 发的 `permission_request` 与 ACP 共用一张卡：`.perm-card` 挂在**输入框上方**而非转录里（`views.tsx:5405-5431`），按钮文案原样用 agent 给的 option 名（allow 类是 primary），另有「这一轮先不做」。

### C6. 每条消息的操作

- `final` 后才出，常驻不靠悬停（`views.tsx:6226-6272`）：复制（两边都有）；自己那句多「修改」（铅笔，编辑态原地改，发送是在末尾新说一句）和带字的「回到这句之前」（忙时置灰并用 `aria-description` 说原因，`:6250-6263`）；行尾是这一轮的 token 用量（`TurnUsage`）。
- agent 那条下方还可能有：产物条 `GENERATED · N`（`GeneratedStrip`）、案例卡片、首条网址的网页预览卡（仅 `final` 后）。
- 回退确认框逐文件列出 agent 动过的文件、内核不会回退的那句用 `.caveat`（`rewind.tsx`）。
- 压缩在转录里是一条 `CompactionRow`：正在压 / 压完（说明上面的记录都在、模型读的是摘要，可展开看摘要）/ 失败 / 停下（`compaction-row.tsx`）。

### C7. 上下文仪表

- `context-meter.tsx`：附栏常驻，16px 圆环 + 「上下文 N%」；到自动压缩线的 85% 变 warn（「快满了」），过线变 over（`:62`、`:208`）。点开是弹层：真数、估算那截、自动压缩线刻度、「现在压缩」，以及 `/compact` 提示。不轮询：换会话 / 回合结束 / 压缩结束 / 打开弹层各取一次；还没有回复时写「—」；外部 agent 写「读不到」。

### C8. 桌面通知

- 判断在 `src/workbench/desktop-notify.ts`（弹不弹、弹什么、角标几）：做完（认 runtime `idle`，不认每次 `final`）/ 出错（只认 `failed` notice）/ 等你点头；缺省全开，前台时默认静音（`quietWhenFocused`）。
- 出口唯一在 `src/electron/desktop-notify.ts`：Electron `Notification`；macOS/Linux `setBadgeCount` = 还没看的段数，Windows 改为 `flashFrame`，回到窗口就停（`:78-87`）。点通知走 `openSession` 推送 → 渲染进程去拉 `takePendingOpenSession` 回到那段（`App.tsx:~735`）。压缩、回退、子 agent 不弹。
