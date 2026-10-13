# Bot Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. 用户已批准此方向并要求在当前 `codex/bot-team` 实施、数据分析验证、不要合并。保留已有未提交改动，不提交/合并/推送。

> 早期阶段方案。当前连续对话、多轮追问、用户插话及头像气泡以 [后续方案](2026-10-13-bot-team-conversation.md) 为准；下文“不递归转托”的旧约束已由有界父链调度替代。

**Goal:** 专业 Bot 能向同一协作团队的队友请求核查或交接工作，自动收到关联回应并继续原任务；坞展示持久化的真实协作过程。

**Architecture:** 在既有任务调度器增加有 ID 的异步 Bot exchange，而不是另建重复调度器。发起任务等待队友时释放执行轮与文件锁，保留原 attempt；队友处理后自动把最终回应送回发起者，再继续原任务。对话/项目/SSH scope、权限、内核和输出锁沿用现有边界。Bot direct 私聊不复制到协作上下文。

**Tech Stack:** TypeScript / NativeRuntime / pi / existing team JSON persistence, Zod protocol, React, Vitest, Electron e2e。没有新模型依赖。

## 已批准的产品语义

- 主对话选择专业 Bot 组成团队并承担最终汇总。
- 成员自主请求、核查、交接，用户在 Bot 坞里能看到发起者、接收者、请求/交接内容、状态及实际回应，并能打开对应成员执行对话。
- `bot_message` 工具参数 `to`（稳定 botId，兼容确切成员名）、`message`、`kind: request | handoff`；发件人由运行会话确定，不接受模型自报。
- 请求为异步：调用后结束本轮等待，不能轮询/假装已获回复；接收者的最终回复自动关联原 request，发起者收到后继续原任务。交接表示请队友完成该段工作并返回交付，原任务仍由发起者确认及汇报。
- 本轮只允许当前团队同 scope 的 Bot 互调；处理队友请求时不能继续递归转托。每任务至多 8 次、每团队至多 64 次，禁止发给自己及非成员。多个任务可并行，已有并发上限保留。
- 取消/转派/停止后迟到回应不能继续旧 attempt；重启将未结束协作标为 interrupted，不自动重放写入。

## 共享契约

`team.collaboration?: BotExchange[]`，旧 team 文件不需要迁移：

```ts
interface BotExchange {
  id: string;
  from: string; to: string; fromBotId: string; toBotId: string;
  kind: "request" | "handoff";
  message: string; reply?: string;
  status: "queued" | "working" | "replied" | "failed" | "cancelled" | "interrupted";
  taskId?: string; attemptId?: string;
  createdAt: number; updatedAt: number; resumedAt?: number;
}
```

`团队调度器.requestBot(teamId, from, {id,to,message,kind?}): BotExchange`；`BotMemberRun.collaboration?: { exchangeId: string; phase: "request" | "reply" }` 标明当前轮来源。严格校验原请求重用 ID 的参数。接收者处理轮不结算自己的原任务，原任务仍等待；发起者 reply 轮沿用原 taskId/attemptId。产物仍由原任务最终输出核验。

## Task 1: 真实请求/回应/继续任务

Files: `src/bot/collaboration.ts`, `src/team/types.ts`, `src/team/scheduler.ts`, `src/bot/recovery.ts`; tests `tests/team/bot-collaboration.test.ts`, `tests/bot/recovery.test.ts`。

- [x] 写失败测试：统计发起核查后原任务不是 completed；数据收到带 request ID 的消息并返回最终回复；统计在新一轮收到该回复并实际继续，最后才结算，持久队列无重复。
- [x] 执行 `npx vitest run tests/team/bot-collaboration.test.ts`，确认旧实现没有 requestBot 导致预期失败。
- [x] 加入持久 exchange 与有限队列，当前任务等待时释放执行轮、队友回复自动返回、继续原 attempt；保留 legacy message 路径。
- [x] 验证失败、取消、转派、重复 ID、跨团队/自己/非 Bot、递归请求拒绝、轮次限制、重启不重放和晚到回应。

## Task 2: Native 工具与严格协议

Files: `src/runtime/native.ts`, `src/bot/runtime.ts`, `src/protocol/events.ts`, `src/protocol/version.ts`; tests `tests/protocol/events.test.ts`, `tests/integration/bot-native-session.test.ts`。

- [x] 先写 schema/工具装配失败测试，再实现 `bot_message` 与 `bot_colleagues`，工具身份与现有 team owner 绑定。
- [x] 加协作请求/接力指令：必须真实查证，不能声称已收结果；最终回应自动返回，普通 task 只在所有必要交流后交付。
- [x] 严格 snapshot 支持上述可选字段，旧快照仍通过；协议 minor 8.14，与 mock 同包更新。

## Task 3: 坞内协作过程

Files: `src/ui/bot-collaboration.tsx`, `src/ui/bot-pane.tsx`, `src/ui/panels.tsx`, `src/ui/styles.css`, `src/ui/i18n/en.ts`; tests `tests/ui/bot-collaboration.test.tsx`。

- [x] 写失败 UI 测试：真实 from→to/状态/内容/回应，空态，打开正确成员，长内容、失败、中断、非当前 owner 不串记录。
- [x] Bot 清单增加“助手 / 协作过程”同一行切换；协作过程显示当前主会话 team 的 exchange，省略内部 IDs，折叠长内容，允许查看成员对话。直接聊天保持独立。
- [x] 保留亮暗、280px 窄坞、自适应页签、文件时间/大小、预览边框与收起。切页后事件来自主会话 snapshot，不能静态写假日志。

## Task 4: 数据分析与最终验收

Files: `scripts/mock-inference-server.mjs`, `e2e/bot-collaboration.spec.ts`, verification docs/history。

- [x] 加与 dev:mock 共用的确定性协作场景，只有推理为假，工具/文件/调度/回应为真。数据包含一条哨兵值；统计先真实读取发现异常，请数据核查，数据返回处理依据，统计收到后执行调整，向绘图交接真实模型产物，收到交付后再完成原任务。
- [x] e2e 断言协作不是预设依赖列表：先看 request waiting，再看 real reply，再检查重新计算结果/脚本/说明/图形。坞能看到请求与回应；点击对应 Bot 可读真实对话，脚本点击沿用已有预览。
- [x] 最终全量 Vitest 388 文件、4373 项通过（10 跳过），44 项 Electron 全通过。类型检查、构建、协作 E2E 和两阶段独立审查通过；修复全部审查问题，不改视觉基线。
- [x] 日志归档和报告完成，见 `docs/reviews/2026-10-13-bot-collaboration-verification.md`。新版隔离分支演示已启动并置前，旧的流水线演示已停止；未提交、合并或推送。
