计算全部4行 carbon_mg_g 的算术均值，单位 mg/g。重复site表示重复观测，不得按site去重或只保留第一行；Python stdlib 脚本、result.json 和报告。
科研模板 tabular-ecology@1；语言 python；用户已批准方法：arithmetic mean。
单位规则：mg/g。缺失值规则：drop NA in target column only。
核查输入结构、方法适用条件及证据缺口；条件不足须 blockers，不猜测单位、填补缺失或编造数据。
需要受控环境复用时，Python 使用 python3 -I 声明脚本路径 的单一命令；宿主绕过 shell 启动隔离解释器，等待非守护线程与退出回调收尾。该同步模式禁止创建子进程；本地代码/数据须列入 inputs，未声明文件或外部依赖不签发复用证明。需要子进程时交还主会话选择普通执行，不能自动改命令重试。R 沿用普通执行与验收，暂不签发依赖及生命周期未完整核实的复用证明。
按约定方法执行并保留可复现脚本；报告须列输入、处理、结果及局限。独立审阅核查实际文件及方法一致性。输出：results/analysis.py、results/result.json、results/report.md
宿主验收规则：{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json","numeric":{"version":1,"dataPath":"input.csv","column":"carbon_mg_g","metric":"mean","unit":"mg/g","missing":"block","absoluteTolerance":1e-9}}；result.json 使用平铺对象 {n:正整数,unit:单位字符串,指标名:有限数值}，须与正式 data.metrics 和 sampleCount 一致。

## 问题与假设
自制科学任务
## 数据与切分
input.csv
## 统计检验与模型
按原方法
## 图
未生成
## 产物
`results/analysis.py`
`results/result.json`
`results/report.md`

## 任务安排（自动安排）
执行方式：科研流水线
安排理由：保留独立审阅；单位不明时先核查，其他任务仅保留所需分析与审阅。
保留独立审阅：是
执行绑定：team-v1

### analyze · analyze
- 目标：按冻结科学契约完成当前阶段
- 分工：analyze
- 输入：input.csv
- 输出：results/analysis.py
- 输出：results/result.json
- 输出：results/report.md
- 验收：既有宿主证据与版本验收
- 独立审阅：否
- 执行者：analyze
- 执行契约：{"acceptance":{"version":1,"kind":"tabular-ecology","scriptPath":"results/analysis.py","reportPath":"results/report.md","resultPath":"results/result.json","numeric":{"version":1,"dataPath":"input.csv","column":"carbon_mg_g","metric":"mean","unit":"mg/g","missing":"block","absoluteTolerance":1e-9}},"submission":"tool","resultType":"model-metrics","version":1,"inputs":["input.csv"],"outputs":["results/analysis.py","results/result.json","results/report.md"],"access":"workspace-exec","requireExecution":true,"requireReview":false}

### review · review
- 目标：按冻结科学契约完成当前阶段
- 分工：review
- 输入：results/analysis.py
- 输入：results/result.json
- 输入：results/report.md
- 依赖：analyze
- 验收：既有宿主证据与版本验收
- 独立审阅：是
- 执行者：review
- 执行契约：{"submission":"tool","resultType":"review","version":1,"inputs":["results/analysis.py","results/result.json","results/report.md"],"outputs":[],"access":"read-only","requireExecution":false,"requireReview":true}
