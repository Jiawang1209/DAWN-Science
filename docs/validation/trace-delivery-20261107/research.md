# 代表性科研任务对照
推理：fixture；模型 deepseek/deepseek-flash；离线夹具不消耗真实调用额度；每组上限 未强制；重复 1；分区强制 false。
代表性自制数据、小样本试验；不是用户真实项目或普遍模型质量结论。
accepted 仍由独立实际文件真值复核；blocked、失败与未运行分开记录。
未使用分区请求门；离线夹具不能代表真实同预算收益。
缺失或部分用量不作零费用；无价格换算；未运行的输入核验和用量不适用。

| 任务 | 重复 | 模式 | 终态 | 独立验收 | 请求 | 提交/退回 | 可见 token | 用量未知任务 | 耗时 ms |
|---|---|---|---|---|---|---|---|---|---|
| carbon-missing | 1 | single | accepted | true | 4 | 1/0 | 80 | 0 | 2083 |
| carbon-missing | 1 | multi | accepted | true | 10 | 3/0 | 200 | 0 | 4687 |
| unknown-unit | 1 | multi | blocked | true | 2 | 1/0 | 40 | 0 | 1287 |
| unknown-unit | 1 | single | blocked | true | 2 | 1/0 | 40 | 0 | 1437 |
| short-known-mean | 1 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1991 |
| short-known-mean | 1 | multi | accepted | true | 10 | 3/0 | 200 | 0 | 5085 |
| moisture-strata | 1 | multi | accepted | true | 10 | 3/0 | 200 | 0 | 4818 |
| moisture-strata | 1 | single | accepted | true | 4 | 1/0 | 80 | 0 | 2318 |

完整配对 4；不完整配对 0；两组均通过独立核验 4。

| 模式 | 合格交付 | 正确阻塞 | 误验收 | 明确触发请求上限 | 请求 / 合格交付 | 毫秒 / 合格交付 |
|---|---|---|---|---|---|---|
| single | 3 | 1 | 0 | 不适用 | 4.67 | 2610 |
| multi | 3 | 1 | 0 | 不适用 | 10.67 | 5292 |
分子包含所有已运行试验的成本，包括失败和正确阻塞；离线结果只验证执行链。
