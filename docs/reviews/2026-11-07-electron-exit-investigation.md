# Electron 退出诊断与收尾复查

本轮始于 11 月 6 日，沿用 `codex/run-explanation-budget` 隔离工作区。用户授权补齐退出诊断、复现修复及相关桌面回归；没有提交、合并、推送、发布或替换正式应用。此前运行解释/预算改动全部保留。

## 结论边界

已复现并修复一项确定遗漏：普通主对话执行、压缩、中止或停止收尾仍在进行时，旧 `needsGracefulShutdown()` 只看统一编排子任务等资源，可能判为空闲而跳过有界等待。真实装配门闩测试确认主任务 busy、子任务为空时旧判断返回 false；实际 Electron 的主任务 `sleep 15` 退出时间线也确认原来走同步路径。新增 `NativeRuntime.hasPendingWork()` 复用现有 busy 状态，同时覆盖启动、停止与子任务，将它接到原退出判断，不另建取消流程，不改变预算或锁。

历史上单次 Close context 超时、以及另一次页面提前关闭仍未在本轮重现。它们没有被强行归因于上述遗漏；重复通过和故障注入都不能证明历史根因已经解决。

## 补齐的事实链

- 应用启动时通过测试专用 `DAWN_ELECTRON_EXIT_DIAGNOSTICS_DIR` 显式开启原生观察；正式应用默认无监听、无日志。`app-PID.jsonl` 由主进程直接写，不依赖将要关闭的 inspector、evaluate 或 stderr。
- 应用记录 before-quit、窗口/contents 关闭、renderer/child gone、will-quit、同步/异步收尾、进程退出；只记录固定事件、数字身份、退出码和资源类型计数，不记录标题、URL、对话、请求、配置或密钥。
- 宿主 `exit-PID.jsonl` 保留 page crash/close、context close、app 协议 close、有限 inspector 标记、close 调用返回/失败，以及真实 child exit/close 和管道状态。退出前快照自己的进程树；五秒未退出才采样，诊断不强杀、不提高预算、不吞控制错误。
- 单独记录原 1500ms 收尾的 `drained / deadline / failed`，区分“调用返回”与“收尾完成”；外层 4000ms 兜底另有独立标记。回调失败不能改变退出，文件不可写也不能让观察器打断产品收尾。两个等待上限均未增加。
- `app.close()`、`signalCode===null`、`exitCode===0` 的原断言保持；退出码 0 之外还检查是否走过收尾上限或兜底，避免将它们包装成正常排空。

## 复现、假设和保留现场

1. 原后台结果回送、活跃子任务关闭及纠偏/点名取消各重复五次：15 项通过、20 次进程退出正常，无卡住、收尾失败或外层兜底。它们使用新诊断，但发生在主任务判断修正前；不能作为该修正后的全部验收。
2. 主任务等待遗漏：`root-drain-unit-red.log` 断言先红；`root-check-red.log` 的真实 Electron 时间线显示同步返回而非有界排空。修复后单元与实际桌面均通过，真正的 sleep 进程退出，重启恢复为 Command aborted。最初 root 探针遇到 ps 采样与短命进程的竞争，保留 `boundary-desktop.log`；修正探针后才形成产品行为红灯，没有冒称最初采样失败是产品缺陷。
3. 收尾到期未被单独观测：`drain-deadline-red.log` 先红；补齐诊断后，原 25ms 测试上限准确报告 deadline，正常门闩报告 drained，已有资源清理失败报告 failed；观察回调抛错仍不改变退出。`all-outcomes-green.log` 为 4 文件 68 通过、1 既有条件跳过。
4. 受控 before-quit veto 测试故意阻止第一次退出，五秒时确认原生进程还活着、日志尚未进入 will-quit；6.5 秒后走原正常 quit，自行释放，没有杀进程。这只证明诊断能定位“退出被阻止”，不是历史故障的复现。
5. 追加的重复 quit 请求假设没有复现提前退出，`reentrant-red.log` 实际为通过结果，不把文件名中的 red 当成产品红灯；保留为回归用例，没有据此改动重复退出行为。
6. 会话执行日志确认历史页面提前关闭前约 14.6 秒收到 goal paused。之后的暂停清理脚本在故障之后才启动，且解析 ps 表头失败，没有发出信号。`interruption-correlation.json` 只保存时间和事件类型。暂停与协议丢失存在时间关联，尚不能证明因果；也不能将该现场归咎于更晚的合盖。

## 验证与效果

首轮 639 文件、6330 项 Node/UI 通过、10 既有跳过，以及十项真实桌面通过，属于补齐内层收尾结果前的候选，原证据保留。当前冻结候选结果：

| 检查 | 实际结果 |
|---|---|
| 完整 Node/UI | 639 文件，6331 通过、10 既有跳过，203.79 秒；`full-unit-verified.log` |
| 类型、完整构建 | 通过；`typecheck-frozen.log`、`build-verified.log`，保留既有 jsdom canvas / 构建 eval 与 chunk 提示 |
| 最终真实 Electron | 11 项通过、1.7 分钟；`final-verified-desktop.log` |
| 原生进程与管道 | 16 次全部 exit/close、code 0 且无信号；没有内层 deadline、收尾失败或外层兜底；`exit-summary.json` |
| watchdog | 唯一一次五秒等待来自故意 veto 的退出探针，有独立 fault-PID.json；没有意外卡住 |
| 源码与边界 | 51 源/测试文件指纹无漂移；main 干净且仍为 9dd59f4f；14 张 Git-ignored 既有视觉基线与 main 文件系统副本逐字节相同；`candidate-manifest.json`、`boundary-audit.json` |

桌面组覆盖单次/连续请求退出、主任务实际工具进程、活跃子任务排空与冻结交接保留、后台回送、纠偏/代次隔离、锁等待、预算截止/重启，以及 MCP HTTP 取消和同连接继续。模型回复为本地确定性数据，Electron、Pi、进程、HTTP、文件和持久化真实执行。没有修改视觉阈值、更新基线、提高退出超时或把强杀当作通过。

本次可见效果：单次退出的 `sleep 15` 主任务约 100.8ms 完成收尾，日志明确出现 `shutdown-drained` 后再退出；连续请求退出的演示约 98.2ms。两例重启均显示 Command aborted，原 sleep 进程无遗留，测试 finally 的 forcedCleanup 为空。截图位于 `final-verified-demo/root/single/root-recovered.png`、`final-verified-demo/root/repeated/root-recovered.png`；这是单次演示观测，不作为通用性能承诺。

证据根：`docs/validation/electron-exit-investigation-20261106/`。`summarize.py` 可重建 `exit-summary.json` 和 `timelines.md`，按原生 PID 对应两侧日志。同步收尾返回也不被当作所有异步资源已完成的证明；异步分支结合 drained 标记与实际进程存活检查验收。

第一批重复命令遗漏了 shutdown 演示目录覆盖参数，重新生成了默认演示文件；新结果和提交基线分别保存于 `repeated-shutdown-demo`，默认两个文件已恢复提交基线。后续命令显式隔离全部演示目录，原失败 trace 和本轮失败现场均保留，不通过修改基线或延长超时换取通过。

本轮为代码自审，未冒称独立代理审查。覆盖退出判断、停止生命周期、诊断写失败、回调失败和定时器清理；没有发布、跨平台、真实付费模型或全量桌面验收结论。历史偶发超时仍作为未定位项保留，下一次异常应凭新增双侧时间线继续定位。


## 后续观测：交付引导合并复审

[交付引导复审](2026-11-07-delivery-efficiency-merge-review.md) 的 27 项桌面回归全部通过、31 个宿主均退出码 0，但记录到两条非故障注入的五秒仍等待：Bot 协作与 slash Bot 派单关闭分别约 7.35s、20.69s。两例在 OS child-close 前已经记录同步收尾完成及 Node process-exit；未观察到内层 drain-timeout/failure 或外层 fallback。五秒时原进程仍活着，自动采样未在命令上限内取得有效堆栈，故根因仍未确定。停止其他回归后各单独复测一次，约 136.8ms、147.9ms 退出，没有再次告警；这不覆盖或抹除首轮延迟。

功能提交 c5d4d568 合入本地 main 后，另 10 项桌面回归通过、8 个宿主均退出码 0，未新增五秒等待。历史偶发退出问题继续 **OPEN**，两例双侧原始 JSONL 与故意 veto 的独立标记均归档于 delivery-efficiency-merge-review-20261107。评测请求门背压的修复是另一项确定问题，不归因为历史退出异常；原 1500/4000ms 收尾预算与测试阈值没有提高。
