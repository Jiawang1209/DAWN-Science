# 单／多 agent 本地评测基线
确定性 localhost 响应，仅证明软件执行与验收路径；不支持真实模型质量、速度或费用收益结论。
时长受本机与取消故障注入影响；用量只计可见字段，未知不按零成本解释。

| 场景 | 模式 | 验收 | 独立真值通过 | 成功 | 错误放行 | 输入保留 | 请求数 | 阶段/尝试 | 重做 | 人工介入 | 可见 token | 未知用量任务 | 耗时 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| normal | single | true | true | true | false | true | 4 | 1 | 0 | 0 | 80 | 0 | 1974 |
| normal | multi | true | true | true | false | true | 10 | 3 | 0 | 0 | 200 | 0 | 4431 |
| missing-units | single | false | false | true | false | true | 2 | 1 | 0 | 0 | 40 | 0 | 1352 |
| missing-units | multi | false | false | true | false | true | 2 | 1 | 0 | 0 | 40 | 0 | 1641 |
| reviewer-repair | single | true | true | true | false | true | 8 | 2 | 1 | 0 | 160 | 0 | 3220 |
| reviewer-repair | multi | true | true | true | false | true | 18 | 5 | 1 | 0 | 360 | 0 | 9159 |
| changed-input | single | false | false | true | false | true | 0 | 1 | 0 | 0 | 0（部分） | 1 | 29 |
| changed-input | multi | false | false | true | false | true | 0 | 1 | 0 | 0 | 0（部分） | 1 | 41 |
| stop-resume | single | true | true | true | false | true | 7 | 2 | 1 | 1 | 80（部分） | 1 | 3168 |
| stop-resume | multi | true | true | true | false | true | 13 | 4 | 1 | 1 | 200（部分） | 1 | 7339 |

Source fingerprint: d6b63bcf719e9a0a554472645d9ce696a43bd633423fe58c63b6557672e8844f
