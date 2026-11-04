# 科研流水线二次审查与本地集成

日期：2026-11-05（Asia/Shanghai）。基线 main@5c88414e，专项 codex/science-pipeline。用户本轮明确授权：检查正式提交、取消、产物锁和恢复；修复补测；无阻塞后本地提交并合并 main，不推送、不发布。

本报告覆盖前轮尚未提交的全部功能及本轮修复。前轮方案和证据见 [首次验收](2026-11-05-science-pipeline-verification.md)，本轮原始输出位于 [二次审查证据](../validation/science-pipeline-rereview-20261105/)。实现保持单主线，按 requesting-code-review 技能另安排一个只读 reviewer；没有并行代码修改。

## 发现与修复

1. **阶段外消息和 Bot 派单绕过（P2，已修复）**。统一 send_subagent_message 的成员适配器、Workbench messageBotTask、dispatchBotTask 没有使用流水线保护。真实 Native 探针可以向分析成员插入邮箱，或在原团队添加不属于 pipeline.taskIds 的无契约任务，绕过冻结定义、阶段回执与观测。新增 scheduler.assertExternalMutation，让这些入口、通用 Team 写工具和公共消息共用保护。流水线终态也拒绝额外写入，避免返回 queued 却永不调度；状态、停止、显式恢复和结束团队保持原职责。真实 Native 回归遍历 running/interrupted/completed/cancelled，对五条写入口逐个验证拒绝且团队快照完全不变。

2. **显式恢复异常卡在 running/claimed（P2，已修复）**。恢复写入 running 后，onChange 或领取通知抛错会跳过调度，之后又不能 resume。恢复操作现在在转换成功后的异常路径先停止团队；没有活动后端的 claimed 尝试复用 recoverTeamExecution 保存为中断失败，后续需确认未知效果再创建新尝试。仍有后端时保留排空门，不伪装已停止。补了 running 通知失败、claimed 通知失败两条红→绿回归。

   正常阶段结算还有同类窗口：check completed/accepted 与 analyze pending 已原子写入后，观察回调抛错会只停内存调度、不改磁盘 running。外层异常路径现在在本轮后端尚未进入或已经等待退出后，按身份清除当前轮映射，直接保存 interrupted；团队没有其他活动轮次时才协调未知尝试。保存独立于故障观察回调，保存失败另行报告。实际调度器回归和独立探针均确认 accepted 核查不重跑、pending 分析可显式继续。

3. **取消发生在检查点等待期间仍进入外部适配器（P2，已修复）**。Native 工具门等待记轮基线后没有再次检查 signal；忽略可选 signal 的外部工具仍可能被调用。新增 await 后的取消复核，不进入适配器、不记录成功证据，finally 释放活动计数。回归使用真实 Native 外层门和受控检查点等待，修复前确实进入适配器，修复后拒绝。

完整回归另验证了上述取消门的兼容性：事前取消返回仍保留 `analysisRouteEvidence.execution: not_observed`，而不调用适配器或伪造执行记录。首次整套发现这一原有元数据约定被遗漏，保留失败输出；修复后分析路线、Native 和恢复三文件 32 项通过。

独立复审还抓住第 2 项初次修复中的过宽 catch：无效 resume 也会中止正常 running。现在仅在 resumePipeline 校验和转换成功返回后设置 transitioned；前置条件错误直接返回，不触发停止。既有启动测试增加非法 resume 前后完整快照相等断言；实际 Native 探针确认始终为 running@revision=1。

## 取消与产物锁补充验收

新增两条真实 Pi 入口测试，均使用真正 cancel_science_pipeline、真实共享锁、文件和实际子进程：

- 排队等待产物占用时取消：不启动后端，仍由原占用者控制释放；取消后没有下游、产物或自动重放。
- 分析执行期间取消：竞争写者在占用期间等待，停止排空后才取得占用；保留已验收核查，当前任务 cancelled，没有分析输出，不能 resume 已取消流程。

两条均验证过期 stateRevision 无副作用，终止后再 kick 不产生新模型请求。结合既有别名、硬链接、共享排队、授权等待、提交冻结及实际 Bot 后端测试，未发现新的占用释放或提交权威性阻塞问题。进程内锁仍不约束人工编辑、未接锁主会话工具或其他进程，不扩大既有沙箱承诺。

## 审查结论与验证

只读 reviewer 独立复跑提交/范围/锁/路线/流程五文件 26 项，最终 Native/工具两文件 20 项，均通过；实际探针验证非法恢复无副作用、正常结算通知失败可恢复且保留 accepted 检查点。主线阶段故障与实际 Pi 四文件 22 项通过。修复后未发现剩余可触发 P1/P2。

最终固定源码验证通过：

- `npm run typecheck`、`npm run build` 通过，保留原有构建 eval/chunk 提示。
- `npm test -- --maxWorkers=4`：608 文件全部通过，6127 项通过、11 跳过（共 6138），185.84 秒。保留既有 jsdom canvas 提示。
- Electron：15 场景全部通过，48.2 秒，覆盖新流水线及原普通子任务、后台编排、Team/Bot、契约及缺输入路径。
- 56 个代码/测试/夹具的源码 SHA256 核对一致，diff 检查通过。

用户已授权本地提交及合并；实际提交和 main 验证另补记。不推送、不发布、不替换已安装应用。只使用合成数据和 localhost 推理验收，真实模型、跨平台清理和科学正确性仍不在本轮证明范围。
