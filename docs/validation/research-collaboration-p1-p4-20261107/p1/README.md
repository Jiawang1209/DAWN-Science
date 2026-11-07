# P1 离线验收与演示

离线实现与独立规格、质量复审通过。新增真实模型额度尚未获得，未发送真实请求，P1 的真实试验验收仍待完成。

当前选定演示：`d392cb56-bb9f-4b0a-b2d1-7ead6956e79e`。[完整报告](offline-d392cb56-bb9f-4b0a-b2d1-7ead6956e79e/research.md)、[冻结清单](offline-d392cb56-bb9f-4b0a-b2d1-7ead6956e79e/research-manifest.json)、[实际结果文件](offline-d392cb56-bb9f-4b0a-b2d1-7ead6956e79e/actual-result.json)。原始隔离根 `/tmp/dawn-p14-a-offline-demo-gFYFTb`；未递归复制转录/环境说明到本目录。早期 `offline/`、`offline-6caa…/` 候选报告保留，不能当作最新源码的验证。

| 演示 | 实际观察 |
|---|---|
| 四题、每题重复两次的单/多配对 | 16 条试验，8 个配对均通过独立核验。两臂各 6 次交付、2 次正确阻塞、0 次误验收。 |
| 实际 Python/文件交付 | carbon 任务输出 `n=41`、均值 `13.870731707317074`、单位 mg/g；输入保持、产物版本匹配。 |
| 缺失单位 | 只读核查后正式 blocked，不猜单位、不交付推断结果。 |
| 三种提交失败 | [脱敏精确格式记录](offline-d392cb56-bb9f-4b0a-b2d1-7ead6956e79e/submission-diagnostic-example.json)分别产生输出上限未执行 1、SDK 拒绝 1、宿主退回 1；不把未执行算成宿主拒绝。 |
| 缺失/截断/歧义转录 | `complete=false`，SDK 与输出上限计数缺失，显示未知，不显示零。 |
| 候选变化 | 源码、构建或模型配置变化后不启动后续臂；`comparisonEligible=false`、合格配对数不用于比较。 |

夹具矩阵没有请求硬门，`enforced=false`；单题配额门测试另验证 15+15、11+4 阶段分配与排空。夹具速度与 token 数均不能代表真实模型收益。

[定向测试](evidence/a-final-allowlist-tests.txt)：7 文件 **97/97**；[构建](evidence/a-reviewed-build.txt)通过。A1 独立复审 65/65，最终质量复审独立纯测试 72/72，无剩余阻断。首个失败及后续修复证据均在 `evidence/`，包括正则回溯、畸形记录、设置/别名/上下文冻结、额外字段白名单和排空后取样。

类型检查：`a-typecheck-final.txt` 是 B2 失败测试加入前的全项目通过记录；`a-typecheck-allowlist.txt` 已捕捉 B2 尚未实现的 service 五参数/释放方法测试错误。它不是最终全项目通过记录；B2 实现后需重新跑完整检查，不删除或掩盖这次失败。

新真实试验范围见[提案](live-proposal.md)：新增最多 30 次、单/多各 15，只有一个自制数据配对。获授权并完成后另建独占运行目录，不覆盖本报告。历史退出超时保持 **OPEN**；本阶段未进行新的 Electron 退出复验。

11 月 8 日补充：真实配对已在独立冻结候选完成，见 [A3 实际交付](live-delivery.md)。本页以上是早先离线证据，不能混称真实模型结果。真实使用 24/30 次，两边均交付正确；multi 额外完成独立审阅，但更慢且多用请求，原 SDK/工具失败均保留。
