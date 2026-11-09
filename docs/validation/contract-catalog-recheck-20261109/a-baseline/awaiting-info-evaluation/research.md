# 代表性科研任务对照
Run 3b400d0b-07ac-415d-b541-8dc0e9b27577；比较清单 97024a403ee31e09cb16d27319865c058363d046dcf06bb7c0ee24569a95ee3e；候选与配置保持冻结：true。
推理：fixture；模型 deepseek/deepseek-flash；离线夹具不消耗真实调用额度；每组上限 未强制；重复 1；分区强制 false。
代表性自制数据、小样本试验；不是用户真实项目或普遍模型质量结论。
accepted 仍由独立实际文件真值复核；blocked、失败与未运行分开记录。
未使用分区请求门；离线夹具不能代表真实同预算收益。
缺失或部分用量不作零费用；无价格换算；未运行的输入核验和用量不适用。

| 任务 | 重复 | 模式 | 终态 | 独立验收 | 请求 | 宿主提交/退回 | 可见 token | 用量未知任务 | 耗时 ms |
|---|---|---|---|---|---|---|---|---|---|
| unknown-unit | 1 | single | blocked | true | 2 | 1/0 | 40 | 0 | 623 |
| unknown-unit | 1 | multi | awaiting-info | false | 1 | 0/0 | 0 | 1 | 66 |

完整配对 0；不完整配对 1；两组均通过独立核验 0。

| 模式 | 合格交付 | 正确阻塞 | 误验收 | 明确触发请求上限 | 请求 / 合格交付 | 毫秒 / 合格交付 |
|---|---|---|---|---|---|---|
| single | 0 | 1 | 0 | 不适用 | 不适用 | 不适用 |
| multi | 0 | 0 | 0 | 不适用 | 不适用 | 不适用 |
awaiting-info 表示规划提出待确认项且尚未执行；不计作合格交付或正确科学阻塞。
分子包含所有已运行试验的成本，包括失败和正确阻塞；离线结果只验证执行链。宿主提交/退回不含 SDK 拒绝和输出截断；它们须结合原始转录另行核查。

## 独立审阅请求保留


## 分阶段用量（宿主已记录回执）

旧 usage 字段保留执行任务口径；以下 planning/execution/review 为互斥作用域，合计包含规划。缓存读取单列，不重复加到输入输出。未知不补零；下界不是完整费用，未提供价格换算。

| 任务 | 重复 | 组 | 阶段 | 输入 | 输出 | 缓存读取 | 可见输入+输出 | 覆盖 |
|---|---:|---|---|---:|---:|---:|---:|---|
| unknown-unit | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | single | execution | 24 | 16 | 0（下界） | 40（下界） | partial |
| unknown-unit | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | single | total | 24 | 16 | 0（下界） | 40（下界） | partial |
| unknown-unit | 1 | multi | planning | 未知 | 未知 | 未知 | 未知 | unknown |
| unknown-unit | 1 | multi | execution | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | multi | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | multi | total | 未知 | 未知 | 未知 | 未知 | unknown |

## 模型自动安排（规划请求计入所在组）

- unknown-unit / multi：规划 1 次，任务 1 项，结构有效 false，审阅覆盖 false，编译通过 false。
固定三阶段夹具不代表模型自动拆分质量；自动安排只评价本题的冻结方法和契约。

## 提交诊断（与宿主计数分开）

| 任务 | 重复 | 模式 | 宿主接收/退回 | SDK拒绝 | 输出上限未执行 | 记录完整 |
|---|---|---|---|---|---|---|
| unknown-unit | 1 | single | 1/0 | 0 | 0 | true |
| unknown-unit | 1 | multi | 0/0 | 未知 | 未知 | false |
SDK/截断计数仅在本轮每个作用域的完整转录与宿主已记录计数一致时报告；未知不是零。诊断不参与权限或科学验收。
