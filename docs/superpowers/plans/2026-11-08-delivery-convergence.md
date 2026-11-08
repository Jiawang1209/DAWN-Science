# 预算内交付收敛与成果协作台实施计划

> 按 `superpowers:executing-plans` 单线逐任务实施；用户已要求开始开发，沿用已确认的对话协作台方向。无独立审查者，不自动提交/合并，不推送、不发布。基线 main `646bcc1a`；分支 `codex/delivery-convergence-20261108`。

**Goal:** 让冻结任务基于真实证据及时正式交付，并让已验收产物及关键协作状态从主界面可直接查看。

**Architecture:** 复用 TaskSubmission/evidence/TaskSettings、现有评测预算 partition、RunOverview/outcome、listArtifacts 与版本预览。不另建调度器、预算账本、成果表或恢复状态机。检查点和页面均只读投影。

**Tech Stack:** TypeScript、Pi、Electron、React、Vitest、Playwright；沿用现有本地科研评测与请求网关。

设计细节见 [设计说明](../specs/2026-11-08-delivery-convergence-design.md)。本轮范围是上一轮优先级 1、2；受控重排和更多执行后端保留后续。

## 阶段 0：隔离与基线

- [x] 确认 main 干净，创建独立 worktree，复用已安装 node_modules，不安装/升级依赖。
- [x] 为两个上一轮 evidence 根及 main 记录只读 SHA 基线；新证据写 `docs/validation/delivery-convergence-20261108/`。
- [x] 执行基线：`npx vitest run tests/orchestration/task-submission.test.ts tests/runtime/approved-plan.test.ts tests/ui/plan-card.test.tsx tests/ui/collaboration-member-panel.test.tsx`，记录实际命中项与输出；缺少文件时按现有文件名校正。
- [x] 阅读本计划与设计，检查 scope、字段、取消/封存语义及预算计量一致，无未决设计占位项。

## 阶段 A1：只读交付检查点

Files: `src/orchestration/task-submission.ts`、`src/subagent/task-tools.ts`、`src/orchestration/task-contract.ts`；新增 `tests/orchestration/task-checkpoint.test.ts`，补现有 task-tools/提交测试。

- [x] 先写失败测试：查询不增加 observation 次数；只返回本任务证据；成功读/写与失败调用区分；执行/审阅引用按原 positiveReferenceKinds；sealed/cancelled/draining/validating 状态真实；路径/目录及 ID 按原限制截断。
- [x] 运行 `npx vitest run tests/orchestration/task-checkpoint.test.ts`，确认因缺少检查点而失败。
- [x] 提取提交器内可复用的只读投影，不用伪造提交触发 feedback。工具形式：

```ts
checkpointTool() {
 return {name:'get_task_status', parameters:Type.Object({}),
   execute:async (_id:string,_args:unknown,signal?:AbortSignal)=>({
     content:[{type:'text' as const,text:JSON.stringify(this.checkpoint(signal?.aborted??false))}]
   })}
}
```

- [x] 在有冻结契约的内部工具列表中加入检查点，保留原 scope.tools 的文件/执行权限；无契约旧工具列表不变。封存后仅允许只读检查，不能重新执行或修改结果。
- [x] 按证据进展变化附加短提示，说明“证据观察齐备，仍须正式提交/宿主验收”，不自动判科学正确，不重复倾倒目录。
- [x] 重跑提交、task-tools、普通子任务、Bot 和版本验收专项，记录全称与通过数。
- 展示 A1：同一任务首次查询显示缺口，真实读取/写入后查询显示可用证据，正式提交后显示封存；输出前后提交计数证明查询无副作用。

## 阶段 A2：准确预算反馈与评测接线

Files: `scripts/evaluation-request-gate.ts`、`scripts/research-trial-budget.ts`、`scripts/evaluate-research.ts`、`src/evaluation/research-manifest.ts`；补 `tests/evaluation/*` 既有网关/runner 测试。

- [x] 先测并发预占后余额、分区共享/审阅独占、关闭后不转发、取消排空、原请求体不变异、未开启提示时字节兼容；反馈不能含 token/凭证或响应正文。
- [x] 提示由既有 partition 统计生成，字段为 `limit`、`reserved`、`remainingAfterThisRequest`，其定义为 `Math.max(0,limit-reserved)`，不复用产品 maxRuns。
- [x] 单/多执行者使用相同提示策略，记录候选和分区方案进 manifest。预算门仍在第一个 await 前预占，提示不能绕过限额或自动重试。
- [x] 沿用当前评测入口增加模型自动安排的合法性/审阅覆盖/规划调用计数记录；固定夹具与自动安排结果分开。若真实自动安排不能批准，如实失败，不能退回手写三任务冒充通过。
- [x] 确定性同题评测与真实复验均已完成：总26/30次，单组15次合格、多组11次工作额度耗尽；规划2次计入工作11，审阅0/4未挪用。完整配对0，不宣称多Agent收益，无模型试验重跑。
- 展示 A2：两次请求之间的实际余量变化、审阅余额未被挪用；展示真实或离线评测原表、完整配对及失败状态，不预先承诺提效。

## 阶段 B：已验收产物贯通

Files: `src/protocol/task-artifacts.ts`、`src/protocol/collaboration-outcome.ts`、`src/protocol/collaboration-settlement.ts`、`src/protocol/operations.ts`、`src/protocol/version.ts`、`src/workbench/backend.ts`；新增纯投影 `src/orchestration/accepted-artifacts.ts`；`src/ui/state/catalog.ts`、`src/ui/artifact-list.ts`、`src/ui/artifacts.tsx`、`src/ui/plan-card.tsx`；复用现有文件预览、outcome 规则和有界 fileIdentity 内容核对。补 protocol/backend/UI 专项。

- [x] 先写投影/后端失败测试：foreign owner 无返回；旧 epoch/attempt 不算当前验收；失败/blocked/cancelled 不伪造成功；同名不同版本保留来源；history 明确标记；读取不启动团队/恢复任务。
- [x] `taskArtifacts` 是可选数组，按现有 artifact 查询风格返回 `path/kind` 与完整 `version`、来源绑定和阶段/最终验收范围，升级所有 consumer，保持旧字段与列表不变。
- [x] 使用既有 outcome 规则和内容版本，后端不凭文件存在、模型文字或 mtime 推断验收。保留不存在/当前内容未知与历史版本的区别。
- [x] UI 合并展示不同来源但保留版本选择，沿用文件预览，增加只读内容核对并在哈希前后校验来源；方案卡区分“验收产物”与原主会话登记统计。
- [x] 补内容改变、删除、旧会话、重开、同名文件/不同 attempt 和跨会话迟到响应测试；确认旧文件、路线和普通产物入口正常。
- 展示 B：先前“验收通过 3 项但成果看不到”的夹具现在能在主产物页直接找到 2 个带验收版本的文件；修改文件后展示版本不匹配，不冒充当前结果。

## 阶段 C：紧凑协作界面

Files: `src/ui/collaboration-workflow.tsx`、`src/ui/collaboration-network.tsx`、`src/ui/agent-observation-view.tsx`、`src/ui/styles.css`、`src/ui/i18n/en.ts`；补协作 UI 测试与 `e2e/approved-plan-execution.spec.ts`、`e2e/collaboration-network.spec.ts`。

- [x] 先测试职责/精确身份/当前动作/阻塞入口可读，搜索和筛选不变；紧凑模式不重复展示完整上下文与未知数值段落；详情仍能看原字段。
- [x] 提供紧凑观测投影，节点高度和布局坐标同步调整，长中文名截断后仍可访问完整文本；真实父子连线与任务依赖分开解释。
- [x] 在 900px 和宽屏捕获多成员真实 Electron，检查无横向溢出、弹层标题遮挡、详情滚动陷阱；选择联动和展开返回精确保留。
- [x] 双语扫描与样式/组件回归通过后展示实际前后图；不自动更新既有视觉基线。
- 展示 C：默认对话协作台、展开流程、选中成员/工具/产物以及返回后的状态，使用新的证据目录。

## 阶段 D：回归、代码自审与交付

- [x] 检查方案绑定、冻结权限、会话/epoch/attempt、封存、预算并发、取消排空、产物锁、恢复和旧功能入口；发现问题先复现再修复补测。
- [x] 最终候选冻结源文件指纹，运行 `npm run typecheck`、`npm run build`、全量 `npx vitest run`。源码冻结期间不编辑 src/scripts；完整 Node/UI 与 Electron 分开运行，避免与真实 API 同时压测 PTY。
- [x] 相关桌面覆盖批准绑定、旧方案、自动安排、协作、普通子任务、Bot、科研流水线与终端退出；所有 DAWN_*_EVIDENCE_DIR 和退出目录指定到本轮，特别是 DAWN_HANDOFF_EVIDENCE_DIR。
- [x] 原始失败日志保留；正常手写代码/文档通过 diff --check，采样原日志不为通过检查而改写。
- [x] 记录实际用量、预算提示、任务拆分与合格交付；未运行或未完整配对不宣称收益。
- [x] 写本轮报告、逐阶段截图与复现命令，核验旧 evidence/main/正式数据保护边界。本轮默认不提交/合并，待用户后续授权。

## 完成判据

检查点真实只读、预算提示来自原账本且不越权、验收产物从统一入口可见且绑定版本、协作布局紧凑而旧入口不丢、测试与自审无未解释阻塞。真实评测可以失败，但必须完整记录；没有新增额度则显式标记未复验。历史偶发退出与 PTY 问题持续 OPEN，不因本轮通过而关闭。

最终验收见 [本轮报告](../../validation/delivery-convergence-20261108/README.md)与[真实对照](../../validation/delivery-convergence-20261108/live-results.md)。真实模型失败被如实保留；不以数值一致代替正式交付。
