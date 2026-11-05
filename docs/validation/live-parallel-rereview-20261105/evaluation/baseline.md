# 单／多 agent 本地评测基线
确定性 localhost 响应，仅证明软件执行与验收路径；不支持真实模型质量、速度或费用收益结论。
时长受本机与取消故障注入影响；用量只计可见字段，未知不按零成本解释。

| 场景 | 模式 | 验收 | 独立真值通过 | 成功 | 错误放行 | 输入保留 | 请求数 | 阶段/尝试 | 重做 | 人工介入 | 可见 token | 未知用量任务 | 耗时 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| normal | single | true | true | true | false | true | 4 | 1 | 0 | 0 | 80 | 0 | 1437 |
| normal | multi | true | true | true | false | true | 10 | 3 | 0 | 0 | 200 | 0 | 4843 |
| missing-units | single | false | false | true | false | true | 2 | 1 | 0 | 0 | 40 | 0 | 1149 |
| missing-units | multi | false | false | true | false | true | 2 | 1 | 0 | 0 | 40 | 0 | 1359 |
| reviewer-repair | single | true | true | true | false | true | 8 | 2 | 1 | 0 | 160 | 0 | 2497 |
| reviewer-repair | multi | true | true | true | false | true | 18 | 5 | 1 | 0 | 360 | 0 | 7485 |
| changed-input | single | false | false | true | false | true | 0 | 1 | 0 | 0 | 0（部分） | 1 | 27 |
| changed-input | multi | false | false | true | false | true | 0 | 1 | 0 | 0 | 0（部分） | 1 | 40 |
| stop-resume | single | true | true | true | false | true | 7 | 2 | 1 | 1 | 80（部分） | 1 | 2392 |
| stop-resume | multi | true | true | true | false | true | 13 | 4 | 1 | 1 | 200（部分） | 1 | 4004 |

Source fingerprint: c9c598e7231c848e1c46267a4eeaeb20e72501b0041aa4d1c8ba30e0cf29b352
