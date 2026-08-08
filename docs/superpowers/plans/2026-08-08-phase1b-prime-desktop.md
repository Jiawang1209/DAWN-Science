# 阶段 ①-B′ 详细计划：桌面成型（按 Hermes 做）

> **状态：10 个 Task 全部完成（2026-08-09）。** 逐条见 `docs/DEVELOPMENT_HISTORY.md`。
> 机器可验的部分全绿：524 单元/集成 + 15 条 Playwright e2e（跑真实构建产物）。
> G2′ 的第二问「你是否真的开始用它替代裸终端」不由任何 Task 交付，待作者本人试用。

- **日期**：2026-08-08
- **上游**：`2026-08-08-master-roadmap.md` §5 阶段 ①-B′（S1–S7）+ 新增 S16′
- **参照**：`hermes-agent-main/apps/desktop`（MIT）—— **只读设计，不复用代码**（规格 §3）
- **作者定调**：**「UI 基本上全都按照 Hermes 做」**

---

## 0. 判据（G2′）

> **你自己打开，不问我，就知道下一步该点哪里；**
> **而且能对着本地 claude 和一个 API 模型各说一句话，都看见回复，都在 Runs 里留下记录。**

这条判据刻意不写「功能齐了」。**功能齐了三次，三次都不可用。**

---

## 1. 从 Hermes 读到的信息架构（照做）

### 1.1 三类界面，规则不同

Hermes `DESIGN.md` 把界面分成三类，**混淆它们是经典 bug**：

| 类 | 语义 | Hermes 的例子 | DAWN 的对应 |
|---|---|---|---|
| **Pages** 持久目的地 | 留在 shell chrome 里 | Chat · Skills · Messaging · Artifacts | **Chat**（首页）· **Runs** · Projects |
| **Route overlays** 短任务 | 渲染成 overlay 卡片，**关闭后回到上一个路由** | Settings · Command Center · Cron · Profiles · Agents | **设置** · **模型/凭证选择** · **onboarding** |
| **Panes** 工作上下文 | 附着于当前任务，**临时隐藏时状态存活** | preview · files · review · terminal | **变更(files)** · **终端** · **成本/来源** |

> *"Do not hide a distinct product noun inside an unrelated page."*
> *"Panes ... state survives temporary hiding and chat switches where the underlying tool is meant to persist."*

### 1.2 Chat 是首页，不是之一

Hermes `routes.ts` 第 10 行：

```ts
export const NEW_CHAT_ROUTE = '/'
```

**根路由就是新建对话。** 其余全部是具名目的地（`/settings` `/skills` `/artifacts` `/cron` …）。

DAWN 第一版把统计面板做成了首页——**改掉**。

### 1.3 右栏三个 pane

Hermes `app/right-sidebar/` 恰好三样：`files` / `review` / `terminal`。

DAWN 对应：**变更**（这次改了哪些文件，从 git 事实算）/ **终端**（PTY 下钻）/ **来源与成本**。

### 1.4 布局常量集中，不散落

```ts
// Hermes app/layout-constants.ts
export const PAGE_INSET_X = 'px-[clamp(1.25rem,4vw,4rem)]'   // 比例化且有上下限
export const PAGE_MAX_W = 'max-w-[75rem]'                     // 超宽屏不摊开
export const SIDEBAR_COLLAPSE_BREAKPOINT_PX = 768             // 单一折叠断点
```

注释里写明了一条易踩的坑：**必须是字面字符串**，Tailwind 扫描器只认完整类名，不能用模板拼。

### 1.5 令牌三层

```
--dt-*        设计令牌（原始值）
  ↓
--color-*     语义令牌（background / foreground / muted / border / ring / destructive …）
  ↓
组件只引用语义令牌
```

外加两个专用令牌：**`--shadow-nous` + `--stroke-nous`** 成对用于所有浮层（对话框、路由 overlay、启动/安装/更新面）。

> *"Don't add per-overlay `shadow-[…]` one-offs; if elevation needs to change, **change the token**."*

### 1.6 z-index 是梯子，不是数字

```
--z-modal-backdrop → --z-modal → --z-modal-popover
--z-over-modal（toast/tooltip）→ --z-over-modal-content
--z-switcher-backdrop → --z-switcher
启动链：--z-connecting → --z-onboarding → --z-setup → --z-crash
```

**禁止 ad-hoc `z-10`/`z-20` 参与跨组件竞争**（组件内部堆叠仍可用）。

### 1.7 设计契约用测试强制，不靠记性

Hermes `components/ui/__tests__/no-native-title.test.ts`——**任何 `<button>` 还带 `title=` 就测试失败**。

Rho `AGENTS.md` 独立写了同一条：

> *"Prefer automated enforcement over remembered convention. When a governance rule can be checked deterministically, add it to repository validation or CI **in the same workstream**."*

**DAWN 采纳**：`docs/DESIGN.md` 里每条可判定的规则，配一个扫描测试。

---

## 2. 技术选型与分层声明

按规格 §4 纪律，每个新依赖必须写明 **①坐在哪一层 ②放弃了什么 ③不变式挂在哪**。

| 依赖 | 坐在哪一层 | 放弃了什么 | 不变式挂点 |
|---|---|---|---|
| `nanostores` + `@nanostores/react` | **状态容器**。`atom`/`computed`/`useStore`，不引入其 router/i18n/persistent | 放弃 Redux 生态的 devtools 与中间件 | 状态按权威归位是不变式 3「没有不可见的行动」在界面侧的前提 |
| `streamdown` | **markdown 渲染叶子**。只在 `TranscriptRow` 内部使用 | 放弃自己处理未闭合围栏的流式边界 | — |
| `shiki` | **代码高亮叶子**。按需加载语言 | 放弃更轻的 `highlight.js`（换来准确的 TextMate 语法） | — |
| `use-stick-to-bottom` | **滚动行为叶子** | 放弃手写 `scrollIntoView`（它在 jsdom 里还要包一层可选调用） | — |
| `@xterm/addon-serialize` 等四个 addon | **终端能力叶子** | — | 终端状态可序列化是「隐藏时不卸载」与大会话恢复的基础 |
| **不引入 `@assistant-ui/react`** | — | **主动放弃**成套对话 primitive | 它会决定整个对话区形态，是又一个「坐哪一层」的决策；且我们的 transcript 要显示 Run 与来源，形态与通用聊天不同 |
| **不引入 `pi-client`/`pi-server`** | — | 主动放弃 | 它们是**远程会话**传输层（framed CBOR over socket），我们是同机 Electron IPC；且 `pi-server` 自述 *"Experimental … may change or be removed without notice"*，撞上风险 R10。**S15（远程执行环境）时再评估** |
| `@playwright/test` | **devDependency**，e2e only | 拉一个浏览器二进制（体积可观） | 它是 R12「界面再次功能齐了但不可用」的唯一有效应对 |

---

## 3. 任务分解

**每个 Task 的纪律**（不得省略）：
先写失败的测试并确认 **FAIL** → 写实现确认 **PASS** → 全量 `npm test` + `npm run typecheck` + `npm run build` → `docs/DEVELOPMENT_HISTORY.md` 顶部追加条目（Commit 写「待回填」，并回填上一条）→ `git commit`（标题 = 条目标题）。**不 push，不加 Co-Authored-By。**

---

### Task 3.1 · R5：界面显示工具调用 ⬜

**收尾返工 R。** 数据通路在 R4 已建好（`ToolItem { name, input, status, result }`），只剩呈现。

- **成果**：工具调用行显示名称、有界的入参摘要、`running|ok|error` 状态、可展开的结果；错误状态可见且带原因
- **验收**：mock 服务器配 `toolCall`，e2e/集成断言**界面上出现该工具名与其结果**——不是断言 store 里有数据
- **对标**：Hermes 的工具结果可以有内联动作打开预览，但 *"It must not open the rail automatically."*（**不自动开右栏**）

---

### Task 3.2 · 设计契约与 primitive 地基 ⬜

**先立契约再改界面，顺序不能反。** 否则每个 Task 各自发明一套。

- **成果**
  1. `docs/DESIGN.md` —— DAWN 的视觉与交互契约，按 Hermes 两分法维护：**原则耐久 / 具名契约与代码同步，过时的名字算 bug**
  2. `src/ui/tokens.css` —— 三层令牌 + `--shadow-dawn`/`--stroke-dawn` 浮层对 + z-index 梯子
  3. `src/ui/layout-constants.ts` —— `PAGE_INSET_X` / `PAGE_MAX_W` / `SIDEBAR_COLLAPSE_BREAKPOINT_PX`
  4. 六个 primitive：`Button`（variant × size）· `Loader` · `ErrorState` · `EmptyState` · `LogView` · `Field`
- **契约扫描测试**（学自 Hermes `no-native-title.test.ts`）
  - 组件里出现裸十六进制颜色 / `rgba(` → **失败**
  - `<button>` 带 `title=` → **失败**
  - 调用点用 `className` 覆写 primitive 的 padding/height/radius → **失败**
  - 出现字面文案 `"Loading…"` / `"加载中…"` → **失败**（必须走 `Loader`）
- **对标**：*"One primitive per concern. Migrate onto them; don't fork."*

---

### Task 3.3 · S1 状态按权威归位 ⬜

- **成果**：`src/ui/store/` 按关注点拆分——`sessions` / `active-session` / `connection` / `panes` / `projects` / `providers`；每个 store 旁边一个 `.test.ts`；`App.tsx` 降为路由与布局
- **规则**（Hermes `AGENTS.md`「Server truth is cached, not owned」六条，逐条落）
  1. **合并不覆盖** —— 刷新是叠加，不是能丢掉活跃行的替换
  2. **先乐观再诚实** —— 直接操作立刻画，写失败**可见地回滚**
  3. **提防过去** —— 世代计数器；过期响应绝不覆盖更新的意图
  4. **隔离前台** —— 只有用户正在看的界面可以往共享视图发布
  5. **合并噪音，放行信号** —— 高频装饰更新批处理，**终态转换（回合结束、需要输入、失败）立刻到达**
  6. **无变化时保持引用同一**
- **作用域规则**：持久化状态必须在 key 里声明作用域（全局 / 会话 / 项目 / 窗口）。*"Getting the scope wrong is how one profile's setting bleeds into another."*
- **验收**：`tests/ui/app-default-client.test.tsx` 仍绿（它是 4 GB 事故的回归测试）；新增测试断言第 3 条与第 6 条

---

### Task 3.4 · S2 删掉「必须先打开项目」的门槛 ⬜

- **成果**：默认工作区 `~/DAWN/scratch`（首次启动自动建）；启动即可对话；项目在左栏可选可换；首次使用引导（选模型 → 填 key → 说第一句话）
- **验收**：**全新配置目录下启动，不做任何设置，直接说一句话并看见回复**
- **对标**：Hermes 也有项目、也让项目持有 cwd、也在侧栏（*"Projects own workspace cwd. Use Sidebar → Projects for local folders and worktrees; **do not reintroduce a per-session/right-sidebar folder-picker flow**."*）
  → **项目模型没错，把它做成门槛才是错。** 门槛的正解是 onboarding，不是禁用一切
- **同时删掉**：`src/electron/main.ts` 里临时的 `DAWN_PROBE` 调试块

---

### Task 3.5 · S16′ Run 最小骨架 ⬜

> **本阶段唯一一件「不做会很贵」的事。**

其余功能都是**新增路径**，随时可加。Run 不是——它要求**每条执行路径在诞生时就记账**。

**Rho 的前车之鉴**（`reproducibility-audit` 设计文档原文）：

> *"Current durable run rows do not directly carry `project_root`. Therefore RA-RC1 is **blocked** until its interface checkpoint defines one canonical, testable run-to-project identity contract. Inferring project identity from source paths, the current open project, adjacent timestamps, or artifact filenames is **forbidden**."*

Run 行少一个字段，整个「运行对比」被阻塞，必须先做三个基线加固包才能继续。

- **范围**：**只落记录，不做审计/对比/溯源面板/成本核算**（那些是 S16/S21–S24）
- **成果**
  - SQLite 表 `runs`，字段：
    ```
    run_id          稳定不透明 ID
    parent_run_id   重跑/续跑链（可空）
    project_id      ← 现在就钉死。Rho 就是漏了它
    session_id
    origin          'user' | 'agent' | 'system'
    request_type    'agent_turn' | 'tool_call' | 'pty_command'
    status          'running' | 'completed' | 'failed' | 'cancelled'
    started_at      单调时间戳
    finished_at
    terminal_reason 异常结束的原因（可空）
    exit_code       ← 结构化字段，不是日志文本
    ```
  - 三个写入点：**agent 回合开始/结束** · **工具调用开始/结束** · **PTY 命令**
  - 协议新增只读操作 `listRuns(sessionId?, projectId?, limit)` / `getRun(runId)`
- **不变式挂点**：**不变式 3（没有不可见的行动）**——每件事都是账本上一条有明确 executor 的条目
- **对标**：Rho `RunSummary` 的字段集合；`origin` 区分人/agent/系统；`parent_run_id` 表达重跑链**而非覆盖**；退出码是**结构化字段，不需解析文本**（这是冻结点八项之一）
- **验收**：说一句话 → `runs` 表出现一条 `origin='agent'` 的记录，带 `project_id` 与 `exit_code`；agent 调一次工具 → 出现一条 `parent_run_id` 指向该回合的记录

---

### Task 3.6 · S3 五种加载态 ⬜

- **成果**：`empty` / `loading` / `reconnecting` / `degraded-stale` / `exhausted-recovery`，**各有诚实文案与各自的出路**
- **规则**：重试**有界**，且以真实恢复动作收尾——*"never an infinite spinner or a hot loop"*
- **验收**：五种状态各一个渲染测试，断言各自有可点击的下一步（`exhausted-recovery` 必须给出「重试」或「查看日志」）

---

### Task 3.7 · S4 终端常驻（visibility ≠ lifecycle） ⬜

- **成果**：`TerminalDock` 收起时**保持挂载**（`hidden` 而非卸载）；接入 `addon-serialize` / `addon-unicode11` / `addon-web-links`
- **验收**：写入输出 → 收起 → 展开 → **断言滚屏内容仍在**（当前实现会丢）
- **边界**（Rho 的反向约束）：**xterm 只用于真 shell（托管外部 CLI）**；未来的 REPL 一律走结构化 Console（S11），**绝不用 xterm 做 REPL**

---

### Task 3.8 · S5 切会话改为 re-home ⬜

- **成果**：切会话时 shell 与用户正在做的事保持不动，只清空并重填绑定该会话的 store；世代计数器丢弃过期响应
- **验收**：A 会话流式输出中途切到 B，再切回 A —— **A 的历史完整，且 B 的迟到响应没有污染 A**
- **对标**：*"Treating a soft switch as hard flickers the app; treating a hard one as soft strands stale rows."* 且**查询失效无法驱逐活会话 store，必须显式擦除**

---

### Task 3.9 · S6 流式 markdown 与代码高亮 ⬜

- **成果**：`streamdown` + `shiki` + `use-stick-to-bottom`；用户上滚后**不被拽回底部**
- **验收**：流式发送一段含未闭合代码围栏的中间态，断言不崩且最终渲染正确
- **对标**：Hermes 的 transcript 里带边框的面（表格、围栏、callout、附件）统一用最弱的那档描边令牌，*"Not `border-border` — that's the app-wide default and **reads too hot against the thread**."*

---

### Task 3.10 · S7 Playwright e2e ⬜

- **成果**：四条基线 spec，跑**已构建的真实 app**，共用 `scripts/mock-inference-server.mjs`（✅ 已建）
  | spec | 断言 |
  |---|---|
  | `boot.spec.ts` | 全新配置目录能起来，落到 Chat 首页 |
  | `chat.spec.ts` | 说一句话 → **界面上出现固定回复的暗号** → `runs` 表有记录 |
  | `sidebar-states.spec.ts` | 空/加载/错误三态各自可见且有出路 |
  | `session-switch.spec.ts` | 切会话不丢历史，迟到响应不串台 |
- **准入规则**（学自 Rho，写进 `CLAUDE.md`）：
  > **新增协议操作，必须在同一次改动里补 mock 分支。**
  > Rho 原文：*"Every new Tauri command and visible state requires a deterministic mock handler … **in the same implementation package**. Otherwise UI review in browser mode quickly drifts away from the real contract."*

---

## 4. 本阶段明确不做

写下来和做什么同样重要。

- ❌ Jupyter 内核、REPL、变量面板（②-A）
- ❌ 远程/SSH/GPU 执行环境（②-B）
- ❌ Run 的审计、对比、溯源链、成本核算（S16/S21–S24）——**只落记录**
- ❌ 多 agent 编排、worktree、派单（④）
- ❌ `pi-client`/`pi-server`（S15 时再评估）
- ❌ `@assistant-ui/react`
- ❌ 国际化（Hermes 有四语言纪律，我们现在只有中文，**不提前造抽象**）
- ❌ 像素级打磨与动效编排

---

## 5. 交付前的品味测试

抄 Hermes 的「taste test」，改成 DAWN 版，同时进 `docs/DESIGN.md`：

> - 每处状态是否住在它的权威方那里，且在最窄的作用域？
> - 后台事件会不会抢走前台或焦点？
> - 每个 resolver 是否只有一个家、一条被验证过的阶梯、一个有界且可恢复的结尾？
> - 异步失败之后，界面是否仍然可用、是否有下一步？
> - 热交互在真实负载（长 transcript、忙终端）下是否仍然便宜？
> - 这次改动是否通过 `DESIGN.md` 的清单？
> - **我自己打开看过了吗？**（前三次我都没有——最便宜也最有效的一条）

---

## 6. 任务顺序与依赖

```
3.1 R5 工具调用显示     ← 返工 R 收尾，独立
 ↓
3.2 设计契约与 primitive ← 地基。后面每一步都踩在它上面
 ↓
3.3 S1 状态按权威归位    ← 地基。先搬状态，再改界面
 ↓
3.4 S2 删门槛 ── 3.5 S16′ Run 骨架   ← 可并行（一个动界面一个动存储）
 ↓
3.6 S3 加载态 → 3.7 S4 终端常驻 → 3.8 S5 re-home → 3.9 S6 markdown
 ↓
3.10 S7 Playwright      ← 最后，因为它要测前面所有的
```

**3.2 与 3.3 的顺序不能反**：契约先立，否则每个 Task 各自发明；状态先搬，否则改完界面还要再搬一次。
