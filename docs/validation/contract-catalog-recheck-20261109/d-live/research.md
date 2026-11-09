# 代表性科研任务对照
Run 7d5b2305-ca06-4013-bf8e-1d4ee4857cad；比较清单 22021bdac08722058c1811e79c08c8abc0be5db5e8581343162fc1a5006c800a；候选与配置保持冻结：true。
推理：live；模型 deepseek/deepseek-flash；整轮最多 300 次请求；每组上限 25；重复 2；分区强制 true。
代表性自制数据、小样本试验；不是用户真实项目或普遍模型质量结论。
accepted 仍由独立实际文件真值复核；blocked、失败与未运行分开记录。
各组独立等额请求上限，未用额度不借给另一组；额度用尽与科学错误分开，不完整配对不形成质量或费用收益结论。
缺失或部分用量不作零费用；无价格换算；未运行的输入核验和用量不适用。

| 任务 | 重复 | 模式 | 终态 | 独立验收 | 请求 | 宿主提交/退回 | 可见 token | 用量未知任务 | 耗时 ms |
|---|---|---|---|---|---|---|---|---|---|
| short-known-mean | 1 | single | accepted | true | 9 | 1/0 | 61744 | 0 | 34664 |
| short-known-mean | 1 | multi | accepted | true | 14 | 3/0 | 91116 | 0 | 78494 |
| carbon-missing | 1 | multi | awaiting-info | false | 5 | 0/0 | 0 | 1 | 26664 |
| carbon-missing | 1 | single | accepted | true | 11 | 1/0 | 90498 | 0 | 39638 |
| unknown-unit | 1 | single | blocked | false | 12 | 2/1 | 120434 | 0 | 62411 |
| unknown-unit | 1 | multi | failed | false | 4 | 0/0 | 0 | 1 | 27082 |
| short-known-mean | 2 | multi | accepted | true | 19 | 3/0 | 121147 | 0 | 108510 |
| short-known-mean | 2 | single | accepted | true | 10 | 1/0 | 67543 | 0 | 36491 |
| carbon-missing | 2 | single | accepted | true | 12 | 2/1 | 104367 | 0 | 45766 |
| carbon-missing | 2 | multi | accepted | true | 16 | 3/0 | 100379 | 0 | 97421 |
| unknown-unit | 2 | multi | awaiting-info | false | 4 | 0/0 | 0 | 1 | 31618 |
| unknown-unit | 2 | single | blocked | false | 10 | 1/0 | 83879 | 0 | 51242 |

完整配对 3；不完整配对 3；两组均通过独立核验 3。

| 模式 | 合格交付 | 正确阻塞 | 误验收 | 明确触发请求上限 | 请求 / 合格交付 | 毫秒 / 合格交付 |
|---|---|---|---|---|---|---|
| single | 4 | 0 | 0 | 0 | 16.00 | 67553 |
| multi | 3 | 0 | 0 | 0 | 20.67 | 123263 |
awaiting-info 表示规划提出待确认项且尚未执行；不计作合格交付或正确科学阻塞。
分子包含所有已运行试验的成本，包括失败和正确阻塞；离线结果只验证执行链。宿主提交/退回不含 SDK 拒绝和输出截断；它们须结合原始转录另行核查。

## 独立审阅请求保留

- short-known-mean / 1 / multi：核查+分析 11/18，拒绝 0；独立审阅 3/7，拒绝 0。保留额度不表示已完成审阅。
- carbon-missing / 1 / multi：核查+分析 5/18，拒绝 0；独立审阅 0/7，拒绝 0。保留额度不表示已完成审阅。
- unknown-unit / 1 / multi：核查+分析 4/18，拒绝 0；独立审阅 0/7，拒绝 0。保留额度不表示已完成审阅。
- short-known-mean / 2 / multi：核查+分析 15/18，拒绝 0；独立审阅 4/7，拒绝 0。保留额度不表示已完成审阅。
- carbon-missing / 2 / multi：核查+分析 13/18，拒绝 0；独立审阅 3/7，拒绝 0。保留额度不表示已完成审阅。
- unknown-unit / 2 / multi：核查+分析 4/18，拒绝 0；独立审阅 0/7，拒绝 0。保留额度不表示已完成审阅。

## 分阶段用量（宿主已记录回执）

旧 usage 字段保留执行任务口径；以下 planning/execution/review 为互斥作用域，合计包含规划。缓存读取单列，不重复加到输入输出。未知不补零；下界不是完整费用，未提供价格换算。

| 任务 | 重复 | 组 | 阶段 | 输入 | 输出 | 缓存读取 | 可见输入+输出 | 覆盖 |
|---|---:|---|---|---:|---:|---:|---:|---|
| short-known-mean | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| short-known-mean | 1 | single | execution | 56957 | 4787 | 0（下界） | 61744（下界） | partial |
| short-known-mean | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| short-known-mean | 1 | single | total | 56957 | 4787 | 0（下界） | 61744（下界） | partial |
| short-known-mean | 1 | multi | planning | 43834 | 2610 | 6656 | 46444 | recorded |
| short-known-mean | 1 | multi | execution | 57663 | 5352 | 1536（下界） | 63015（下界） | partial |
| short-known-mean | 1 | multi | review | 24091 | 4010 | 512（下界） | 28101（下界） | partial |
| short-known-mean | 1 | multi | total | 125588 | 11972 | 8704（下界） | 137560（下界） | partial |
| carbon-missing | 1 | multi | planning | 71664 | 3472 | 14464 | 75136 | recorded |
| carbon-missing | 1 | multi | execution | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| carbon-missing | 1 | multi | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| carbon-missing | 1 | multi | total | 71664 | 3472 | 14464 | 75136 | recorded |
| carbon-missing | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| carbon-missing | 1 | single | execution | 84865 | 5633 | 0（下界） | 90498（下界） | partial |
| carbon-missing | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| carbon-missing | 1 | single | total | 84865 | 5633 | 0（下界） | 90498（下界） | partial |
| unknown-unit | 1 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | single | execution | 110421 | 10013 | 0（下界） | 120434（下界） | partial |
| unknown-unit | 1 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | single | total | 110421 | 10013 | 0（下界） | 120434（下界） | partial |
| unknown-unit | 1 | multi | planning | 56159 | 3678 | 10752 | 59837 | recorded |
| unknown-unit | 1 | multi | execution | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | multi | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 1 | multi | total | 56159 | 3678 | 10752 | 59837 | recorded |
| short-known-mean | 2 | multi | planning | 81220 | 7544 | 14464 | 88764 | recorded |
| short-known-mean | 2 | multi | execution | 76307 | 6529 | 2048（下界） | 82836（下界） | partial |
| short-known-mean | 2 | multi | review | 34123 | 4188 | 768（下界） | 38311（下界） | partial |
| short-known-mean | 2 | multi | total | 191650 | 18261 | 17280（下界） | 209911（下界） | partial |
| short-known-mean | 2 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| short-known-mean | 2 | single | execution | 62396 | 5147 | 0（下界） | 67543（下界） | partial |
| short-known-mean | 2 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| short-known-mean | 2 | single | total | 62396 | 5147 | 0（下界） | 67543（下界） | partial |
| carbon-missing | 2 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| carbon-missing | 2 | single | execution | 97282 | 7085 | 0（下界） | 104367（下界） | partial |
| carbon-missing | 2 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| carbon-missing | 2 | single | total | 97282 | 7085 | 0（下界） | 104367（下界） | partial |
| carbon-missing | 2 | multi | planning | 57359 | 3282 | 11520 | 60641 | recorded |
| carbon-missing | 2 | multi | execution | 66659 | 7686 | 2304 | 74345 | recorded |
| carbon-missing | 2 | multi | review | 22146 | 3888 | 640 | 26034 | recorded |
| carbon-missing | 2 | multi | total | 146164 | 14856 | 14464 | 161020 | recorded |
| unknown-unit | 2 | multi | planning | 54530 | 4285 | 13056 | 58815 | recorded |
| unknown-unit | 2 | multi | execution | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 2 | multi | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 2 | multi | total | 54530 | 4285 | 13056 | 58815 | recorded |
| unknown-unit | 2 | single | planning | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 2 | single | execution | 76278 | 7601 | 0（下界） | 83879（下界） | partial |
| unknown-unit | 2 | single | review | 未运行 | 未运行 | 未运行 | 未运行 | not-run |
| unknown-unit | 2 | single | total | 76278 | 7601 | 0（下界） | 83879（下界） | partial |

## 模型自动安排（规划请求计入所在组）

- short-known-mean / multi：规划 3 次，任务 3 项，结构有效 true，审阅覆盖 true，编译通过 true。
- carbon-missing / multi：规划 5 次，任务 3 项，结构有效 false，审阅覆盖 false，编译通过 false。
- unknown-unit / multi：规划 4 次，任务 3 项，结构有效 true，审阅覆盖 true，编译通过 false。
- short-known-mean / multi：规划 5 次，任务 3 项，结构有效 true，审阅覆盖 true，编译通过 true。
- carbon-missing / multi：规划 4 次，任务 3 项，结构有效 true，审阅覆盖 true，编译通过 true。
- unknown-unit / multi：规划 4 次，任务 3 项，结构有效 false，审阅覆盖 false，编译通过 false。
固定三阶段夹具不代表模型自动拆分质量；自动安排只评价本题的冻结方法和契约。

## 提交诊断（与宿主计数分开）

| 任务 | 重复 | 模式 | 宿主接收/退回 | SDK拒绝 | 输出上限未执行 | 记录完整 |
|---|---|---|---|---|---|---|
| short-known-mean | 1 | single | 1/0 | 0 | 0 | true |
| short-known-mean | 1 | multi | 3/0 | 1 | 0 | true |
| carbon-missing | 1 | multi | 0/0 | 未知 | 未知 | false |
| carbon-missing | 1 | single | 1/0 | 0 | 0 | true |
| unknown-unit | 1 | single | 2/1 | 0 | 0 | true |
| unknown-unit | 1 | multi | 0/0 | 未知 | 未知 | false |
| short-known-mean | 2 | multi | 3/0 | 1 | 0 | true |
| short-known-mean | 2 | single | 1/0 | 0 | 0 | true |
| carbon-missing | 2 | single | 2/1 | 0 | 0 | true |
| carbon-missing | 2 | multi | 3/0 | 0 | 0 | true |
| unknown-unit | 2 | multi | 0/0 | 未知 | 未知 | false |
| unknown-unit | 2 | single | 1/0 | 0 | 0 | true |
SDK/截断计数仅在本轮每个作用域的完整转录与宿主已记录计数一致时报告；未知不是零。诊断不参与权限或科学验收。
