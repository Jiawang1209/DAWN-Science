# 运行中纠偏与有界科研并行：本地验收

基线 main：`6f6c7251`。专项分支 `codex/live-steering-parallel-science`，隔离工作区 `/Users/liuyue/.codex/worktrees/dawn-live-steering-parallel-20261105/dawn-science`。

## 实际行为

- 普通本地 Pi 子任务新增独立实时纠偏入口；排队续聊保留原语义。宿主 accepted 与真实 user message_start 确认的 applied 分开记录，绑定请求 ID 与调用方检查过的执行代次。冻结契约拒绝原地纠偏，Team／Bot 等未验证能力不宣称支持。
- 状态查询与现有子任务面板显示实际停止阶段：active controller 已中断但后端仍持有时为 stopping，真正排空后为 drained。进程清理与文件锁仍由原执行器负责。
- 科研批量默认串行；显式 concurrency:2 使用逐项 checkpoint 和原流水线 reducer。普通子 agent 只读阶段用相同冻结执行者定义的独立会话；Bot 不克隆，分析执行仍持有原工作区锁。
- 失败会关闭待执行任务并停止兄弟执行，迟到成功不能发布。恢复核验全部活动／已完成项的内容版本；只有排空并明确核对未知副作用后才继续。最终宿主汇总和路线 CAS 仍只在全部验收通过后运行。

## 审查中修复的问题

1. 派生并行批次最后一项复用历史流水线时，显示投影携带旧路线版本，导致最终 CAS 或恢复拒绝；改为绑定本批冻结定义和请求 ID，并以 pending 开始路线同步。增加旧版本 1 → 新版本 99 的失败／通过回归及真实完整复用验收。
2. 串行／旧记录没有逐项 checkpoint，新的 active 统计误报为 0；保留串行活动项统计，增加公共状态回归。
3. 纠偏调用没有携带预期执行代次，旧轮次准备的消息可能误投下一轮；API、模型工具和 UI 草稿都冻结 expectedEpoch，接受前拒绝代次不符。重复请求只能回执原内容与原代次。
4. 子进程 applied／failed 回执写盘失败可能从 stdout EventEmitter 回调抛出；增加有界严格解析和保护，失败中止并排空，补实际子进程注入写盘失败与过大错误回归。
5. 上述解析保护之前对非字符串 JSON type 调用 startsWith 仍可能异常；增加 typeof 检查与数字／对象／数组 type 的真实进程回归。

6. 实际取消已排空后，子转录仍有工具行显示执行中；只在真正 settled 时将仍运行的子工具行收口为中断／完成状态未确认，保留既有成功和失败事实，并补成功／失败收尾两种回归。

额外回归覆盖隐藏成员停止、兄弟后端忽略取消并迟到成功、隐藏审阅项文件篡改、多项恢复的全量预检和单次汇总。协议版本升至 8.44，同步桌面操作、模型工具、后端能力、界面和测试。

## 证据与验证

阶段 A 的真实 Pi／bash 演示与桌面截图在 [stage-a](../validation/live-parallel-20261105/stage-a/real-child-demo.md)。阶段 B 的真实桌面输出在 [stage-b](../validation/live-parallel-20261105/stage-b/actual-demo.md)。统一入口 `npm run evaluate:science -- docs/validation/live-parallel-20261105/evaluation` 保留原基线与增量复用场景，追加串行／并发同工作量对照和纠偏演示。

最终冻结代码验收：

- `npm run typecheck`、`npm run build`、`git diff --check` 均通过。
- `npm test`：635 文件通过，6282 项通过、11 跳过；日志 [tests.txt](../validation/live-parallel-20261105/tests.txt)。中途 TDD 预期失败、源码变化使复用保守失效，以及评测入口选择错误均保留为开发过程，未计入通过结果；最后在冻结代码上完整重跑通过。
- 6 个实际 Electron 场景全部通过，包含旧数值验收阻断、批量／增量以及新并行和纠偏取消；日志 [electron.txt](../validation/live-parallel-20261105/electron.txt)。本轮旧场景的截图和回执复制到 desktop-regressions，再恢复原历史验收档案。
- 同一统一评测命令退出 0：原 5 对单／多 agent 场景通过、无错误放行；10 条增量复用记录通过；追加 2 对并行对照、停止恢复／取消和实际纠偏演示均通过。日志 [evaluation.txt](../validation/live-parallel-20261105/evaluation.txt)。
- 两名独立只读审阅者复查源码和回归用例，最终未发现剩余 P1/P2；运行结果由主执行者验证，审阅者没有声称亲自执行完整测试。
- 1473 个源码条目的冻结清单复核无漂移，见 source-manifest.json 和 source-verification.json。本地 main 仍为 `6f6c7251`，干净。

| 配对 | 串行 ms | 并发 2 ms | 各自请求数 | 只读阶段实际重叠 ms | 分析重叠 ms |
|---|---:|---:|---:|---:|---:|
| 1 | 17635 | 12976 | 20 | 1429 | 0 |
| 2 | 13752 | 13051 | 20 | 1408 | 0 |

两种模式实际输出均为 n=5、mean=3、unit=m，内容版本审阅、单次汇总与路线写回均通过。原锁池实测累计等待：串行 25/16 ms，并发 3583/3701 ms；表明并行没有绕过工作区锁。两组墙钟分别下降约 26.4% 和 5.1%，抖动明显，不能推断普遍加速。完整记录见 [parallel.md](../validation/live-parallel-20261105/evaluation/parallel/parallel.md)。

两个真实活动核查任务停止后分别 62/67 ms 排空；显式恢复后完成，终态取消没有生成汇总。完整复用派生为 0 新模型请求、1 次宿主汇总、当前路线 CAS 成功、原批次字节保持且构建指纹稳定。实际纠偏演示使用 3 次本地请求，验证工具边界、重复不投递、取消 bash PID 退出。

## 边界

本地确定性 provider 只控制回复和网络延迟，实际 Pi、Python、文件、验收、锁、恢复和桌面协议均真实运行。这里的耗时差异只证明指定工程夹具中的效果，不能推断真实模型质量、费用或普遍加速。未上报用量保持 unknown／partial。

工作保留在专项工作区；未提交、未合并、未推送、未打 tag、未发布，未替换安装应用。
