# 代表性科研任务对照
推理：live；模型 deepseek/deepseek-flash；整轮最多 30 次请求。
代表性自制数据、小样本试验；不是用户真实项目或普遍模型质量结论。
accepted 仍由独立实际文件真值复核；blocked、失败与未运行分开记录。
缺失或部分用量不作零费用；无价格换算；不完整配对不形成收益结论。

| 任务 | 模式 | 终态 | 独立验收 | 请求 | 可见 token | 用量未知任务 | 耗时 ms |
|---|---|---|---|---|---|---|---|
| carbon-missing | single | accepted | true | 19 | 36242 | 0 | 101878 |
| carbon-missing | multi | failed | false | 11 | 27263 | 0 | 102499 |
| unknown-unit | multi | not-run | false | 0 | 0 | 1 | 0 |
| unknown-unit | single | not-run | false | 0 | 0 | 1 | 0 |

完整配对 0；不完整配对 2。
