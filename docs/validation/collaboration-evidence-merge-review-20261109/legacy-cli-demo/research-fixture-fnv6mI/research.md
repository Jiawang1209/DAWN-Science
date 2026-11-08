# 代表性科研任务对照
Run 4f388210-1632-494b-b386-27be6317e6f2；比较清单 a0d97f5c657b155a09bbb1bc48517b462818be0c27ebb55536ce064ed06d0629；候选与配置保持冻结：true。
推理：fixture；模型 deepseek/deepseek-flash；离线夹具不消耗真实调用额度；每组上限 25；重复 1；分区强制 true。
代表性自制数据、小样本试验；不是用户真实项目或普遍模型质量结论。
accepted 仍由独立实际文件真值复核；blocked、失败与未运行分开记录。
各组独立等额请求上限，未用额度不借给另一组；额度用尽与科学错误分开，不完整配对不形成质量或费用收益结论。
缺失或部分用量不作零费用；无价格换算；未运行的输入核验和用量不适用。

| 任务 | 重复 | 模式 | 终态 | 独立验收 | 请求 | 宿主提交/退回 | 可见 token | 用量未知任务 | 耗时 ms |
|---|---|---|---|---|---|---|---|---|---|
| carbon-missing | 1 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1177 |
| carbon-missing | 1 | multi | accepted | true | 9 | 2/0 | 160 | 0 | 2083 |
| unknown-unit | 1 | multi | blocked | true | 3 | 1/0 | 40 | 0 | 728 |
| unknown-unit | 1 | single | blocked | true | 2 | 1/0 | 40 | 0 | 664 |
| short-known-mean | 1 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1115 |
| short-known-mean | 1 | multi | accepted | true | 9 | 2/0 | 160 | 0 | 1945 |
| moisture-strata | 1 | multi | accepted | true | 9 | 2/0 | 160 | 0 | 1956 |
| moisture-strata | 1 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1043 |
| negative-zero-mean | 1 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1044 |
| negative-zero-mean | 1 | multi | accepted | true | 9 | 2/0 | 160 | 0 | 1889 |
| duplicate-sites | 1 | multi | accepted | true | 9 | 2/0 | 160 | 0 | 1937 |
| duplicate-sites | 1 | single | accepted | true | 4 | 1/0 | 80 | 0 | 1061 |

完整配对 6；不完整配对 0；两组均通过独立核验 6。

| 模式 | 合格交付 | 正确阻塞 | 误验收 | 明确触发请求上限 | 请求 / 合格交付 | 毫秒 / 合格交付 |
|---|---|---|---|---|---|---|
| single | 5 | 1 | 0 | 0 | 4.40 | 1221 |
| multi | 5 | 1 | 0 | 0 | 9.60 | 2108 |
分子包含所有已运行试验的成本，包括失败和正确阻塞；离线结果只验证执行链。宿主提交/退回不含 SDK 拒绝和输出截断；它们须结合原始转录另行核查。

## 独立审阅请求保留

- carbon-missing / 1 / multi：核查+分析 5/18，拒绝 0；独立审阅 4/7，拒绝 0。保留额度不表示已完成审阅。
- unknown-unit / 1 / multi：核查+分析 3/18，拒绝 0；独立审阅 0/7，拒绝 0。保留额度不表示已完成审阅。
- short-known-mean / 1 / multi：核查+分析 5/18，拒绝 0；独立审阅 4/7，拒绝 0。保留额度不表示已完成审阅。
- moisture-strata / 1 / multi：核查+分析 5/18，拒绝 0；独立审阅 4/7，拒绝 0。保留额度不表示已完成审阅。
- negative-zero-mean / 1 / multi：核查+分析 5/18，拒绝 0；独立审阅 4/7，拒绝 0。保留额度不表示已完成审阅。
- duplicate-sites / 1 / multi：核查+分析 5/18，拒绝 0；独立审阅 4/7，拒绝 0。保留额度不表示已完成审阅。

## 分阶段用量（宿主已记录回执）

旧 usage 字段保留执行任务口径；以下 planning/execution/review 为互斥作用域，合计包含规划。缓存读取单列，不重复加到输入输出。未知不补零；下界不是完整费用，未提供价格换算。

| 任务 | 重复 | 组 | 阶段 | 输入 | 输出 | 缓存读取 | 可见输入+输出 | 覆盖 |
|---|---:|---|---|---:|---:|---:|---:|---|
| carbon-missing | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| carbon-missing | 1 | single | execution | 48 | 32 | 0（下界） | 80（下界） | partial |
| carbon-missing | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| carbon-missing | 1 | single | total | 48 | 32 | 0（下界） | 80（下界） | partial |
| carbon-missing | 1 | multi | planning | 12 | 8 | 0（下界） | 20（下界） | partial |
| carbon-missing | 1 | multi | execution | 48 | 32 | 0（下界） | 80（下界） | partial |
| carbon-missing | 1 | multi | review | 48 | 32 | 0（下界） | 80（下界） | partial |
| carbon-missing | 1 | multi | total | 108 | 72 | 0（下界） | 180（下界） | partial |
| unknown-unit | 1 | multi | planning | 12 | 8 | 0（下界） | 20（下界） | partial |
| unknown-unit | 1 | multi | execution | 24 | 16 | 0（下界） | 40（下界） | partial |
| unknown-unit | 1 | multi | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | multi | total | 36 | 24 | 0（下界） | 60（下界） | partial |
| unknown-unit | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | single | execution | 24 | 16 | 0（下界） | 40（下界） | partial |
| unknown-unit | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | single | total | 24 | 16 | 0（下界） | 40（下界） | partial |
| short-known-mean | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| short-known-mean | 1 | single | execution | 48 | 32 | 0（下界） | 80（下界） | partial |
| short-known-mean | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| short-known-mean | 1 | single | total | 48 | 32 | 0（下界） | 80（下界） | partial |
| short-known-mean | 1 | multi | planning | 12 | 8 | 0（下界） | 20（下界） | partial |
| short-known-mean | 1 | multi | execution | 48 | 32 | 0（下界） | 80（下界） | partial |
| short-known-mean | 1 | multi | review | 48 | 32 | 0（下界） | 80（下界） | partial |
| short-known-mean | 1 | multi | total | 108 | 72 | 0（下界） | 180（下界） | partial |
| moisture-strata | 1 | multi | planning | 12 | 8 | 0（下界） | 20（下界） | partial |
| moisture-strata | 1 | multi | execution | 48 | 32 | 0（下界） | 80（下界） | partial |
| moisture-strata | 1 | multi | review | 48 | 32 | 0（下界） | 80（下界） | partial |
| moisture-strata | 1 | multi | total | 108 | 72 | 0（下界） | 180（下界） | partial |
| moisture-strata | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| moisture-strata | 1 | single | execution | 48 | 32 | 0（下界） | 80（下界） | partial |
| moisture-strata | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| moisture-strata | 1 | single | total | 48 | 32 | 0（下界） | 80（下界） | partial |
| negative-zero-mean | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| negative-zero-mean | 1 | single | execution | 48 | 32 | 0（下界） | 80（下界） | partial |
| negative-zero-mean | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| negative-zero-mean | 1 | single | total | 48 | 32 | 0（下界） | 80（下界） | partial |
| negative-zero-mean | 1 | multi | planning | 12 | 8 | 0（下界） | 20（下界） | partial |
| negative-zero-mean | 1 | multi | execution | 48 | 32 | 0（下界） | 80（下界） | partial |
| negative-zero-mean | 1 | multi | review | 48 | 32 | 0（下界） | 80（下界） | partial |
| negative-zero-mean | 1 | multi | total | 108 | 72 | 0（下界） | 180（下界） | partial |
| duplicate-sites | 1 | multi | planning | 12 | 8 | 0（下界） | 20（下界） | partial |
| duplicate-sites | 1 | multi | execution | 48 | 32 | 0（下界） | 80（下界） | partial |
| duplicate-sites | 1 | multi | review | 48 | 32 | 0（下界） | 80（下界） | partial |
| duplicate-sites | 1 | multi | total | 108 | 72 | 0（下界） | 180（下界） | partial |
| duplicate-sites | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| duplicate-sites | 1 | single | execution | 48 | 32 | 0（下界） | 80（下界） | partial |
| duplicate-sites | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| duplicate-sites | 1 | single | total | 48 | 32 | 0（下界） | 80（下界） | partial |

## 模型自动安排（规划请求计入所在组）

- carbon-missing / multi：规划 1 次，任务 2 项，结构有效 true，审阅覆盖 true，编译通过 true。
- unknown-unit / multi：规划 1 次，任务 3 项，结构有效 true，审阅覆盖 true，编译通过 true。
- short-known-mean / multi：规划 1 次，任务 2 项，结构有效 true，审阅覆盖 true，编译通过 true。
- moisture-strata / multi：规划 1 次，任务 2 项，结构有效 true，审阅覆盖 true，编译通过 true。
- negative-zero-mean / multi：规划 1 次，任务 2 项，结构有效 true，审阅覆盖 true，编译通过 true。
- duplicate-sites / multi：规划 1 次，任务 2 项，结构有效 true，审阅覆盖 true，编译通过 true。
固定三阶段夹具不代表模型自动拆分质量；自动安排只评价本题的冻结方法和契约。

## 提交诊断（与宿主计数分开）

| 任务 | 重复 | 模式 | 宿主接收/退回 | SDK拒绝 | 输出上限未执行 | 记录完整 |
|---|---|---|---|---|---|---|
| carbon-missing | 1 | single | 1/0 | 0 | 0 | true |
| carbon-missing | 1 | multi | 2/0 | 0 | 0 | true |
| unknown-unit | 1 | multi | 1/0 | 0 | 0 | true |
| unknown-unit | 1 | single | 1/0 | 0 | 0 | true |
| short-known-mean | 1 | single | 1/0 | 0 | 0 | true |
| short-known-mean | 1 | multi | 2/0 | 0 | 0 | true |
| moisture-strata | 1 | multi | 2/0 | 0 | 0 | true |
| moisture-strata | 1 | single | 1/0 | 0 | 0 | true |
| negative-zero-mean | 1 | single | 1/0 | 0 | 0 | true |
| negative-zero-mean | 1 | multi | 2/0 | 0 | 0 | true |
| duplicate-sites | 1 | multi | 2/0 | 0 | 0 | true |
| duplicate-sites | 1 | single | 1/0 | 0 | 0 | true |
SDK/截断计数仅在本轮每个作用域的完整转录与宿主已记录计数一致时报告；未知不是零。诊断不参与权限或科学验收。
