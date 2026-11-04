# DAWN 统一编排升级实施计划

> For agentic workers: 使用 superpowers:executing-plans 在当前隔离工作区逐任务执行。用户已要求制定后直接执行；不重复索取开工确认。遵循测试驱动开发和阶段验收，默认不派子 agent。

**Goal:** 完成统一编排、持续协作和持久恢复前三阶段，让主 agent 能可靠控制并继续既有子任务。

**Architecture:** 新增父会话作用域协调服务和原子 JSON 状态库；SubagentExecutor 与团队/Bot 通过适配入口复用同一准入、取消和排空机制。Pi 主循环、现有 Team DAG/attempt 与 Bot 产物锁保留。

**Tech Stack:** TypeScript、Node.js、Zod、Pi、Vitest、Electron/Playwright。

## 范围、依赖和执行记录

设计：[统一编排设计](../specs/2026-11-04-unified-orchestration-design.md)。后续结构化工作流和外部 agent 后端进入 P3，不阻塞当前目标。原长期路线图中的历史完成状态不在本次批量改写。

- 基线：43dd7bdc，主工作区 clean。
- 工作区：/Users/liuyue/.codex/worktrees/dawn-orchestration-20261104/dawn-science。
- 分支：codex/unified-orchestration。
- 依赖：复用现有 node_modules 符号链接，不运行安装或变更 lockfile。
- 2026-11-04 基线：28 个文件 / 219 项 subagent、team、bot 与 Native 续问测试通过。

## P0：统一生命周期和执行准入

### Task 1：持久身份和恢复状态库

Files: Create src/orchestration/store.ts, tests/orchestration/store.test.ts。

- [x] 先写使用真实临时目录的行为测试：相同地址 ID 稳定、不同后端不碰撞、同 ID 内容冲突拒绝；原子保存后可重开；未知版本和损坏 JSON 不覆盖原文件。
- [x] 测试恢复：running → interrupted，完成结果保持；状态文件中的 ownerSessionId 必须匹配。
- [x] Run `npm test -- tests/orchestration/store.test.ts`，确认失败原因是新能力不存在。
- [x] 实现版本化 Zod schema、地址派生 ID、读写和状态事务；先写临时文件再 rename，变更失败不发布内存状态。

接口约定：
```ts
type ChildKind = "subagent" | "team" | "bot"
type RunState = "idle" | "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted"
// childIdentity(kind, address, ownerSessionId) returns a stable opaque ID; no caller-provided path is opened.
// OrchestrationStore(sessionDir, ownerSessionId) owns one versioned state file.
```

- [x] Run 同一测试，验证磁盘数据保留和恢复；更新阶段证据。

### Task 2：共享容量、逐子级串行和关闭排空

Files: Create src/orchestration/service.ts, tests/orchestration/service.test.ts。

- [x] 先写行为测试：不同后端共享最多 N 个执行名额，同一子级连续两轮不会重叠，等待期间取消不调用后端。
- [x] 写关闭与错误用例：关闭同步拒绝新请求，活动信号取消，等待实际后端 finally；一个失败不阻塞后续执行；旧 epoch 不能写新结果。
- [x] Run `npm test -- tests/orchestration/service.test.ts` 验证红灯。
- [x] 实现 session-scoped service，入口遵循 `run(child, work, signal?)`；work 返回 `{ok, output, error?}`。工作完成在 finally 归还名额，close 为幂等 Promise。
- [x] Run 定向测试到绿灯。

### Task 3：接入普通子任务、旧 Team 和 Bot

Files: Modify src/subagent/executor.ts, src/subagent/tool.ts, src/team/scheduler.ts, src/runtime/native.ts；新增接线测试。

- [x] 测试真实 SubagentExecutor 和 Team scheduler 使用同一协调器时共享容量，原有事件和按输入顺序返回结果保持。
- [x] executor 以可选协调器装配保持旧调用方兼容；子任务地址是 toolCallId/index，禁止从模型传入路径。
- [x] scheduler 在既有成员一轮执行外接协调服务，Bot 延续释放原轮次名额；原 attempt 仍是任务结算权威。
- [x] NativeRuntime 每个父会话装配同一服务，stop 在释放父会话前 await close；启动失败也收尾。
- [x] Run `npm test -- tests/orchestration tests/subagent tests/team tests/bot tests/runtime/subagent-follow-up.test.ts`。

## P1：主 agent 可用的持续协作

### Task 4：普通子 agent 控制面和稳定地址

Files: Create src/orchestration/tools.ts, tests/orchestration/tools.test.ts；Modify src/subagent/tool.ts, src/runtime/native.ts。

- [x] 先测试后台启动立即返回稳定 ID，列出状态/能力；发送后续消息续同一目录；同一 requestId 不重复执行。
- [x] 增加主 agent 可见工具，名称清楚区分启动、发送、列出、等待变化和中断。参数经 schema 验证，拒绝不属于当前父会话的 ID。
- [x] 后台执行复用 createSubagentTool，不复制执行器；后续执行复用 createSubagentFollowUp 的转录路径，明确是否回送主 agent。
- [x] 排队和 steer 能力分开报告，未实现的实时引导明确报不支持。
- [x] 验证原用户侧续问不会改变主结果，取消后后续消息可再次启动。

### Task 5：团队适配和原有界面兼容

Files: Modify src/team/scheduler.ts, src/runtime/native.ts；Test tests/orchestration/adapters.test.ts, tests/workbench/subagent-restore.test.ts, tests/ui/subagent-pane.test.tsx。

- [x] 主控制面能够发现当前注册的 Team/Bot，能力不支持时明确拒绝；消息和中断转到 scheduler 原有身份检查。
- [x] 保持 subagent_start/end/event 与 team_changed，后台执行的过程可在现有坞查看，不建立第二套隐藏 UI 状态。
- [x] 验证跨会话拒绝、成员移除重加不会续错、Bot 不出现嵌套团队工具。

## P2：持久消息、回执和恢复

### Task 6：消息队列与恢复对账

Files: Extend src/orchestration/store.ts, service.ts；恢复测试落在 tests/orchestration/store.test.ts、mailbox.test.ts 和 tests/team/recovery.test.ts，不另建 recovery.test.ts。

- [x] 用落盘后重建服务测试 queued/running/completed 三种消息；running 中断后绝不重新调用后端，queued 未开始消息在明确接续时执行。
- [x] 为 requestId 持久记录 payload、执行 epoch 和结果；同 ID 不同内容拒绝。保存失败不启动执行或确认接收。
- [x] 旧 meta.json/transcript 保留，按权威地址补注册；恢复状态缺失或转录损坏必须说明原因。
- [x] 中断只取消本轮，关闭取消全部并关闭准入；延迟结果不能覆盖取消/重启后状态。

### Task 7：父结果通知与自动补送

Files: Create src/orchestration/delivery.ts, src/runtime/orchestration-receipt.ts, tests/orchestration/delivery.test.ts, tests/runtime/orchestration.test.ts；Modify src/runtime/native.ts。

- [x] 复用 BotDelivery 的已落盘 outbox/父历史稳定标记确认模式；测试父忙、投递失败、写入后确认前崩溃、重复 flush 和重启。
- [x] 执行结果先持久化再发通知；父历史确认标记后才 delivered；不重跑子任务以重新取得结果。
- [x] Native 父空闲时尝试补送，关闭后停止唤醒；队列回执和实际回复在文案中明确区分。

## 收口

### Task 8：文档、验证、代码审查与交付

Files: Create docs/reviews/2026-11-04-unified-orchestration-verification.md, docs/子agent协作-怎么用.md；Update 当前计划和长期路线图专项入口。

- [x] 执行定向红绿验证，记录准确数量和限制。
- [x] Run `npm run typecheck`、`npm test`、`npm run build`。
- [x] 运行相关 mock Electron subagent/team 主路径验收；必要时增加实际控制工具接线验收。
- [x] 审查取消、并发、恢复、跨会话身份、旧会话、状态损坏；任何实质变更补测试后重新验证相关面。
- [x] 保存验收报告与当前进度，保留用户可审阅 diff。依本仓库约定，没有额外授权不自动 merge/push/发布。

## P3：后续路线（当前不执行）

在前三阶段验收后，按科研任务需要单独设计结构化结果、条件工作流和外部后端；以人工介入次数、重复工作、缺陷检出、耗时和费用衡量收益，不以子 agent 数量作为成功指标。

## 2026-11-04 本地交付状态

P0/P1/P2 的实现与验收已完成，代码位于隔离工作区，最终整体验证日志已归档。P3 不在当前目标范围内，未开始。

实现保留 Pi 主循环、独立子进程、原 Team/Bot 状态机、BotDelivery、产物锁和原始转录；新增协调/消息适配层及行为回归。已实现 next-turn Queue，未实现运行中 Steer、条件 pipeline 或外部 agent 后端。

用户已明确选择“本地提交到专项分支”，满足长期路线图第 7 节的授权要求。仅在 codex/unified-orchestration 分支本地提交；不 merge、push 或发布。

最终证据：594 个文件 / 6034 项测试通过，11 项跳过；12 个独立 Electron 场景通过；typecheck、build、diff 检查通过。详情及原始日志见 [验收记录](../../reviews/2026-11-04-unified-orchestration-verification.md)。真实服务商、跨平台清理及科研准确性未验证。
