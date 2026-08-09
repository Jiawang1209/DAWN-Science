# 阶段 ①-B″ 详细计划：runtime 补强 · 桌面加厚 · subagent

- **日期**：2026-08-09
- **上游**：`2026-08-08-master-roadmap.md`；前置 `2026-08-08-phase1b-prime-desktop.md`（10 个 Task 已完成）
- **触发**：作者试用后确认「可以作为 agent 工作了」，并提出桌面「照比 Hermes 还差很多」
- **写法**：沿用主规划的五项——**技术栈 / 成果 / 效果 / 来源 / 对标**

---

## 0. 判据

> **① 长对话不再悄悄丢内容，工具改了哪些文件看得见，模型能在界面里换。**
> **② 能把一件事拆给几个子 agent 并行做，且每个子 agent 的账都记在账本上。**

---

## 1. 规划期发现的一个正在生效的缺陷

```ts
// src/runtime/native.ts:244（现状）
text: content.map(c => c.text ?? "").join("").slice(0, RESULT_PREVIEW_CHARS)  // 2000
```

**runtime 层硬砍 2000 字符，不出声、不留路径。**

它违反规格 7.5，而且与 Task 3.1 自相矛盾：**界面层认真做了「还有 N 行」的出声，但更早的 runtime 层已经把内容砍掉了**——界面折叠里那个"全文"本身就是残缺品。

**这不是新功能，是修 bug。** 所以 R2 排在批次 1。

### 一处对上一轮判断的更正

pi 的 `truncated` / `fullOutputPath` **只在 `role: "bashExecution"` 上**（`packages/agent/src/harness/messages.ts:20-26`），不是通用的工具结果字段。此前记录的「pi 已有与 wisp 相同的设计」**说过头了**：pi 只对 bash 有，wisp 是所有文本工具统一预算。

---

## 2. 批次划分与依赖

```
批次 1  runtime 补强      R1 卡死守卫 → R2 工具输出 → R3 溯源快照
批次 2  外观              V2 主题 → V1 视觉基线      （先定样子再存基线）
批次 3  桌面加厚          U1 命令面板 → U2 模型选择器 → U3 上下文用量 → U4 变更 pane
批次 4  编排入口          S1 subagent
```

**两条硬依赖**：
- **U4 变更 pane 依赖 R3** —— 没有 per-tool 的文件事实，它只能显示会话级 git diff，那是 ①-B 已有的粗糙版。
- **U1 命令面板排在 U2–U4 之前** —— 它们都要往它注册入口，后做等于三次回头改。

---

## 3. 批次 1 · runtime 补强

### R1 · 卡死守卫 ✅ `8deb729`

- **技术栈**：纯 TS，无新依赖。挂在 `NativeRuntime.translate()` 的 `tool_start` 分支
- **成果**：`src/runtime/stuck-guard.ts`。窗口内重复达阈值 → `abort()` + 发一条 `notice` 说明原因
  ```ts
  const STUCK_WINDOW = 16        // 扫描最近 16 批
  const STUCK_REPEAT_LIMIT = 5   // 窗口内重复 5 次判定卡死
  signature = calls.map(c => `${c.name}:${stableStringify(c.input)}`).join("|")
  ```
- **效果**：模型退化时不再一路烧到上限。**pi 确实没有这个**（全包 grep `stuck|repeated|no_progress` 零命中）
- **来源**：wisp-science `crates/wisp-core/src/agent.rs`（其自身移植自 mangopi-cli）
- **对标 —— 直接从窗口式起步，不重走它的弯路**：wisp 的注释与测试名留下了一道疤——`interspersed_tool_call_loop_breaks_the_loop`，注释写着 *"the case the **old consecutive-only guard** let run to max_iter"*。**连续式会被 A/B/A/B 绕过去**，他们踩过，我们不必再踩
- **不出声地停是不允许的**：中断必须带原因进 transcript（规格 7.5）

### R2 · 工具输出双份处理 ✅ `10ff8c6`

- **技术栈**：Node fs；协议 `ToolItem` 加三个字段
- **成果**
  ```ts
  result: string            // 头尾摘要
  resultTruncated: boolean
  resultBytes: number       // 原始字节数 —— 界面说「还有 N」要用真数，不是猜
  fullOutputPath?: string   // 落在 <sessionDir>/tool-output/，用户可打开
  ```
  **删掉 `RESULT_PREVIEW_CHARS` 那个静默 slice。** 截断只允许发生在一处，且必须带齐三个字段
- **效果**：用户能拿到全文；界面的「还有 N 行」第一次是**真数**
- **来源**：wisp 的 `budget_tool_result`（溢出到 `.wisp/tool-output/`）
- **对标**：wisp 的省略标记直接把路径和用法写进去——*"full output at &lt;path&gt; — **read/grep narrow ranges; do not load the whole file**"*。我们的标记同样要可执行，不能只说"已截断"
- **不做**：模型侧的上下文预算。**那是 pi 的职责**，我们不越界重做一套

### R3 · 溯源快照 ✅ `b579262`

- **技术栈**：`simple-git`；pi 的 `tool_call` 扩展事件（R1 spike 已验证可拿到 `{toolCallId, toolName, args}` 且可 `{block, reason}`）
- **成果**：`runs` 表加 `files_written` / `files_read`（JSON 列）。**不新建表**——它天然属于那条 `tool_call` Run
  ```
  tool_call 事件 → isProducing(toolName)? → snapshot(before)
                → 放行 → tool_end → snapshot(after) → diff → 写进那条 Run
  ```
- **效果**：**不变式 5 的物理载体**。第一次能回答「**哪个工具**改了这个文件」，而不只是「这个会话改了这些」
- **来源**：wisp 在循环里每次工具调用前后各拍一次快照
- **对标 —— 成本控制在入口**：wisp 用 `provenance::is_producing(&name)` 先判断这个工具会不会产出，不会就不拍。我们的白名单先只放 `write` / `edit` / `bash`；`read`/`grep`/`find`/`ls` **一律不拍**——大仓库上 git status 不便宜
- **不变式挂点**：**不变式 5**（产出从 git 事实算，不听 agent 声明）

---

## 4. 批次 2 · 外观

### V2 · 主题 ✅ `95409ed`

> **两处按实测偏离了本计划，理由如下。**
>
> **① 不用 `@media (prefers-color-scheme)` 那一支。** 下面写的三行 CSS 里，
> 媒体查询版与 `.dawn-dark` 版**没法共用一个声明块**，暗色种子必须写两遍。
> 那正是 `tokens.css` 头注一直警告的「退化成两套各自维护的颜色表」，
> 而且更隐蔽——它们一开始是一样的。改为「跟随系统」在 `state/theme.ts` 里
> 解析成明确的类，CSS 只留一个入口。
>
> **② 作者改了主意，配色是取过色的。** 计划写着「不需要取色」，
> 但作者随后说明*「我其实喜欢 OpenAI 品牌色，我们不是抄，而是向权威和经典致敬」*。
> 取色范围与边界见 `docs/REFERENCES.md` 第七条参考。
> 取到的最有价值的东西不是色值，是**灰阶的刻度密度**（暗端八档、亮端五档）
> 和**描边由前景派生**（一套百分比管两个主题）。
> 另发现：**那个应用自己没有强调色**，整套色相委托给 VS Code 的当前主题——
> `#10a37f` 是 DAWN 自己定的。

- **技术栈**：只改 `tokens.css` 的种子段 + 加一个覆盖类
- **成果**
  1. 暗色优先的一版配色（作者说明不需要取色，故由我出方案后再调）
  2. **强制明暗切换** —— 现在只认 `prefers-color-scheme`，用户想强制暗色做不到
     ```css
     .dawn-dark  { /* 强制暗 */ }
     .dawn-light { /* 强制亮 */ }
     @media (prefers-color-scheme: dark) { :root:not(.dawn-light) { … } }
     ```
  3. `--dawn-red/green/yellow` → `--dawn-danger/success/warning`。**语义比色名耐用**——万一将来危险色不是红的
- **来源**：作者的 `cx_app_learn/UI_ANALYSIS.md`（他自己的分析文档）
- **对标 —— 双类名策略**：Codex 用 `.dark`（跟随系统）+ `.electron-dark`/`.electron-light`（强制）。**跟随与强制是两件事**，只做前者就没有"我就要暗色"这个选项
- **一处刻意不学**：Codex 有 **1,366 个语义角色令牌**（`--color-background-button-primary` 这种）。我们 ~30 个数字分级令牌。**两种都对，取舍不同**——语义角色在调用点自解释但数量爆炸，数字分级紧凑可派生。我们的规模用数字分级是对的，不跟着膨胀

### V1 · 视觉基线 ✅ `47bd299`

> **按实测偏离本计划两处。**
>
> **① 不是 4 张，是 8 张。** 计划写「4 条 e2e 各加一张」，但 V2 刚落地明暗两套主题；
> 只存亮色的话，**暗色改坏了没有任何东西会说话**——而暗色恰恰是新的那一半。
> 四个屏 × 两个主题。
>
> **② 逐像素阈值取 0，不是留容差。** 试出来的，结论反直觉：
> `0.2`（默认）和 `0.02` **都漏掉**「强调色 ΔRGB=(2,5,5)」与「描边浓度 8%→10%」
> 这两种漂移；只有 `0` 抓得住（分别红 4 张与 8 张）。
> 也就是说**留任何色距容差，令牌的微小漂移就是看不见的**。
>
> 敢用 0 的前提是先把采集环境钉死：`--force-color-profile=srgb`。
> 在那之前，广色域屏上饱和色的合成会随机漂移 3000–5000 像素——
> **只有饱和色变，中性灰一个像素不动**，diff 图指得很清楚。

- **技术栈**：Playwright `toHaveScreenshot()`
- **成果**：4 条 e2e 各加一张基线图；`npm run test:e2e:visual` + `--update-snapshots`
- **效果**：改样式时能看见改动了什么，而不是"我猜没坏"
- **顺序理由**：**必须排在 V2 之后**——先存基线再改主题，基线要重存一遍

---

## 5. 批次 3 · 桌面加厚

### U1 · 命令面板（先做）✅ `e82bc65`

> **本 Task 的实质不是面板，是把动作收拢成一处。**
>
> 做之前 `App.tsx` 里 `() => setView("settings")` 写了**四遍**，中止与打开项目
> 还各自带着实现——面板再加一个入口就是第五份，那时「一个动作一个家」
> 就只剩一句写在文档里的话。
>
> 现在动作只有 `Actions` 一份定义，两条扫描 + 一条 e2e 钉住它
> （e2e 那条从**行为**上验：同一个动作走面板与按钮两遍，断言落在同一个 DOM 状态）。

- **技术栈**：React + nanostores；`⌘K`
- **成果**：命令注册表 `{ id, title, group, keybinding?, run() }`；分组：会话 / 模型 / 项目 / 视图 / 设置
- **效果**：后面每一样功能都有地方放入口
- **对标**：Hermes *"**One action, one home.** A command may have keyboard, palette, and visible affordances, but they **invoke the same action and state**. Do not fork behavior per entry point."*
  → 面板里的命令必须调用**和按钮同一个函数**。这条要写进 `docs/DESIGN.md` 并配扫描测试

### U2 · 模型选择器 ✅ `1cf88f6`（Spike E）· `2e859a2` · `68e28d0`

- **技术栈**：`getProviders` 已返回 `providers[].models`——**数据已经有了**
- **成果**：会话级模型覆盖（`sessions` 表加 `model_override`）+ 面板 + 命令面板入口
- **效果**：换模型不用改 yaml 重启。**作者反馈里最直接的痛**
- **前置小 spike**：**pi 能不能在会话中途换模型**（`AgentSession` 是否支持，还是必须重建）。**先验后做**——验不过就退化为"换模型 = 新建会话并继承 transcript"，并把理由记进历史

### U3 · 上下文用量 ✅ `6d24ccc` · `b009bb0`

- **技术栈**：pi 的 `ToolResultEventResult.usage`（R1 已验证）+ 每轮 token 统计
- **成果**：状态栏一个紧凑指示 + 展开后的分解面板
- **效果**：**成本支柱的第一块真数据**。长对话烧了多少、烧在哪，现在完全看不见
- **来源**：Hermes `app/shell/context-usage-panel.tsx`，按 system/tools/rules/skills/mcp/conversation 分解
- **对标 —— 诚实纪律**：我们先做能真拿到的三档（system prompt / 工具 schema / 对话历史）。**分不出来的部分标「其他」，不要凑数**——分解不准比不分解更坏，它会让人据此做错决定

### U4 · 变更 pane ✅ `21c3992` · `c4a4093`（补 e2e）· `2a3bc40`（焦点重取）

- **技术栈**：React；数据来自 R3 写进 Run 的 `files_written` / `files_read`
- **成果**：右栏第二个 pane。列出「这次回合改了哪些文件」，可点开 diff，**并标明是哪次工具调用改的**
- **效果**：不变式 5 第一次有了用户可见面
- **依赖**：**R3。** 没有它只能显示会话级 git diff = ①-B 的粗糙版
- **2026-08-09 追加**：文件监听用 **`@parcel/watcher`**（Codex 桌面版用的就是它）。
  没有监听的话，作者在外部编辑器里改了文件，这个 pane 不会知道——
  而「产出从 git 事实算」的前提是**事实要及时**
- **对标**：Hermes 右栏恰好三个 pane（files / review / terminal）。我们补齐第二个，`review` 留到阶段 ④（它是审批面，现在做是空壳）

---

## 6. 批次 4 · S1 subagent ✅ `7f227b8` · `17f3543` · `edc26dd` · `6e2c978` · `c540235` · `be0a196`

> **2026-08-09 追加 —— 子 agent 在界面上长什么样，有现成答案。**
> Codex 桌面版的组件叫 `subagent-activity-chip-group`：**chip 组，不是树、也不是日志。**
> 这回答的是「N 个并发子 agent 怎么显示才不淹掉对话」——
> 一行紧凑的状态芯片，点开才展开细节。做 S1 的界面时按这个形态来。

### 作者的决定与它的代价（记录在案）

我建议过「最小可用 + 授权接缝预留」，**作者选择照 pi 样板全搬**。决定已记录，代价一并记录：

> **阶段 ④ 加能力授权与验证隔离时，要改已有的调用点，而不是在空白处设计。**

规格 §4.3 的反向约束（②③ 不得提前引入编排概念）在此**被显式豁免**——这是作者的范围决定，不是疏漏。

### 第二条决定（2026-08-09）：项目级 agent 定义照做，不加确认层

**发现**：pi 的 README 对项目级 agent 定义写了明确警告——

> *"Project-local agents (`.pi/agents/*.md`) are **repo-controlled prompts** that can
> instruct the model to read files, run bash commands, etc. **Default behavior:**
> Only loads user-level agents."*

pi 默认只从 `~/.pi/agent/agents/`（家目录）加载；项目里的定义要显式开
`agentScope`，交互时还要再确认一次。**而计划 §6 规定的正是项目级
`<project>/.dawn/agents/*.md`。**

**这条缝的形状**：定义文件的正文原样成为子 agent 的 system prompt，
而子 agent 手里有 `read` / `bash` / `write`。文件在仓库里，所以控制权不在使用者手上，
而在「谁能往这个仓库提交」手上——clone 来的仓库、团队里任何有写权限的人、
一个 PR 里夹带的定义，都能给你机器上的 agent 下指令。**这不是漏洞利用，就是正常功能。**

**给过的三条路**：①维持现状，交给阶段 ④ 的授权门；②照 pi 的
`confirmProjectAgents` 加一道「首次见到新定义时确认」；③改成家目录 + 项目双来源。

**作者选择 ①。** 我的建议也是 ①，理由是：**提示词注入拦不干净，能力边界拦得住**——
真正的解法是限制 agent 能干什么，而不是限制谁能写提示词；②只是把风险挪到
「用户会不会认真看确认框」上，③要新造一个本项目没有的「用户级」概念。

**代价一并记录**：

> **在阶段 ④ 的能力授权门落地之前，任何 clone 来的仓库都可能自带 agent 定义。
> `src/subagent/definitions.ts` 是授权门第一个要接的调用点。**

现有收窄只有两条，**都不解决上述问题**，只是不让它更糟：
只认 `<project>/.dawn/agents/` 一层，不向上查找父目录（pi 会一路往上找，
那样一个上级目录就能影响其下所有仓库）；name 必须是安全标识符。

### 执行方式：功能全搬，代码自己写

`examples/extensions/subagent/` **不是 pi 的发布 API**，是示例源码。把它的文件复制进来，我们的仓库就混入外部 MIT 源码——法律上没问题（MIT 兼容 AGPL，需署名），但动摇规格 §3.3「代码库完整归属自己」。

**所以：形态一样、上界一样、三种模式一样，代码是我们的。**

### 具体

- **技术栈**：`node:child_process` spawn 独立进程；pi 的 custom tool 注入（`createAgentSession` 的 `customTools`，R2 已用过）
- **成果**
  ```
  三种模式   single / parallel / chain（chain 里可用 {previous} 引上一步结果）
  上界       8 个任务 / 4 并发 / 每任务输出上限
  agent 定义 <project>/.dawn/agents/*.md（scout / planner / reviewer / worker 起步）
  进程隔离   每个子 agent 一个独立进程 = 独立上下文窗口
  ```
- **效果**：能把一件事拆开并行做
- **来源**：pi `packages/coding-agent/examples/extensions/subagent/`（1,015 + 126 行）
- **对标 —— 进程隔离恰好是不变式 1 的最强实现**：验证者拿不到生产者的上下文，不是因为我们过滤了，而是因为**它在另一个进程里**。**过滤会漏，进程边界不会。** 这一点比 wisp 的同进程子会话更彻底
- **不变式挂点（现在就做，不等阶段 ④）**：
  - **不变式 3**：每个子 agent 的回合**落 Run**，`parent_run_id` 指向发起它的那次工具调用。子 agent 干的活也是账本上的条目
  - 上界从第一天钉死。**没有上界的 fan-out 是一张空白支票**
- **明确不做**（留阶段 ④）：有界 DAG · 能力由宿主解析 · Roundtable 交叉评审 · 嵌套委派 · 验证隔离语义

---

## 7. 本阶段明确不做

- ❌ 审批模式（ask/plan/act）—— 属于阶段 ④ 的授权门，现在做是空壳
- ❌ 右栏 `review` pane —— 同上
- ❌ i18n —— 现在只有中文，**不提前造抽象**
- ❌ Jupyter / 内核 / REPL —— ②-A
- ❌ 跟着 Codex 膨胀到上千个语义令牌

---

## 8. 每个 Task 的纪律（不变）

先写失败的测试并确认 **FAIL** → 写实现确认 **PASS** → 全量 `npm test` + `npm run typecheck` + `npm run build` → **真机验证一次**（`test:e2e` / `dev:mock` / 一次性探针）→ `DEVELOPMENT_HISTORY.md` 顶部追加条目 → `git commit`。**不 push，不加 Co-Authored-By。**

三条准入规则见 `CLAUDE.md`，其中最要紧的一条：**写「测试绿了」不等于「能用了」。**

---

## 9. 收口对账（2026-08-09）

**四个批次全部完成。** 下面逐条对 §0 的两条判据，**每条指向具体的验证手段**——
「Task 勾完了」不是判据，那是 G2 那次栽过的坑（主规划 §6 第三条教训）。

### 判据 ① 长对话不再悄悄丢内容，工具改了哪些文件看得见，模型能在界面里换

| 子句 | 落在哪 | 怎么验的 | 判定 |
|---|---|---|---|
| 不悄悄丢内容 | R2 删掉 runtime 层那个静默 `slice(0, 2000)`；截断必带 `resultTruncated` + `resultBytes` + `fullOutputPath` | 单测断言三件套同行；界面「还有 N 行」用的是真数 | ✅ |
| 卡死不烧到上限 | R1 窗口式守卫，中断带原因进 transcript | 单测含 `A/B/A/B` 交替式（wisp 踩过连续式的坑） | ✅ |
| 工具改了哪些文件看得见 | R3 逐次快照 → U4 变更 pane | **e2e 跑构建产物**：假模型真调一次 `write`，文件名出现在面板上；另一条验「不知道」与「没改」措辞不同 | ✅ |
| 模型能在界面里换 | U2 会话级覆盖 | **e2e 断言假后端记下的请求体里 `model` 真的变了**——从外部证明切换发生 | ✅ |

**一处如实标注**：「长对话不丢内容」指的是**我们这一层**不丢。
模型侧的上下文预算是 pi 的职责，计划 §3 R2 明写「不越界重做一套」——
所以更长的对话由 pi 压缩，我们不声称对那一层负责。

### 判据 ② 能把一件事拆给几个子 agent 并行做，且每个子 agent 的账都记在账本上

| 子句 | 落在哪 | 怎么验的 | 判定 |
|---|---|---|---|
| 拆给几个子 agent | 执行器三种模式 `single` / `parallel` / `chain` | 16 条单测**起真 node 子进程**（不 mock 进程——mock 掉就正好测不到进程边界那件事） | ✅ |
| 并行 | 上界 8 任务 / 4 并发 | 单测数并发峰值 ≤ 4 且 > 1；超上界**拒绝整批**而非截断 | ✅ |
| 独立进程 | `process.execPath` + `ELECTRON_RUN_AS_NODE=1`（Spike F） | **集成测试跑构建产物**：子进程里一个真的 pi 会话把请求发到假后端 | ✅ |
| 每个子 agent 落账 | `subagent_start/end` → 记账员 | **e2e 断言三层链**：`agent_turn` → `tool_call:subagent` → `subagent:scout`，`parent_run_id` 逐层对得上 | ✅ |
| 界面看得见 | chip 组（协议 2.2） | e2e 验状态、`1/1` 概览、点开展开、失败原因不折叠 | ✅ |

### 三笔知情的欠账（都不影响判据，但必须写在明面上）

1. ~~**e2e 只走了 `single` 模式。**~~ **2026-08-10 已还清。**
   `parallel` 与 `chain` 各补了一条，跑真实构建产物：
   - parallel 盯的是**两个独立进程都挂到了同一次工具调用下面**——
     单元测试里 `childOf` 是替身，进程根本没起，也就没有「两个进程各自记账」这回事
   - chain 盯的是 **`{previous}` 换成的是第一步的真输出**：点开第二个 chip
     必须看得见假模型的暗号，且**占位符本身不许留在任务里**。
     那段文字只可能来自第一个子进程里真的跑过一次模型，**是整条 chain 唯一无法伪造的证据**
2. **子 agent 的逐个溯源缺失。** 账本上有它的 Run，但那条 Run 没有 `files_written`。
   父侧不拍快照是刻意的：多个子进程并发改文件，父侧的 before/after 只能得到
   「这一批一共改了什么」。**按不变式 5，缺省读作「不知道」，这正是实情**——
   补它要等阶段 ③ 的 worktree 隔离。
3. **`@parcel/watcher` 文件监听推到阶段 ③**（作者 2026-08-09 决定）。
   现在用窗口 focus 重取覆盖主场景；盖不住「并排放着不切窗口」。

### 两条作者的范围决定（已在 §6 记录，此处只列索引）

- 子 agent 照 pi 样板全搬 → 阶段 ④ 加授权与验证隔离时要改已有调用点
- 项目级 agent 定义照做、不加确认层 → 授权门落地前，clone 来的仓库可自带 agent 定义

### 规模（2026-08-09 收口时）

**66 个源文件 / 11,325 行**；**754 个单元与集成测试**（58 文件）+ **56 条 Playwright e2e**（13 文件，含 8 张视觉基线）。
