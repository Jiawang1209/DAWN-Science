# Bot 可靠性与协作可见性

**Goal:** 在 `codex/bot-team` 修复用户确认的五项缺陷，完善成员状态、用户消息处理状态及成果预览；测试后保留分支，不合并、不推送。

**Architecture:** 沿用 Native 托管 Bot、持久化 Team、现有协议和坞布局。Bot 对队友的执行请求只走受认证、带根任务预算的协作入口；任务停止与成员停止分开。界面只呈现已有权威状态，成果入口复用后端校验过的 task.artifacts 和现有文件预览。

**Tech Stack:** TypeScript、React、nanostores、Vitest、Electron / Playwright。

用户已在本轮确认评估建议和执行范围。遵循长期路线图的就地执行约定，不委派子 agent。没有新增模型服务、真实 API 调用或 SSH 验收。

## 执行与验收

- [x] 1. Native 成员工具移除旧 `team_send`，保留 `team_status` / `bot_say` / `bot_message`。工具清单回归证明旧入口不再可用，8 次根请求预算仍有效。
- [x] 2. 增加调度器按任务停止入口。取消排队任务不 abort 同成员正在执行的其他任务、不取消其用户消息；取消执行任务仍中断该任务及其后代协作。Native 接入此入口。
- [x] 3. 调度器开始/结束事件共享每轮固定 ID，Native 根据该 ID 配对 chip index；并发先后颠倒的结束顺序仍各自结算。
- [x] 4. 草稿、发送对象、幂等回执、阅读位置按 owner / scope / team 保存在 UI 状态；普通卸载后恢复，换范围不会串用，迟到发送结果不能清掉更新草稿。
- [x] 5. 32 项限制计算未结束任务；64 次限制计算未续接的活动请求。历史记录不删除；每项根任务/用户消息 8 次请求总预算继续生效。完成的历史不阻止新工作。
- [x] 6. 团队顶部展示成员头像、工作/等待队友/待回答/待批准/待命/失败状态。点击成员设置发言对象；状态取自 team，不推测模型内部思考。
- [x] 7. 用户气泡显示各收件人的 queued/working/replied/failed/cancelled/interrupted 状态。无元数据的历史消息不显示虚构的已送达状态。
- [x] 8. Bot 气泡复用 AgentMarkdown；结果消息匹配对应任务与 attempt，只展示该任务已校验的 artifacts。点击复用本地/远端现有预览；任意消息中的路径不自动获得产物信任。

## 验证命令与判据

先添加失败回归并运行相应文件，再实现。每步跑覆盖该边界的测试。

```sh
npx vitest run tests/integration/bot-native-session.test.ts tests/team/bot-collaboration.test.ts tests/team/state.test.ts tests/ui/bot-team-conversation.test.tsx tests/ui/bot-pane.test.tsx
npm run typecheck
npm test
npm run build
npx playwright test e2e/bot-collaboration.spec.ts e2e/bot-dispatch.spec.ts e2e/bot-direct-chat.spec.ts e2e/bot-team.spec.ts e2e/team.spec.ts e2e/dock-responsive-tabs.spec.ts
git diff --check
```

Electron 实际检查：数据分析反问/交接/用户插话后所有 chip 收尾；草稿经助手页、成员详情、坞切换后恢复；成员状态与消息处理结果存在；结果气泡打开脚本/图表；亮色与 280px 暗色无横向溢出。保留真实输入、脚本、结果与截图证据。更新开发历史，记录实际通过数与固定推理验收边界。

验收完成：全量 391 文件、4424 项通过、10 项跳过；类型检查、构建及 diff 检查通过。27 项独立 Electron 回归通过，最终构建 Bot 协作/派单 4 项及额外阅读位置/截图复验通过。详见 `docs/reviews/2026-10-13-bot-reliability-verification.md`。未合并、未推送。
