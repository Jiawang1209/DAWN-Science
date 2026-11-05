# 增量科研交付与可执行验收实施计划

> 使用 superpowers:executing-plans 按单实现主线推进；按 requesting-code-review 做独立只读审查。用户已要求计划后执行，设计和开工不重复询问；本批不自动提交/合并，不推送/发布。

**Goal:** 在真实界面中展示每项为何复用/重跑、验收如何拦截错误，并安全派生局部重跑批次，用现有评测入口记录实际增量收益。
**Architecture:** 复用TaskContract/TaskSubmission、fileIdentity、原表格解析、环境快照、Team reducer/attempt/共享占用和路线CAS；新增受限规则引擎与显式来源判定，不建全局缓存或第二执行循环。
**Tech Stack:** TypeScript/Zod、Pi、SQLite、React、Vitest、Electron/Playwright；基线ce5ae5dd，codex/incremental-science-acceptance。

设计：`docs/superpowers/specs/2026-11-05-incremental-science-design.md`。

## 1. 验收协议、完整读取与纯规则（里程碑A前半）

Files: 新建 src/protocol/science-acceptance.ts、src/team/science-acceptance.ts；修改 protocol/{task-contract,science-template,science-pipeline}.ts、team/science-templates.ts；新建 tests/team/science-acceptance.test.ts。

- [x] 先写红测：均值/n/单位不符、data.metrics与result.json不符、缺列/引号换行/非数值/截断/空数据、超限/符号链接/取消、SVG脚本/外链/尺寸及缺出处。未配置numeric须只报告基础检查。
- [x] 协议关键形状：`Validation={version:1,dataPath,column,metric:'mean'|'sum'|'min'|'max',unit,missing:'block'|'drop',absoluteTolerance}`；`AcceptanceReceipt={version:1,ruleVersion:1,state:'passed'|'blocked',checks:[{id,state,expected?,actual?,reason?}],numericChecked:boolean}`。模型TaskResult不接受此回执。
- [x] `validateScienceAcceptance(settings,receipt,workspace,signal)` 只在原accept通过后读声明文件、用既有fileIdentity/readBytes和读成表完整解析，返回新host receipt。缺规则、无支持的复杂方法不编造检查。
- [x] Run `npx vitest run tests/team/science-acceptance.test.ts tests/team/science-templates.test.ts tests/protocol/task-contract.test.ts`，记录红绿和具体错误输出。

## 2. 提交、父端与Bot共用验收 + 第一轮真实效果

Files: 修改 orchestration/task-submission.ts、artifacts/task-versions.ts、subagent/executor.ts、team/scheduler.ts、workbench/backend.ts；public协议与UI现有 science-pipeline-status；新增可见验收组件和UI测试。

- [x] 先测正式提交验收等待期间冻结/取消、父端拒绝缺验收/伪造结果、Bot同规则、规则版本冻结、旧记录兼容。
- [x] 用统一异步finalizer串接基础契约→可执行验收→内容版本→封存；无新权限，不在锁外再读文件；受阻不进入审阅。
- [x] 公共回执/批量项显示规则名与expected/actual/是否数值核验；协议升8.43，更新strict快照消费者。
- [x] 复用mock-science-template，新增真实文件wrong-numeric场景；build后跑Pi和Bot/SQLite测试。
- [x] **展示A**：实际Electron“期望3、实际999，被宿主拦截”截图；用户可打开原CSV与result.json，并看到没有启动review。截图通过view_image检查后在对话展示，不拿mock设计图称功能。

## 3. 复用签名、环境证据与失效判定

Files: 新建 team/science-reuse.ts、team/science-environment.ts、protocol/science-reuse.ts；修改protocol/science-batch.ts；测试 science-reuse/environment。

- [x] 先测输入/方法/规则/执行者/工具/权限/环境改变均不复用；缺证明、旧未验收、未知环境、文件篡改拒绝复用；同内容安全候选通过。
- [x] `reuseDecision(sourceItem,newDefinition,context)` 返回 `{mode:'reused'|'rerun',reason,source?}`，纯判定与I/O复核分开。签名使用稳定对象序，不含时间或observationId；内容比较沿sameFileVersions。
- [x] 环境复用现有environmentProbeFor/parseEnvironmentFor/fingerprintOf；只跑固定元数据代码，5s/2MiB限制，支持signal，清单缺失/截断标unknown。准入与分析终验相同，源历史不回填。
- [x] 实际核对候选输入+产物时用原共享只读占用，source revision与所有异步边界再检查；原read-only权限不扩大。
- [x] Run `npx vitest run tests/team/science-reuse.test.ts tests/team/science-environment.test.ts tests/bot/output-lock-identity.test.ts`。

## 4. 派生批次与局部重跑（里程碑B）

Files: 修改team/science-pipeline-tools.ts、science-batch.ts、science-batch-facts.ts、science-summary.ts、state.ts/types.ts/task-snapshot.ts、runtime/native.ts、electron/wiring.ts；新增tests/team/science-batch-derivation.test.ts及integration场景。

- [x] 先测同父/同工作区/源修订/状态/已排空限制；当前其他团队不被覆盖；重复请求幂等；取消等待不发布；未知效果须确认；不复制开放任务、不采用局部阶段。
- [x] start_science_batch可选reuseFrom。创建新Team；只有完整合格项复制闭合回执投影并标reusedFrom，输出保留旧路径；其他项用新根目录。旧Team/tasks/文件逐字保持。
- [x] 原reducer同步跳过复用项并推进必需阶段；ID稳定有界。原汇总读取新旧accepted事实，包含明确来源；当次统计排除历史调用/耗时/token，仍展示历史证明。
- [x] 恢复仍复核所有有效版本，summary取消/未知效果确认/attempt fencing及route CAS不放宽；数据变化只影响相应项，规则/方法变化按签名失效。
- [x] **展示B**：真实Pi两项首批受阻后新批次，只对失败项发模型请求；Electron展示A复用、B重跑、原因和来源；给出实际请求计数与新旧文件清单。

## 5. 原评测入口扩展、可见演示（里程碑C）

Files: 修改src/evaluation/science-pipeline.ts、scripts/evaluate-science-pipeline.ts、mock-science-template/batch.mjs；新增scripts/evaluate-science-incremental.ts或同入口模块；e2e/science-incremental.spec.ts与fixtures。

- [x] 保留原五对对照；追加相同故障前置下的全量重跑/派生重跑，重复批次、内容/方法/环境变更、错误数值。真实脚本/文件和独立真值驱动，错误复用或错误放行必须失败。
- [x] JSON/MD记录commonSetup与recoveryIncrement、actualRequests/executedItems/reusedItems/hostChecks/unknownUsage/elapsed；不得把复制旧receipt当新执行或零费用。输出单独目录，不覆盖上批证据。
- [x] E2E在相同viewport截图before-blocked/after-incremental/invalidated，写到docs/validation/incremental-science-20261105/demo；保留复现命令与简单说明。
- [x] **展示C**：对话直接展示真实截图与前后对照表、可打开汇总文件；区分已实现效果、合成测试条件及未验证的真实模型收益。

## 6. 审查与完整收尾

- [x] 按requesting-code-review进行独立只读审查：内容/规则/环境绑定、派生源身份、复制闭合事实、当次观测、取消/共享占用排空、恢复和汇总/CAS。问题先复现修复再验。
- [x] `npm run typecheck`、`npm run build`、`npm test -- --maxWorkers=4`、相关Electron；源码hash冻结并检查无漂移。通过后不反复无目的跑全量。
- [x] 更新原指南、开发历史、路线图、专项验收报告和效果演示说明；保留隔离分支diff，不提交/合并、不推送/发布、不替换安装应用。
- [x] 对照设计逐项核验后才将/goal标complete；最终回复包含实际效果和证据链接，不能只给代码/测试数量。

最终结果：629文件/6227项通过，11跳过；7个Electron场景通过；原五对及9条增量评测通过；独立复审无剩余重要阻塞。源码1466文件冻结复核。见 docs/reviews/2026-11-05-incremental-science-verification.md。

后续授权更新：用户于合并前复审本轮明确要求修复补测、无阻塞后本地提交及合并main，不推送、不发布。复审证据见 docs/reviews/2026-11-05-incremental-science-rereview.md；旧“不提交/合并”仅属于首次实现阶段。
