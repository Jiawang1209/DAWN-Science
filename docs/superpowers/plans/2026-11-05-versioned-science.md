# 版本化科研交接与批量模板实施计划

> 使用 superpowers:executing-plans，按仓库单实现主线逐项执行。用户已明确要求计划后直接实施，不重复询问开工；独立 reviewer 只读，不分派代码实现。

**Goal:** 版本绑定贯穿提交、审阅、恢复与交付；可复用两类模板和最多八项批量；建立同条件单/多 agent 的可重现评测。

**Architecture:** 复用 fileIdentity、ArtifactStore 版本观察、TaskSubmission、Team 调度/attempt/共享锁/恢复与路线 CAS。批量在同一 Team 中按项串行，通过原调度器执行固定宿主汇总，不另造执行循环。

**Tech Stack:** TypeScript、Zod、Pi、SQLite、Vitest、Electron/Playwright。基线 07275d77；codex/versioned-science-batches。

设计：[版本化科研设计](../specs/2026-11-05-versioned-science-design.md)。先完成 A，再完成 B，最后 C，各阶段保留独立回归结果。

## Task 1：内容版本协议与复用采集器

创建 `src/protocol/file-versions.ts`、`src/artifacts/task-versions.ts`；修改 `src/protocol/task-contract.ts`；测试 `tests/artifacts/task-versions.test.ts`、`tests/protocol/task-contract.test.ts`。

- [x] 先测临时文件同路径同字节数变更必须不匹配、符号链接/缺文件/取消/超限明确失败，空版本仅表示零输入不能替代缺失绑定。
- [x] 定义 `FileVersionSchema={path,sha256,bytes,observationId?,versionId?}`、`TaskVersionsSchema={version:1,inputs,outputs}`；TaskSettings.versions 只有冻结 inputs，TaskReceipt.versions 保存实际 inputs/outputs。所有字段 strict；版本路径必须与契约一一对应。
- [x] 实现 `captureFileVersions(workspace,paths,signal)` 调用现有 fileIdentity，64 MiB/文件、256 MiB/批次、64文件，顺序 worker；`assertFileVersions` 比 path/hash/bytes；`finalizeTaskVersions(settings,receipt,workspace,signal,submittedVersions?)` 复核并生成封存回执。
- [x] 运行 `npx vitest run tests/artifacts/task-versions.test.ts tests/protocol/task-contract.test.ts`，记录红绿，旧协议仍通过。

## Task 2：正式提交、父端复核与产物版本装配

修改 `src/orchestration/task-submission.ts`、`src/subagent/{task-tools,child,child-task,protocol,executor}.ts`、`src/team/{runner,scheduler,types}.ts`、`src/runtime/native.ts`、`src/workbench/backend.ts`、`src/electron/wiring.ts`。

- [x] 先测采集等待期间新工具/重复提交拒绝、采集中取消不可提交、child done 缺失/伪造版本不得满足新设置、Bot 相同规则，旧未绑定设置不变。
- [x] TaskSubmission 的异步 submit 采用 validating 终结门：有效输入→校验实际证据→核对/采集版本→复核 signal→封存。invalid 可以修正；版本冲突 blocked 且不能自动进入 revise。
- [x] ChildPiSession 增加 submittedVersions，done 与父端结果透传受限宿主版本，TaskResult 仍不接受模型 versions。父端在原产物锁内做输入预检及结果复核，元数据/Outcome 保留新回执。
- [x] Native/Bot 在原 runWithTaskScope/后端占用内复核；注入可选 recorder，把已核验输入/输出交给 ArtifactStore.observe，使用已有 artifact_versions。没有数据库时保留哈希，ID 不伪造；不改变数据库 schema。
- [x] 运行 `npx vitest run --maxWorkers=4 tests/orchestration tests/subagent tests/team/runner.test.ts tests/runtime/orchestration.test.ts tests/workbench/bot-contract.test.ts tests/artifacts`（实际 runner 文件以 rg inventory 为准），真实本地 Bot 验证观察记录可查。

## Task 3：单项流水线绑定、恢复和异步路线投影

修改 `src/protocol/science-pipeline.ts`、`src/team/{science-pipeline,science-pipeline-tools,recovery,scheduler}.ts`、`src/runtime/{science-pipeline-route,native}.ts`；必要时创建 `src/runtime/science-pipeline-projection.ts`。

- [x] 先测初始输入改变阻止启动下一阶段、审阅必须匹配分析输出、恢复不接受不同数据、缺版本旧记录不能补造过去事实、路线 CAS/去重及停止后不能迟到投影。
- [x] 新启动捕获并冻结 initial inputVersions；所有 async 边界后重检 signal、请求指纹、当前团队与路线修订。审阅任务从最新 accepted 分析回执绑定 outputs；修正保留原 inputs。
- [x] 恢复前在共享读占用内核对原输入及仍有效的 accepted 产物，哈希后按 stateRevision 再次检查；未知效果 acknowledge 不放宽内容版本。
- [x] 路线投影在内容复核后沿用原同步 CAS，异步投影登记父会话取消/drain；不匹配给出 conflict/blocked 原因，不覆盖新路线或重写旧 accepted 回执。
- [x] 运行 `npx vitest run tests/team/science-pipeline.test.ts tests/team/science-pipeline-tools.test.ts tests/runtime/science-pipeline-route.test.ts tests/integration/science-pipeline.test.ts`，真实 Pi 验证改版本与恢复。

## Task 4：模板注册表与同一 Team 的批量 reducer

创建 `src/protocol/science-batch.ts`、`src/team/science-templates.ts`、`src/team/science-batch.ts`、既有 `src/team/science-pipeline-tools.ts` 的共用工具装配；修改 Team 持久/调度/恢复/控制保护及 Native 装配。

- [x] 为 tabular-ecology@1 与 figure-reproduction@1 定义用户批准方法/证据要求，语言 Python/R；宿主生成稳定请求/项ID隔离输出路径。
- [x] 先测 1–8 项限制、重复 ID/输入输出重叠、raw/别名拒绝、模板版本冻结、参数冲突去重、失败停后续及旧 Team 不变。
- [x] Batch 定义保存 template、冻结 route、items、inputs 版本、当前 index、已结束项 pipeline 和整体修订。pipeline namespace 生成唯一 taskIds；advanceBatch 在原 scheduler.改 中归档当前项并初始化下一项，同次原子写入。
- [x] start/status/resume/cancel_science_batch 复用既有成员解析与冻结函数；批量子阶段不允许单项控制工具绕过。重开 interrupted，不重放；恢复保留 completed 项，核对所有相应版本并使用原未知效果确认。
- [x] 运行 `npx vitest run tests/team/science-templates.test.ts tests/team/science-batch.test.ts tests/team/science-batch-tools.test.ts tests/team/recovery.test.ts`。

## Task 5：固定宿主汇总、完整交付及 UI

创建 `src/team/science-summary.ts`；扩展 `src/team/scheduler.ts` 的受控宿主任务分支，修改协议/公共投影、路线投影、Native 装配与既有团队 UI。

- [x] 汇总是一项实际 Team task，使用原 attempt、准入、占用、冻结 settings、正式提交与版本验收；只接受 batch.aggregateTaskId，不能由模型选择任意宿主操作。
- [x] 先测只消费 accepted 项、缺/变产物不得汇总成功、JSON/Markdown 只含实际指标与来源、停止排空、汇总重开确认恢复及不重复汇总。
- [x] 使用 createTaskTools 的受控 write/submit 生成汇总 JSON/Markdown；用户可从原产物入口查看。部分完成不写路线 delivered，全部项与汇总版本匹配后按原路线 CAS 投影一次。
- [x] 公共摘要排除内部 settings，显示项进度、受阻原因、版本与汇总路径；更新协议版本和相关快照消费者，不新增复杂面板。
- [x] 构建并新增 `tests/integration/science-batch.test.ts` 与 `e2e/science-batch.spec.ts`，复用现有 mock 服务扩展场景，验证真实 Pi、SQLite 与严格 UI 协议。

## Task 6：同条件评测基线

创建 `src/evaluation/science-pipeline.ts`、`scripts/evaluate-science-pipeline.ts`、`tests/evaluation/science-pipeline.test.ts`、共用 `scripts/mock-science-template.mjs` 的确定性合成数据，增加 package.json 脚本。

- [x] 固定正常、缺单位、返工、输入变化和中断恢复用例；每项记录 inputs 哈希、方法、输出要求和同模型配置。
- [x] 两种软件路径共用宿主验收与独立 ground truth；单 agent 仍需读/执行/交付，多 agent 使用真实流水线。真实文件/工具回执驱动统计，不比较不可比配置。
- [x] 输出 deterministic-local JSON/Markdown，记录正确交付/阻塞、错误接受、原输入保留、调用/观测/返工/干预、数据与源码身份；usage 缺失为 unknown/partial，不估算费用。
- [x] 运行 `npm run evaluate:science -- docs/validation/versioned-science-20261105/evaluation`，对数据变化/无证明假阳性回归必须失败。报告不推导真实模型质量、成本或并行收益。

## Task 7：审查、完整验收和交付

- [x] 更新科研流水线/契约指南、评测指南、长期路线图、开发历史及专项报告，明确串行批量、内容绑定与字节留存区别。
- [x] 按 requesting-code-review 技能做只读独立审查：提交异步门、跨进程证明、版本记录作用域、取消/锁排空、批量原子推进、恢复/汇总、投影生命周期、评测公平与旧记录兼容；问题先复现修复。
- [x] 固定源码执行类型检查、完整构建、完整单测 `npm test -- --maxWorkers=4` 和相关 Electron，真实本地 Pi/SQLite 验收。保留明确红绿日志、评测产物和源码 SHA256。
- [x] 保留隔离分支可审阅 diff，不自动 commit/merge，不 push/release；仅在目标真正完成后更新 /goal 为 complete。


实施调整：批量工具复用原流水线工具公共准入，未另建重复装配；fixture 共用同一 localhost 推理服务；新增 summary/facts/paths 三个小模块分别承担事实复核、路径准入与汇总。返工评测经独立审查改为两路径共同初始缺陷和修正上限，未知用量传播；标准评测命令先构建。最终结果以专项报告与 source-sha256.json 为准。


最终验收：618 文件/6162 项通过、11 跳过；Electron 11 场景、类型检查、完整构建及 66 文件哈希一致检查通过。见专项报告。
