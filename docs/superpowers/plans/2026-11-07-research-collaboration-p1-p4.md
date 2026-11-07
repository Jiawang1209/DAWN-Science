# 科研协作 P1—P4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use requesting-code-review for independent review at phase gates. Steps use checkbox syntax for tracking.

**Goal:** 让 DAWN 完整科研交付可验证、阶段预算可控、协作结果易读、上下文消耗可解释。

**Architecture:** 在现有统一编排/流水线上增加可选预算预留与只读观测；冻结契约、工具证据、版本锁和恢复保持原职责。主界面沿用对话协作台与展开流程工作台，不新增执行器。

**Tech Stack:** TypeScript、Zod、React、Pi SDK、Electron、Vitest、Playwright、既有 JSON 原子状态与会话存储。

---

## 执行位置与当前状态

- 基线 main：`9cc757cc`；功能基线：`c5d4d568`。
- 专项分支：`codex/research-collaboration-p1-p4-20261107`。
- 工作区：`/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science`。
- [设计](../specs/2026-11-07-research-collaboration-p1-p4-design.md)。以下相对路径均相对于专项工作区。
- 当前进度：A—D 全部完成本轮本地交付与独立规格/质量复审。真实配对 24/30 请求，两边文件核验通过；multi 比 single 多 4 次请求、29.190 秒，失败记录保留。最终 Node/UI 6813 passed、10 skipped；Electron 行为 15 项、最后 CSS 构建针对性 5 项与 disk 可见来源补验 1 项通过，候选差异精确记录。最终 346 项独立测试、18 个跨阶段 cases 和 115 项冻结配对只读核验通过。未提交/合并/推送/发布；历史退出 OPEN、长 Bot/MCP stopping 与跨平台/kernel 未验证边界保留。见验证索引和 final-audit.json。
- 不自动 commit/merge/push/release，不替换已安装 App，不修改正式配置/凭证/数据库。实现开始前核对 clean baseline、依赖和来源指纹；按既有工作区约定复用依赖，不为文档规划安装软件。

## 阶段与依赖

| 顺序 | 子计划 | 可交付结果 | 对用户展示 |
|---|---|---|---|
| A | [交付评测](2026-11-07-research-collaboration-p1-delivery.md) | 完整交付、正确阻塞及各种未提交原因分开计量；新授权下的真实配对 | 离线正反例 + 真实结果表，原失败保留 |
| B | [阶段预留](2026-11-07-research-collaboration-p2-budget.md) | 正式流水线审阅轮次预留、并发与恢复账本 | 前序受限、审阅仍可准入、取消排空与恢复后的额度 |
| C | [成果界面](2026-11-07-research-collaboration-p3-workbench.md) | 成果、阻塞、下一步及阶段预算首屏可见 | 深浅主题、窄窗口、展开返回、实际状态变化 |
| D | [上下文观测](2026-11-07-research-collaboration-p4-observation.md) | 成员当前上下文、累计消耗、估算/未知分开 | 同任务数值对照、切会话与重启失效演示 |

A 的离线评测与计量先完成，作为 B—D 的回归入口。真实调用需独立授权；等待时可以推进 B—D 离线工作，A 真实验收保持待完成。B 的正式预算先于 C 中的预留展示；C 的统一快照先于 D 的成员观测展示。每阶段独立完成、复审和展示，避免一次混入四阶段的大提交。

## Task 0：准备与执行记录

- [x] 核对基线/专项分支与 main，读取设计和四份子计划；保护任何新出现的用户修改。
- [x] 记录源码、lockfile、版本和必要构建指纹；仅在实际开始实现时准备依赖。
- [x] 建立 `docs/validation/research-collaboration-p1-p4-20261107/` 的阶段索引；离线/真实、候选版本、模型/工具、额度和未验项分开。
- [x] 用对应现有定向测试确认所需主路径基线；这不是重新宣称历史全量已通过。

## Task 1—4：按子计划实施

- [x] 完成 A 的分类计量、冻结任务清单、离线执行与展示；真实复验在新增额度授权后完成。
- [x] 完成 B 的可选轮次预留，覆盖准入、并发、修订、停止排空和恢复；展示真实账本。
- [x] 完成 C 的 presentation selector、刷新一致性和成果优先主视图；展示真实 Electron。
- [x] 完成 D 的有来源上下文观测、未知/估算处理、成员详情；展示真实读数与失效场景。
- [x] 获得新模型额度后执行 A 的真实配对，记录正反结果，不改写旧报告，不绕过总额度。

## Task 5：共同收口

- [x] 每阶段先红后绿，执行精确的相关测试，独立代码复审并处理阻断问题。
- [x] 产品代码变更阶段收尾：`npm run typecheck`、`npm run build`、`npm test -- --project node --project ui`。涉及真实内核时另串行 `npm test -- --project kernel`。
- [x] Electron 必须针对已构建产物，`--output` 与所有演示/诊断目录指向隔离证据根；不覆盖旧截图或基线。
- [x] 复核会话/代次隔离、冻结契约、原始工具记录、产物版本与锁、取消排空、恢复、旧入口及未知用量。
- [x] 保存初次失败与最终验证，展示每阶段具体效果。重新核对功能而非仅累计测试数。
- [x] 更新历史退出跟踪并保留 OPEN；出现五秒等待必须区分故障注入、应用退出事件和实际 OS 退出，不能只看 exitCode=0。
- [x] 对源码指纹和仓库状态做最终审计；只有后续明确授权才本地提交/合并，push/release 仍单独受限。

## 新真实调用的明确边界

首批最多 30 次、每臂最多 15 次、仅一个代表性配对，已于 11 月 8 日获用户明确授权；多 Agent 核查和分析共享 11 次，独立审阅 4 次，不互借。详见验证目录 p1/live-proposal.md。旧试验 27 次结束后不可滚存剩余 3 次。更多题目/重复需要明确总预算和任务清单；不能重开进程、换目录、换别名来重置预算。凭证只读、只在内存中传递，系统密码只由用户在系统提示处理。尚未运行不记作完成。

## 成功与限制

成功是四项能力按设计完成并有相应证据，不是保证多 Agent 在所有任务更快、更便宜或审阅一定通过。无法完成的阶段、模型失败、unknown、历史超时都如实保留；实际模型未复验时整轮真实验收仍待完成。

## 本轮收口

独立最终质量审查通过，未发现可复现 P1/P2 阻断。各阶段 Files/Run 是设计时预期接点；实际实现文件、命令、初次失败、最终候选与限制以各交付报告为准，不将规划中的示例命令当已运行证据。所有本轮改动保留在专项分支和工作区，main 仍为 9cc757cc 且干净。未自动提交或合并。
