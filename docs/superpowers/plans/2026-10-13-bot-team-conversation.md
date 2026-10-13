# Bot Team Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. 用户已批准上述设计并要求执行，不重复确认。保留当前工作树全部未提交改动，不提交、合并或推送。

**Goal:** 同一个团队讨论支持 Bot 追问/转询、连续消息与用户插话。

**Architecture:** 扩展已有持久 exchange 与事件驱动 scheduler，嵌套轮次挂起时释放会话及输出锁，回复逐层接回原 attempt；公开消息形成团队时间线。沿用 Native 工具与严格协议，不引入新的运行时。

**Tech Stack:** TypeScript、React、Zod、Vitest、Electron/Playwright、现有 team.json。

## Task 1 — 持久消息与多轮接回

Files: `src/team/types.ts`, `src/team/scheduler.ts`, `src/bot/collaboration.ts`, `src/bot/recovery.ts`, `tests/team/bot-collaboration.test.ts`, `tests/bot/recovery.test.ts`。

- [x] RED：实际 scheduler 测试 A→B→A 反问及 A→B→C 转询，父请求等待，子回应接回正确轮次，原 task 只结算一次。
- [x] GREEN：exchange 父链及原始负责人；持久公开消息；用户消息幂等排队、指定/全员、忙时不并发注入。`botRequestPrompt` / `botReplyPrompt` 带真实公开上下文。
- [x] 验证停止、取消/转派、成员移除、重启、限额、重复 ID、迟到响应及私聊隔离。Run `npx vitest run tests/team/bot-collaboration.test.ts tests/bot/recovery.test.ts`。

## Task 2 — Native 与严格协议

Files: `src/runtime/native.ts`, `src/workbench/backend.ts`, `src/protocol/events.ts`, `src/protocol/operations.ts`, `src/protocol/version.ts` 和对应 integration/protocol/backend mocks。

- [x] RED：公开消息与新用户输入操作严格 schema、未知字段拒绝、当前 owner/scope 校验；成员工具可在请求轮继续提问。
- [x] GREEN：安装团队发言工具、更新协作指令；新 `messageBotTeam` 操作 `{ownerSessionId,teamId,requestId,message,toBotId?}`，发送者由后端确定，禁止模型冒充；同包更新协议 fixtures。
- [x] Run `npx vitest run tests/protocol tests/workbench/bot-ops.test.ts tests/integration/bot-native-session.test.ts`，`npm run typecheck`。

## Task 3 — 坞内团队对话

Files: `src/ui/bot-collaboration.tsx`, `src/ui/bot-pane.tsx`, `src/ui/styles.css`, `src/ui/i18n/en.ts`, `tests/ui/bot-collaboration.test.tsx`, `tests/ui/bot-pane.test.tsx`。

- [x] RED：按时间连续显示原发言/追问/回应，发言者准确；用户输入和目标选择，错误保留草稿，owner/scope 切换无旧回执污染。
- [x] GREEN：团队对话替换记录卡片；消息不再需要逐条点开；小型输入区支持团队/成员与发送；私聊/只读执行转录仍可进入返回。新增可判定样式规则与 i18n。
- [x] Run `npx vitest run tests/ui/bot-collaboration.test.tsx tests/ui/bot-pane.test.tsx tests/ui/design-contract.test.ts tests/ui/i18n.test.ts`。

用户追加的视觉要求：每条发言使用固定头像和独立圆角气泡，姓名/专业角色/时间清晰分层；头像贯穿清单、团队、私聊，用户右侧、Bot 左侧；亮暗及窄坞实测。实现新增 `src/ui/bot-avatar.tsx`、身份令牌和对应测试，不拆多列窗口。

## Task 4 — 数据分析真实链路验收

Files: `scripts/mock-bot-collaboration.mjs`, `e2e/bot-collaboration.spec.ts`, `docs/reviews/2026-10-13-bot-team-conversation-verification.md`, `docs/DEVELOPMENT_HISTORY.md`。

- [x] 扩展共用假推理：数据反问/第三人核对、绘图反问、用户插入标注要求。工具、数据、实际计算与绘图真实执行。
- [x] `npm test`、`npm run typecheck`、`npm run build`，相关 Bot/Team/dock/files Electron 回归；亮暗与 280px 截图实看，不调整原视觉基线。
- [x] 两阶段独立审查，修复发现后复验；记录精确通过数量与边界。重新打开隔离分支预览，保留 main。

验收已完成，精确数量与边界见 `docs/reviews/2026-10-13-bot-team-conversation-verification.md`；分支保留未提交状态，未合并。
