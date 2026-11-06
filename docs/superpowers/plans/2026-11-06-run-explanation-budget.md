# 运行解释与会话委派预算 Implementation Plan

后续复查：路径拼写、Team 真实验收阶段的两个缺陷已复现修正，token 到限并发排空补测通过。相关 306 项及真实桌面 7 项、8 次正常进程退出的当前证据见[后续报告](../../reviews/2026-11-06-run-explanation-budget-followup.md)。旧退出异常仍待根因定位；专项仍未提交/合并。

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:executing-plans 单主线逐项执行；本仓库未获明确委派授权，不派生子 agent。

**Goal:** 在现有编排上显示真实等待与历史，为同父会话的委派轮次提供不会因续问或重启归零的预算，沿用现有评测展示效果。

**Architecture:** OrchestrationStore 原子保存事实及预算，OrchestrationService 继续唯一准入和取消；AsyncLocalStorage 关联现有锁/执行/验收的身份；RunOverview 及原协议提供界面。所有新持久字段可选，旧数据保持可读；观察不是恢复事实的另一来源。

**Tech Stack:** TypeScript、Zod、Node AsyncLocalStorage、React、Vitest、Electron/Playwright、现有 Pi 与 evaluate:science。

规格：[运行解释与会话委派预算](../specs/2026-11-06-run-explanation-budget-design.md)。基线 9dd59f4f；基线定向 13 文件 70 测试通过。

## 阶段 A：真实过程解释

文件：新增 src/protocol/run-explanation.ts、src/orchestration/execution-context.ts；修改 src/orchestration/store.ts、service.ts、run-overview.ts、src/bot/output-locks.ts、src/subagent/executor.ts、src/team/scheduler.ts、src/runtime/native.ts、src/ui/run-overview.tsx；测试 tests/orchestration/explanation.test.ts、tests/bot/output-locks.test.ts、tests/ui/run-overview.test.tsx；桌面 e2e/run-explanation-budget.spec.ts。

- [x] 写失败测试：两个同工作区的不同父会话争用同产物，第二个显示首个持有者，排空前不释放；冷读不改 state.json，不能把旧锁当在线锁。
- [x] 运行 `npx vitest run tests/orchestration/explanation.test.ts --maxWorkers=4` 保存红灯。
- [x] 实现受限事件词汇和 execution context；Store 的 recordEvent 为单调 seq、有界256条，事件只接受已知身份/当前 epoch。

```ts
type ExecutionStage = 'lock-wait'|'preflight'|'execution'|'acceptance'
// Context only observes existing execution. It cannot admit or resume work.
reportExecutionStage(stage: ExecutionStage, blockers?: LockOwner[]): void
```

- [x] 在原锁 acquire/drain 中发布当前阻塞关系；在原执行器和 Bot scope 周围标注阶段，不改锁判定及验收规则。
- [x] 运行 `npx vitest run tests/orchestration tests/bot/output-locks.test.ts tests/ui/run-overview.test.tsx --maxWorkers=4`。
- [x] 更新只读协议投影/UI，补 mock；构建后跑真实 Electron 解释场景并截图，向用户展示阶段效果。

## 阶段 B：持久累计预算

文件：新增 src/protocol/run-budget.ts、src/orchestration/budget.ts、src/ui/run-budget.tsx；修改 store.ts、service.ts、run-overview.ts、src/runtime/types.ts、native.ts、src/protocol/operations.ts、version.ts、src/workbench/backend.ts 与 mock；测试 tests/orchestration/budget.test.ts、tests/ui/run-budget.test.tsx 及协议/后端定向测试。

- [x] 写失败测试：maxRuns=2，三次同身份续轮只启动两次，重建后 consumedRuns 仍为2；过期配置拒绝覆盖。
- [x] 写失败测试：超历时触发 abort，但服务仍 stopping 直到真实清理；队列不启动；已完成产物保留。
- [x] 写失败测试：用量分项/partial/未知、取消与硬重启不能归零或重复记账；旧数据兼容且标注未知。
- [x] 运行 `npx vitest run tests/orchestration/budget.test.ts --maxWorkers=4` 保存红灯。
- [x] 实现原子 admission/settlement 与预算修订；服务在准入前检查、结算后检查、历时定时器触发原取消路径。

```ts
type RunBudgetLimits = {maxRuns?: number; maxElapsedMs?: number; maxTokens?: number}
// Changes limits only; consumption and frozen task settings are retained.
configureBudget(limits: RunBudgetLimits, expectedRevision: number): RunBudget
```

- [x] 接入仅 UI 可写 IPC，并在原总览显示配置、消耗、未知/在途限制。协议 minor 递增，mock 同批增加。
- [x] 运行 `npx vitest run tests/orchestration tests/protocol tests/ui/run-budget.test.tsx tests/workbench --maxWorkers=4`。
- [x] 真实 Electron 设置预算、触发拒绝、重启查看同一消耗并截图，展示阶段效果。

## 阶段 C：评测、回归、自审

文件：新增 scripts/evaluate-run-budget.ts；追加 scripts/evaluate-science-pipeline.ts；报告 docs/reviews/2026-11-06-run-explanation-budget.md；证据 docs/validation/run-explanation-budget-20261106；更新 docs/DEVELOPMENT_HISTORY.md。

- [x] 用相同确定性输入运行无预算/有预算场景，记录实际启动轮数、输入哈希、成果保留、恢复后的消耗；原评测场景照旧保留。
- [x] 执行 `npm run evaluate:science -- docs/validation/run-explanation-budget-20261106/evaluation`，核对所有既有与新增结果，不覆盖历史目录。
- [x] 执行 `npm run typecheck`、`npm run build`、`npx vitest run --project node --project ui --maxWorkers=4`、独立内核及相关 Electron 组；以实际 vitest 配置确认项目名后运行。
- [x] 代码自审：事件丢失不冒充业务失败；旧请求/旧 epoch 不改新状态；设置不扩大冻结权限；停止排空不提前释放锁；取消/恢复未知用量不归零；冷读不写。
- [x] 缺陷先写红灯、修复、定向重跑；按最终代码执行必要回归。报告实际覆盖与未覆盖边界；本轮保留专项分支，不自动 commit/merge/push/release。
