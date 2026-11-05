# main合并后的真实运行效果

代码提交0f8daea2，从main重新构建后跑实际Electron/Pi/Python/文件与宿主验收。数据为合成CSV，推理响应来自localhost夹具；不读取真实提供商凭证，不替换安装应用。

- [错误数值被拦截](02-numeric-blocked.png)：输入1..5的均值为3，文件和模型都写999；宿主受阻，无审阅任务启动。[输入](input.csv)、[结果](numeric-error-result.json)、[宿主回执](numeric-error-receipt.json)。
- [首批受阻](03-source-blocked.png) → [A复用、B重跑](04-derived-decisions.png) / [完整界面](04-derived-full.png)。原Team文件字节不变；只产生1项新的分析执行。[汇总JSON](derived-summary.json)、[来源与实际请求](incremental-electron.json)。
- Electron统计包含主会话控制；[成对评测](../evaluation/incremental.md)直接调用工具，因此分别记录恢复阶段20/10次请求，不将这两种计数混用。

main类型检查、完整构建、15文件104测试及3个Electron场景通过；分支全量630文件6246项通过、11跳过，另有7个完整科研Electron场景通过。仅支持本次工程验证，不支持真实模型科学质量或费用结论。
