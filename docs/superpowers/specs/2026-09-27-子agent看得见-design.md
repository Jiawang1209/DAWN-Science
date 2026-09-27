# 子 agent 看得见：点一颗 chip，看它在干什么、交回了什么（学自 Codex / Claude 桌面版）

2026-09-27 · 分支 `agent-basics` · 实现计划 `plans/2026-09-27-子agent看得见.md`

> **作者 2026-09-27 已确认**：「需要作者定的」全部按推荐默认值走。

## 0. 需要作者定的

计划按每条的**推荐默认**往下写；作者改了哪条，计划里对应的 Task 跟着改（每条后面写了落在哪）。

| # | 问题 | 推荐默认 | 另一个选项 | 落在 |
|---|---|---|---|---|
| D1 | 子 agent 的过程画在哪 | **坞里新开一格「子 agent」**（§2.2 草图 A）：chip 一点，坞打开到这一格、显示那一个；同一批的几个在格顶一排切换 | 主转录里就地展开一个限高小窗（草图 B） | Task 9、10 |
| D2 | 关掉 DAWN 再开，还看得见吗 | **看得见**：子进程的 pi 会话文件落进会话目录 `subagents/<调用>/<序号>/`，重开后 chip 组从盘上重建、点开读会话文件。**这个功能之前跑过的**没有会话文件，点开如实说「那时没留下过程记录」 | 只在本次运行里看得见（重开后 chip 组照旧消失，与今天一样） | Task 3、5、8 |
| D3 | 跑完的子 agent 能不能接着问 | **能**，坞格底下一个输入框「接着问它」；**它的回答不回主 agent**（与侧边对话同一口径：旁边问，不改主线）。只对 `subagent` 工具派的；团队成员不给（团队有自己的邮箱，§3） | 不做（只看不问） | Task 4、6、8、9 |
| D4 | 团队成员那一轮的 chip 点了去哪 | **切到坞里「团队」那一格**——团队的真相（任务、邮箱、产出）已经在那儿了；成员一轮的逐步过程本轮不做 | 与 `subagent` 同等对待（成员轮也流过程） | Task 10 |
| D5 | chip 上要不要常驻一行「正在做什么」 | **要**：在跑的那颗 chip 后面跟一句最近的动作（`read README.md`、`bash pytest -q`），不点也知道它没卡住；跑完就收起 | 不要，一律点开才看 | Task 6、7、9 |

## 1. 要解决什么

子 agent 这条线**后端是好的**：`src/subagent/` 起独立进程、并发 4 个、超时与中止整组杀、22 份自带人设（spec `2026-08-22-子agent名册-design.md`）。
界面上却只有一排 chip（`SubagentChips`，`src/ui/views.tsx`）：名字、状态，点开**只有任务原文**。

- 在跑的时候：它读了哪些文件、跑了什么命令、卡在哪——**一个字都看不到**。
- 跑完之后：它交回了什么——得去翻主转录里那条折起来的 `subagent` 工具行，而且那是一整批拼在一起的文本。
- 关掉再开：chip 组整个没了（查实：`backend.ts` 的 `还原成条目` 只认 `text` / `tool`，`subagents` 条目不在 pi 的会话文件里）。

从人这边看，这个功能「没做」。**不变式 3「没有不可见的行动」在子 agent 这里只做到了账本那一层。**

### 1.1 查实的：子进程其实什么都有，是在两处被丢掉的

1. **子进程里**：`child-task.ts` 订阅 pi 事件，只留 `text_delta` 拼成一段 `text`，其余（工具开始 / 结束、思考、轮次）直接丢；stdout 上只写一条 `done`。
   `protocol.ts` 的注释早就写着「留着可辨识联合是为了下一片的进度行（界面的 chip 组要显示子 agent 正在调什么工具）」——**那一片一直没做**。
2. **父进程里**：`executor.ts` 把 stdout 攒成一整串，`close` 时才 `parseDone`；`SubagentProgress` 只有 `started` / `settled`。
3. **会话文件其实落盘了，但找不回来**：非成员模式下 `child.ts` 不给 `sessionManager`，pi 默认写进 `<agentDir>/sessions/--<cwd>--/*.jsonl`；
   而 `agentDirOf` 是 `join(spec.sessionDir, "subagents", String(i))`——**只按序号，不按哪一次调用**，第二次派子 agent 时序号 0 又写进同一个目录。
   文件在，对应关系没了。

团队成员（`src/team/`）走同一个子进程入口，成员模式下会话文件落在成员自己的 `sessionDir`、下一轮 `continueRecent` 续上——**「可续聊」就是这么做的**，本 spec 的 D3 照抄这条路，不另写一套。

## 2. 交互

### 2.1 主转录里：还是一排 chip，只多半行

```
agent：我派两个子 agent 分头看。
  子 agent 1/2
  (✓ data-auditor 完成)  (⏳ code-reviewer 运行中 · bash pytest -q)
```

- chip **点一下 = 在坞里打开它**（D1）。不再在主转录里展开任务全文——那是日志的开头。
- 在跑的那颗后面跟一句最近的动作（D5），**只一句、会被下一句替换**；跑完就没了。
- 失败原因照旧**不点也看得见**（`chip-error`，规格 7.5）。
- 主转录里**永远不画子 agent 的逐条过程**。这条可判定，进设计契约（§5）。

### 2.2 过程画在哪（D1）

**草图 A（推荐）：坞里一格「子 agent」**

```
┌ 面板：子 agent ─────────────────────────────────────── × ┐
│ 审阅 文件 产物 笔记本 概览 网页 团队 对话 [子 agent]            │
├──────────────────────────────────────────────────────────┤
│ 这一批 1/2   (✓ data-auditor)  [⏳ code-reviewer]              │ ← 同一次调用的几个，点了换
├──────────────────────────────────────────────────────────┤
│ ⏳ code-reviewer · 运行中                                     │
│ ▸ 任务（点开看全文）                                           │
├──────────────────────────────────────────────────────────┤
│ 你：审一下 analysis.py 的边界情况……   ← 交给它的任务，第一句    │
│ code-reviewer：我先读一下 analysis.py。                       │
│ ▸ read analysis.py                              ✓            │
│ ▸ bash  python -m pytest -q                     ⏳ 0:34       │
│ ……（与主区同一套行：工具行、折叠组、思考、用量）                │
├──────────────────────────────────────────────────────────┤
│ 交回主 agent 的结果                         （跑完才出现）     │
│   ……（原样，就是主 agent 拿到的那段；截断了说省了多少）        │
├──────────────────────────────────────────────────────────┤
│ [ 接着问它……                                   ] [接着问]    │ ← D3，只在跑完、非团队时
│ 它的回答不会回到主对话                                          │
└──────────────────────────────────────────────────────────┘
```

没选中任何一个时（直接点标签进来）：列出**这段对话派过的所有子 agent**（按调用分组，最新在上），点一个看；一个都没有就直说「这段对话还没派过子 agent」。

**草图 B：主转录里就地展开**

```
  (✓ data-auditor)  [⏳ code-reviewer]
  ┌ code-reviewer ─────────────────── 在坞里看 ┐
  │ ▸ read analysis.py                 ✓        │   限高 240px，内部滚动
  │ ▸ bash python -m pytest -q         ⏳       │
  └─────────────────────────────────────────────┘
```

**推荐 A 的理由**：
1. 主转录保持克制——Codex 的 chip 组要回答的正是「N 个并发子 agent 怎么显示才不淹掉对话」；B 点开四个就是四个滚动小窗叠在对话里。
2. 并发几个时要来回切，A 在格顶一排切，B 要在对话里上下找。
3. D3 要一个输入框，放进主转录就是第二个输入框，与主区那个长得一样——**两处长得一样的东西，等于没有判据**（CLAUDE.md）。
4. 先例：侧边对话已经把「第二段转录」放进坞里，行、折叠组、贴底跟随都是现成的。

代价：多一个坞标签（第九个）。标签条已经不宽；若作者嫌挤，D1 的备选是把「团队」「子 agent」合成一格——本轮不做。

### 2.3 接着问（D3）

- 只在：这个子 agent 已经跑完（完成或失败都行）、是 `subagent` 工具派的、盘上有它的会话文件。别的情形输入框不画，**在同一个位置写一句为什么**（「还在跑」「团队成员请在「团队」格里给它发消息」「这次没有留下会话文件，续不上」）——不画一个点了没反应的框。
- 发出去：这句作为「你」的一句进这一格的转录，起一个**新进程**、`continueRecent` 续它的会话文件（与团队成员下一轮同一条路；不变式 1：进程边界不变）。它用**主对话此刻的模型与凭证**；子 agent 定义被删或停用了 → 说清楚，不换人。
- **答复不回主 agent**。主转录一个字都不变，账本不记（它不是主 agent 的行动）。格底常驻一句「它的回答不会回到主对话」。
- 同一个子 agent 一次只能问一句；在答的时候输入框灰着。关掉主对话（停会话 / 删会话）时，正在答的那一轮整组杀掉，与团队成员同一条收尾。

### 2.4 重开之后（D2）

- 主转录从 pi 的会话文件重建时，每条 `subagent` 工具行后面按盘上的 `meta.json` **补回那一组 chip**（状态、失败原因都在）。
- 点开：先看内存里有没有（本次运行跑过的），没有就读盘——`transcript/` 里那份 pi 会话文件翻成转录，头信息与「交回的结果」读 `meta.json`。
- 这个功能上线之前跑的：没有 `meta.json`，chip 组补不回来（与今天一样）；有 `meta.json` 没有会话文件的（写盘失败）：点开如实说「这次没有留下过程记录」，结果照样给。

## 3. 哪些会话有

- **native 会话里 `subagent` 工具派的**：全有（过程、结果、重开、接着问）。
- **团队成员的轮**（chip 的 `toolCallId` 是 `team:<id>`）：chip 照旧；点了切到「团队」格（D4）。子进程同一个入口，过程行照样吐，父侧 `runner.ts` 不认得就跳过（它只认 `call` / `done`）。
- acp / cli / pty / 内核会话：没有 `subagent` 工具，不涉及。
- 远端会话：native agent 与子进程都在本机跑（工具经执行器落到远端），会话目录在本机——与本机会话同一条路。

## 4. 分层

依赖决策（规格 §4）：

① **坐在哪**：pi-coding-agent 的 `AgentSession.subscribe` 事件（子进程里）与 `SessionManager.create(cwd, dir)` / `SessionManager.continueRecent(cwd, dir)` / `SessionManager.open(path)`（落盘、续、读回）——
   这三个已经在 `child.ts` 成员模式与 `native.ts` 续接里用着，本轮不引入新的 pi 接口。
② **放弃了什么**：不在父进程里再起一个 pi 会话去「旁观」子进程（不变式 1：过程只经 stdout 出来，不共享任何东西）；不做「在坞里停掉单个在跑的子 agent」（那会改主 agent 拿到的工具结果，另议）；子 agent 的工具调用**不进账本**（会话文件就是它的记录；账本那一层照旧是 `subagent:<名字>` 一条 Run）。
③ **不变式挂在**：子进程 → 父进程只有一条 NDJSON（`protocol.ts` 是两边唯一的真相）；父侧把每一行翻成 `subagent_event` 进事件中枢，中枢为每个子 agent 开一段**子转录**（与会话同一套条目、同一套 revision），界面用同一套行去画。

### 4.1 子进程吐过程（`src/subagent/`）

- `protocol.ts`：子 → 父多一种行 `{ type: "event", event: 子事件 }`。`子事件` = `output` / `thinking` / `tool_start` / `tool_end` / `turn_end`，
  形状就是 `AgentEvent` 同名几种**去掉 `sessionId`**——父侧补上子转录的 id 就能原样喂给中枢，不另写一套归并。
  **用量本轮不吐**：native 的用量要从 pi 的消息状态里对账（`emitUsageIfNew`），搬进子进程是另一件事；这一格不画用量。
- 工具结果在子进程里就截：**16 KiB**，截了带 `truncated` 与原始 `bytes`（规格 7.5）。全文在它的会话文件里。
- 父 → 子的规格多一格 `transcript?: { dir, resume }`：给了就把 pi 会话落在 `dir`（`resume` 时续最近那份）。成员模式的 `member.sessionDir` 走同一段代码。
- `runChildTask` 多一个 `onEvent`；`done` 的语义一个字不改（`output` 仍是所有文字拼起来，chain 的 `{previous}` 不变）。

### 4.2 父侧（执行器、工具、运行时）

- `executor.ts`：stdout **按行读**，`event` 行即时交给 `onProgress({ type: "event", … })`，只留最后一条 `done`（不再把几 MB 的过程攒在一个串里）。
  规格里带 `transcript: { dir: <agentDir>/transcript, resume: false }`。新方法 `续问()`：同一个运行目录、`resume: true`、同一套墙钟与整组杀。
- 运行目录：`<会话目录>/subagents/<安全化的 toolCallId>/<序号>/`——`agentDir` 就是它，里面是 pi 的设置、`transcript/`（会话文件）与我们的 `meta.json`（谁、任务、状态、原因、交回的结果、起止时刻）。
  **按调用分目录**，修掉 §1.1 第 3 条的串位。
- `tool.ts`：开始写 `meta.json`、每行过程发 `subagent_event`、结束补全 `meta.json` 并发一条 `settled`（带交回的结果，截断如实标）。`subagent_start` / `subagent_end` 照旧（chip 与账本不变）。
  另导出 `createSubagentFollowUp`：拿同一份 `childOf` / `context` 造「续问」，供运行时用。
- `native.ts`：每段会话记一份续问函数；`askSubagent()` 起一轮、把过程照样经 `subagent_event` 发出去；关会话时整组杀（挂在已有的 `收尾` 上）。

### 4.3 中枢（`src/workbench/events.ts`）

- `subagent_start`：chip 照旧；另开一段子转录（id 见 §4.4），第一句是「你」交给它的任务。
- `subagent_event`：翻进那段子转录；是 `tool_start` 且 chip 还在跑 → chip 的 `activity` 换成这一句（D5）。`settled` → 子转录的头信息写上状态与交回的结果。
- `subagent_end`：chip 照旧，`activity` 收掉。
- **子转录的更新不给「全听」**：飞书 / 微信的「答完了」通知与定时任务的完成判定只认真会话——子转录的第一句是「你」、最后一句是 agent 的 `final`，不挡的话每派一个子 agent 手机上就响一次（查实：`channels/feishu/channel.ts` 的 `该不该通知` 按 `turn` 的 `who` / `final` 判）。

### 4.4 协议（minor：**执行时的下一个 minor 版本**）

全是新增：
- `src/protocol/subagent-id.ts`：`子转录id(会话, toolCallId, 序号)` = `<会话>#sub:<toolCallId>:<序号>`；`拆子转录id`、`是子转录id`。会话 id 是 UUID，不含 `#`。
- `SubagentsItem.agents[]` 加可选 `activity`（≤ 120 字）。
- `SessionSnapshot` 加可选 `subagent`（头信息：agent、task、status、error、result、asking、canAsk、askWhy；`status` 永远是主 agent 派的那一轮的结果，接着问时另标 `asking`，`askWhy` 是枚举 `running | asking | team | no-transcript`，文案由界面按枚举给）；`SessionUpdate` 加 `{ type: "subagent", subagent }`（整份换掉，与 `team` / `queued` 同一纪律）。
- 操作 `openSubagent({ transcriptId }) → SessionSnapshot`（有副作用：可能读盘建子转录；订阅那段子转录）；退订复用 `unsubscribeSession`。
- 操作 `askSubagent({ transcriptId, text }) → {}`（可写；不要求租约——与 `setSideTool` 同理：写的不是那段会话，是它旁边的一段；同一时刻一句由「在答」挡住，`conflict`）。
- mock（准入规则 1）：假模型三支——「派子agent」→ 调 `subagent`；「子任务」→ 先说一句再 `read README.md`；「子任务慢」→ `bash sleep 15`。`dev:mock` 与 e2e 共用。

### 4.5 界面

- `SubagentChips`：给了 `onOpen` 就是「点了在坞里打开」；在跑的带 `activity` 那半行。没给 `onOpen` 时保留旧行为（点开看任务原文），只给没接线的调用点兜底。
- 坞：`坞房客` 加 `"subagent"`，名字「子 agent」，排在「团队」前面（两者都是「谁在替主 agent 干活」）。
- `src/ui/subagent-pane.tsx`：格顶同一批切换条、头（名字 · 状态 · 任务折叠）、转录（复用 `分组转录` + `TranscriptRow` + `ToolGroupRow`，贴底跟随）、交回的结果（Markdown）、接着问。
- 状态：第三个转录槽 `子槽`（`创建转录槽()`，与主槽、侧槽同一份攒的逻辑）+ `$子转录id` + `$子agent信息`。App 的推送分流里，子转录 id **排在最前面**处理——它不是一段会话，不能进「标记在跑 / 未读 / 答完退订」那几段。
- i18n：新文案全进 `en.ts`（「子 agent」→ "Subagent"，「接着问」→ "Ask it"，「交回主 agent 的结果」→ "Returned to the main agent"）。

## 5. 测试

- 单元：子事件翻译与截断；`runChildTask` 的 `onEvent`；执行器按行转发、只留最后一条 `done`、`transcript` 规格、`续问`；运行目录与 `meta.json` 读写、盘上重建 chip 组、会话文件翻成转录；
  `tool.ts` 发 `subagent_event` 与 `settled`、写 `meta.json`；中枢：子转录开、归并、`activity`、`settled`、**不给全听**；后端 `openSubagent`（内存 / 读盘 / 找不到）、`askSubagent`（在答时 `conflict`、团队不给、没有会话文件不给）、重开后补 chip 组；协议新形状。
- 集成：真子进程（构建产物 + 假模型「子任务」那一支）吐出 `tool_start` / `tool_end` 行，`transcript/` 里有会话文件；`resume: true` 再跑一次，第二问的请求里带着第一问（续上了）。
- 设计契约：**`SubagentChips` 里不许出现 `TranscriptRow` / `ToolRow` / `ToolGroupRow`**——子 agent 的过程只在坞里画（Codex 的克制写成扫描）。
- e2e（`e2e/subagent-view.spec.ts`）：
  1. 点 chip → 坞打开到「子 agent」、这一格里有 `read` 那条工具行与「交回主 agent 的结果」；主转录里没有那条 `read` 行。
  2. 「子任务慢」：在跑时 chip 上有 `bash sleep 15`、坞格里那条 bash 在跑；跑完 chip 上那半行消失。
  3. 接着问：发一句 → 这一格多一问一答；主转录条数不变。
  4. 重开应用（同一数据目录）→ chip 组还在、点开过程还在。
  5. 看得见：chip、「接着问」按钮、切换条 `opacity === "1"`。
- 旧用例：`e2e/subagent.spec.ts` 里「点开才有任务全文」那两句改成「点开在坞里」。视觉基线：坞的标签条多一格，出现在哪张就看 diff 再重存。

## 6. 不做

- 在坞里停掉单个在跑的子 agent（会改主 agent 拿到的结果）。
- 子 agent 的工具调用进账本（会话文件就是记录）。
- 团队成员轮的逐步过程（D4）。
- 子 agent 里的内核 / 笔记本：子进程只有 pi 的默认工具（或定义里写的 `tools`），没有 `run_code`——**不存在「子 agent 的内核 cell」**；哪天给子 agent 接内核，过程行照样是 `tool_start` / `tool_end`，这一格不用改。
- 接着问的回答回到主 agent（D3 的反面，另议）。
