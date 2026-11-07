# 代表性科研任务对照
Run d5eb17bb-2438-46c9-809d-0a10ee3c2001；比较清单 b559533bb9b2ee0f7746357c57c82d180cd7c573f9dbe94635f4dd3fdd9cfa47；候选与配置保持冻结：true。
推理：fixture；模型 deepseek/deepseek-flash；离线夹具不消耗真实调用额度；每组上限 未强制；重复 2；分区强制 false。
代表性自制数据、小样本试验；不是用户真实项目或普遍模型质量结论。
accepted 仍由独立实际文件真值复核；blocked、失败与未运行分开记录。
未使用分区请求门；离线夹具不能代表真实同预算收益。
缺失或部分用量不作零费用；无价格换算；未运行的输入核验和用量不适用。

| 任务 | 重复 | 模式 | 终态 | 独立验收 | 请求 | 宿主提交/退回 | 可见 token | 用量未知任务 | 耗时 ms |
|---|---|---|---|---|---|---|---|---|---|
| carbon-missing | 1 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1095 |
| carbon-missing | 1 | multi | accepted | true | 10 | 3/0 | 200 | 0 | 2565 |
| unknown-unit | 1 | multi | blocked | true | 2 | 1/0 | 40 | 0 | 696 |
| unknown-unit | 1 | single | blocked | true | 2 | 1/0 | 40 | 0 | 651 |
| short-known-mean | 1 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1072 |
| short-known-mean | 1 | multi | accepted | true | 10 | 3/0 | 200 | 0 | 2468 |
| moisture-strata | 1 | multi | accepted | true | 10 | 3/0 | 200 | 0 | 2429 |
| moisture-strata | 1 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1044 |
| carbon-missing | 2 | multi | accepted | true | 10 | 3/0 | 200 | 0 | 2446 |
| carbon-missing | 2 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1031 |
| unknown-unit | 2 | single | blocked | true | 2 | 1/0 | 40 | 0 | 635 |
| unknown-unit | 2 | multi | blocked | true | 2 | 1/0 | 40 | 0 | 662 |
| short-known-mean | 2 | multi | accepted | true | 10 | 3/0 | 200 | 0 | 2546 |
| short-known-mean | 2 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1085 |
| moisture-strata | 2 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1085 |
| moisture-strata | 2 | multi | accepted | true | 10 | 3/0 | 200 | 0 | 2463 |

完整配对 8；不完整配对 0；两组均通过独立核验 8。

| 模式 | 合格交付 | 正确阻塞 | 误验收 | 明确触发请求上限 | 请求 / 合格交付 | 毫秒 / 合格交付 |
|---|---|---|---|---|---|---|
| single | 6 | 2 | 0 | 不适用 | 4.67 | 1283 |
| multi | 6 | 2 | 0 | 不适用 | 10.67 | 2713 |
分子包含所有已运行试验的成本，包括失败和正确阻塞；离线结果只验证执行链。宿主提交/退回不含 SDK 拒绝和输出截断；它们须结合原始转录另行核查。

## 独立审阅请求保留


## 提交诊断（与宿主计数分开）

| 任务 | 重复 | 模式 | 宿主接收/退回 | SDK拒绝 | 输出上限未执行 | 记录完整 |
|---|---|---|---|---|---|---|
| carbon-missing | 1 | single | 1/0 | 0 | 0 | true |
| carbon-missing | 1 | multi | 3/0 | 0 | 0 | true |
| unknown-unit | 1 | multi | 1/0 | 0 | 0 | true |
| unknown-unit | 1 | single | 1/0 | 0 | 0 | true |
| short-known-mean | 1 | single | 1/0 | 0 | 0 | true |
| short-known-mean | 1 | multi | 3/0 | 0 | 0 | true |
| moisture-strata | 1 | multi | 3/0 | 0 | 0 | true |
| moisture-strata | 1 | single | 1/0 | 0 | 0 | true |
| carbon-missing | 2 | multi | 3/0 | 0 | 0 | true |
| carbon-missing | 2 | single | 1/0 | 0 | 0 | true |
| unknown-unit | 2 | single | 1/0 | 0 | 0 | true |
| unknown-unit | 2 | multi | 1/0 | 0 | 0 | true |
| short-known-mean | 2 | multi | 3/0 | 0 | 0 | true |
| short-known-mean | 2 | single | 1/0 | 0 | 0 | true |
| moisture-strata | 2 | single | 1/0 | 0 | 0 | true |
| moisture-strata | 2 | multi | 3/0 | 0 | 0 | true |
SDK/截断计数仅在本轮每个作用域的完整转录与宿主已记录计数一致时报告；未知不是零。诊断不参与权限或科学验收。
