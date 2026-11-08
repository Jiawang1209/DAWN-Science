计算 temperature_c 的算术均值，单位 °C；输入 4 行、不能丢弃样本。使用 Python stdlib，交付脚本、result.json 和报告。
科研模板 tabular-ecology@1；语言 python；用户已批准方法：arithmetic mean。
单位规则：°C。缺失值规则：drop NA in target column only。
核查输入结构、方法适用条件及证据缺口；条件不足须 blockers，不猜测单位、填补缺失或编造数据。
需要受控环境复用时，Python 使用 python3 -I 声明脚本路径 的单一命令；宿主绕过 shell 启动隔离解释器，等待非守护线程与退出回调收尾。该同步模式禁止创建子进程；本地代码/数据须列入 inputs，未声明文件或外部依赖不签发复用证明。需要子进程时交还主会话选择普通执行，不能自动改命令重试。R 沿用普通执行与验收，暂不签发依赖及生命周期未完整核实的复用证明。
按约定方法执行并保留可复现脚本；报告须列输入、处理、结果及局限。独立审阅核查实际文件及方法一致性。输出：results/analysis.py、results/result.json、results/report.md
宿主验收规则：{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json","numeric":{"version":1,"dataPath":"input.csv","column":"temperature_c","metric":"mean","unit":"°C","missing":"block","absoluteTolerance":1e-9}}；result.json 使用平铺对象 {n:正整数,unit:单位字符串,指标名:有限数值}，须与正式 data.metrics 和 sampleCount 一致。

## 问题与假设

问题：对 `input.csv` 中 `temperature_c` 列计算算术均值，单位 °C，交付脚本、结果与报告。

已读到的输入（只读核查，未执行分析）：
- `input.csv` 表头 `site,temperature_c`，4 行样本：A=14、B=18、C=22、D=26。
- 目标列 4/4 非缺失，故「drop NA in target column only」规则本轮不触发任何删除；行数保持 n=4，不丢样本。

假设与边界：
- 单位按用户指定的 °C 记录，不另行推断原始量纲。
- 采用用户已批准的 arithmetic mean（算术平均，等权，含全部 4 个观测）。
- 缺失值规则为 block（宿主验收）：若执行时发现目标列存在非数值/缺失，则以此前结构核查结论为准判定，不做插补、不静默删行；出现该情形即记 blockers 而非猜测。
- 合理性区间：均值必须落在观测最小值 14 与最大值 26 之间（用于脚本内断言，不作为结果预设）。

证据缺口：本次为自制数据，无需外部来源引用；缺口仅为「不经实际执行无法确认脚本可运行、JSON 与宿主正式 metric 一致」，由分析任务实际运行补齐。

## 数据与切分

- 单一数据源：`input.csv`（4 行 × 2 列），不涉及切分、抽样、加权或分组。
- 不做训练/测试划分；全样本参与统计。
- 不引入外部数据、网络请求或第三方包。

## 统计检验与模型

- 统计量：算术均值 mean = Σx / n，n = 4（非缺失目标值个数）。
- 无假设检验、无模型拟合；仅点估计，不报告推断区间（n=4 且为自制数据，不做显著性/置信区间声明）。
- 实现：Python stdlib 单脚本（`csv` + 内置算术），结果按有限浮点写出，与宿主 `absoluteTolerance=1e-9` 的 mean 校验对齐；脚本内断言 n 为正整数、均值有限且落在 [min, max]。
- 执行方式（受控环境复用）：单一命令 `python3 -I results/analysis.py`，隔离解释器直接启动脚本；脚本内**不创建子进程**、不 spawn、不写临时执行器，仅读 `input.csv`、写三个交付文件。外部依赖为零；`results/analysis.py` 由该任务自身生成，属任务内产物而非外部输入。
- 若宿主在本模式下不予签发复用证明或要求改为普通执行，则退回普通执行验收，不自动改命令重试、不放宽科学契约。

## 图

本任务不产出图。理由：n=4 的单一均值估计，任何图形都不承载超出数字本身的证据；避免生成只为装饰的图件。

## 产物

- `results/analysis.py`：可复现脚本，读 `input.csv`，计算 `temperature_c` 算术均值（单位 °C），打印并写出 `result.json`；含 n、有限性、区间断言。
- `results/result.json`：平铺对象 `{ "n": 4, "unit": "°C", "mean": <数值> }`，键含义与正式 `data.metrics`（mean）及 `sampleCount` 一致，不嵌套、不加多余字段。
- `results/report.md`：列明输入（文件、列、行数、缺失情况）、处理（算术均值、等权、未删样本）、结果（n、单位、均值）、局限（无推断统计、单位由用户指定、自制小样本不外推），并给出复现命令。

## 任务安排（自动安排）
执行方式：串行交接
安排理由：单列算术均值是单一统计量的最小任务：先只读核查输入结构与方法适用条件（含缺失/单位/证据缺口），再由唯一分析任务在同一任务内产出脚本、JSON 与报告并以 python3 -I 单命令实际运行，最后交由独立只读审阅核对实际文件与方法、单位、n 一致性。三块按依赖串行：核查结论是分析前提，审阅必须基于已生成的真实产物；不再额外拆块。
保留独立审阅：是
执行绑定：team-v1

### check-input · 只读核查输入结构、方法适用条件与证据缺口
- 目标：读取 input.csv，核实行列结构、temperature_c 列类型与非缺失计数、是否存在被错误当作 0 或空值的样本、单位是否有歧义证据；确认 arithmetic mean 在本数据结构下可计算（目标列为数值型、n>0），并列出证据缺口。若发现缺失、非数值、单位冲突或行数与 4 不符，写明确 blockers，不给替代数值、不插补。不修改任何文件。
- 分工：核查者（只读）
- 输入：input.csv
- 验收：回执给出：列名与类型、行数、目标列非缺失计数、最小值/最大值、缺失规则是否触发、arithmetic mean 适用性结论、证据缺口清单；无文件写入；结论与实际 input.csv 内容一致。
- 独立审阅：否
- 执行者：check
- 执行契约：{"submission":"tool","resultType":"data-summary","version":1,"inputs":["input.csv"],"outputs":[],"access":"read-only","requireExecution":false,"requireReview":true}

### analyze-mean · 计算 temperature_c 算术均值并交付脚本、result.json、报告
- 目标：依据 {check-input} 的结构结论，在 results/ 下写 analysis.py（Python stdlib，仅 csv 与内置算术，读 input.csv，按 block 缺失规则处理目标列，计算等权算术均值，单位 °C，含 n>0、均值有限且落在观测区间的断言，不创建子进程），并以单命令 python3 -I results/analysis.py 实际运行生成 results/result.json 与 results/report.md。result.json 为平铺对象 {n:正整数, unit:"°C", mean:有限数值}，与正式 data.metrics 的 mean 及 sampleCount 一致。报告列输入、处理、结果、局限与复现命令。不得插补缺失、不得改单位、不得删行。
- 分工：分析执行者
- 输入：input.csv
- 输出：results/analysis.py
- 输出：results/result.json
- 输出：results/report.md
- 依赖：check-input
- 验收：三个文件均真实生成且内容自洽：analysis.py 可被 python3 -I 直接运行且不 spawn 子进程；result.json 为平铺三键对象，n 等于实际参与计算的样本数（4），unit 为 °C，mean 为有限数值且等于脚本实际输出，与宿主 mean 校验在 1e-9 内；report.md 覆盖输入、处理、结果、局限。
- 独立审阅：否
- 执行者：analyze
- 执行契约：{"acceptance":{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json","numeric":{"version":1,"dataPath":"input.csv","column":"temperature_c","metric":"mean","unit":"°C","missing":"block","absoluteTolerance":1e-9}},"submission":"tool","resultType":"model-metrics","version":1,"inputs":["input.csv"],"outputs":["results/analysis.py","results/result.json","results/report.md"],"access":"workspace-exec","requireExecution":true,"requireReview":false}

### independent-review · 独立只读审阅实际产物与方法一致性
- 目标：独立重读 input.csv 与 {analyze-mean} 的 results/analysis.py、results/result.json、results/report.md，核对：脚本是否真的读 input.csv 并只用 stdlib；缺失规则是否为 block 且未插补/删行；单位是否恒为 °C 未被改写；n 是否等于实际样本数；JSON 是否平铺且 mean 与脚本输出、正式 data.metrics 数值一致；报告是否如实列出输入、处理、结果、局限，并覆盖上游核查（check-input）关于结构、适用条件与证据缺口的结论与脚本依赖的文件/命令。指出任何不一致或未证据化的声明。只读，不改文件、不用自己重算的结果替换原产物。
- 分工：独立审阅者（只读）
- 输入：results/analysis.py
- 输入：results/result.json
- 输入：results/report.md
- 依赖：analyze-mean
- 验收：回执逐项给出：脚本依赖核查结论、方法与单位一致性、n 与缺失规则一致性、JSON 结构与数值一致性、报告完整性与局限声明；明确 reviewed 或 issues，issues 须定位到具体文件与位置；无文件写入。
- 独立审阅：是
- 执行者：review
- 执行契约：{"submission":"tool","resultType":"review","version":1,"inputs":["results/analysis.py","results/result.json","results/report.md"],"outputs":[],"access":"read-only","requireExecution":false,"requireReview":true}
