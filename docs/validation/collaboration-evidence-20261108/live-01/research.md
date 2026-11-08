# 代表性科研任务对照
Run 65032776-edd0-4dd3-b530-3feb1f1bdd0d；比较清单 8ec91ed30e3a212c8e38325ab52ab00fbcc8435bde5a96eec0c523bd75e2e340；候选与配置保持冻结：true。
推理：live；模型 deepseek/deepseek-flash；整轮最多 300 次请求；每组上限 25；重复 2；分区强制 true。
代表性自制数据、小样本试验；不是用户真实项目或普遍模型质量结论。
accepted 仍由独立实际文件真值复核；blocked、失败与未运行分开记录。
各组独立等额请求上限，未用额度不借给另一组；额度用尽与科学错误分开，不完整配对不形成质量或费用收益结论。
缺失或部分用量不作零费用；无价格换算；未运行的输入核验和用量不适用。

| 任务 | 重复 | 模式 | 终态 | 独立验收 | 请求 | 宿主提交/退回 | 可见 token | 用量未知任务 | 耗时 ms |
|---|---|---|---|---|---|---|---|---|---|
| short-known-mean | 1 | single | accepted | true | 13 | 1/0 | 165687 | 0 | 75677 |
| short-known-mean | 1 | multi | accepted | true | 15 | 3/0 | 109791 | 0 | 133070 |
| carbon-missing | 1 | multi | failed | false | 18 | 2/0 | 145790 | 0 | 140594 |
| carbon-missing | 1 | single | blocked | false | 17 | 4/3 | 255113 | 0 | 102981 |
| unknown-unit | 1 | single | blocked | false | 12 | 2/1 | 264360 | 0 | 88359 |
| unknown-unit | 1 | multi | failed | false | 5 | 0/0 | 0 | 1 | 51508 |
| short-known-mean | 2 | multi | failed | false | 4 | 0/0 | 0 | 1 | 36170 |
| short-known-mean | 2 | single | accepted | true | 14 | 1/0 | 137343 | 0 | 64328 |
| carbon-missing | 2 | single | accepted | true | 10 | 1/0 | 89113 | 0 | 47722 |
| carbon-missing | 2 | multi | accepted | true | 17 | 3/0 | 148265 | 0 | 121464 |
| unknown-unit | 2 | multi | blocked | false | 13 | 1/0 | 79328 | 0 | 83044 |
| unknown-unit | 2 | single | blocked | false | 10 | 1/0 | 229610 | 0 | 63901 |

完整配对 3；不完整配对 3；两组均通过独立核验 2。

| 模式 | 合格交付 | 正确阻塞 | 误验收 | 明确触发请求上限 | 请求 / 合格交付 | 毫秒 / 合格交付 |
|---|---|---|---|---|---|---|
| single | 3 | 0 | 0 | 0 | 25.33 | 147656 |
| multi | 2 | 0 | 0 | 0 | 36.00 | 282925 |
分子包含所有已运行试验的成本，包括失败和正确阻塞；离线结果只验证执行链。宿主提交/退回不含 SDK 拒绝和输出截断；它们须结合原始转录另行核查。

## 独立审阅请求保留

- short-known-mean / 1 / multi：核查+分析 12/18，拒绝 0；独立审阅 3/7，拒绝 0。保留额度不表示已完成审阅。
- carbon-missing / 1 / multi：核查+分析 15/18，拒绝 0；独立审阅 3/7，拒绝 0。保留额度不表示已完成审阅。
- unknown-unit / 1 / multi：核查+分析 5/18，拒绝 0；独立审阅 0/7，拒绝 0。保留额度不表示已完成审阅。
- short-known-mean / 2 / multi：核查+分析 4/18，拒绝 0；独立审阅 0/7，拒绝 0。保留额度不表示已完成审阅。
- carbon-missing / 2 / multi：核查+分析 13/18，拒绝 0；独立审阅 4/7，拒绝 0。保留额度不表示已完成审阅。
- unknown-unit / 2 / multi：核查+分析 13/18，拒绝 0；独立审阅 0/7，拒绝 0。保留额度不表示已完成审阅。

## 分阶段用量（宿主已记录回执）

旧 usage 字段保留执行任务口径；以下 planning/execution/review 为互斥作用域，合计包含规划。缓存读取单列，不重复加到输入输出。未知不补零；下界不是完整费用，未提供价格换算。

| 任务 | 重复 | 组 | 阶段 | 输入 | 输出 | 缓存读取 | 可见输入+输出 | 覆盖 |
|---|---:|---|---|---:|---:|---:|---:|---|
| short-known-mean | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| short-known-mean | 1 | single | execution | 154826 | 10861 | 73728（下界） | 165687（下界） | partial |
| short-known-mean | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| short-known-mean | 1 | single | total | 154826 | 10861 | 73728（下界） | 165687（下界） | partial |
| short-known-mean | 1 | multi | planning | 62326 | 8284 | 11520 | 70610 | recorded |
| short-known-mean | 1 | multi | execution | 66400 | 5501 | 39168（下界） | 71901（下界） | partial |
| short-known-mean | 1 | multi | review | 31902 | 5988 | 12800（下界） | 37890（下界） | partial |
| short-known-mean | 1 | multi | total | 160628 | 19773 | 63488（下界） | 180401（下界） | partial |
| carbon-missing | 1 | multi | planning | 75335 | 6584 | 14464 | 81919 | recorded |
| carbon-missing | 1 | multi | execution | 100227 | 8830 | 52224（下界） | 109057（下界） | partial |
| carbon-missing | 1 | multi | review | 31945 | 4788 | 12800（下界） | 36733（下界） | partial |
| carbon-missing | 1 | multi | total | 207507 | 20202 | 79488（下界） | 227709（下界） | partial |
| carbon-missing | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| carbon-missing | 1 | single | execution | 239876 | 15237 | 104448 | 255113 | recorded |
| carbon-missing | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| carbon-missing | 1 | single | total | 239876 | 15237 | 104448 | 255113 | recorded |
| unknown-unit | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | single | execution | 251055 | 13305 | 73728 | 264360 | recorded |
| unknown-unit | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | single | total | 251055 | 13305 | 73728 | 264360 | recorded |
| unknown-unit | 1 | multi | planning | 81215 | 8832 | 14464 | 90047 | recorded |
| unknown-unit | 1 | multi | execution | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | multi | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | multi | total | 81215 | 8832 | 14464 | 90047 | recorded |
| short-known-mean | 2 | multi | planning | 59944 | 6038 | 11520 | 65982 | recorded |
| short-known-mean | 2 | multi | execution | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| short-known-mean | 2 | multi | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| short-known-mean | 2 | multi | total | 59944 | 6038 | 11520 | 65982 | recorded |
| short-known-mean | 2 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| short-known-mean | 2 | single | execution | 127925 | 9418 | 86016 | 137343 | recorded |
| short-known-mean | 2 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| short-known-mean | 2 | single | total | 127925 | 9418 | 86016 | 137343 | recorded |
| carbon-missing | 2 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| carbon-missing | 2 | single | execution | 82343 | 6770 | 61440 | 89113 | recorded |
| carbon-missing | 2 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| carbon-missing | 2 | single | total | 82343 | 6770 | 61440 | 89113 | recorded |
| carbon-missing | 2 | multi | planning | 54787 | 4432 | 11520 | 59219 | recorded |
| carbon-missing | 2 | multi | execution | 87627 | 8614 | 45696（下界） | 96241（下界） | partial |
| carbon-missing | 2 | multi | review | 45733 | 6291 | 19200（下界） | 52024（下界） | partial |
| carbon-missing | 2 | multi | total | 188147 | 19337 | 76416（下界） | 207484（下界） | partial |
| unknown-unit | 2 | multi | planning | 72330 | 6372 | 14464 | 78702 | recorded |
| unknown-unit | 2 | multi | execution | 73716 | 5612 | 45696（下界） | 79328（下界） | partial |
| unknown-unit | 2 | multi | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 2 | multi | total | 146046 | 11984 | 60160（下界） | 158030（下界） | partial |
| unknown-unit | 2 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 2 | single | execution | 220973 | 8637 | 61440 | 229610 | recorded |
| unknown-unit | 2 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 2 | single | total | 220973 | 8637 | 61440 | 229610 | recorded |

## 模型自动安排（规划请求计入所在组）

- short-known-mean / multi：规划 4 次，任务 3 项，结构有效 true，审阅覆盖 true，编译通过 true。
- carbon-missing / multi：规划 5 次，任务 3 项，结构有效 true，审阅覆盖 true，编译通过 true。
- unknown-unit / multi：规划 5 次，任务 0 项，结构有效 false，审阅覆盖 false，编译通过 false。
- short-known-mean / multi：规划 4 次，任务 3 项，结构有效 false，审阅覆盖 false，编译通过 false。
- carbon-missing / multi：规划 4 次，任务 3 项，结构有效 true，审阅覆盖 true，编译通过 true。
- unknown-unit / multi：规划 5 次，任务 2 项，结构有效 true，审阅覆盖 true，编译通过 true。
固定三阶段夹具不代表模型自动拆分质量；自动安排只评价本题的冻结方法和契约。

## 提交诊断（与宿主计数分开）

| 任务 | 重复 | 模式 | 宿主接收/退回 | SDK拒绝 | 输出上限未执行 | 记录完整 |
|---|---|---|---|---|---|---|
| short-known-mean | 1 | single | 1/0 | 0 | 0 | true |
| short-known-mean | 1 | multi | 3/0 | 0 | 1 | true |
| carbon-missing | 1 | multi | 2/0 | 0 | 0 | true |
| carbon-missing | 1 | single | 4/3 | 0 | 0 | true |
| unknown-unit | 1 | single | 2/1 | 0 | 0 | true |
| unknown-unit | 1 | multi | 0/0 | 未知 | 未知 | false |
| short-known-mean | 2 | multi | 0/0 | 未知 | 未知 | false |
| short-known-mean | 2 | single | 1/0 | 0 | 0 | true |
| carbon-missing | 2 | single | 1/0 | 0 | 0 | true |
| carbon-missing | 2 | multi | 3/0 | 1 | 1 | true |
| unknown-unit | 2 | multi | 1/0 | 0 | 0 | true |
| unknown-unit | 2 | single | 1/0 | 0 | 0 | true |
SDK/截断计数仅在本轮每个作用域的完整转录与宿主已记录计数一致时报告；未知不是零。诊断不参与权限或科学验收。
