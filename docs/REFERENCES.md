# 参考地图

- **日期**：2026-08-08
- **用途**：实体清单里的「构思来源」只写了项目名与文件名。本文档补上**本地路径与具体位置**——实现某个实体时，一查就知道去读哪里。

---

## 各自教什么（先看这张表）

**两种关系，不可混淆**：

> **Hermes / wisp-science / Rho：读设计，不复用代码。**
> **pi：直接坐在上面。我们不学它，我们用它。**

把 pi 说成「教会我们 agent 怎么写」，隐含的下一步是「学会了 → 自己写一个」——那正是本项目已经推翻过一次的路线（见 `specs/2026-08-08-dependency-layering-decision.md`）。

| 学什么 | 谁 | 许可 | **关系** | 去哪读 |
|---|---|---|---|---|
| 桌面应用怎么写 | **Hermes** | MIT | 读设计 | `«REF»hermes-agent-main/apps/desktop/` — `DESIGN.md`(337) + `AGENTS.md`(210) + `e2e/`(19 spec) + `src/store/`(140 文件) |
| 科学工作台 × agent 怎么合成 | **Rho** | MIT | 读设计 | `«REF»Rho-main/crates/rho-protocol/src/workbench.rs`(493) · `docs/design/proposed-2026-07-26-{reproducibility-audit,evidence-workspace}*.md` |
| 科学证据与发表级溯源 | **wisp-science** | AGPL | 读设计 | `«REF»wisp-science-main/docs/publication-evidence.md` |
| 多 agent 编排与防幻觉 | **wisp-science** | AGPL | 读设计 | `«REF»wisp-science-main/docs/agent-delegation.md`(562) |
| 记忆投影（不变式 4） | AgentDeck（自有）+ Buzz | 自有 / Apache-2.0 | 设计萃取 | `«OWN»multi-agent-explore/` · `«REF»buzz-main/buzz-agent/src/handoff.rs` |
| AI agent 怎么跑 | **pi** | MIT | **运行依赖** | `@earendil-works/pi-coding-agent` → `pi-agent-core`(=`packages/agent`) → `pi-ai` |

### 第七个：Codex 桌面版（闭源，**只读构建产物，不读源码**）

`«REF»ccb_hive_code_learn/app_learn/` —— `openai-codex-electron` 的 asar 解包。
**它不进上面那张表，因为它不开源。** 读它的边界必须写死：

> **读**：`webview/assets/*.css`（构建产物）的**聚合事实**——令牌名、选择器计数、
> 数值刻度、文件名清单；`package.json` 的依赖表。
> **不读**：任何 JS bundle、任何组件实现。

理由是规格 §3.3：*不接触外部非开源代码 → 项目许可由自己决定、代码库完整归属自己*。
色值与刻度是事实，不是可被占有的表达；组件代码是表达。这条线在哪儿要说清楚，
否则「学习」会不知不觉滑成「移植」。

**技术栈四项与我们相同**：`better-sqlite3` · `node-pty` · `zod ^4` · `yaml`。
这是对我们几个核心选择的独立佐证。

**已经吃进来的**（2026-08-09，见 DEVELOPMENT_HISTORY 同日条目）：

| 学到什么 | 落在哪 |
|---|---|
| 13 档手工灰阶，暗端八档 / 亮端五档 | `tokens.css` 的 `--theme-gray-*` |
| 描边由前景兑透明，5/8/12% 三档 | `--mix-stroke-*`，一套数管两个主题 |
| 文字层级用不透明度，不另配颜色 | `--dawn-text-1…4` |
| 暗色的高度 = 一圈亮描边 + 深投影 | 暗色 `--dawn-shadow-float` |
| 圆角乘一个全局缩放系数 | `--radius-scalar`（我们原本就有，得到印证） |
| 主题是**契约**，不是一堆私有变量 | 见下方待办 |

**待办清单**（尚未落地，各自标注影响哪一步）：

- **`worktree` 应当是一等 UI 概念，不是后端细节。** 他们有
  `worktree-environment-dropdown` 与 `worktree-init-tool-activities` 两个独立组件。
  我们的 S28 把它当后端能力——但三个 agent 同时跑时，「这个 agent 在哪个工作树里」
  正是最需要看见的东西。→ **影响 S28**
- **子 agent 用 chip 组呈现**（`subagent-activity-chip-group`），不是树、不是日志。
  这是「N 个并发子 agent 怎么显示才不淹掉对话」的现成答案。→ **影响 ①-B″ · S1**
- **`shlex`**：shell 安全分词。我们现在拼 PTY 命令行没有它，是个隐患。→ **影响 ①-A 的 PTY 会话**
- **`@parcel/watcher`**：文件监听。→ **影响 ①-B″ · U4 变更 pane**
- **`capnweb`**：能力式 RPC，与「能力由宿主授予、不由模型声明」同构。→ **影响阶段 ④ 授权门**
- **认识 28 个外部编辑器与终端并把活交出去**（`webview/apps/` 的图标清单：
  vscode / cursor / zed / rustrover / pycharm / xcode / ghostty / kitty / warp …）。
  **不试图取代用户的编辑器。** 科研的人手里有 RStudio、Jupyter、VS Code。→ **影响 ②-A 之后**
- **VS Code 主题令牌词表**（公开文档，约 600 键，与 asar 无关）值得借它的**命名切分**：
  `list.hoverBackground` / `focusBorder` / `descriptionForeground` /
  `editor.selectionBackground` / `badge.*` / `diffEditor.insertedTextBackground` / `charts.*`。
  向它靠拢之后，「支持 VS Code 主题」就是一张映射表的事，而不是重做设计系统。

其余功能地图（存档备查）：`thread-user-message-navigation-rail`（长对话里在自己的消息间跳转）·
`thinking-shimmer` · `chart-stores` · `pdf-preview-panel` · `terminal-panel` ·
`quick-chat-window` + `hotkey-window-home-page`（全局热键小窗）· `global-dictation-orb`（语音输入）·
`remote-text-edit-session`（配 `yjs`）· `chronicle-settings-page`。
另有 **64 个原生菜单语言包**，说明原生菜单栏与 webview 是分开本地化的。

---

**两处曾经的误判，已修正**：

1. ~~「Rho 是科学场景的呈现层参考」~~ → **Rho 与 DAWN 是同物种**。`rho-store` 10,835 行里 audit+evidence+compare 占 4,680 行（43%）
2. ~~「多 agent 编排没有外部老师」~~ → **wisp-science 有完整实现**：有界 DAG、能力解析、Roundtable 交叉评审、worktree 隔离

详见 `plans/2026-08-08-master-roadmap.md` §2–§3。

---

## 纪律

**参考代码不进本仓库。** 原因有二：

1. **许可证边界。** 本项目 AGPL-3.0；参考项目中 wisp-science / ccb 同为 AGPL，Buzz 为 Apache-2.0，pi / wispterm / Rho / pi-crew 为 MIT。把它们放进本仓库树内会制造归属上的模糊地带，一次 `git add -A` 就可能变成实质问题。
2. **体积。** 参考仓库合计约 398 MB。

规格第 3 节的纪律是「**只读设计，不复用代码**」——参考仓库留在外部目录，这条纪律在物理上才立得住。

---

## 参考仓库在哪

```
~/Desktop/Github_repos/
├── dawn-science/                ← 本项目
│
├── multi-agent-explore/         ← 自有：AgentDeck（90k 行 Python 编排内核）
├── multi-agent-orchestrator/    ← 自有：设计文档（不变式 5 的出处）
├── hermes-multi-agent-demo/     ← 自有：协作拓扑原型
│
└── ccb_hive_code_learn/         ← 第三方参考（研究档案，不再维护）
    ├── pi-main/                 MIT   —— 同时是运行依赖
    ├── hermes-agent-main/       MIT   —— Nous Research；apps/desktop 与 DAWN 同栈
    ├── buzz-main/               Apache-2.0
    ├── Rho-main/                MIT
    ├── wispterm-main/           MIT
    ├── wisp-science-main/       AGPL-3.0
    ├── claude_codex_bridge-main/ AGPL-3.0
    └── hive-main/               BUSL-1.1  ← 只看交互，不读代码
```

两个路径前缀（均相对于本仓库根目录）：

| 记号 | 展开 | 指向 |
|---|---|---|
| **`«OWN»`** | `../` | 你自己的三个仓库 |
| **`«REF»`** | `../ccb_hive_code_learn/` | 七个第三方参考仓库 |

### 需要临时获取的

pi 生态的编排扩展**不在本地**，需要时用 `npm pack` 取：

```bash
mkdir -p /tmp/piref && cd /tmp/piref
npm pack pi-crew && tar xzf pi-crew-*.tgz -C . && mv package pi-crew
npm pack pi-subagents && tar xzf pi-subagents-*.tgz -C . && mv package pi-subagents
```

> 下文用 `«NPM»` 代表 `/tmp/piref/`。

---

## 阶段 ①-A · 会话核心

| 实体 | 去哪读 | 看什么 |
|---|---|---|
| **#2** 配置加载 · 无静默回退 | `«OWN»/multi-agent-explore/src/agentdeck/config.py` | 环境变量缺失时响亮失败的处理方式 |
| **#4** 先落库再改内存 | `«REF»/hive-main/AGENTS.md` | 「No memory-before-database writes」硬规则的原文表述 |
| **#5** 启动对账 | `«REF»/wisp-science-main/docs/agent-delegation.md` | 搜 "On startup, queued/running child attempts become explicit failed attempts" |
| **#6** Runtime 接口抽象 | `«REF»/wisp-science-main/docs/agent-delegation.md` | 「Native, ACP, and code execution」一节的 executor 划分 |
| **#8** Native Runtime | `«REF»/pi-main/packages/agent/src/agent.ts:98-124` | `AgentOptions` 的全部钩子——`beforeToolCall` / `afterToolCall` / `transformContext` / `shouldStopAfterTurn` 是我们不变式的挂载点 |
| | `«REF»/pi-main/packages/agent/src/agent-loop.ts:31-64` | `agentLoop()` / `agentLoopContinue()` 签名 |
| | `«REF»/pi-main/packages/ai/src/providers/deepseek.ts` | provider 构造全文（14 行），换 Kimi/Qwen 照此改 |
| | `«REF»/pi-main/packages/agent/src/harness/tools/index.ts` | `createBashTool` / `createReadTool` / `createWriteTool` / `createEditTool` |
| | `«REF»/pi-main/packages/coding-agent/src/core/sdk.ts:169` | `createAgentSession()` 入口（第三层，可选） |
| | `«REF»/buzz-main/crates/buzz-agent/src/` | 完整 ACP agent 参考实现（Rust，26,003 行） |
| **#10** 进程组终止 | `«REF»/buzz-main/crates/buzz-dev-mcp/src/shell.rs:675-730` | `KillGroup`：`process_group(0)` / `kill_immediate` / `kill_graceful`（TERM→200ms→KILL）/ `disarm` |
| | 同上 `:17-21` | 边界常量：`MAX_TIMEOUT_MS` 600s · `MAX_BYTES` 50KB · `MAX_LINES` 2000 |
| **#11** per-session 配置隔离 | `«REF»/claude_codex_bridge-main/docs/claude-session-isolation-contract.md` | Claude 侧隔离契约 |
| | `«REF»/claude_codex_bridge-main/docs/codex-session-isolation-contract.md` | Codex 侧隔离契约 |
| **#12** 输入租约 | `«OWN»/multi-agent-explore/src/agentdeck/daemon/lease.py` | `ControllerLease` · `ObserverRegistration` · `TakeoverPreview` · `LeaseAuditEvent` · `LeaseTransition` + 指纹 |
| | `«REF»/wispterm-main/src/agent/terminal_lease.zig` | 终端租约的另一种实现（232 行） |
| **#14** 终端流与流控 | `«REF»/hive-main/src/server/terminal-flow-control.ts` | 背压策略 |
| | `«REF»/hive-main/src/server/pty-output-bus.ts` | 输出广播 |

---

## 阶段 ①-B · 桌面壳

| 实体 | 去哪读 | 看什么 |
|---|---|---|
| **#16** IPC 白名单 | `«OWN»/multi-agent-explore/src/agentdeck/ui.py:1-20` | 「只读端点白名单」的设计注释——可写操作走注册控件而非开洞 |
| **#17** Workbench Protocol | `«REF»/Rho-main/Rho-implementation-plan.md` | 搜 "§2.5 Keep the frontend transport-independent" |
| **#18** 终端组件 | `«REF»/Rho-main/Rho-implementation-plan.md` | 搜 "xterm.js only for an actual shell terminal, never for the Ark R Console" |
| **#19** 终端墙布局 | `«REF»/hive-main/README.zh.md` + `assets/hive-team-view.png` | team 面板的视觉与交互（**BUSL：只看不抄代码**） |
| **#21** 接管控件 | `«OWN»/multi-agent-explore/src/agentdeck/daemon/lease.py` | `TakeoverPreview` 的字段——夺权前展示什么 |

---

## 阶段 ②-A · 科学计算内核

| 实体 | 去哪读 | 看什么 |
|---|---|---|
| **#22** Jupyter 客户端 | `«REF»/Rho-main/crates/rho-kernel/src/lib.rs` | 五通道使用、`ExecuteRequest` / `IsCompleteRequest` / Comm 消息、`InterruptRequested` |
| | `«REF»/Rho-main/Rho-implementation-plan.md` | §2.2 的通道职责映射表（shell / iopub / stdin / control / heartbeat） |
| | npm 包 `enchannel-zmq-backend` 的 `lib/index.d.ts` | `createMainChannel()` / `createSockets()` / `JupyterConnectionInfo` |
| **#24** Ark 集成 | `«REF»/Rho-main/runtime/ark.json` | 固定版本 + sha256 校验的做法 |
| **#26** 中断机制 | `«REF»/Rho-main/Rho-implementation-plan.md` | 搜 "Interrupt is a kernel-manager responsibility" 及其 Phase 0 出口门表述 |
| **#28** 变量检查 | `«REF»/wisp-science-main/python/kernel_worker.py` | `MAX_OBJECTS = 200` 等上限设定 |
| **#29** 结构化 Console | `«REF»/Rho-main/Rho-implementation-plan.md` | §2.4 前端栈选择与「不用 xterm.js 做 REPL」的理由 |
| **#30** 截断保全 | `«REF»/buzz-main/crates/buzz-dev-mcp/src/shell.rs:900-920` | `stdout_truncated` 标志 + artifact 保全 |

---

## 阶段 ②-B · 执行环境与 Run 管理

| 实体 | 去哪读 | 看什么 |
|---|---|---|
| **#31–34** 执行环境 · Run · 凭证 | `«REF»/wisp-science-main/README_zh.md` | 「真实算力」一节：一次连接完成探测、每秒心跳、有界日志、环境快照、密钥只进密钥环 |
| **#35** Skills 加载 | `«REF»/wisp-science-main/crates/wisp-skills/` | 渐进式加载的实现 |
| | `~/.claude/plugins/` | Claude Code 的 marketplace → plugin → `SKILL.md` 实际目录结构 |
| **#36–37** 产物存储与 schema | 规格 7.13 / 7.14 | 来自跨任务协作综述，无参考实现 |

---

## 阶段 ③-A · 事件流与成员

| 实体 | 去哪读 | 看什么 |
|---|---|---|
| **#38** 统一事件流 | `«REF»/buzz-main/ARCHITECTURE.md` | 「every action is a signed event identified by a `kind` integer」的模型 |
| | `«NPM»/pi-crew/src/state/event-log/event-log.ts:20-52` | `TeamEventMetadata` 全部字段：`provenance` / `causationId` / `correlationId` / `attemptId` / `confidence` / `fingerprint` |
| | `«NPM»/pi-crew/src/state/event-log/worker-atomic-writer.ts:1-25` | **反面教材**：他们为 JSONL 并发写付出的代价（疑似 V8/libuv 竞态 → worker 线程）。我们用 SQLite WAL 绕开 |
| **#39–40** 成员与协作空间 | `«REF»/buzz-main/README.md` | 「Agents are members, not bots」的产品理念 |
| **#42** 记忆投影 | `«REF»/Rho-main/Rho-implementation-plan.md` | 搜 "bounded summaries tagged with kernel instance, state revision, and project revision" |
| **#43** 上下文恢复阶梯 | `«REF»/buzz-main/crates/buzz-agent/src/handoff.rs:1-45` | `HandoffOutcome` / `ContextRecovery`（含 `Exhausted` 分支）/ 交接摘要的内容契约 |

---

## 阶段 ③-B · 编排

| 实体 | 去哪读 | 看什么 |
|---|---|---|
| **#44** 任务账本 | `«OWN»/multi-agent-explore/src/agentdeck/step_dag.py` | 任务图模型 |
| | `«REF»/wisp-science-main/src-tauri/src/delegation_tool.rs:276-330` | `delegate_tasks` 的完整 JSON Schema |
| **#46** Report MCP | `«REF»/hive-main/src/cli/team.ts` | **反面教材**：注入 shell 命令的脆弱性（那段教 agent 用 heredoc 防转义的 usage 就是化石证据） |
| **#48** 交叉核对 | `«OWN»/multi-agent-orchestrator/doc/plan.md` | §2.4「Session 不是唯一真相，仓库状态才是」——不变式 5 的出处 |
| | `«NPM»/pi-crew/src/runtime/goal-workflow/goal-achievement.ts` | false-green 检测：mutating workflow + 干净工作树 = 谎报。含 `GoalAchieved = boolean \| "unknown"` |
| **#49** verdict 与 GreenLevel | `«OWN»/multi-agent-explore/src/agentdeck/review_verdict.py` | `review-verdict/v1` 契约 |
| | `«NPM»/pi-crew/src/runtime/verification/green-contract.ts` | 五级 GreenLevel：`none < targeted < package < workspace < merge_ready` |
| **#49b** 验证环境净化 | `«NPM»/pi-crew/src/runtime/verification/verification-gates.ts:22-97` | 为什么验证命令必须剥离密钥 |
| **#49c** manifest 快照 | `«NPM»/pi-crew/src/runtime/verification/verification-integrity.ts:1-30` | 三项残余风险的诚实记录，及「必须靠 worktree 内容寻址才能关闭」的结论 |
| **#49e** 编排成本实测 | `«NPM»/pi-crew/src/workflows/topology-analyzer.ts` | 「串行 3 步比 3 次直调慢 5.7×」的度量与 advisory-only 策略 |
| **#50** worktree 隔离 | `«NPM»/pi-crew/src/worktree/worktree-manager.ts:136-175` | `assertCleanLeader`（`--untracked-files=no` 的理由） |
| **#50b** 脏 worktree 快照 | 同上 `:586-700` | `snapshotDirtyWorktree`：`--binary` diff、256KB 上限、`TextDecoder(fatal)` 探编码 |
| **#50c** seedPaths | 同上 `:496-585` | 符号链接拒绝与越界路径校验（两处，纵深防御） |
| **#50d** 依赖链接 | 同上 `:184-200` | `linkNodeModulesIfPresent` |
| **#50e** 分支新鲜度 | `«NPM»/pi-crew/src/worktree/branch-freshness.ts` | 全文 110 行；`missingFixes` 列出缺失 commit 标题 |
| **#50f** git 环境净化 | 同上文件头 | 防 git hook / alias / credential-helper 窃取环境变量 |
| **#51–52** capability 授权与审批门 | `«REF»/wisp-science-main/crates/wisp-core/src/delegation_policy.rs` | 2,186 行；「模型不能给子 agent 授权原始工具」的实现 |
| | `«REF»/wisp-science-main/docs/agent-delegation.md` | capability → 模型/executor/工具集/预算/超时 的解析规则 |
| **#53** 预览确认 | `«OWN»/multi-agent-explore/src/agentdeck/gate_preview.py` | exact / expiring / consume-once |
| **#54** Planner/Orchestrator 拆分 | `«OWN»/multi-agent-explore/src/agentdeck/orchestration/split_planning.py` | 二段拆分与 `planner_brief` 冻结 |
| **#55** 协作拓扑 | `«OWN»/hermes-multi-agent-demo/src/orchestrator.py:181-240` | `fan_out` / `pipeline` / `cross_validate` / `arbitrate` |
| **#59** ACP Runtime | `«REF»/buzz-main/crates/buzz-acp/` | ACP 客户端实现 |
| | `«REF»/wisp-science-main/crates/wisp-acp/src/lib.rs` | 另一份 ACP 客户端（1,039 行） |

---

## 阶段 ④–⑤

| 实体 | 去哪读 | 看什么 |
|---|---|---|
| **#60** 任务图可视化 | `«REF»/wisp-science-main/docs/agent-delegation.md` | Workflow Studio 的 canvas 交互描述（拓扑分列、inspector、minimap、环检测） |
| **#63** 决策日志 / 失败案例库 | `«OWN»/hermes-multi-agent-demo/src/decision_log.py` · `failure_log.py` | 记录结构与导出格式 |
| **#64–65** Skills 与 MCP 组织 | `«REF»/wisp-science-main/skills/` · `mcp-servers/` | 目录组织形式（内容全部替换为数据科学 / 生态 / 环境方向） |
| **#66** ACP surface | `«REF»/buzz-main/VISION_AGENT.md` | 双协议解耦架构的完整论述 |

---

## 自研实体（无参考）

以下实体没有现成原型——它们是本项目的差异化所在，**照着规格实现，不要找参考**：

`#7` FakeRuntime · `#41` 可见范围过滤器 · `#45` dispatch 通道 · `#46` Report MCP（契约部分）· `#61` 度量框架 · `#62` 附和检测 · `#21c` Entry 序列 · `#21d` 三视图渲染 · `#29b` 内核状态版本 · `#64b–64c` PDF 与文献解读 Skills

其中 **#41 可见范围过滤器**与 **#48 交叉核对**是整个防幻觉体系的两个执行点，规格第 5 节（不变式 1、5）与第 11 节（接口草案）是它们唯一的依据。


---

## WorkBuddy 量表（2026-08-12）

作者：*「我要全面贴近 workbuddy 的 UI」*，随即补了一句要害的：
**「不是无脑贴近，而是基于我们现在有的内容去贴近。」**

所以这份表记的是**它的视觉语言**（数值与结构），不是它的产品判断。
方法与 Hermes / Rho 同一条：**读事实，不读表达**——量数值、记结构，
**不取它任何一行代码**。

来源：`/Applications/WorkBuddy.app` 的 `app.asar`（Electron，与我们同栈），
解包后量 CSS。规模：**280,348 行样式、13,975 个 CSS 变量、近百个文件**——
下面只是已经量到的那一部分，**不是全部**。

| 项 | WorkBuddy | 量自 | 我们采用 |
|---|---|---|---|
| 正文字号 / 行高 | `15px / 1.7` | `markdown-utils-*.css` `.markdown-preview__body` | ✅ `15px / 25px` |
| 正文最大宽 | `900px` | 同上 | ⚠️ 取 **880px**——这一列还要放工具调用与溯源，留余量给密度 |
| 正文内边距 | `32px / 48px` | 同上 | ⚠️ 取 **24 / 32**——我们窗口更窄，48 会吃掉行宽 |
| 代码字号 / 行高 | `13px / 1.6` | 同上 | ✅ 同 |
| 间距标尺 | `4 / 8 / 12 / 16 / 20 / 24` | `--cb-spacing-*` | ✅ 与我们的 `--dawn-unit × N` 同源 |
| 圆角 | `4 / 6 / 8 / 16 / 24` + Radix `--radius-N` | 全局 | 待议：我们是 `0.25–0.75rem × 1.25` |
| 文字层次 | **用透明度**：`rgba(26,26,26,.6)` / 暗色 `rgba(232,236,241,.7)` | `--cb-text-muted` | 待议——**这一条值得学**：在任何底色上都自动协调 |

**明确不抄的**（作者定）：点赞/点踩/朗读/分享那一排（工作台不需要给模型打分）、
「已完成 10s」那种把整轮收成一个词的措辞（**我们有账本，收起来等于把最贵的部分藏了**）。

### 补量：**从运行中的 DOM 量**（2026-08-12）

**样式表里量不到它的界面**：`user-message` / `chat-input` / `composer`
这类语义类名**一个都没有**（只有 `.agent-member-sidebar-status--failed` 这种零碎的）。
它的侧栏、消息块、输入区多半是内联样式或哈希工具类。
唯一量得到的例外是 `.markdown-preview__body`——那块是独立的 markdown 渲染器。

所以改用 **CDP 连上运行中的应用量计算样式**
（`--remote-debugging-port=9222`）。**这比读源码还准**：
不必推断哪条规则最终生效。

| 项 | 实测 | 我们 |
|---|---|---|
| 侧栏宽 / 底色 / 边框 | `264px` · `rgb(242,242,242)` · **无边框** | 275px · 无边框 ✓ |
| 输入卡 | 圆角 **16px** · 内边距 `12px 12px 0` · **无边框** · 阴影 `0 12px 24px -8px rgba(0,0,0,.02)` · 高 ~138px | 已按此改 |
| 输入文字 | **15px / 26.25px（1.75）** | 已按此改 |

**「无边框 + 很轻的浮起」那条是关键**：描边的框看起来是「表单控件」，
只靠阴影浮起的面看起来是「可以往里写东西的地方」。

### 再补：**对话页整块**（2026-08-12，作者说「还是差得挺远」之后）

按住页面上的文字往上爬到它真正的容器读计算样式，不再靠猜类名。

| 项 | 实测 | 我们 |
|---|---|---|
| **对话列** | **784px**，内容区 1113 —— 占 70%，左右各留约 160 | 已按此改（原 880 铺满） |
| 用户气泡 | `#f2f2f2`（**与侧栏同色**）· `padding 8px 12px` · `border-radius: 16px 16px 0`（**右下角 0**） | 已按此改 |
| 助手块 | **无气泡、无底色**，通栏；头像 24×24 + `gap 10` + 名字 `15/26.25/600` | ✓ 一致 |
| 状态行 | 名字下面一行，`rgba(0,0,0,.5)`，如「已完成 5s ›」「深度思考」 | 我们是思考块（Hermes 形态，作者点的） |
| 文字层次 | **只有四档透明度**：`1 / .7 / .5 / .3` | 已对齐（原 72/55/40） |
| 行距 | `26.25px`（15 × 1.75）—— 名字、状态、气泡、输入框**四处同一个数** | 已按此改（原 25） |
| 操作行 | 图标 → `共消耗 ◇4.43` → `Auto (GLM-5.2)`，**连着排**，`gap 12`，`.7`，**不缩小字号** | 已按此改（原先用量甩到行尾） |
| 顶栏标题 | `16px / 24px / 600` | 已按此改 |
| 侧栏分区标题 | `12px / 20px / 600` + `.5` —— **加粗但更淡** | 已按此改 |
| 侧栏行 | 高 31px · 圆角 8px · 左内距 12 | 30px ✓ |
| 底注 | `_aiDisclaimer_`：784 宽、`12/20`、`.3`、居中 | 未采用 |

**上一版量错过一次**：气泡圆角记成了「100px 全圆胶囊」——那个 100px 抓的是页面上
另一个元素。**教训不是「要仔细」，是「按住内容往上爬，别按位置猜」**：
从文字本身 `parentElement` 一层层上溯，读到 `_userMessageBubble_` 才停。

**还没量的**：侧栏 hover / 选中态、状态色、暗色映射、输入卡底部那一排控件
（`+`、权限、模型 pill、麦克风、圆形发送键）。**应用开着调试端口时随时可以再量。**
