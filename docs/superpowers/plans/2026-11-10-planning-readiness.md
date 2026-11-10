# 科研规划与执行前就绪检查 Implementation Plan

> 执行方式：按superpowers:executing-plans单线逐项实现和自审。用户已要求写计划后开始；不委派子agent。每阶段先红测、再实现、再验收与展示。

**Goal:** 减少重复澄清，让无效依赖在方案提交时被发现，并确保显式缺单位的科研任务在执行前停下，补齐后沿原契约及恢复路径重新安排。

**Architecture:** 共用现有自动安排提示、propose_plan、批准编译器和可信模板工厂。抽出纯执行结构校验供提交/批准复用；单位缺失通过原模板、acceptance、TaskSettings、来源指纹及方案簿传播。文件系统权限/别名/内容版本仍在批准和执行时复核。

**Tech Stack:** TypeScript、Zod/TypeBox、Electron、React、pi、Vitest、Playwright及现有Python受控执行。

## 基线与保护

- main：baaa2c5fa8a57fbdb019cdaa614348a45ea28218；隔离分支codex/planning-readiness-20261110。
- 工作区：/Users/liuyue/.codex/worktrees/dawn-planning-readiness-20261110/dawn-science。
- 验证目录：docs/validation/planning-readiness-20261110；main及正式App配置/数据库不写。
- 旧模型额度已结束。本轮默认0请求，离线和本地Python验证先行；不自动提交、合并、推送或发布。
- 现有取消、排空、共享锁、冻结执行者/权限、版本与恢复逻辑保持同一路径；科研冻结任务仍是停止→新方案/新批次→重新验收。

## A：固定问题与基线

- [x] 保存main/工作分支身份和正式profile三文件哈希（只哈希、不复制凭证）。阅读上轮失败方案、问题与独立文件报告。
- [x] 跑现有propose-plan、approved-plan和planning-contract-context基线；失败先定位，不能把旧失败记成本轮回归。
- [x] 创建本plan对应/goal并记录本轮模型调用0、历史退出/PTY OPEN。

## B：规划事实与依赖校验

**文件职责：** 修改src/protocol/task-arrangement.ts共享澄清准则；src/tools/propose-plan.ts提供规则及提交前拒绝；src/tools/get-plan-contracts.ts返回已确认/缺少事实；新增src/protocol/executable-arrangement.ts供提交与src/team/approved-plan.ts共用纯检查。tests/tools/propose-plan.test.ts、tests/team/approved-plan.test.ts及新增tests/protocol/executable-arrangement.test.ts覆盖反例。

- [x] 红测：结构合法但读取他人产物缺依赖的方案，propose_plan必须isError、无持久化、无terminate；合法间接依赖通过。
- [x] 红测：任务文件与契约不符、写目标冲突/嵌套、审阅漏读直接前置产物分别拒绝；保留普通非执行方案与问题卡。
- [x] 抽取批准编译器已有检查，不另建DAG或调度器；错误明确指向任务与路径，模型可以修正后重新提交，不能宿主自动补边。
- [x] 指引要求“已有确认直接采用、只询问当前真实缺失或冲突”，目录返回真实source事实；不自动删问题，不用文本匹配猜科研含义。
- [x] 定向命令：`npx vitest run tests/tools/propose-plan.test.ts tests/protocol/executable-arrangement.test.ts tests/team/approved-plan.test.ts tests/protocol/task-arrangement.test.ts --maxWorkers=2`。预期错误方案未存、合法方案仍可批准。
- [x] 阶段展示：保存提交错误原文、修正后方案和同一目录确认事实。明确模拟效果不等于真实提问率改善。

## C：单位就绪状态贯通与拦截

**文件职责：** src/protocol/science-template.ts新增可选显式missing状态；src/protocol/planning-contract-source.ts保留表格校验；src/protocol/science-acceptance.ts提供纯就绪判据；src/protocol/task-contract.ts限制缺信息TaskSettings；src/team/science-templates.ts展开标记；src/orchestration/task-contract.ts输入预检给blocked回执；src/team/approved-plan.ts、src/team/science-pipeline.ts在批准/启动前再次复核；src/subagent/executor.ts在等待锁前拦截，src/team/science-execution.ts和src/team/science-acceptance.ts阻止执行回退及旧证明复用；src/runtime/planning-contract-context.ts约束缺单位方案只能待补信息。

- [x] 红测：显式缺单位+空单位有效；无标记空单位无效；缺单位不能同时有numeric核验或伪装已知单位；旧模板JSON结构不变。
- [x] 红测：源指纹随单位补齐改变；缺单位无questions不能出执行方案；带真实补单位问题可保存；不能编辑清掉问题绕过来源校验。
- [x] 红测：直接子任务使用缺单位契约时，已有执行器在spawn前返回blocked、childOf未调用、无产物，原输入不变，锁可再次取得。
- [x] 实现共用scienceReadinessIssue判据，TaskSettings和taskInputReceipt复用；pipeline启动先判据后改team，批准继续保留原权限和文件版本检查。
- [x] 更新既有evaluate-research/research-auto-arrangement入口的缺单位模板为显式状态；预检阻塞/待补信息单列，不冒充已读输入的正确科学blocked。旧离线报告保持原样。
- [x] 定向命令：`npx vitest run tests/team/science-templates.test.ts tests/runtime/planning-contract-context.test.ts tests/runtime/planning-contract-book.test.ts tests/runtime/planning-contract-arrangement.test.ts tests/subagent/task-executor.test.ts tests/evaluation/research-tasks.test.ts --maxWorkers=2`，新增测试文件随实现登记。

## D：必要界面反馈、恢复与实际效果

**文件职责：** src/ui/planning-contract-source-form.tsx新增显式单位缺失选择；src/ui/state/collaboration-view.ts沿用可选草稿字段；已有mock-research.mjs/共享mock与e2e/planning-contract-source.spec.ts同步。协议可选字段变化更新src/protocol/version.ts及现有版本断言，不新增操作。

- [x] UI红测：标缺单位时无需伪填字符串；禁配数值核验；反馈明确“不能执行，补齐后重新安排”，不会显示可直接执行。
- [x] UI红测：切会话、同owner换连接、取消与重新读取不泄露草稿或旧单位状态；旧草稿无新增字段照常恢复。
- [x] Electron：确认缺单位→生成补信息方案→不可采纳执行→输入不变且三产物不存在；关闭并重开仍缺单位，不自动重放。
- [x] Electron：补齐单位→确认新修订→新方案→批准后真实Python生成既有合成夹具均值2m与独立审阅；旧缺单位方案不能复活。
- [x] Electron：编排展开/Esc返回仍回同一会话；普通任务不需要科研表单；取消后可再次生成。保存截图和实际JSON，每阶段展示。

## E：回归、自审与收口

- [x] `npm run typecheck`、`npm run build`、`npx vitest run --maxWorkers=4`。必要相关Electron以单worker运行，保留失败证据后修复；不更新无关视觉基线。
- [x] 自审共享校验是否在提案与批准都生效、缺单位是否可通过完整合同/旧快照/恢复绕过、会话和执行代次、取消排空与锁、旧入口；发现问题补红绿测试。
- [x] 保存候选身份、正式profile哈希对比、截图、模型请求0和退出诊断；历史偶发退出超时和PTY继续OPEN，不修改阈值。
- [x] 更新docs/reviews/2026-11-10-planning-readiness.md及本plan。只有实现、相关测试、自审与逐阶段效果均齐备才完成goal；没有真实模型新授权时，不宣称提问率或费用收益已验证。

## 具体行为样例

```text
已有单位mg/g、方法算术均值、只丢弃NA：直接采用，不为假设性文件缺失追加问题。
review读取results/result.json但没有analysis前置依赖：propose_plan返回错误，不保存卡片。
用户标记单位尚未提供：保存缺项，等待补单位；无子进程、无result.json。
补齐m并确认新修订：旧方案仍无效，重新生成并采纳后按原冻结合同执行。
```

## 实施中核实与调整

- 方案提交复用纯校验，权限/符号链接/版本仍在批准端复核；问题卡不自动删除问题或补边。
- 缺单位执行器先于锁等待返回；执行回退和验收证明复用也复用同一就绪判据。阻塞时清掉旧验收证明、版本和交付路径，避免恢复后误读。
- 桌面测试首次在展开返回后过早取消勾选，事件日志证明没有触发change（表单仍在恢复约束），已改为等待真实源状态恢复后操作；原草稿机制未重写。
- 正向桌面验证沿用现有共享夹具x=1,2,3、单位m，真实Python得到2m。首次另设4行°C数据时共享mock仍提交固定3行m回执，宿主如实拒绝；未放宽验收或把它计作产品成功。失败trace均保留。
- 科研评测的automatic-plan使用显式单位缺项，单执行者预检0请求、自动规划保留待补信息。普通pipeline旧评测路径及旧报告保持原口径。新manifest注明confirmed-product-readiness-v2，awaiting-info仍不算合格交付/正确科学blocked。

## 最终验收

- 733个测试文件，7166通过、11跳过、0失败（vitest-final-green.log）。类型检查、固定构建通过。
- 9项相关Electron通过；补齐JSX分行与英文翻译后，最终构建再次通过2项科研路径。19次退出观察为0，最大147.28ms。
- 原离线评测入口12组：5个数值配对合格，缺单位两组awaiting-info；独立输入/文件核验12项通过，72次localhost请求、在途0，真实模型请求0。
- 完成单线代码自审，原失败日志和trace均保留在archived-validation.json所列路径，没有放宽验收规则。
- candidate.json与最终源码/子进程构建一致；main干净且仍为baaa2c5f，正式profile三文件哈希不变。改动未提交、未合并；不推送、不发布、不替换正式App。历史退出超时与PTY继续OPEN。
