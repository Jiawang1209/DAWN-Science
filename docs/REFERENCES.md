# 参考地图

- **日期**：2026-08-08
- **用途**：实体清单里的「构思来源」只写了项目名与文件名。本文档补上**本地路径与具体位置**——实现某个实体时，一查就知道去读哪里。

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
