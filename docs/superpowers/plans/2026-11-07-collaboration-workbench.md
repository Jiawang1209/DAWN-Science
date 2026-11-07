# 对话协作台与流程工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 默认以紧凑对话协作台呈现真实子任务，展开查看流程；保持原执行和恢复语义。

**Architecture:** RunOverview 继续读取 getRunOverview；提取共享只读轮询 hook，主对话摘要和协作面板复用同一查询缓存。任务选择/页签是会话内 UI 状态，不产生新调度器。真实 TeamSnapshot 依赖使用现有 team-dag 布局，普通委派只展示并行兄弟节点；未知和历史态始终有标签。

**Tech Stack:** React、nanostores、TypeScript、Vitest/Testing Library、Playwright Electron、现有设计令牌。

## 隔离与边界

- 在 /Users/liuyue/.codex/worktrees/dawn-evidence-evaluation-20261107/dawn-science 继续；保留上一轮未提交证据交接。baseline.patch 和 baseline-files.json 固定本轮起点。main f685a561 不修改。
- 不调用真实模型；上一轮 30 次 API 上限已用完。桌面验证用现有 mock inference + 真实 Electron 和原后端。
- 不提交、合并、推送、发布或替换安装 App。正式配置和数据库不写入。历史偶发 Electron 关闭超时保持开放，记录本轮实际退出结果。

## 阶段 A：协作面板

**Files:** src/ui/run-overview.tsx、src/ui/use-run-overview.ts、src/ui/collaboration-model.ts、src/ui/collaboration-detail.tsx、src/ui/styles.css、src/ui/i18n/en.ts、tests/ui/run-overview.test.tsx、tests/ui/collaboration-model.test.ts。

- [x] 先补失败测试：完成但 blocked 不计验收；disk 不显示实时运行；切会话不显示旧回复；切任务保持页签而不泄露旧任务；交接仍展示 v1/v2 冻结事实。
- [x] 提取 status/摘要推导，轮询按 client/session 共享，最后订阅卸载停止轮询；失败清空旧快照，异步结果按所属会话校验。
- [x] 默认紧凑列表：真实 label、类型、phase、阶段、结算耗时；选择后过程/交接/产物/记录。只有真实的输入/输出版本计数可见，缺具体路径不得伪造。
- [x] 预算/完整历史放折叠区；保留子转录跳转及原权限控制入口，不新增未经后端支持的停止、重试或纠偏。
- [x] 跑定向 Vitest/typecheck，真实 Electron 截图检查，展示阶段 A。

## 阶段 B：主对话摘要与流程展开

**Files:** src/ui/app.tsx、src/ui/team-panel.tsx、src/ui/team-dag.ts（复用）、src/ui/collaboration-workflow.tsx、src/ui/state/collaboration-view.ts、src/ui/styles.css、tests/ui/collaboration-workflow.test.tsx、e2e/collaboration-workbench.spec.ts。

- [x] 先补失败测试：无子任务不出现空摘要；摘要点击打开所属会话协作；真实 Team 依赖仅按明确 address 匹配，不靠 label 猜；无依赖不画假串行。
- [x] 在主 ConversationView 上方挂摘要：任务数量、当前阶段、验收数；不自动打开或抢焦点。原团队格显示“协作”，兼容原 team tenant。
- [x] 扩展视图可切换流程/列表，任务选择和页签由同一状态持有。TeamSnapshot 原团队管理折叠保留，未产生运行记录的 pending 任务仍可查看。
- [x] 键盘可操作按钮和页签，窄栏换行、溢出滚动；明暗主题只用现有令牌。
- [x] 运行真实 Electron：普通并行、锁等待、冻结交接、任务切换、流程展开、恢复；截图展示阶段 B。

## 阶段 C：审查、回归与交付

- [x] 按 requesting-code-review 技能安排独立只读审查：重点会话隔离、未知态、验收计数、依赖身份绑定、取消排空、轮询卸载及旧入口。
- [x] 修复问题并补针对性回归；不放宽等待时间或视觉阈值来掩盖失败。
- [x] npm run typecheck；npm run build；完整 npm test；相关 Playwright Electron（orchestration/science-pipeline/task-contract/evidence-handoff/observable-handoff/subagent-shutdown/subagent-steering/run-explanation-budget/exit-lifecycle）；kernel 单独报告（若本轮未涉及执行内核，记录既有与新跑区别）。
- [x] 文档与审查报告记录实际通过数、截图、退出诊断、未测范围；检查 main 及既有未提交文件保留情况。展示阶段 C，完成 goal。

## 验收原则

后端 completed ≠ accepted。queued/stopping/unknown 不混为执行中；disk 只读不触发恢复。Team 依赖来自同一会话且相同身份的真实 tasks；没有资料就解释未知。产物“版本计数”不是重新核验文件。冻结任务不显示普通续聊能力。流程切换不启动、取消或恢复任何任务。

## 用户补充视觉要求（实施中确认）

用户提供 Harness 编队截图，明确要求展开视图具备全屏规模、左侧 Agent 网络、右侧多列成员卡片、搜索筛选和顶部进度。阶段 B 改为原生 dialog 展开整个工作区；默认对话协作台不变。网络边表示同一宿主的直接编排关系；任务依赖另用现有 team-dag 绘制，不伪造更深血缘、费用或上下文构成。优先用实际状态、结算耗时和已记录累计 tokens；未知保留未知。

## 最终验收

实施、三阶段真实截图及独立审查已完成。最终6378 Node/UI通过、10跳过，50内核通过/1条件跳过，22个桌面场景及5次补验通过。保留首轮远端PTY清理期失败及一次Electron关闭延迟，不将历史根因标为解决。详见[验收报告](../../reviews/2026-11-07-collaboration-workbench.md)。用户本轮未要求提交合并，按仓库默认保留工作区待验收，不提交、合并、推送、发布。
