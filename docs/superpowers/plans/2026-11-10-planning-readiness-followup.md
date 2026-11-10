# 科研规划与就绪检查：复用候选、补漏和重新验收

> 执行方式：superpowers:executing-plans，当前会话单线执行与代码自审。沿用已授权设计，不重新询问确认、不委派、不自动提交或合并。

**Goal:** 完成用户明确列出的三项行为：直接采用已确认条件、提案阶段拒绝错误依赖、显式缺单位时在执行前停止；展示每阶段真实效果。

**Architecture:** 复用 codex/planning-readiness-20261110 的未合入候选，共享 planningClarificationGuidance、validateExecutableArrangement、scienceReadinessIssue。仅补本次复查确认的遗漏，保留原方案簿、冻结契约、锁、内容版本和恢复机制。

**Tech Stack:** TypeScript、Zod、Vitest、Electron、Playwright、现有受控 Python。

## 0. 范围与保护

- 用户写“四个问题”但实际列出三项，以明确三项为交付，不扩大为上轮建议的四个新方向。
- main 基线 baaa2c5fa8a57fbdb019cdaa614348a45ea28218，保持干净且不改；复用现有专项工作区，不复制实现、不覆盖旧证据。
- 专项路径：/Users/liuyue/.codex/worktrees/dawn-planning-readiness-20261110/dawn-science。
- 原设计、实施计划及验收记录保持历史有效；本文件记录新一轮复查，不把上轮测试冒充本轮新跑。
- 新证据放 docs/validation/planning-readiness-20261110/followup/。模型请求为 0；不使用旧额度，不读取正式密钥，不更换正式 App。
- 不提交、不合并、不推送、不发布。历史偶发退出超时、长 Bot/MCP 收尾和 PTY 清理保持 OPEN；不改超时阈值。

## A. 建立本轮目标及复查基线

- [x] 核实 main、专项分支和已有实现，阅读原设计、计划、专项审查及验收记录。
- [x] 创建本轮 /goal，冻结范围；记录当前差异身份，保护上轮证据。
- [x] 复核关键源文件及现有反例覆盖，先记录具体缺口再改代码；已有功能不重复实现。

## B. 阶段一：已确认事实和提案依赖

文件：src/protocol/executable-arrangement.ts、src/protocol/task-arrangement.ts、src/tools/propose-plan.ts、src/tools/get-plan-contracts.ts、src/team/approved-plan.ts，以及 tests/protocol/executable-arrangement.test.ts、tests/tools/planning-readiness.test.ts。

- [x] 检查自依赖、间接依赖、未知依赖、重复写入、输入/产物路径、审阅覆盖与普通描述性方案。
- [x] 如有遗漏，在上述测试先添加反例，运行确认失败，再修改共享校验；不自动补边、不放松原契约。
- [x] 运行 `npx vitest run tests/protocol/executable-arrangement.test.ts tests/tools/planning-readiness.test.ts tests/tools/propose-plan.test.ts tests/team/approved-plan.test.ts tests/runtime/planning-contract-context.test.ts --maxWorkers=2`。
- [x] 通过实际工具调用展示：确认事实不重复填；缺依赖不保存方案；修正后可提交。复用原 probe.ts 的工具调用，输出写到本轮 followup 子目录，保留旧输出。

## C. 阶段二：缺单位、补齐和恢复

文件：src/protocol/science-template.ts、src/protocol/science-acceptance.ts、src/protocol/task-contract.ts、src/orchestration/task-contract.ts、src/subagent/executor.ts、src/team/science-execution.ts、src/team/science-acceptance.ts、src/ui/planning-contract-source-form.tsx，以及 tests/runtime/unit-readiness.test.ts、tests/ui/planning-contract-source-form.test.tsx。

- [x] 复核显式缺单位不能通过 TaskSettings、直接子任务、旧回执或恢复绕过；取消优先、阻塞不等待锁、不清理他人原有产物。
- [x] 检查填回单位后旧字段、数值核验、来源修订和旧方案的关系；跨会话、连接替换和迟到回调不覆盖当前草稿。
- [x] 对具体遗漏先红测再最小修复；旧记录无可选字段继续兼容，不从任意自由文本猜单位。
- [x] 运行 `npx vitest run tests/runtime/unit-readiness.test.ts tests/tools/planning-readiness.test.ts tests/ui/planning-contract-source-form.test.tsx tests/subagent/task-executor.test.ts tests/runtime/planning-contract-book.test.ts tests/runtime/planning-contract-arrangement.test.ts tests/evaluation/research-unit-readiness.test.ts --maxWorkers=2`。
- [x] 展示就绪拦截的实际工具输出与文件证据；明确模拟模型不能证明真实提问率下降。

## D. 阶段三：桌面效果、完整代码回归和审查

- [x] `npm run typecheck`、`npm run build`、`npx vitest run --maxWorkers=4`，完整结果保存本轮目录。
- [x] 先核对 e2e 夹具隔离与清理，再运行 `npx playwright test e2e/planning-readiness.spec.ts e2e/planning-contract-source.spec.ts e2e/approved-plan-execution.spec.ts e2e/auto-arrangement.spec.ts --workers=1`，本轮输出独立保留，不放宽阈值，不更新视觉基线。
- [x] 桌面展示缺单位早停、重启仍缺项、补 m 确认新版本、新方案实际 Python 计算 x=1,2,3 得到均值 2m，分析和独立审阅通过，展开/Esc 返回仍可用。
- [x] 阅读实际截图后展示，不只给通过计数。完整桌面套件与真实模型未运行时明确说明。
- [x] 完成单线审查：提案/批准一致性、权限冻结、owner/代次、取消排空、锁、恢复、旧入口；修复阻塞项并补测试。
- [x] 保存新变更清单、测试日志、实际结果、审查结论及历史问题 OPEN 状态；核实 main 未变，再完成 /goal。

## 判定标准

1. 已确认方法/单位/缺失规则直接提供，真实缺项或冲突仍允许提出问题；没有自动批准。
2. 非法执行依赖在提案阶段拒绝，不能保存为可执行方案；合法间接依赖通过。
3. 显式缺单位不启动执行、不生成新科研结果、不借用旧通过证明；重启保持缺项，补齐后新方案正常执行。
4. 测试与审查没有阻塞问题；每阶段附实际输出，真实模型收益保持未验证，历史超时与 PTY 保持 OPEN。

## 本轮执行记录

- 阶段一：5 个测试文件、41 项通过；工具实际拒绝缺生产者依赖，保存 0；补齐后保存 1，confirmedFacts/missingFacts 按来源返回。
- 阶段二：发现表单在用户标记缺单位后仍隐藏保留旧值，取消勾选会恢复。3 项反例先红，改为标记时清空单位并规范化旧缺单位草稿；7 文件、57 项通过。修复仅涉及原表单状态，不增加确认或修改科学合同。
- 阶段三：类型检查、构建通过，完整 Vitest 与相关桌面测试已通过，原阈值不变。

## 本轮最终验收

- 完整代码回归：733 文件、7169 通过、11 跳过、0 失败；类型检查和构建通过。
- 8 项相关 Electron 全部通过；新用例同时验证旧单位清空、缺单位早停、重启恢复、新修订/新方案、真实 Python 得到 2m、双宿主验收、展开返回。
- 14 次退出观察均为退出码 0，最大关闭耗时 182.01ms，未见失败/到期/兜底事件；历史退出超时与 PTY 继续 OPEN，不关闭。
- 已阅读本轮缺单位反馈和双验收截图。原工具输出、独立探针、截图和 JSON 均在 followup 子目录，旧证据未覆盖。
- 本轮新增生产修改仅为原表单的旧单位清除与恢复规范化，另改其测试和桌面测试；原三项完整实现仍复用专项候选。new-changes.json 可查本轮 3 文件差异身份。
- 源码和构建身份未漂移；main 干净且仍为 baaa2c5f。候选未提交、未合并，不推送、不发布、不更换已安装 App；真实模型调用 0，未使用旧额度。
