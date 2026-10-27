# 产物来源与关键结果留存实现计划

> 执行方式：按 superpowers:executing-plans 在本会话顺序实施，使用 test-driven-development。用户已批准四步方案及独立分支开发；不合并、不推送，不启动子 agent。

**Goal:** 本地执行自动记录可检查来源，显式保存关键结果后可独立读取旧字节，并将固定版本交给既有分析交付验证。

**Architecture:** SQLite 保存不可变内容版本、按次观察和留存清单；应用数据目录保存按项目隔离的对象。采集服务接入内核队列和本地工具包装器；产物面板使用同一后端查询。

**Tech Stack:** 现有 TypeScript、SQLite、Node 文件流/worker、React、Vitest、Electron/Playwright，无新增运行依赖。

基线：`846e1c35`。分支：`codex/artifact-provenance`。工作区：`/Users/liuyue/.codex/worktrees/artifact-provenance/dawn-science`。用户批准规格：`../specs/2026-10-27-artifact-provenance-retention-design.md`。

## 0. 基线与约束

- [x] 安装锁定依赖，运行 `npm run typecheck` 和相关存储/产物/交付测试；记录原有失败与环境限制。
- [x] 每项行为先写能检出该缺口的测试，观察失败，再实现并复验。
- [x] 每步维护本文件进度、开发历史和验收记录；不自动提交、合并或推送。

## 1. 版本与留存底座

文件：新增 `src/artifacts/model.ts`、`store.ts`、`blobs.ts`、`retention.ts`；修改 `src/store/schema.ts`；新增 `tests/artifacts/store.test.ts`、`retention.test.ts`。

- [x] 测试迁移幂等、旧记录不变、工作区隔离、同字节复用版本、不同执行保留观察、未知哈希不生成版本。
- [x] 运行 `npx vitest run tests/artifacts/store.test.ts`，确认新表/服务不存在导致失败，再增加数据库迁移与不可变索引。
- [x] 测试留存后覆盖/删除原件仍读旧字节、错哈希拒绝、软链拒绝、配额、同请求不同参数拒绝、复制失败整组不发布、损坏不回退、显式删除与重启中断。
- [x] 运行 `npx vitest run tests/artifacts/retention.test.ts`，确认失败，再实现安全流式身份/复制、请求与清单事务、恢复及引用计数释放。
- [x] 运行 `npx vitest run tests/artifacts tests/store/runs.test.ts` 与 `npm run typecheck`。

## 2. 本地自动记录

文件：新增 `src/artifacts/capture.ts`；修改 `src/runtime/native.ts`、`src/tools/run-code.ts`、`src/kernel/挂载.ts`、`src/project/run-recorder.ts`、`src/electron/wiring.ts`、`src/workbench/backend.ts`；新增采集与队列回归测试。

- [x] 测试实际代码固定、读取与声明分开、输入变化、已有变量缺口、覆盖观察、归属疑义、采集失败不改变执行结果。
- [x] 测试内核真正出队前/结束后的可等待钩子；排队取消不采集为已执行，采集完成后才放行下一次内核执行。
- [x] 在真实工具定义外包裹采集服务，按会话绑定工作区与 Run；`inputPaths` 为可选声明，不解析代码伪造依赖。
- [x] 用户 notebook 与 agent cell 共用队列采集；保留原新建统计，采集结果通过刷新事件通知。
- [x] 运行 `npx vitest run tests/artifacts tests/tools/run-code.test.ts tests/run-recorder.test.ts tests/provenance-probe.test.ts`、相关内核队列测试及类型检查。

## 3. 协议与产物面板

文件：新增 `src/protocol/artifact-history.ts`、`src/ui/artifact-history.tsx`；修改 operations/version、后端装配、artifacts/analysis-delivery 和 i18n；新增协议/后端/UI 回归。

- [x] 测试作用域校验、只读写拒绝、查询不新增记录、历史内容不可得状态、留存/删除和当前文件检查。
- [x] 注册版本查询、来源查询、当前核验、显式留存、后补捕获、项目留存列表与读取/删除操作；接入相同 mock/真实后端。
- [x] 在原面板提供来源记录、显式保存、留存组列表和历史预览，覆盖文件可见但不增加 GENERATED 新建数。
- [x] 验证切换后的迟到响应边界（选择切换自动回归、会话 generation 作用域自审）、来源缺口展示、保存后读取旧副本、无副本的历史不能预览。
- [x] 运行相关 UI/后端/协议测试，构建后运行新增 Electron 用例与既有产物/预览/视觉基线。

## 4. 交付、生命周期与验收

文件：修改 delivery 协议/service/verify、项目删除/影响面操作和 UI；新增端到端/生命周期测试；新增 `docs/reviews/2026-10-27-artifact-provenance-verification.md`。

- [x] 测试留存成员交付读取固定字节，验证报告绑定版本，不继承旧版本验证状态。
- [x] 测试删除会话仍可读项目留存，移除项目必须确认确切留存集合，保存与删除并发不会绕过确认。
- [x] 接通留存与现有交付入口、删除数量/大小/修订标识、重启中断及存储清理。
- [x] 使用真实 Python 和 R 生成数据表/图片并验证来源采集；明确 mock 和真实内核的证据范围。
- [x] 运行 `npm run typecheck`、`npm test`、`npm run build`、相关 Electron 及原视觉基线；查看任何视觉差异后再判断，禁止盲目更新基线。
- [x] 自审最终 diff、记录限制与四步验证结果。分支和工作树留待用户审查，不合并、不推送。

## 进度与证据

2026-10-28 收尾：四步完成并完成本地验证，详见 [验收记录](../../reviews/2026-10-27-artifact-provenance-verification.md)。

- 基线类型检查及 4 文件、90 项相关测试通过后开始实施。
- 第一步先验证缺失模块/表导致的失败，再通过存储与留存相关检查；v17 旧 Run 迁移和不补造来源已在最终全量覆盖。
- 第二步完成工具/实际内核队列接线，再做来源、排队边界、Python/R 真内核检查；后续修正真实环境绑定与哈希时间预算，回归通过。
- 第三步完成协议/共用 mock/UI 接线；相关协议与 UI 契约通过。保存后刷新及旧请求迟到错误先检出再修正；会话切换按 generation 作用域自审，选择切换有独立 UI 回归。
- 第四步完成固定版本交付、聊天/项目删除、请求中断恢复；最后全量 534 文件、5614 项通过、10 原有跳过，类型与构建通过，新增 3/3 与既有 26/26 Electron 通过，包含全部 14 个原视觉基线。
- 真实 Python/R 场景使用既有解释器，未新增运行依赖、未替换安装版。无合并、推送或自动提交，工作树保留。
