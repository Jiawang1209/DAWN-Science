# 复审后的实际效果

这些图来自本轮冻结代码的实际Electron/Pi/Python/文件/宿主验收；推理响应是localhost确定性夹具，CSV为合成数据，不是外部模型科研质量或费用实验。

- [数字错误被拦截](02-numeric-blocked.png)：实际CSV均值3，模型与文件都报999；宿主受阻，无review启动。[输入](input.csv)、[实际错误结果](numeric-error-result.json)、[回执](numeric-error-receipt.json)。
- [首批A完成/B受阻](03-source-blocked.png) → [派生批次决策卡](04-derived-decisions.png) / [完整界面](04-derived-full.png)：A保留原产物和审阅，B在新根执行。[实际汇总](derived-summary.json)、[请求及来源记录](incremental-electron.json)。
- [10条增量对照](../evaluation/incremental.md)：恢复阶段完整重跑20请求，局部重跑10请求，重复采用0新增模型请求；新增用户路线约束或环境变化时两项重跑，单项内容变化只重跑对应项。

分支验收：630文件6246项通过、11跳过；7个Electron场景通过。合并到main后另跑的实际效果保存在相邻 `main-demo/`，以本轮复审报告的集成记录为准。
