# 阶段 A：实时子任务纠偏验收

范围：普通 Pi 子任务；复用现有父会话编排 store/service、childId 和持久执行 epoch。团队成员与持久 Bot 未增加实时适配器，不宣称具备实时纠偏能力。现有 send_subagent_message 仍为下一轮排队消息。

## 结果

- 新增 steer_subagent 和桌面 controlSubagent；检查返回当前 epoch，纠偏请求必须带 expectedEpoch。编辑草稿和重试保留原 epoch，拒绝跨代误投。
- 只有真实子进程握手后才启用能力。父进程通过 stdin 把独立控制发送给安装的 Pi AgentSession.steer；applied 只来自真实 user message_start 与唯一文本 marker 的精确匹配。
- accepted 只代表宿主已持久接收；applied 代表该控制消息已经进入模型上下文。取消、关闭、执行结束和恢复时未确认回执为 interrupted，未自动重放。
- 每目标最多 8 条待确认、128 条保留回执，文本最多 16 KiB。达到历史上限显式拒绝新请求；保留原请求 ID 去重信息。
- 冻结科研契约一律拒绝实时纠偏，要求先停止再派生新批次。没有改变任务复用身份。
- phase 来自实际 active/queue 所有权：停止后仍有活动后端时 stopping，真正结束后 drained。磁盘回执失败及坏格式子进程回执不能逃逸 stdout 回调；停止并排空子进程，失败保留为未确认。

## 实际效果与证据

- `electron-final.txt`：真实 Electron E2E 1/1 通过（27.2 秒），覆盖慢工具中的接收、工具边界后的 applied、点名取消和排空。
- `desktop-accepted.png`、`desktop-applied.png`、`desktop-cancelled.png`：上述真实桌面状态。
- `desktop-demo.json`：桌面验收摘要；推理请求实际包含控制 marker。
- `real-child-demo.json`：安装的 Pi SDK、真实子进程与 bash 的时序。总计 3 次 localhost 推理请求；最终文本包含 corrected-blue；同 ID 未再次发送；取消后 bash PID 已退出且没有产生尾部副作用文件。
- `real-child-demo.md`：实际子进程演示说明。
- `targeted-tests-final.txt`：39 个关联文件、460 项测试通过；之后新增的非字符串 stdout 回归见 `review-regressions-final.txt`（3 个文件、66 项通过）。
- `ui-checks.txt`：界面、设计约束、翻译和错误文案扫描 132 项通过。
- `settlement-ui-regressions.txt`：实际 settlement 收尾与恢复关联 3 个文件、41 项通过；新增两项回归确认仅结束仍在运行的工具行，不覆盖既有成功或失败结果。取消桌面截图已重跑，工具行显示「已中断」，同时显示已排空。
- `typecheck-final.txt`、`build-final.txt`：类型检查和全构建通过；构建保留仓库已有 direct-eval/包大小提示。

测试包括重复请求、每目标隔离、旧 epoch、检查与提交间换代、取消同目标排队工作、关闭与延迟后端排空、重启不重放、冻结拒绝、大小/数量上限，以及真实 stdout 确认分支的磁盘失败、超长错误与非字符串消息类型。

## 复现

```sh
npm run build
npx tsx scripts/demo-subagent-steering.ts docs/validation/live-parallel-20261105/stage-a
npx playwright test e2e/subagent-steering.spec.ts
```

脚本也导出 `runSubagentSteeringDemo(outputDir)`，供同一个 evaluate:science 入口调用。全部推理均为 localhost 确定性回复，不代表真实模型质量、费用收益或用户科研结论。未执行用户案例或加载科研模型；未提交、合并、推送、发布或替换安装应用。
