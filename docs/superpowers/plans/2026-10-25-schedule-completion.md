# 定时整轮结算修复实施计划

**Goal:** 定时任务仅在完整请求结束后结算，保留失败、取消和超时。
**Architecture:** 复用 SessionTranscripts.on回合收尾；后端持有同一次运行的订阅与幂等收尾。协议与调度定义保持不变。
**Tech Stack:** TypeScript、SQLite、Vitest、Electron、Playwright。

## 本切片

- [x] 确认 main 基线 516f7486；独立 worktree、codex/schedule-completion 分支；定向基线 2 文件 11 项通过。
- [x] 在 tests/workbench/schedule-ops.test.ts 加入手动事件模型，覆盖中间回复仍运行、最终摘要、迟到失败、无文本结束、超时/取消/退出、用户停止、启动中取消与迟到事件；确认现有实现按预期失败。
- [x] 修改 src/workbench/backend.ts：状态订阅只处理 exited，正常结算改用 on回合收尾；失败写 agent_error，成功摘要从当前转录取最后 agent 发言；收尾清理全部监听；取消/超时先结算后中止。
- [x] 在共用 mock-inference-server 中加入可控多轮定时夹具，在 e2e/schedule.spec.ts 验证真实 Electron 的运行中状态、最终成功、后续失败及用户停止取消；保持 dev:mock 与 E2E 共用模型 mock。
- [x] 运行定向回归、npm run typecheck、npm test、npm run build、相关 Electron；记录实际结果与边界。
- [x] 自审变更与失败/取消竞争；更新 DEVELOPMENT_HISTORY 和独立 review 证据；提交本切片。
- [ ] 将验证通过的提交快进合并本地 main，确认代码相同及相关运行路径；然后才创建下一项分支。

本轮依用户指示原会话内串行执行，无子 agent。下一项不混入本分支。
