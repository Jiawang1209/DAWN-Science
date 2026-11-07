# P2：正式流水线审阅预留 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 正式科研流水线在有限执行轮次下，为独立审阅保留一轮，并正确处理并发、修订、取消和恢复。

**Architecture:** 扩展同一 BudgetRecord/OrchestrationStore 原子账本和现有准入路径；不引入评测代理服务器或另一套调度器。

**Tech Stack:** TypeScript、Zod、原子 JSON 状态、Vitest、Electron。

---

## Task B1：定义可选持久预留

**Files:**
- Modify: `src/protocol/run-budget.ts`、`src/orchestration/budget.ts`、`src/orchestration/store.ts`。
- Test: `tests/protocol/run-budget.test.ts`、`tests/orchestration/budget.test.ts`、`tests/orchestration/store.test.ts`。

第一版预留的明确语义：

```ts
interface ReviewRunReservation {
  key: string // JSON.stringify([ownerSessionId, pipelineId, revisionCycle])
  stage: 'review'
  remainingRuns: 0 | 1
  phase: 'held' | 'consumed' | 'released' | 'recovery-check'
}
```

key 使用规范 JSON 元组编码，持久记录可无歧义取得 owner/pipeline/cycle；不能仅靠成员昵称。实际 epoch 与准入记录沿用既有稳定身份，不用 UI 索引。用户配置通过现有 `setRunBudget` 的 CAS 请求扩展可选开关（默认 false），内部数量固定为每周期一轮；无 maxRuns 时拒绝启用此轮次预留。

- [x] 旧 BudgetRecord 缺预留字段时按无预留读取，保留 consumedRuns/legacyRuns/未知用量。新增 schema 协议同批更新消费者与正反解析测试。
- [x] 写准入、消费、释放的失败测试；初始可用轮次小于三阶段最低需要时，任何副作用前阻塞。
- [x] 原子准入按 `可用 = maxRuns - consumedRuns - heldReviewRuns` 判断普通阶段；review 在一次写入中消费自己的预留并扣实际执行轮次。
- [x] 相同 child/epoch 重复回调不重复收费；不能消费其他 owner、pipeline 或修订周期的预留。

测试要求示意：

```ts
expect(afterCheckAndAnalysis).toMatchObject({consumedRuns: 2})
expect(ordinaryAdmission.allowed).toBe(false)
expect(reviewAdmission.allowed).toBe(true)
expect(afterReview.consumedRuns).toBe(3)
expect(repeatedSettlement.consumedRuns).toBe(3)
```

以上名称为测试中的观察值，生产 API 继续使用现有 store/service 准入方法。不能把 consumedRuns 当模型请求数。

Run: `./node_modules/.bin/vitest run --project node tests/protocol/run-budget.test.ts tests/orchestration/budget.test.ts tests/orchestration/store.test.ts`。预期旧数据、冲突版本和原子计账全部通过。

## Task B2：接入流水线、排空和恢复

**Files:**
- Modify: `src/orchestration/service.ts`、`src/team/science-pipeline.ts`、`src/protocol/science-pipeline.ts`，必要的 `src/team/scheduler.ts` 适配仅传递既有身份。
- Test: `tests/orchestration/service.test.ts`、`tests/team/science-pipeline.test.ts`、`tests/team/science-batch-recovery.test.ts`、`tests/team/recovery.test.ts`、`tests/subagent/task-recovery.test.ts`。

- [x] 流程开始前持有其周期预留；批量流程同时准入用同一个原子账本，不能两个分支各自读旧余额后都成功。
- [x] 前序失败/取消沿用现有停止排空；已准入轮次不退款，未用预留只在对应流程排空并终结后释放。
- [x] recover 将未结束预留设为 recovery-check，已消耗轮次不清零；未重新核验文件版本的流程不自动开始或消费预留。
- [x] 旧 attempt 的迟到结果不能改新周期；中断后再次恢复仍幂等。
- [x] review=revise 后重新为下一周期核算所需阶段；不能返还旧消费。降低预算或 revision conflict 的行为清楚可解释，不强杀合法在途任务。
- [x] 没启用策略、非科研任务和不支持后端保持既有行为，不伪造阶段预留。

Run: `./node_modules/.bin/vitest run --project node tests/orchestration/service.test.ts tests/team/science-pipeline.test.ts tests/team/science-batch-recovery.test.ts tests/team/recovery.test.ts tests/subagent/task-recovery.test.ts`。

## Task B3：预算可见与正式装配验证

**Files:**
- Modify: `src/ui/run-budget.tsx`、`src/protocol/operations.ts`、`src/ui/i18n/en.ts`；中文沿用调用处的现有 t/中文键约定，不创建不存在的 zh.ts。
- Test: `tests/ui/run-budget.test.tsx`、`e2e/run-explanation-budget.spec.ts`、`e2e/science-pipeline.spec.ts`。

- [x] UI 显示普通阶段可用、审阅预留、已用、在途和恢复待核对；启用/修改沿用 expectedRevision。
- [x] 所有文案写执行轮次；保留 token 未知、结算后核验和在途可能超额说明。不要搬入评测 11+4 常数。
- [x] 在真实 Electron 演示前序普通轮次受限、review 仍可准入，再演示取消排空释放以及重启核对。不以 mock 推理证明审阅质量。
- [x] 类型/构建、完整 Node/UI、相关 Electron，独立审查后展示预算账本和恢复截图。

Run: `./node_modules/.bin/vitest run --project ui tests/ui/run-budget.test.tsx`。重建后：

```sh
DAWN_RUN_BUDGET_EVIDENCE_DIR=/tmp/dawn-research-collaboration-p1-p4-20261107/p2/desktop DAWN_COLLABORATION_EVIDENCE_DIR=/tmp/dawn-research-collaboration-p1-p4-20261107/p2/desktop DAWN_TRACE_VERIFY=1 ./node_modules/.bin/playwright test e2e/run-explanation-budget.spec.ts e2e/science-pipeline.spec.ts --output=/tmp/dawn-research-collaboration-p1-p4-20261107/p2/desktop-results
```

若该 run 目录已有结果，先分配并记录新的 runId 子目录，不能覆盖原始结果。

B1 执行记录：43 项定向通过，独立规格审查通过。恢复审阅已准入的旧轮次不退款；B2 通过可选持久 budgetGeneration 区分新的已核验恢复代次（科学修订 round 不变），并重新核算仅审阅需要的 1 轮。初始准入默认 3 轮、修订分析+审阅 2 轮保持。minimumRuns 内部范围为 1—3，零不可用；外部 API 不能自行传递预留身份。

最终本地验收已完成：6586 Node/UI 通过、10 跳过；9 项桌面回归及追加的中断恢复 1 项通过，类型与构建通过。独立规格/质量复审最终无阻断。首轮失败与修复均保留，详见 `docs/validation/research-collaboration-p1-p4-20261107/p2/README.md`。未运行全量桌面或 kernel，真实模型收益仍待 A3。
