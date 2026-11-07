# 正式提交反馈与任务证据贯通 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. 用户已授权本会话执行；不自动提交、合并、推送或发布。

**Goal:** 减少无效正式提交，让用户从协作任务直接检查真实工具证据、验收原因与版本产物，同时用有上限的对照记录收益。

**Architecture:** 现有 TaskSubmission 是唯一提交门，实际工具记录是唯一证据来源，冻结契约决定范围。统一编排仅增加有界证据摘要和完整回执的只读投影；产物沿用既有 readFile、历史留存与 FilePreview，明确历史指纹与当前内容的区别，不另建调度器或恢复存储。

**Tech Stack:** TypeScript / Zod / React / Vitest / Playwright Electron，现有 Pi 子进程与科研流水线。

## 阶段 A：模型提交反馈
- [x] 在 tests/orchestration/task-submission.test.ts、tests/subagent/task-tools.test.ts 先加失败测试：真实 read/bash ID 在工具结果正文中可见；提交错误返回有界 evidenceCatalog、契约 outputs、字段错误；不能伪造或跨任务借证据；取消/并行排空/成功冻结仍有效。
- [x] src/orchestration/task-submission.ts、src/subagent/task-tools.ts、src/orchestration/task-contract.ts 最小实现：宿主附加精简证据标签；失败结构化反馈，不自动代填成功、不扩权、不无限重试。轻量观测沿用 submissionAttempts/invalidSubmissions。
- [x] 定向 Vitest +实际 Pi 子进程夹具；保存原始失败/通过日志和模型可见反馈示例，展示效果。

## 阶段 B：协作任务证据与产物
- [x] src/protocol/run-overview.ts、src/orchestration/store.ts 增加向后兼容的有界工具摘要与 taskReceipt；由 executor/scheduler 的真实 evidence 生成，不重复保存大结果。测试重启读取无写、跨会话拒绝、旧记录兼容和重跑旧回执遮罩。
- [x] src/ui/collaboration-evidence.tsx 新增只读证据/回执详情，供 RunOverview 与 Team 任务复用；准确标注 ID、工具状态、执行状态、路径、截断和缺失。复用 FilePreview 显示当前文件并明确不冒充已验收版本；历史留存沿用 ArtifactHistoryPanel。展示冻结指纹、逐项验收失败和原过程入口。
- [x] UI 异步按会话/任务/代次隔离，切换后迟到结果不显示；不添加自动恢复/重新执行按钮，不改产物锁与取消排空。补 EN、语义焦点与展开返回测试。
- [x] 真实 Electron 在独立夹具内跑：执行→验收→证据→版本→预览→返回；展示截图。

## 阶段 C：同预算评测、审查和收口
- [x] scripts/evaluation-request-gate.ts 增加每组分区额度，整轮原子上限仍30，取消后排空。scripts/evaluate-research.ts 支持 equal per-arm budgets、repeat 与交替顺序；不完整配对不产生质量/成本结论。
- [x] 先跑现有共享 mock 的实际 Pi/Team 路线，两次重复覆盖四个配对；再按用户新增授权最多30次调用当前 DAWN 模型。真实对照选一个代表任务、一次配对、每组固定15次；上轮单组曾用19次，故不拆成每组7次以免所有组提前耗尽。如不足完成，如实报告，不追加额度，不以一次配对推断普遍收益。
- [x] spec compliance 与 independent code review；修复再定向测试。完成 typecheck/build、Node/UI全套、相关桌面回归，必要内核验证。
- [x] 保存阶段图、数据、测试日志及报告。main和正式App/配置保持不变。历史 Close context timeout、关闭管道延迟、remote-terminal afterEach 事件延迟继续OPEN；本轮不复现不等于修复。

## 方案取舍
选择现有记录的有限摘要投影，避免让轮询携带整份转录；完整过程仍走原转录入口。文件版本指纹不表示字节已留存；当前预览和历史留存入口明确分开。暂不做递归委派、通用 workflow DSL 或完整遥测平台。

## 验证命令
```sh
npx vitest run tests/orchestration/task-submission.test.ts tests/subagent/task-tools.test.ts
npm run typecheck
npm run build
npx vitest run --project node --project ui --maxWorkers=4
npx playwright test e2e/task-contract.spec.ts e2e/science-pipeline.spec.ts e2e/collaboration-workbench.spec.ts e2e/collaboration-network.spec.ts e2e/subagent-shutdown.spec.ts e2e/exit-lifecycle.spec.ts
```

## 最终状态

Implementation, targeted tests, full Node/UI regression, build, typecheck and independent reviews completed. Source frozen: 44 changed files, zero drift; 648 files / 6408 tests passed, 10 existing skips. Desktop batch: 59 passed / 1 skipped, then explicit Python/R and artifact-chain supplemental acceptance: 2 passed. Actual model pilot: 18 of 30 maximum requests, zero complete pairs; no quality or cost benefit established. Informational-vs-blocking issues guidance clarified afterward; not revalidated with live inference. Main remains 77aeae71; no commit, merge, push, release or installed-app replacement. Historical intermittent timeouts remain OPEN. See docs/reviews/2026-11-07-submission-evidence-workbench.md.
