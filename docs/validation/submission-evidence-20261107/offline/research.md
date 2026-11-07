# 代表性科研任务对照
推理：fixture；模型 deepseek/deepseek-flash；离线夹具不消耗真实调用额度；每组上限 未强制；重复 2；分区强制 false。
代表性自制数据、小样本试验；不是用户真实项目或普遍模型质量结论。
accepted 仍由独立实际文件真值复核；blocked、失败与未运行分开记录。
未使用分区请求门；离线夹具不能代表真实同预算收益。
缺失或部分用量不作零费用；无价格换算；未运行的输入核验和用量不适用。

| 任务 | 重复 | 模式 | 终态 | 独立验收 | 请求 | 提交/退回 | 可见 token | 用量未知任务 | 耗时 ms |
|---|---|---|---|---|---|---|---|---|---|
| carbon-missing | 1 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1024 |
| carbon-missing | 1 | multi | accepted | true | 10 | 3/0 | 200 | 0 | 2758 |
| unknown-unit | 1 | multi | blocked | true | 2 | 1/0 | 40 | 0 | 781 |
| unknown-unit | 1 | single | blocked | true | 2 | 1/0 | 40 | 0 | 726 |
| carbon-missing | 2 | multi | accepted | true | 10 | 3/0 | 200 | 0 | 2707 |
| carbon-missing | 2 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1129 |
| unknown-unit | 2 | single | blocked | true | 2 | 1/0 | 40 | 0 | 820 |
| unknown-unit | 2 | multi | blocked | true | 2 | 1/0 | 40 | 0 | 740 |

完整配对 4；不完整配对 0。
