请求报告 carbon 的带单位均值，但原始文件和用户均没有提供单位。单位是交付必要条件；不能从数值或邻列猜测。条件不足须正式提交 blockers，不能交付推断结果。保留原始文件。
科研模板 tabular-ecology@1；语言 python；用户已批准方法：arithmetic mean。
单位规则：未提供，必须阻塞，不能猜测。缺失值规则：drop NA in target column only。
核查输入结构、方法适用条件及证据缺口；条件不足须 blockers，不猜测单位、填补缺失或编造数据。
需要受控环境复用时，Python 使用 python3 -I 声明脚本路径 的单一命令；宿主绕过 shell 启动隔离解释器，等待非守护线程与退出回调收尾。该同步模式禁止创建子进程；本地代码/数据须列入 inputs，未声明文件或外部依赖不签发复用证明。需要子进程时交还主会话选择普通执行，不能自动改命令重试。R 沿用普通执行与验收，暂不签发依赖及生命周期未完整核实的复用证明。
按约定方法执行并保留可复现脚本；报告须列输入、处理、结果及局限。独立审阅核查实际文件及方法一致性。输出：results/analysis.py、results/result.json、results/report.md
宿主验收规则：{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json"}；result.json 使用平铺对象 {n:正整数,unit:单位字符串,指标名:有限数值}，须与正式 data.metrics 和 sampleCount 一致。

## 问题与假设

**任务**：报告 carbon 的均值，且必须带单位。已批准方法 arithmetic mean；缺失值规则为「仅对目标列 drop NA」。

**输入事实**（只读核对 `input.csv`）：3 列 `site,carbon,rain_mm`，48 条数据行；`carbon` 为数值列且含字面量 `NA`；`rain_mm` 是降雨毫米，不构成 carbon 的单位来源。

**假设与判定**
1. 目标变量为 `carbon`；`site` 仅作标识，不参与计算。
2. `NA` 为缺失标记；按批准规则只对 `carbon` 做 drop-NA，不填补、不换算、不删改其他列。
3. 单位信息在全部已声明输入中不存在：文件头无单位字段，也没有任何元数据/说明文件被声明为输入。从数值量级或邻列反推单位属于禁止的猜测，本方案不做。
4. 结论是「可计算、不可交付」：算术均值可算并留证，但「带单位」的交付条件不成立，必须正式提交 blockers，不得输出带推断单位的结果。
5. 成功标准：脚本可复现；报告写明输入/处理/结果/局限；`result.json` 通过宿主 schema；单位缺口以 blockers 形式如实登记；不改原始文件、不编造单位、缺失值或数据行。

## 数据与切分

- 数据仅 `input.csv`，只读，保留原文件；不在 `data/raw/` 或别处写入，产物只落 `results/`。
- 全样本描述性汇总，**无切分**：不设训练/测试集、不做交叉验证（非预测建模）。
- 有效样本量 n = `carbon` 非缺失值个数；报告 n 与剔除条数，若与结构核查不符则停止并说明。
- 不做单位换算或依赖单位的量级变换（未知单位即不可换算）；`rain_mm` 保持原样、不参与计算、不作单位线索。

## 统计检验与模型

- 点估计：对 `carbon` 非缺失值取 arithmetic mean，等权、无截尾、无插补、无变换。
- 附带纯描述量：n、剔除数、min/max/median/sd，同样标注「单位未提供」，仅作数据面貌说明。
- 不做显著性检验、不拟合模型、不声称区间估计。
- **方法适用性**：算术平均要求可加尺度的数值，该列解析为数值且连续，方法可执行；单位未知属交付层阻塞而非算法层错误，报告分开陈述。
- **正式 blockers**：BLOCK-1 `input.csv` 无单位字段；BLOCK-2 已声明输入中无任何单位元数据；BLOCK-3 后果——无法产出合规的「带单位均值」，不猜单位、不借用 `rain_mm`、不写「g C m⁻²」类常见默认。处理约定：`result.json` 仍按宿主 schema 平铺 `{n, unit, mean_carbon}`，`unit` 只写客观状态字符串（如 `not_provided`），不写具体计量单位；报告开头即声明交付阻塞。
- **可复现与校验**：脚本一次性读入 `input.csv`、显式声明 NA 识别、输出 n/均值/剔除数；审阅方独立从原始文件重算 n 与均值，并核对脚本未引入单位字符串、未插补、未改原始数据。
- **执行环境**：不申请受控环境复用证明（无已知 fingerprint），按普通执行运行；不使用需 `python3 -I` 单一命令的同步隔离模式（该模式禁子进程且未在此声明本地脚本），故不扩大 `inputs`。

## 图

不产出图。单位缺口未解决时，任何以 carbon 为纵轴的图都是无单位刻度，读者容易默认某种单位，反而制造误导；图形也不改变 blockers 结论。用户补齐单位后可在单独任务补描述性分布图，不在本次范围。

## 产物

- `results/analysis.py` — 只读加载 `input.csv`，按「仅目标列 drop NA」算 arithmetic mean，输出 n、剔除数、均值与单位状态；不写原始数据、不含推断单位。
- `results/result.json` — 平铺对象 `{n: 正整数, unit: "not_provided", mean_carbon: 有限数值}`，与报告数字及宿主 `data.metrics`/`sampleCount` 一致。
- `results/report.md` — 输入与结构核查、处理方法与 NA 规则、n 与均值、单位缺失的正式 blockers、局限（不可物理解释、不可跨数据集比较）。

## 任务安排（自动安排）
执行方式：串行交接
安排理由：单一输入文件、单一算式，产物互不重叠；结构核查与单位缺口可在分析任务内一次判定，另设 check 只会重复取数，故只保留「分析→独立只读审阅」两块。审阅必须覆盖分析依赖（脚本、结果、报告）并独立重算与核对未推断单位。
保留独立审阅：是
执行绑定：team-v1

### A1 · 按 arithmetic mean 计算 carbon 均值并正式登记单位缺失 blockers
- 目标：只读 input.csv（site,carbon,rain_mm，48 行，carbon 含 NA），仅对 carbon 列 drop NA 后计算算术均值，写可复现脚本、result.json 与报告；单位未提供必须作为正式 blockers 登记，unit 字段只写 not_provided，绝不推断单位或借用 rain_mm，不插补、不改原始文件。
- 分工：分析执行（唯一产物任务）
- 输入：input.csv
- 输出：results/analysis.py
- 输出：results/result.json
- 输出：results/report.md
- 验收：results/analysis.py 一次性读入 input.csv 并显式处理 NA；result.json 为平铺 {n, unit, mean_carbon}，n 为正整数、mean_carbon 有限、unit 为 not_provided；report.md 列输入、处理、结果、blockers 与局限；原始 input.csv 未被修改；报告中无任何具体计量单位被赋予 carbon。
- 独立审阅：否
- 执行者：analyze
- 执行契约：{"acceptance":{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json"},"submission":"tool","resultType":"model-metrics","version":1,"inputs":["input.csv"],"outputs":["results/analysis.py","results/result.json","results/report.md"],"access":"workspace-exec","requireExecution":true,"requireReview":false}

### A2 · 独立只读审阅：核对文件、方法一致性与未推断单位
- 目标：只读审阅 results/analysis.py、results/result.json、results/report.md，并从 input.csv 独立重算 n 与算术均值；确认方法为 arithmetic mean、NA 仅从 carbon 剔除、单位缺口以 blockers 记录且全文未赋予 carbon 具体单位、原始文件未被改动。
- 分工：独立审阅
- 输入：results/analysis.py
- 输入：results/result.json
- 输入：results/report.md
- 依赖：A1
- 验收：给出独立重算的 n 与均值并与 result.json 比对；逐项判定方法一致性、NA 规则、单位未推断、原始文件完整；结论为通过或列出具体问题。
- 独立审阅：是
- 执行者：review
- 执行契约：{"submission":"tool","resultType":"review","version":1,"inputs":["results/analysis.py","results/result.json","results/report.md"],"outputs":[],"access":"read-only","requireExecution":false,"requireReview":true}
