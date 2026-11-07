# 真实任务评测与证据交接 Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans 单实现主线；按 requesting-code-review 技能进行独立只读审查，不并行修改。用户已授权方案后直接执行，阶段展示，不自动提交/合并。

**Goal:** 真实模型成对科研试验与可检查、可恢复的证据交接，复用现有契约/版本/评测。

**Architecture:** 现有 evaluate:science 增加 research 显式入口；独立真值与配对报告、原子请求上限代理分别单文件。原交接协议增加 v2 分支，宿主构造引用并沿原 SHA 绑定；UI 只投影。原科研流水线和独立审阅不注入父会话。

**Tech Stack:** TypeScript/Zod/Node HTTP、Pi、React、Vitest、Electron/Playwright、Python stdlib。

基线 main `f685a56122ee`，工作区 `/Users/liuyue/.codex/worktrees/dawn-evidence-evaluation-20261107/dawn-science`。规格见 `../specs/2026-11-07-evidence-evaluation-design.md`。

## A · 科研任务对照

文件：新增 `src/evaluation/research-tasks.ts`、`scripts/evaluation-request-gate.ts`、`scripts/evaluate-research.ts`；修改 `scripts/evaluate-science-pipeline.ts`；测试 `tests/evaluation/research-tasks.test.ts`、`tests/evaluation/request-gate.test.ts`。

- [x] 写独立真值及可比性失败测试：篡改结果不能因 accepted 通过；配对方法/模型/输入不同拒绝；未知用量不得作零成本；不完整记录不计胜率。
- [x] 写请求上限并发/重试/取消测试：`Promise.all` 发 31 次，原服务器最多收到 30 次。
- [x] `npx vitest run tests/evaluation/research-tasks.test.ts tests/evaluation/request-gate.test.ts --maxWorkers=4` 保存红灯；实现最小模块后重复至通过。
- [x] 通过既有 SubagentExecutor / Team 调度器执行两类代表性任务；同一 input manifest 和最终真值分别运行 single/multi，不把事后答案注入模型。
- [x] 显式 research 模式才调用真实模型；读取当前 API 路线仅输出 provider/model，不打印 endpoint/密钥/请求。整轮 gate 30 次；每行失败/中止也写报告。
- [x] 展示任务清单、联网实际完成量、错误放行、请求/用量及局限；默认确定性入口继续可用。

## B · 证据交接

文件：修改 `src/protocol/context-handoff.ts`、`src/subagent/context-handoff.ts`、`src/subagent/tool.ts`、`src/orchestration/tools.ts`、`src/runtime/native.ts`、`src/ui/run-overview.tsx` 与 i18n；新增 `src/subagent/handoff-sources.ts`；测试 `tests/subagent/evidence-handoff.test.ts`、现有交接/编排/UI 测试；桌面 `e2e/evidence-handoff.spec.ts`。

- [x] 红灯：显式选择早期正文，不含思考/工具/当前回复；外来消息/子任务、无版本回执、活动执行、错误路线均拒绝。
- [x] 实现有界 v2 schema，`HandoffSelection={recentMessages:number,messageIds?:string[],routeStepId?:string,acceptedChildIds?:string[]}`；指定 ID 数与 recentMessages 相同，来源仅当前分支和父编排。无新字段时保持 v1。
- [x] 复用 `freezeHandoff` / `readHandoff` / `bindHandoff`；选择用结构化 schema 比较，不让续问补新引用。v2 指纹覆盖全部字段、恢复只读；旧 v1 原样可读。
- [x] 来源目录只读工具显示有界候选 ID/预览、路线和已结束版本回执；capability 缺失明确返回不支持。模型只交引用 ID，不交内容。
- [x] UI 显示历史来源/版本，明确当前文件未再核验；更新协议 minor/mock 及双语契约。
- [x] 真实 Pi 子进程验证快照进入请求；Electron 展示来源、早期要求、续问与重启不重新采集，保存截图并逐张检查。

## C · 验证与代码审查

- [x] 定向协议、交接、编排、契约、产物锁、恢复回归；失败先留证修复，不改原超时、阈值或视觉基线。
- [x] 执行类型、完整构建、`npx vitest run --project node --project ui --maxWorkers=4`，独立内核使用 `/usr/local/bin/R`；相关 Electron 含退出严格诊断。
- [x] 自审身份冻结、版本引用不冒充当前有效、会话隔离、权限、并发 cap、取消排空与恢复；必要问题红→绿补测。
- [x] 更新 `docs/科研编排评测-怎么用.md`、开发历史、长期路线图及专项报告；保存源指纹与分阶段证据，不提交/合并/推送/发布。历史偶发退出超时状态仍未定位。

最终状态：专项待用户验收，未提交/合并。类型/构建、6367 Node/UI（10 跳过）、内核50/1、20桌面/27次退出通过，30源/测试指纹无漂移；真实API恰30次但无完整配对，不宣称收益。见专项报告。
