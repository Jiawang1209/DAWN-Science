计算 carbon_mg_g 的算术均值；单位 mg/g。仅丢弃该列 NA，不能按 rain_mm 筛选或填补。保留全部输入；Python stdlib 脚本、result.json 和说明报告。
科研模板 tabular-ecology@1；语言 python；用户已批准方法：arithmetic mean。
单位规则：mg/g。缺失值规则：drop NA in target column only。
核查输入结构、方法适用条件及证据缺口；条件不足须 blockers，不猜测单位、填补缺失或编造数据。
需要受控环境复用时，Python 使用 python3 -I 声明脚本路径 的单一命令；宿主绕过 shell 启动隔离解释器，等待非守护线程与退出回调收尾。该同步模式禁止创建子进程；本地代码/数据须列入 inputs，未声明文件或外部依赖不签发复用证明。需要子进程时交还主会话选择普通执行，不能自动改命令重试。R 沿用普通执行与验收，暂不签发依赖及生命周期未完整核实的复用证明。
按约定方法执行并保留可复现脚本；报告须列输入、处理、结果及局限。独立审阅核查实际文件及方法一致性。输出：results/analysis.py、results/result.json、results/report.md
宿主验收规则：{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json","numeric":{"version":1,"dataPath":"input.csv","column":"carbon_mg_g","metric":"mean","unit":"mg/g","missing":"drop","absoluteTolerance":1e-9}}；result.json 使用平铺对象 {n:正整数,unit:单位字符串,指标名:有限数值}，须与正式 data.metrics 和 sampleCount 一致。

## 问题与假设

- 目标量：`carbon_mg_g` 的算术均值，单位 mg/g。属描述性统计，不做推断、不涉及分组比较、不涉及 `rain_mm` 关系。
- 方法：用户已批准 arithmetic mean，预先指定，不做方法搜索。适用前提：该列为同一单位下的数值型观测、按行独立；本任务只给点估计，不对总体做外推，故不假设缺失机制。
- 单位假设：`mg/g` 仅由列名 `carbon_mg_g` 给出，工作区内无 README/单位元数据。该假设须写入报告局限；不换算、不猜测其他量纲。
- 缺失假设：目标列中的 `NA` 是缺失标记（不是 0、不是检出限）。仅丢弃目标列为 `NA` 的行；`rain_mm` 不参与任何筛选，禁止填补。
- 可核查点：`result.json` 的 `n`、`unit`、`mean` 必须与独立重算一致（绝对误差 ≤ 1e-9），且与报告数值一致。

## 数据与切分

- 唯一输入 `input.csv`：48 个数据行，列 `site, carbon_mg_g, rain_mm`，无重名列。不引入外部数据、不联网、不读其他文件。
- 描述统计，无训练/测试切分；全部有效记录进入同一均值。不做按 `rain_mm`、`site`、行序的分层或子集筛选。
- 缺失：目标列字面量 `NA` 共 7 处（plot-1/8/15/22/29/36/43），预期有效 n = 41；`rain_mm` 完整且不参与剔除。最终 n 以脚本实算为准，由独立审阅复核。
- 前置只读核查（check）：表头与列名、数据行数、目标列实际出现的非数值标记形态逐一列举、`rain_mm` 是否完整、单位是否只有列名证据。
- 阻塞条件（成立则分析必须报 blocker，不猜）：目标列存在除 `NA` 之外无法解析的取值；列名/单位与 mg/g 声明不符；行数差异无法解释；有效值不足 1 个。

## 统计检验与模型

- 无假设检验、无模型：仅点估计 mean = Σx_i / n，x_i 为 `carbon_mg_g` 可解析为数值的记录，n 为有效记录数。
- 实现：Python 标准库 `csv` + `math.fsum`（避免朴素累加舍入误差），不装包、不建子进程、不联网；缺失判定对 `NA`/空串显式分支并统计计数。
- 输出：双精度全精度计算；`result.json` 平铺对象 `{n: <正整数>, unit: "mg/g", mean: <有限浮点数>}`（指标名 `mean`），须与正式 `data.metrics` 和 `sampleCount` 一致；报告数值保留 ≥6 位小数并同时给出 n 与缺失计数。
- 不报告置信区间/推断结论（超出批准范围）；如需描述性 sd，必须标注为描述性且不用于推断，否则省略。

## 图

- 本任务不产出图：交付物仅脚本、`result.json`、说明报告，绘图会引入额外依赖且无需求。
- 不做探索性可视化，避免形成未批准的推断性解读。

## 产物

- `results/analysis.py`：stdlib 单文件脚本，声明输入 `input.csv`、显式 NA 处理、`math.fsum` 求均值、写出 `results/result.json` 并可独立重跑（无子进程、无外部依赖）。
- `results/result.json`：平铺 `{n, unit, mean}`，须与 `input.csv` 中仅剔除 NA 后的 `carbon_mg_g` 算术均值在 1e-9 内一致，unit 为 `mg/g`。
- `results/report.md`：列明输入（文件、列、48 行、7 处 NA）、处理（仅丢弃目标列 NA、无筛选无填补、算法与库）、结果（n、均值、单位）、局限（单位仅由列名推断、行独立性与设计未知、不做推断、无图）。

## 任务安排（自动安排）
执行方式：串行交接
安排理由：先用只读 check 固化输入结构、单位证据与缺失形态并给出阻塞边界；再由 analyze 在 workspace-exec 下生成脚本与两项产物；最后由独立只读 review 复核实际文件并独立重算 n 与均值。三块串联，审阅与执行分离，不并行以免共写 results/。受控复用要求把本地脚本列入 inputs，而冻结 analyze 契约 inputs 仅含 input.csv，故按普通执行验收，不签发依赖复用证明。
保留独立审阅：是
执行绑定：team-v1

### T1 · 核查 input.csv 结构、单位证据与缺失形态
- 目标：只读核查 input.csv：表头与列名、数据行数、carbon_mg_g 中实际出现的非数值缺失标记及逐行位置、rain_mm 是否完整、单位是否仅有列名证据；给出有效 n 预期与必须阻塞的边界情况。
- 分工：check
- 输入：input.csv
- 验收：以 data-summary 形式报告：列名与行数、目标列非数值标记的形态与逐行 site、有效 n 预期、rain_mm 完整性、单位证据来源（仅列名），并给出必须阻塞的边界清单；不写任何文件、不填补、不按 rain_mm 筛选。
- 独立审阅：否
- 执行者：check
- 执行契约：{"submission":"tool","resultType":"data-summary","version":1,"inputs":["input.csv"],"outputs":[],"access":"read-only","requireExecution":false,"requireReview":true}

### T2 · 生成 results/analysis.py 并实算 carbon_mg_g 算术均值
- 目标：写 Python stdlib 脚本 results/analysis.py：读 input.csv，仅丢弃 carbon_mg_g 为 NA 的行（不按 rain_mm 筛选、不填补），用 math.fsum 求算术均值，写出平铺 results/result.json {n,unit,mean}，并生成 results/report.md（输入、处理、结果、局限）。
- 分工：analyze
- 输入：input.csv
- 输出：results/analysis.py
- 输出：results/result.json
- 输出：results/report.md
- 依赖：T1
- 验收：脚本可在仓库根目录以 python3 -I results/analysis.py 单命令重跑、无子进程、无外部依赖；result.json 为平铺对象 {n:正整数, unit:"mg/g", mean:有限数值}，与仅剔除 NA 后的碳列算术均值在 1e-9 内一致；报告列出输入、处理、结果、局限（含单位仅由列名推断）。若 T1 阻塞条件成立则报 blocker，不猜单位、不填补、不编造数据。
- 独立审阅：否
- 执行者：analyze
- 执行契约：{"acceptance":{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json","numeric":{"version":1,"dataPath":"input.csv","column":"carbon_mg_g","metric":"mean","unit":"mg/g","missing":"drop","absoluteTolerance":1e-9}},"submission":"tool","resultType":"model-metrics","version":1,"inputs":["input.csv"],"outputs":["results/analysis.py","results/result.json","results/report.md"],"access":"workspace-exec","requireExecution":true,"requireReview":false}

### T3 · 独立只读审阅脚本、结果与报告并独立重算
- 目标：只读审阅三个产物：从 input.csv 独立重算碳列均值与有效 n，核对 result.json 的平铺结构、unit、mean、n 与 1e-9 容差；核查脚本只丢弃目标列 NA、未按 rain_mm 筛选、未填补、无子进程与外部依赖；核查报告是否如实列出输入、处理、结果、局限（单位仅由列名推断）。
- 分工：review
- 输入：results/analysis.py
- 输入：results/result.json
- 输入：results/report.md
- 依赖：T2
- 验收：给出 review 结论：独立重算的 n 与均值、与 result.json 的差值、方法/单位/缺失规则一致性、脚本依赖与可重跑性、报告局限覆盖度；不一致须具体到文件与数值；不修改文件、不新增产物。
- 独立审阅：是
- 执行者：review
- 执行契约：{"submission":"tool","resultType":"review","version":1,"inputs":["results/analysis.py","results/result.json","results/report.md"],"outputs":[],"access":"read-only","requireExecution":false,"requireReview":true}
