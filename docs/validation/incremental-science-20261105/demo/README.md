# 这轮改动的真实效果

以下来自隔离测试项目中的真实 Electron、Pi/Python、文件和宿主验收。模型响应来自确定性 localhost 夹具；CSV 是合成样本，不代表真实模型或科学实验结论。没有替换安装应用。

1. [仅基础验收](01-basic-only.png)：同一个错误结果 999，在未配置数值规则时只能报告结构检查通过，界面明示“数值核验未配置”。
2. [数值规则拦截](02-numeric-blocked.png)：输入 1、2、3、4、5 m，宿主独立计算 3；结果文件与正式回执的 999 都被拦截，没有启动 review。可直接查看 [CSV](input.csv)、[错误 JSON](numeric-error-result.json)、[真实回执](numeric-error-receipt.json)。
3. [首批 A 完成、B 受阻](03-source-blocked.png)。
4. [派生批次决策卡](04-derived-decisions.png)、[完整界面](04-derived-full.png)：A 引用原产物和历史审阅，本次不执行；B 使用新根目录重新执行。[控制与请求记录](incremental-electron.json)、[实际汇总](derived-summary.json) 可打开核对。旧批次文件字节保持不变。

完整重跑与局部重跑采用相同故障前置，比较恢复后的实际请求与执行，见 [增量对照](../evaluation/incremental.md) 和 [JSON](../evaluation/incremental.json)。Electron 的请求计数包含主会话控制；评测脚本直接调工具，分别记录，不混用。

复现：先 `npm run build`，再运行 `npx playwright test e2e/science-acceptance.spec.ts e2e/science-incremental.spec.ts`；完整对照运行 `npm run evaluate:science`。验收脚本不读取真实模型密钥，不调用远端推理。

后续迭代交付沿用：展示实际界面或运行输出、说明前后行为、提供可打开的产物与测试证据；不以代码行数或测试数量代替效果。
