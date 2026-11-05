# 增量复用对照
本地确定性夹具的工程路径对照，不是真实模型能力、质量或费用评测。
commonSetup 是共同故障前置成本；recoveryIncrement 仅含修正之后的新请求/执行/宿主开销。
复用历史回执不计为本次新执行或零费用；未上报用量保留 unknown/partial。
实际文件独立验收；复用仅承认历史产物与审阅，不证明科学结论普遍有效。

| 模式／场景 | 阶段 | 请求 | 新分析项 | 复用项 | 实际数值正确 | 原记录保留 | 耗时 ms | 可见 token（部分） | 未知任务用量 |
|---|---|---:|---:|---:|---|---|---:|---:|---:|
| full-rerun/fault | commonSetup | 16 | 2 | 0 | false | true | 7884 | 320 | 0 |
| full-rerun/recovery | recoveryIncrement | 20 | 2 | 0 | true | true | 12216 | 400 | 1 |
| derived-rerun/fault | commonSetup | 16 | 2 | 0 | false | true | 10550 | 320 | 0 |
| derived-rerun/recovery | recoveryIncrement | 10 | 1 | 1 | true | true | 8158 | 200 | 1 |
| derived-rerun/identical-repeat | increment | 0 | 0 | 2 | true | true | 2968 | 0 | 1 |
| derived-rerun/input-changed | increment | 10 | 1 | 1 | true | true | 9087 | 200 | 1 |
| derived-rerun/method-changed | increment | 20 | 2 | 0 | true | true | 14509 | 400 | 1 |
| derived-rerun/artifact-tampered | increment | 10 | 1 | 1 | true | true | 8796 | 200 | 1 |
| derived-rerun/route-notes-changed | increment | 20 | 2 | 0 | true | true | 15703 | 400 | 1 |
| derived-rerun/temporary-environment-changed | increment | 20 | 2 | 0 | true | true | 14059 | 400 | 1 |
