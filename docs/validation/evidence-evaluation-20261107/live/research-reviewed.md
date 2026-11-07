# 真实模型试验：审阅后的结果

DeepSeek / deepseek-flash；实际转发 30 次；达到上限后拒绝 4 次，没有追加联网。原始报告 research.json 保留。

| 任务 | 模式 | 结果 | 请求数 |
|---|---|---|---|
| carbon-missing | single | accepted | 19 |
| carbon-missing | multi | failed | 11 |
| unknown-unit | multi | not-run | 0 |
| unknown-unit | single | not-run | 0 |

单 agent 正确交付；多 agent 只取得剩余额度后未完成；单位缺失两组未运行。没有完整配对，不作质量/费用收益结论。审阅仅把未运行行的输入核验改为不适用，并移除虚构的未知执行任务计数；未修改实际执行结果，未重新联网。
