计算 carbon_mg_g 的算术均值；单位 mg/g。仅丢弃该列 NA，不能按 rain_mm 筛选或填补。保留全部输入；Python stdlib 脚本、result.json 和说明报告。
科研模板 tabular-ecology@1；语言 python；用户已批准方法：arithmetic mean。
单位规则：mg/g。缺失值规则：drop NA in target column only。
核查输入结构、方法适用条件及证据缺口；条件不足须 blockers，不猜测单位、填补缺失或编造数据。
需要受控环境复用时，Python 使用 python3 -I 声明脚本路径 的单一命令；宿主绕过 shell 启动隔离解释器，等待非守护线程与退出回调收尾。该同步模式禁止创建子进程；本地代码/数据须列入 inputs，未声明文件或外部依赖不签发复用证明。需要子进程时交还主会话选择普通执行，不能自动改命令重试。R 沿用普通执行与验收，暂不签发依赖及生命周期未完整核实的复用证明。
按约定方法执行并保留可复现脚本；报告须列输入、处理、结果及局限。独立审阅核查实际文件及方法一致性。输出：results/analysis.py、results/result.json、results/report.md
宿主验收规则：{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json","numeric":{"version":1,"dataPath":"input.csv","column":"carbon_mg_g","metric":"mean","unit":"mg/g","missing":"drop","absoluteTolerance":1e-9}}；result.json 使用平铺对象 {n:正整数,unit:单位字符串,指标名:有限数值}，须与正式 data.metrics 和 sampleCount 一致。

## 问题与假设

**目标**：计算 `input.csv` 中 `carbon_mg_g` 列的算术均值，单位为 mg/g。

**零假设/前提（无需推断统计）**：本任务是单变量描述性估计，不做假设检验。唯一需要假定的前提是：`carbon_mg_g` 各观测为有效数值读数；`NA` 字面量代表缺失，而非真实的 0 或某个编码值。

**已核对的输入事实（只读检查，未做任何计算）**：
- 文件仅 48 行数据 + 1 行表头；列恰为 `site, carbon_mg_g, rain_mm`。
- `carbon_mg_g` 的第 1、8、15、22、29、36、43 行（plot-1/8/15/22/29/36/43）为字面量 `NA`，其余为普通小数（12.0–15.6 区间）。
- `rain_mm` 在全部行都有值，且随 `site` 序号单调递增（300→817），是与本次计算无关的协变量。

**证据缺口（需在结果中如实声明，不猜测）**：
1. 单位 mg/g 仅来自列名 `carbon_mg_g` 与用户声明，数据文件内无独立单位元数据或方法说明；不做单位换算。
2. 缺失机制未知（是否随机缺失无信息支持），因此结果只在"可观测子集"上有效，报告不得外推为总体均值。
3. 无抽样设计、无重复测量信息；不计算置信区间或做加权。

**明确排除**：不按 `rain_mm` 做任何筛选、分层、协变量调整；不填补、不插值、不截尾。

## 数据与切分

- 输入：`input.csv`（唯一数据源，全部 48 行保留在读取阶段，不预筛）。
- 缺失处理：**仅**丢弃 `carbon_mg_g` 为 `NA` 的行；其余列（含 `rain_mm`）不参与筛选。预期有效样本 n = 48 − 7 = 41，脚本内须实测并由 `n` 字段自证一致。
- 解析规则：`NA`、空字符串视为缺失；不做字符串到 0 的兜底；若遇非数值且非缺失的取值，脚本必须报错退出而非静默跳过。
- 无训练/测试切分、无交叉验证：单变量点估计，不做任何模型选择。不划分区域、不做按 `rain_mm` 的分组。
- 语言/环境：Python 3 标准库（`csv`、`json`、`math`、`statistics` 或手写累加），单文件脚本，禁止 `subprocess`/网络/第三方包，以 `python3 -I <script>` 单一命令运行。

## 统计检验与模型

- 方法（用户已批准，不替换）：`carbon_mg_g` 的**算术均值** = Σx / n，n 为去除目标列缺失后的行数。
- 数值实现：`statistics.fmean`（或等价的 Kahan/`math.fsum` 累加，避免舍入累积），结果写成有限数值；不使用中位数、几何均值、插补均值等替代量。
- 无显著性检验、无 p 值、无模型拟合，因此报告不得出现"显著""效应量"等推断性表述。
- 自证性检查（脚本内、失败即非零退出）：
  1. `n` = 有效样本数，为正整数；
  2. 均值在数据观测范围 [12.0, 15.6] 内（越界视为实现错误）；
  3. `result.json` 中的 `n` 与脚本内计数、报告中的 n 三者一致；
  4. 保留全部输入、不做原地修改（只读输入，仅写 `results/` 下产物）。
- `result.json` 结构（平铺对象）：`{"n": <正整数>, "unit": "mg/g", "mean": <有限数值>}`，指标名与宿主 `numeric` 契约（`column=carbon_mg_g`, `metric=mean`, `unit=mg/g`, `missing=drop`, 容差 1e-9）一致。

## 图

本次交付不需要图（用户未要求，且单变量点估计配图无信息增量）。若需可选的示意，也只允许来自同一份数据的直方图，不得引入新数据；默认**不生成**任何图像文件，避免增加无证据支持的产物。

## 产物

- `results/analysis.py` — 单文件 Python 标准库脚本：读 `input.csv` → 仅丢弃 `carbon_mg_g` 的 NA → 算术均值 → 写 `results/result.json`；含上述自证性检查，非零退出表示失败。
- `results/result.json` — 平铺对象 `{n, unit:"mg/g", mean}`，与脚本输出的 `n`/均值严格一致。
- `results/report.md` — 说明输入（文件、列、7 个 NA 的具体行）、处理（仅目标列删失、n=41）、结果（均值与单位）、局限（缺失机制未知、单位仅源于列名、不可外推、未做不确定性估计），并附复现命令 `python3 -I results/analysis.py`。

### 分工与依赖（3 项：1 核查 + 1 分析 + 1 独立审阅）

- `check`（只读，`check` 契约）：核对 `input.csv` 的结构、`NA` 位置计数、目标列可解析性、单位线索与证据缺口，产出 `data-summary` 供分析引用；只读，不改文件。
- `analyze`（`workspace-exec`，`analyze` 契约）：唯一产物生产任务，依赖 `check` 的结论；写 `results/analysis.py`、`results/result.json`、`results/report.md`，实际执行脚本并提交 `model-metrics`。
- `review`（只读，`review` 契约，依赖 `analyze`）：独立核查三份实际文件是否存在、数值是否与 `input.csv` 独立重算一致、方法（算术均值）、单位（mg/g）、缺失规则（仅目标列 drop，未按 rain_mm 筛选/填补）是否一致；不写文件。

**待用户确认/补充的问题**：无阻塞性问题；若项目有既定的 `results/` 之外落位约定（如 `figures/`、`results/tables/`），请告知，我按约定调整路径。当前按你给定的 `results/` 三件套执行。

## 任务安排（自动安排）
执行方式：串行交接
安排理由：任务本身是单变量算数均值：一个只读核查确认输入结构与证据缺口，一个唯一产物生产者实际运行脚本，一个独立只读审阅核对实际文件与方法/单位/缺失规则一致性。三块各自独立、不共写目标，不预设更多块数。
保留独立审阅：是
执行绑定：team-v1

### check · 只读核查 input.csv 结构与证据缺口
- 目标：确认 input.csv 的列结构、carbon_mg_g 中 NA 的实际位置与数量、其余取值可解析为数值、rain_mm 是否全非缺失，并记录单位证据（仅列名 carbon_mg_g）与缺失机制未知这一缺口；给出算术均值在这份数据上的适用条件与任何 blockers。
- 分工：核查（只读）：不写任何文件，不计算正式结果作为交付。
- 输入：input.csv
- 验收：给出 48 行数据、恰好 7 个 NA（plot-1/8/15/22/29/36/43）、n=41 的有效子集预期、目标列取值域与单位证据来源；如发现结构意外（非数值取值、额外列、NA 编码不一致）须明确列为 blockers，不猜测、不填补。
- 独立审阅：否
- 执行者：check
- 执行契约：{"submission":"tool","resultType":"data-summary","version":1,"inputs":["input.csv"],"outputs":[],"access":"read-only","requireExecution":false,"requireReview":true}

### analyze · 实现并运行均值脚本，产出三份文件
- 目标：按核查结论写 results/analysis.py（Python 标准库，无 subprocess/网络/第三方包），以单一命令 python3 -I results/analysis.py 实际运行：读 input.csv，仅丢弃 carbon_mg_g 为 NA 的行（不按 rain_mm 筛选、不填补），计算算术均值，写 results/result.json 的平铺对象 {n, unit:"mg/g", mean} 与 results/report.md（输入/处理/结果/局限/复现命令）。
- 分工：分析与产物生产（唯一写 results/ 的任务）：实际执行脚本，不编造数值。
- 输入：input.csv
- 输出：results/analysis.py
- 输出：results/result.json
- 输出：results/report.md
- 依赖：check
- 验收：三份文件真实存在；脚本以 python3 -I 单一命令成功执行且退出码 0；result.json 的 n 为正整数且等于脚本实测有效样本数（预期 41）、unit 为 mg/g、mean 为有限数值且落在 [12.0,15.6]；报告列明 7 个缺失行、仅目标列删失规则、单位来源与局限（缺失机制未知、不可外推、未做不确定性估计）；全程未修改 input.csv。
- 独立审阅：否
- 执行者：analyze
- 执行契约：{"acceptance":{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json","numeric":{"version":1,"dataPath":"input.csv","column":"carbon_mg_g","metric":"mean","unit":"mg/g","missing":"drop","absoluteTolerance":1e-9}},"submission":"tool","resultType":"model-metrics","version":1,"inputs":["input.csv"],"outputs":["results/analysis.py","results/result.json","results/report.md"],"access":"workspace-exec","requireExecution":true,"requireReview":false}

### review · 独立只读审阅文件与方法一致性
- 目标：读取实际存在的 results/analysis.py、results/result.json、results/report.md，独立从 input.csv 重算 carbon_mg_g 的算术均值（仅丢弃目标列 NA，不按 rain_mm 筛选/填补），核对数值与 n 是否一致、单位是否为 mg/g、方法是否为算术均值、报告是否如实声明局限与缺失行、脚本是否可复现且未含被禁依赖；不写任何文件。
- 分工：独立审阅（只读）：覆盖分析依赖，不修改产物。
- 输入：results/analysis.py
- 输入：results/result.json
- 输入：results/report.md
- 依赖：analyze
- 验收：给出逐项核对结论（存在性、数值与 n 一致、单位、方法、缺失规则、报告局限、脚本可复现性），明确 pass 或列出需修正的问题；不写文件、不改产物。
- 独立审阅：是
- 执行者：review
- 执行契约：{"submission":"tool","resultType":"review","version":1,"inputs":["results/analysis.py","results/result.json","results/report.md"],"outputs":[],"access":"read-only","requireExecution":false,"requireReview":true}
