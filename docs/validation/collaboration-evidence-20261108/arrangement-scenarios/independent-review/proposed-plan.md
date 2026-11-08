## 问题与假设
隔离规划场景
## 数据与切分
自制输入
## 统计检验与模型
只规划不执行
## 图
未执行
## 产物
等待采纳

## 任务安排（自动安排）
执行方式：串行交接
安排理由：本地夹具按此场景的明确输入、依赖和审阅要求安排，不代表真实模型规划质量。
保留独立审阅：是
执行绑定：team-v1

### analyze · analyze
- 目标：analyze
- 分工：analyze
- 输入：input.csv
- 输出：metrics.csv
- 验收：声明输入、输出及证据必须可核对
- 独立审阅：否
- 执行者：scenario-worker
- 执行契约：{"submission":"tool","resultType":"model-metrics","version":1,"inputs":["input.csv"],"outputs":["metrics.csv"],"access":"workspace-write","requireExecution":false,"requireReview":false}

### review · review
- 目标：review
- 分工：independent reviewer
- 输入：metrics.csv
- 依赖：analyze
- 验收：声明输入、输出及证据必须可核对
- 独立审阅：是
- 执行者：scenario-reviewer
- 执行契约：{"submission":"tool","resultType":"review","version":1,"inputs":["metrics.csv"],"outputs":[],"access":"read-only","requireExecution":false,"requireReview":false}
