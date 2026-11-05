# 阶段 B 实际执行展示

复现入口：`npm run evaluate:science -- docs/validation/live-parallel-20261105/evaluation`。

该统一入口保留原来的五类单／多 agent 基线及增量复用行，再运行相同两份独立 CSV 的串行／并发 2 配对和实际纠偏演示。最终执行结果在 [并行评测](../evaluation/parallel/parallel.md) 与 [原始记录](../evaluation/parallel/parallel.json)。

并行夹具经过实际 NativeRuntime 工具、Pi 子进程、Python 和真实文件；180ms 确定性 provider 回复延迟在两种模式中一致。不同只读核查／审阅会话可以重叠；分析成员仍共享，原工作区执行锁保留。`intervals` 将调度起轮与持锁后首个请求分开，`lockReservations` 直接记录原锁池的排队、授予、释放时间，不以排队时间伪造实际重叠。

每轮实际 Python／JSON／报告产物保存在 `evaluation/parallel/artifacts/`；配套 `*-team.json` 保存宿主验收与版本绑定审阅，`*-route.json` 保存路线投影，`*-summary.json` 保存唯一宿主汇总。

`stop-resume.json` 与 `intervention-stop-resume-paused.json` 展示两个真实 backend 活动时停止、排空、检查点和显式确认后恢复；`cancel.json` 展示终态取消且未生成汇总；`all-reuse.json` 验证已验收两项派生复用、零新增模型请求、单次宿主汇总和当前路线投影。数值正确性直接读取实际结果文件并断言 n=5、mean=3、unit=m。

最终数值以统一入口实际输出为准；探索目录明确标记为非最终验收证据。确定性夹具不证明真实模型质量、费用或通用速度收益。
