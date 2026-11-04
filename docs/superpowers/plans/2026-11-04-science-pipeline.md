# 结构化结果提交与科研流水线实施计划

> 使用 superpowers:executing-plans 在当前专项工作区按任务执行；仓库默认单主线。用户已明确要求方案后直接实施，不重复询问开工。

**Goal:** 让现有子任务可正式提交结构化结果，支持有界、可恢复的核查→分析→审阅→修正/交付，并记录真实轻量观测。

**Architecture:** 扩展共享协议并提供小型 TaskSubmission 控制器；普通 Pi 工具和 Native Bot 外层门共用它。固定流水线作为现有 Team 的持久状态 reducer 与模型工具，继续复用 attempt、DAG、输出锁、分析路线和恢复入口。

**Tech Stack:** TypeScript、Zod、TypeBox、Pi、Vitest、Electron/Playwright。

设计：[方案](../specs/2026-11-04-science-pipeline-design.md)。基线 5c88414e；分支 codex/science-pipeline。

## Task 1：共享数据与提交状态

文件：src/protocol/task-contract.ts、src/orchestration/task-contract.ts；新建 src/orchestration/task-submission.ts、src/protocol/task-observation.ts；测试 tests/orchestration/task-submission.test.ts、tests/protocol/task-contract.test.ts。

- [x] 先用真实临时文件/工具证据复现非法提交应可修正、成功后不可重开、有活动调用时不能提交以及数据类型/审阅字段遗漏。
- [x] 扩展可选 submission/resultType/data；三个科学载荷均有界，数值有限。保留旧结果形状；requireExecution/Review 继续生效。
- [x] TaskSubmission 管理活动工具数、accepted/blocked 快照、attempt/invalid 计数，复用 acceptTaskResult；Tool 参数复用 schema，不接受模型 metrics。
- [x] Run `npx vitest run tests/orchestration/task-submission.test.ts tests/orchestration/task-contract.test.ts tests/protocol/task-contract.test.ts`，确认红→绿。

## Task 2：普通 Pi、Team 和持久 Bot 接线及观测

文件：src/subagent/{task-tools,child,child-task,protocol,executor,run-dir,tool}.ts、src/team/{runner,types,scheduler,state}.ts、src/runtime/native.ts、src/workbench/backend.ts、src/orchestration/store.ts；新建 src/runtime/task-observation.ts。

- [x] 复现提交后 write、通信工具和等待 parent authorize 的迟到调用必须拒绝；严格 tool 模式最终 JSON 不算提交。
- [x] 普通工具装配共用 TaskSubmission，附加资源/通信工具也经过终结门；子会话导出已提交结果、真实证据和新轮次 usage。父端解析并保存有界 observation。
- [x] Native 持久 Bot 注册受任务范围约束的提交工具，外层门登记活动调用并在异步边界复核终结状态；runWithTaskScope 返回提交快照、evidence、observation。后端在占用内复核验收。
- [x] Outcome、meta、task/result 保留 observation；从新增 branch entry 复用 sessionUsage，缺失不补零。
- [x] Run 定向 `npx vitest run tests/subagent tests/orchestration tests/team tests/bot tests/runtime/orchestration.test.ts tests/workbench/bot-contract.test.ts`，真实本地模型用例验证改错提交与终结冻结。

## Task 3：Team 上的持久科研流程

新建 src/protocol/science-pipeline.ts、src/team/science-pipeline.ts；修改 src/team/{state,scheduler,recovery,tools,types}.ts、src/bot/recovery.ts；测试 tests/team/science-pipeline.test.ts。

- [x] 写并运行流程顺序、独立审阅、一次/两次修正、阻塞、不重放、去重/冲突与取消红灯用例。
- [x] PipelineSchema 保存冻结定义/路线快照、阶段和 round、任务 ID、终态、版本及时间。reducer 只消费当前真实回执，推进与新任务同一次 team.json 写入。
- [x] reviewer 只读且与分析身份不同，需真实 read 证据。repair 复用原分析契约并附具体意见，maxRevisions 0–2；未知失败不自动重试。
- [x] 恢复将活动流程标 interrupted；显式 resume 保留已验收阶段，未知效果须 acknowledgeInterrupted，新建 attempt；限制通用 Team 修改活动流水线。
- [x] Run `npx vitest run tests/team/science-pipeline.test.ts tests/team tests/bot/recovery.test.ts tests/orchestration`。

## Task 4：主会话工具、路线投影与公共快照

新建 src/team/science-pipeline-tools.ts、src/runtime/science-pipeline-route.ts；修改 src/runtime/native.ts、src/team/task-snapshot.ts、src/protocol/{events,version}.ts 和相关只读/方案期工具分类；测试 tests/runtime/science-pipeline-route.test.ts、tests/protocol/events.test.ts。

- [x] start_science_pipeline 绑定当前分析路线 routeId/revision/stepId 和既有 agent/Bot；稳定请求身份、先持久后调度；提供 status/resume/cancel。
- [x] 路线完成投影使用 expected revision 与稳定来源标记；冲突不覆盖新路线，重复更新/崩溃恢复幂等。展示 facts 不泄漏 settings。
- [x] 更新协议版本并覆盖严格客户端 schema；原 Team/普通子任务入口继续可用。
- [x] 新增真实本地 Pi/后端与 Electron 用例：完成交付、一次审阅修正、阻塞、取消/重开和恢复；保留每阶段回执及观察量。

## Task 5：审查与验收

- [x] 更新 docs/子任务契约-怎么用.md、新科研流程使用指南、长期路线图专项和审查报告。
- [x] 完成技能要求的代码审查：提交权威性、活动调用/取消窗口、共享占用、attempt/冻结定义、恢复与路线跨文件幂等、unknown usage、旧快照消费者。
- [x] 实质问题先复现修复并补测；固定源码后执行 `npm run typecheck`、`npm run build`、`npm test -- --maxWorkers=4` 和相关 Electron 主路径。
- [x] 将准确输出和源码 SHA256 清单归档 docs/validation/science-pipeline-20261104；保留可审阅 diff。不推送、不发布，Git 集成遵循明确授权。

## 进度

五项任务完成，/goal 的实现、验收与代码审查目标已达到。最终全量 608 文件/6120 项通过、11 跳过；Electron 15 场景通过；类型检查与构建通过。56 个变更代码/测试/夹具的清单归档。审查修复与初次 PTY 清理时序波动见 [验收报告](../../reviews/2026-11-05-science-pipeline-verification.md)。改动未提交，留在 codex/science-pipeline 专项工作区，main@5c88414e 保持干净；未推送、发布或替换安装应用。

2026-11-05 后续：用户明确授权二次审查、修复补测后本地提交合并 main。本轮补齐阶段外写入口、显式恢复和正常阶段结算故障的暂停检查点，以及异步检查点后的取消复核；最终 608 文件/6127 项通过、11 跳过，Electron 15 场景通过。最新集成进度以 [二次审查报告](../../reviews/2026-11-05-science-pipeline-rereview.md) 为准。

本地集成已完成：功能提交 `59eccd6e` 已快进合并 main；main 类型检查、完整构建与 11 文件/72 项关键回归通过，56 个代码/测试/夹具哈希一致。未推送、未发布，保留专项工作区。
