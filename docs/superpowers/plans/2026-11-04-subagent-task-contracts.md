# 子任务契约与执行范围实施计划

> 使用 superpowers:executing-plans 在当前隔离工作区逐项实施；按仓库约定单主线，不委派子 agent。用户已要求方案后直接执行。

**Goal:** 实现结构化子任务派单/证据回执和统一执行范围/产物占用保护。

**Architecture:** 共享契约与设置层复用分析路线类型和校验；现有 Pi 工具增加子任务门；现有执行器及 Team/Bot 在同一产物锁上运行和验收。保留旧文本调用与转录。

**Tech Stack:** TypeScript、Zod、Pi、Vitest、Electron/Playwright。

设计见 [设计文档](../specs/2026-11-04-subagent-task-contracts-design.md)。

## 阶段 A：契约与证据

- [x] Task 1：在 src/protocol/analysis-route.ts 导出共享 execution/verification/相对路径 schema；新建 src/protocol/task-contract.ts（共享词汇）和 src/orchestration/task-contract.ts（宿主验收），定义 contract、result、receipt、冻结 scope。新建 tests/orchestration/task-contract.test.ts，先复现非法路径、只读输出、无依据 completed/reviewed、缺失产物、虚构产物及 blocked；复用 validateRouteEvidence/routeDeliverableEvidence。
- [x] Task 2：扩展 src/orchestration/store.ts 的可选设置与结果字段，先在 tests/orchestration/store.test.ts 验证重开、幂等、范围不可扩大和旧记录兼容，再实现。

## 阶段 B：执行范围与共享占用

- [x] Task 3：新增 src/subagent/task-tools.ts，复用 Pi 工具工厂和 permissions 风险判据；tests/subagent/task-tools.test.ts 验证只读、限定写入、符号链接、data/raw、输入覆盖、冻结权限和无证据拒绝。实际 shell 的执行证明使用现有 Native observedBash 模式。
- [x] Task 4：扩展 src/bot/output-locks.ts 共享实例与规范化本地 scope；接入普通 executor、旧 Team、Bot backend。tests/orchestration/task-locks.test.ts 验证跨后端冲突排队、不相交并发、取消排队不启动和退出后释放。

## 阶段 C：端到端装配

- [x] Task 5：扩展 src/subagent/protocol.ts、child-task.ts、child.ts、executor.ts、tool.ts、orchestration.ts 和控制工具，让同步/后台/续问共用设置、真实证据和验收；保留旧调用与 UI 事件。新建真实 Pi/进程集成回归，验证契约不会被续问扩大，回执可持久恢复。
- [x] Task 6：扩展 src/team/types.ts、state.ts、tools.ts、runner.ts、scheduler.ts 和 Native/Bot 适配，任务记录带 contract，配置由父端冻结。Bot 原执行门和交付不弱化；远端不支持的严格能力明确拒绝。验证 DAG 不因契约失败而启动下游。

## 收口

- [x] Task 7：更新使用文档、长期路线图专项进度、验收报告，记录能力限制。
- [x] Run `npm test -- tests/orchestration tests/subagent tests/team tests/bot tests/runtime/orchestration.test.ts`，检查红绿证据及原行为兼容。
- [x] Run `npm run typecheck`、`npm run build`、`npm test` 与相关 Electron 主路径；新增契约路径真实 Electron 验证。
- [x] 自行按 requesting-code-review 检查共享锁顺序、取消/关闭、恢复、冻结范围、证据冒认、旧数据与真实装配。实质修正补失败回归，再验证。
- [x] 归档准确输出，保持主目录和真实用户数据不变，不推送、不发布；本地提交依明确授权处理。

## 当前进度

实现与二次审查已完成；公共协议为 8.40，内部设置使用 taskTeamSnapshot 投影排除。首次交付保留 19 个独立 Electron 场景记录。本轮修复 Team 通信门遗漏、硬链接占用、回执恢复及索引部分重建窗口，新增 11 项回归；最终完整测试 601 文件 / 6081 项通过、11 跳过，定向 298 项及 Electron 7 项通过；typecheck、build、diff 检查通过。用户已明确授权本地提交并合并 main，不推送或发布；最新验收与集成状态见 [二次审查](../../reviews/2026-11-04-subagent-task-contracts-rereview.md)，[首次记录](../../reviews/2026-11-04-subagent-task-contracts-verification.md) 保留。
