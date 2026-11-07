# P1：审阅交付与真实复验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 分清真正交付、正确阻塞及未完成提交，并在新额度授权后复验最新候选。

**Architecture:** 扩展既有 research evaluation；宿主计数与 SDK/输出截断诊断分开，真实文件仍由独立真值与版本检查验收。

**Tech Stack:** TypeScript、Vitest、Pi 子进程、现有 loopback 请求门。

---

## Task A1：补齐提交诊断口径

**Files:**
- Create: `src/evaluation/research-submissions.ts`（仅评测转录后处理）。
- Create: `tests/evaluation/research-submissions.test.ts`。
- Modify: `src/evaluation/research-tasks.ts`、`scripts/evaluate-research.ts`、`tests/evaluation/research-runner.test.ts`。

新增评测输出约定：

```ts
export interface SubmissionDiagnostics {
  hostAttempts: number
  hostRejected: number
  sdkRejected?: number
  outputLimitNotExecuted?: number
  source: 'host-and-transcript' | 'host-only'
  complete: boolean
}
```

`hostAttempts/hostRejected` 沿用 TaskObservation；新的可选字段只来自明确的 SDK 记录和 stopReason/未执行记录。无法辨认的转录保持 complete=false 和字段缺失，不能猜为零。后处理只读取自己创建的合成试验目录，绑定 child/epoch，不执行其中的模型脚本。

- [x] 以已保存的三次 review 失败做脱敏夹具，加入输出截断、SDK schema 拒绝、宿主拒绝、accepted、无转录五类行为测试。
- [x] 新测试先失败；实现纯分类函数与 report 字段，保留原 host-only 字段及旧报告兼容。
- [x] 报告打印原字段与诊断各自来源；`failed` 与 request-budget exhausted/科学误验收分开。

测试要求示意：

```ts
expect(observed).toMatchObject({hostAttempts: 1, hostRejected: 1,
  sdkRejected: 1, outputLimitNotExecuted: 1, complete: true})
expect(missing).toMatchObject({source: 'host-only', complete: false})
expect(missing.sdkRejected).toBeUndefined()
```

Run: `./node_modules/.bin/vitest run --project node tests/evaluation/research-submissions.test.ts tests/evaluation/research-tasks.test.ts tests/evaluation/research-runner.test.ts`。预期分类、取消、任务真值与旧报告行为全部通过，未执行真实 API。

## Task A2：冻结试验清单与离线矩阵

**Files:**
- Modify: `scripts/evaluate-research.ts`、`scripts/evaluate-current-api.ts`、`scripts/research-trial-budget.ts`。
- Reuse: `scripts/evaluation-request-gate.ts`、`scripts/research-model-compat.ts`、`src/evaluation/research-tasks.ts`。
- Test: `tests/evaluation/request-gate.test.ts`、`tests/evaluation/research-model-compat.test.ts`、`tests/evaluation/research-runner.test.ts`。

- [x] 为任务清单记录 runId、输入/源/构建指纹、provider/model、推理及输出设置、工具/权限、各臂额度与是否阶段分区。原历史 fingerprint 不回填新字段。
- [x] 完整四任务矩阵沿用无 beginTrial 的 fixture 路线，明确 requestAllocation.enforced=false；预算硬门另用一个单任务配对（每臂 15、总 30）及门单测检验，不能让四任务矩阵套用仅支持 15 的阶段分区造成错误配置。四个既有任务在真实 Pi/文件/宿主链上离线运行；覆盖正常、正确阻塞、失败引用、缺字段、超额路径、取消排空、请求门耗尽。
- [x] 单/多每个比较单元有独立等额总请求上限；若多 Agent 额外分区，报告声明其策略差异，不伪称两者内部预算结构相同。
- [x] 模型别名完整沿用已验证的底层兼容配置；不支持的 provider/API 在读凭证/发送前拒绝，不能隐式替换。
- [x] 记录所有已运行失败的消耗，不把 4 次拒绝门请求算真实转发；末尾无在途请求。

Run: `npm run build`，再运行 A1 的测试加 `tests/evaluation/research-model-compat.test.ts`、`tests/evaluation/request-gate.test.ts`。预期所有离线配对得到可解释的独立验收结果，预算边界无超发。

展示：正常交付/正确阻塞/未完成提交三行报告，展示真实文件与宿主回执的区别，以及三个不同提交失败层级。

## Task A3：新额度下的真实配对

- [x] 先完成可审阅的任务、模型、清单与上限，再询问新的明确调用额度；旧 30 次授权不复用。等待时进入其他阶段的离线工作，不阻塞整轮开发。
- [x] 建议首轮最多 30 次、单多各 15；用户允许的总上限优先。额度不足完整配对时明确缩小试验覆盖或不运行，不偷偷减少必要审阅。
- [x] 冻结候选源码与构建后运行一次既有 Electron 只读凭证 helper；安全系统提示只能由用户处理；未发请求的 credential preflight 失败与已消耗额度分开。
- [x] 试验期间不重建 child 或改源码；结束保存原报告、逐臂计数和文件版本，不因失败自动重试/增加额度。
- [x] 报告完整合格交付率、正确阻塞、误验收、失败、每种提交拒绝及消耗。若仅一个配对，不生成普遍性能结论。
- [x] 独立代码复审本阶段变更，展示真实结果与失败细节。为每个新发现先复现后修复，修复后的新联网验证另计授权，不替换先前报告。

阶段退出条件：离线矩阵、清单、分类与取消测试通过；新授权真实试验已执行并如实报告。模型不优于单 Agent 或未交付也可以形成完成的试验，不得把它描述为成功交付。

离线阶段记录：97 项定向测试、构建及独立规格/质量复审通过；演示与首个失败见 `docs/validation/research-collaboration-p1-p4-20261107/p1/README.md`。真实试验仍待新额度；完整项目类型检查随 B2 红绿阶段收口。

真实配对于 11 月 8 日获新增额度后完成，24/30 次、两臂正确，剩余关闭不滚存。范围、SDK/工具失败、独立核验与非普遍收益结论见验证目录 p1/live-delivery.md。
