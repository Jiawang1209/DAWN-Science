# 交付引导与待确认闭环实施计划

> 单线使用 superpowers:executing-plans、test-driven-development 与 verification-before-completion。用户已批准设计方向并要求开始；不再次请求方案批准，不自动commit/merge，不推送发布。

**Goal:** 减少冻结字段抄写/证据引用错误，贯通补信息到新版本方案，主协作台清晰说明成果、阻碍和下一步。

**Architecture:** 只扩展propose_plan入参适配、TaskSubmission只读投影、现有规划请求和结果呈现；冻结存档、权限、版本验收、锁和恢复继续由原机制负责。

**Tech Stack:** TypeScript/Zod/React/Electron/Vitest/Playwright及现有evaluate:science。

工作区：/Users/liuyue/.codex/worktrees/dawn-delivery-guidance-20261109/dawn-science；证据：docs/validation/delivery-guidance-20261109/。设计见同日spec。

## 阶段0：边界、计划与goal

- [x] 核实main38ba63ef干净，创建专项worktree及依赖软链接。
- [x] 只保存正式profile三文件哈希；保留旧证据与历史风险。
- [x] 写设计与本计划；检查职责与批准/科学真值不变。
- [x] 创建/goal后开始实现；每阶段更新勾选和证据。

## 阶段A：契约引用及提交引导

文件：src/protocol/task-arrangement.ts、src/tools/propose-plan.ts、src/runtime/native.ts、scripts/research-auto-arrangement.ts、src/protocol/task-contract.ts、src/orchestration/task-submission.ts；必要时增加纯投影helper。测试：tests/tools/propose-plan.test.ts、tests/orchestration/task-submission.test.ts、tests/evaluation/research-auto-arrangement.test.ts及现有schema测试。

- [x] 先加失败测试：宿主catalog中的引用展开后acceptance完全一致；未知/重复字段/旧目录引用/取消不能交方案；完整contract旧入口仍可用。
- [x] 实现引用适配：`execution:{agent,contractRef}`查宿主目录，克隆规范化contract，交原TaskArrangementSchema；序列化只写完整contract。catalog变化后旧引用拒绝，不能由模型注入catalog。
- [x] get_task_status返回精确deliveryGuide；测试mean键、n/unit、reviewedPaths、不猜结论、唯一成功证据、失败/重名/跨实例排除、只读不增加提交次数。
- [x] 科学指标schema指导与服务端一致；错误metric键/引用仍走原submit/finalize拒绝。
- [x] 运行`npx vitest run tests/tools/propose-plan.test.ts tests/orchestration/task-submission.test.ts tests/evaluation/research-auto-arrangement.test.ts`保存red/green。目录中不存在的测试名以实际runner文件定位后在本计划记明。
- [x] 以localhost实际工具生成引用方案及正式提交，保留完整报告，展示少抄哪些字段。无真实模型调用，不宣称模型成功率改善。

## 阶段B：补信息闭环

文件：src/ui/orchestration-advisor.tsx、src/ui/task-arrangement-view.tsx、src/ui/auto-arrangement-request.ts、src/protocol/task-arrangement.ts、src/evaluation/research-tasks.ts、scripts/research-auto-arrangement.ts、scripts/evaluate-research.ts及对应Vitest。

- [x] 先测questions方案不可批准，协作台显示问题与输入框；答案不足禁用，齐全后以原任务+确切方案版本+逐题回答生成新方案，不直接执行。
- [x] 回答保留至新方案到达；请求失败保留；方案变化取消旧提交、会话卸载abort、迟到完成不能覆盖新草稿；沿原onGenerate requester守卫。
- [x] 重新启动从原plans.json恢复待确认问题，新生成方案仍需原批准；原批准执行不被改动或自动恢复。
- [x] awaiting-info评测只在确切收到问题且没有执行时产生，报告单列，success=false且不是correctBlock；取消仍cancelled，其他异常仍failed。旧真实报告不覆盖。
- [x] 专项单测与localhost未知单位场景通过，展示待确认及补全后的新版方案。

## 阶段C：信息层级与收口

文件：src/ui/collaboration-outcome-panel.tsx、src/ui/run-overview.tsx、src/ui/styles.css、src/ui/i18n/en.ts、必要的纯outcome投影；tests/ui相关、e2e/delivery-guidance.spec.ts。

- [x] 成果状态/阻碍/下一步常显，产物版本和预算收进可访问details，展开工作台仍有快捷返回；待正式审阅与运行中审阅明确区分。
- [x] 实际Electron900x640/宽屏检查待确认→补信息→新版→采纳→宿主验收、记录/版本预览、展开返回、双会话与取消恢复；mock服务与产品共用。
- [x] `npm run typecheck`、`npm run build`；完整`npx vitest run --maxWorkers=4`；相关Electron用既有隔离profile，不改正式数据。
- [x] 自审契约绑定、权限/科学验收、会话与代次、取消排空、恢复、旧入口；问题先修复补测试。没有独立审查者时明确是自审。
- [x] 每阶段实拍/JSON报告归档，核对main及正式三文件哈希，保留专项worktree不提交合并；历史退出/PTY保持OPEN。

## 完成判据与效果

A/B/C实现与当轮证据齐备，旧入口可用，无阻塞问题；实际科学验收没有放宽。展示三种状态：等待信息、等待正式提交/审阅、全部验收；明确模拟模型不等于真实模型收益。记录失败与未验证平台，不能用测试数量代替真实可用性。


## 实施进度（2026-11-09）

A已实现：宿主目录使用内容指纹引用，交付前展开完整契约；无目录的普通会话保持旧schema与完整契约。目录当前由可信宿主提供，真实科研评测已接入；不从用户文本推测科学验收阈值，也不声称所有普通任务已有可复用目录。get_task_status增加deliveryGuide与精确科学字段，不生成默认结论或替人正式提交；指标键采用schema描述与属性引导，保留blocked无数值表达。原数值/版本验收不变。新增Native/reference、guidance、strict与bounds的red/green日志和stage-a-effect.json保留。初始schema强制metric的方案已在审查中取消，避免诱导虚构数值。

B已实现：问题来自既有方案，逐题回答走原只读规划请求并生成新版本；原方案不可批准，补全后仍须采纳。已用真实Electron重启复现并修复空composer草稿导致按钮不可用，原失败trace和两次截图保留。已验收问题恢复→补充→第二版→采纳→实际文件/宿主验收及展开返回。待确认评测单列awaiting-info，不计作合格交付或正确blocked，实际runner测试已通过。没有改写旧真实报告。

C已实现：下一步常显，版本/额度详情折叠；已结束但未正式提交的提示仅依据确切owner/team/task/attemptId/epoch、失败及排空观测，缺数据不猜。类型和构建阶段通过、设计/语言扫描121项通过。样式已改用dawn令牌，不放宽扫描。源码冻结后正在跑最终完整Vitest，随后运行相关桌面规格及窄窗/停止复验。

所有阶段是单线自审；没有声称独立审查。0新增真实模型调用，无科学质量/成本收益改善声明。未提交、未合并，main保持38ba63ef。历史退出与PTY继续OPEN。

手动探索补充：面板来回时的回答草稿已接入现有按会话协作视图（最多64会话），owner+planId/version/markdown精确隔离；重启只恢复原方案问题，未发送答案只在当前窗口保留。首轮全量捕获32KiB边界及两个旧自定义fixture读取旧提示的问题，已修复并定向复验，保留原失败日志；最终代码冻结后重新执行全量，不使用原轮结果充当最终通过。

## 最终交付

完成A/B/C并逐阶段展示。完整Vitest716文件7074通过/11跳过；首轮相关桌面57通过/1失败（取消入口藏于折叠区），原现场保留。最后取消按钮调整后147项UI及10项相关Electron复验全部通过，类型/构建退出0。全量后的4文件差异及对应验证见completion-state.json。离线6题6合格配对，另验证awaiting-info不编译、不执行、不计作成功交付或正确阻塞。87次退出观察最大252.13ms，无非零退出或原生关闭错误；不能据此关闭历史问题。

1739源文件交付指纹已保存，main38ba63ef干净，正式配置/凭证/数据库哈希与基线一致。0新增真实模型请求；不宣称真实模型质量或费用改善。修改保留专项worktree，未提交、未合并、未推送、未发布，不替换正式App。历史退出与PTY仍OPEN，1500/4000ms不变。

## 用户授权的本地审查合并（2026-11-09）

在后续明确授权下，复核方案绑定、权限冻结、owner/执行代次、取消排空、恢复和旧入口；修复长问题补信息超限、补信息前置请求取消缺口及窄面板旧 CSS 隐藏新入口三项问题。完整 Vitest 717 文件 7083 通过/11 跳过；相关 Electron 28 项、补信息修复后 10 项、窄面板红绿后 2 项通过。完整测试冻结后只有窄面板 CSS 与对应 Electron 断言变化，132 项 UI 专项及实机验证覆盖该差异。

代码 ad23c80f 本地提交并快进 main；合并后完整构建、222 项定向测试及 7 项 Electron 冒烟通过。最终 1746 源文件与 main 一致，正式三文件哈希未变。证据收尾不改变应用代码；不推送、不发布，不替换正式 App，原始工作区及失败证据保留。72 次正常退出观察不能关闭历史超时/PTY问题，仍 OPEN。详见同日 delivery-guidance-merge-review 审查与验证索引。
