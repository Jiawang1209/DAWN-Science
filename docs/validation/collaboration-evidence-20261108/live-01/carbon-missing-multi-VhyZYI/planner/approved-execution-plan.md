计算 carbon_mg_g 的算术均值；单位 mg/g。仅丢弃该列 NA，不能按 rain_mm 筛选或填补。保留全部输入；Python stdlib 脚本、result.json 和说明报告。
科研模板 tabular-ecology@1；语言 python；用户已批准方法：arithmetic mean。
单位规则：mg/g。缺失值规则：drop NA in target column only。
核查输入结构、方法适用条件及证据缺口；条件不足须 blockers，不猜测单位、填补缺失或编造数据。
需要受控环境复用时，Python 使用 python3 -I 声明脚本路径 的单一命令；宿主绕过 shell 启动隔离解释器，等待非守护线程与退出回调收尾。该同步模式禁止创建子进程；本地代码/数据须列入 inputs，未声明文件或外部依赖不签发复用证明。需要子进程时交还主会话选择普通执行，不能自动改命令重试。R 沿用普通执行与验收，暂不签发依赖及生命周期未完整核实的复用证明。
按约定方法执行并保留可复现脚本；报告须列输入、处理、结果及局限。独立审阅核查实际文件及方法一致性。输出：results/analysis.py、results/result.json、results/report.md
宿主验收规则：{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json","numeric":{"version":1,"dataPath":"input.csv","column":"carbon_mg_g","metric":"mean","unit":"mg/g","missing":"drop","absoluteTolerance":1e-9}}；result.json 使用平铺对象 {n:正整数,unit:单位字符串,指标名:有限数值}，须与正式 data.metrics 和 sampleCount 一致。

## 问题与假设

- 目标量：`input.csv` 中 `carbon_mg_g` 列的**算术均值**，单位 mg/g（用户已批准方法 arithmetic mean、单位规则 mg/g）。
- 假设 H0/操作性假设：该列可解析为有限数值；`NA` 仅表示缺失，不代表 0 或低于检出限。因此按契约只丢弃目标列缺失行，**不填补**。
- 数据独立性假设：每行（plot）为一个观测单元，一行一值，不做加权、不按 `rain_mm` 分层或筛选。这一点不额外检验（单变量均值不依赖行间独立性推断），但会在报告局限中说明。
- 只读核查已确认的事实（来自实际读取 `input.csv` 全文 49 行含表头）：3 列 `site,carbon_mg_g,rain_mm`；48 个数据行；`carbon_mg_g` 中字面 `NA` 出现 7 次（plot-1、8、15、22、29、36、43），故预期有效样本 n = 41；`rain_mm` 无缺失但**全程不参与计算**。
- 证据缺口（待核查步骤确认，不预设结论）：列名后缀 `_mg_g` 与声明单位 mg/g 是否一致、是否存在 `NA` 以外的缺失记号（空串、`NaN`、`null`）、是否存在非数值或非有限值。若出现与声明单位或缺失规则冲突的证据（例如列名指示其它量纲、存在需要填补才能计算的空洞），**记为 blockers 上报，不猜测单位、不填补、不改数据**。

## 数据与切分

- 唯一输入：`input.csv`（不下载、不合成、不追加任何外部数据；`site`、`rain_mm` 列原样保留在输入文件中，不删列、不改写、不另存清洗副本）。
- 缺失处理：仅对 `carbon_mg_g` 列做删除式处理——将字面 `NA`（以及核查中确认的其它缺失记号）判为缺失并整行不参与均值计算；**禁止**按 `rain_mm` 过滤、禁止插补（均值/中位数/前向填充）、禁止截断或缩尾、禁止剔除离群值。
- 不做训练/测试切分：这是单变量描述统计，无模型、无调参、无交叉验证。
- 计算口径：算术平均 = 全部 n 个有效观测之和 / n，float64 精度；n 为有效观测数（预期 41，最终以脚本实际计数为准）。结果保留全部有效数字写入 `result.json`，报告中另给四舍五入展示值并注明精度。

## 统计检验与模型

- 不做假设检验、不拟合模型、不给置信区间作为主结论（避免把描述统计包装成推断）。仅计算点估计：算术均值。
- 主结果：`mean(carbon_mg_g)`，单位 mg/g，n 与均值同时报告（n 是均值可解释性的必要条件）。
- 附带描述量（仅写入报告，用于审计，不改变主结果）：有效 n、缺失计数、min、max、样本标准差（仅作量级核对，不作为结论）。
- 复算一致性：脚本内同时用 `statistics.fmean` 与基于 `math.fsum` 的求和/计数两条路径各算一次，二者差值须 ≤1e-12 才写出结果，否则以失败退出（防止累加误差或解析错误被当成结果）。
- 受控执行方式（按契约）：单一命令 `python3 -I results/analysis.py`，宿主绕过 shell 启动隔离解释器；脚本**不创建任何子进程**，不访问网络，不依赖第三方包（仅 `csv`、`json`、`math`、`statistics`、`pathlib`、`sys`）。脚本以工作区相对路径解析 `input.csv`，路径不可写死为绝对路径；输出写入 `results/` 下三个声明产物，不改动 `input.csv`。
- `result.json` 结构（与宿主验收及正式 data.metrics/sampleCount 对齐）：平铺对象 `{"n": <正整数>, "unit": "mg/g", "mean": <有限数值>}`；键名即契约中的指标名 `mean`，三键之外不塞嵌套结构；数值必须是有限浮点（禁止 NaN/Infinity/null）。
- 验收对应：`dataPath=input.csv`、`column=carbon_mg_g`、`metric=mean`、`unit=mg/g`、`missing=drop`、`absoluteTolerance=1e-9`——即宿主用同一输入、同一缺失规则独立重算均值并与 `result.json` 的 `mean` 比对，容差 1e-9。

## 图

- 不产出图形文件：本任务是单一标量点估计，图形不增加证据，且契约要求的产物只有脚本、结果、报告三项。
- 报告内以 Markdown 表格替代图形：输入字段与类型、缺失计数（按列）、有效 n、均值（mg/g）、min/max/SD 量级、以及"未使用 `rain_mm` 筛选"的显式声明。
- 如需可视化，仅可作可选附加项并在报告中标注为"非结论性辅助图"，本次不生成。

## 产物

- `results/analysis.py`
- `results/result.json`
- `results/report.md`

## 执行安排

- 三块任务，链式推进：核查（只读）→ 分析（唯一写产物的任务）→ 独立只读审阅（覆盖分析依赖），审阅必须与执行者分离。
- 详述与验收见结构化安排：核查结论回传后若出现单位/缺失规则冲突，分析任务须上报 blockers 而不修改契约；审阅发现问题则回报主会话，不自行改文件。

## 任务安排（自动安排）
执行方式：串行交接
安排理由：单变量点估计本身很轻，但契约要求：核查输入结构与单位/缺失证据、唯一分析任务签发可复现脚本与验收产物、以及与分析执行者分离的只读审阅覆盖分析依赖。因此拆成三块：只读核查 → 分析（唯一写产物、workspace-exec、受控 python3 -I 单命令）→ 独立只读审阅。核查只做结构与证据核对，不重算主结果；审阅不写任何文件。
保留独立审阅：是
执行绑定：team-v1

### T1_check · 只读核查输入结构、方法适用条件与证据缺口
- 目标：核对 input.csv 的列结构、行数、carbon_mg_g 解析性、缺失记号种类与计数、单位证据，判断 arithmetic mean + drop-NA 规则是否可无歧义执行；如存在单位冲突、NA 以外的空洞或需要填补才能计算的情形，明确记为 blockers，不猜测单位、不填补、不改数据。
- 分工：check（只读数据摘要，不产出文件）
- 输入：input.csv
- 验收：给出：列名与类型、数据行数、carbon_mg_g 有效值数/缺失数及缺失记号清单、rain_mm 是否含缺失（仅作记录，明确不参与筛选）、单位证据（列名后缀与声明 mg/g 是否一致）、是否存在非数值或非有限值、以及明确的 blockers 或 no-blockers 结论；不计算并提交正式均值，不写任何文件。
- 独立审阅：否
- 执行者：check
- 执行契约：{"submission":"tool","resultType":"data-summary","version":1,"inputs":["input.csv"],"outputs":[],"access":"read-only","requireExecution":false,"requireReview":true}

### T2_analyze · 执行算术均值并交付脚本、result.json 与报告
- 目标：在核查无阻塞前提下手写纯 Python stdlib 脚本 results/analysis.py，仅丢弃 carbon_mg_g 缺失行，计算算术均值（mg/g），写出 results/result.json 与 results/report.md；保留 input.csv 原样不改。
- 分工：analyze（唯一写产物的执行任务，workspace-exec）
- 输入：input.csv
- 输出：results/analysis.py
- 输出：results/result.json
- 输出：results/report.md
- 依赖：T1_check
- 验收：以单一命令 python3 -I results/analysis.py 可确定性复现；脚本不创建子进程、不联网、不依赖第三方包、不硬编码绝对路径；result.json 为平铺对象 {n:正整数, unit:"mg/g", mean:有限数值} 且与正式 data.metrics/sampleCount 一致；n 等于 carbon_mg_g 非缺失计数；未按 rain_mm 筛选、未填补、未改输入；报告含输入、处理步骤、结果与局限（含 NA 机制未检验、rain_mm 未使用、单位依据为列名与用户规则）。
- 独立审阅：否
- 执行者：analyze
- 执行契约：{"acceptance":{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json","numeric":{"version":1,"dataPath":"input.csv","column":"carbon_mg_g","metric":"mean","unit":"mg/g","missing":"drop","absoluteTolerance":1e-9}},"submission":"tool","resultType":"model-metrics","version":1,"inputs":["input.csv"],"outputs":["results/analysis.py","results/result.json","results/report.md"],"access":"workspace-exec","requireExecution":true,"requireReview":false}

### T3_review · 独立只读审阅实际文件、方法一致性与分析依赖
- 目标：逐字读取 results/analysis.py、results/result.json、results/report.md，核对：方法确为算术均值、仅丢 carbon_mg_g 缺失且未按 rain_mm 筛选、未填补、单位与声明一致、n 与缺失规则自洽、脚本可复现且未越权（无子进程/网络/第三方包/绝对路径）、报告与结果文件一致并如实列出局限；同时核查分析依赖（输入、执行方式、验收参数）是否被正确声明与满足。不写入任何文件，不改结果。
- 分工：review（独立只读审阅，与执行者分离）
- 输入：results/analysis.py
- 输入：results/result.json
- 输入：results/report.md
- 依赖：T2_analyze
- 验收：逐项给出 pass/fail 与文件内证据位置；对每个 fail 写明问题、影响与修复建议（交主会话决定，不自行修改）；结论须覆盖方法一致性、缺失规则、单位、n 与均值一致性、脚本可复现性与执行边界、报告完整性与局限；不产出任何文件。
- 独立审阅：是
- 执行者：review
- 执行契约：{"submission":"tool","resultType":"review","version":1,"inputs":["results/analysis.py","results/result.json","results/report.md"],"outputs":[],"access":"read-only","requireExecution":false,"requireReview":true}
