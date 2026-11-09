# 本轮交付与证据

计划：`docs/superpowers/plans/2026-11-09-contract-catalog-recheck.md`。本轮只覆盖真实收益复验、可信科研契约目录生产接入及必要入口反馈；完整会话轨迹另行开展。

## 日常使用的变化

在对话协作台的“自动安排”中展开“科研任务约束”，确认输入、方法、单位、缺失处理、产物目录和可选数值核验/独立审阅。确认只写会话元数据；随后生成安排，模型只读查询当前契约并引用，用户采纳后沿原执行、文件版本和科学验收运行。

来源或路线变更会使旧未批准方案失效；已批准任务保留原冻结快照。约束草稿和展开状态在当前窗口按会话/来源修订保留，已确认来源可在Electron重启后恢复。不再要求模型手抄完整科研验收字段，任务数量仍由具体任务决定。

## 已验证

- A基线：`a-baseline/`，6个离线合格配对，缺单位 awaiting-info 单独保留，不计成功交付。
- B产品与专项：`b-product/`；`desktop/confirmed-source-wide.png`、`catalog-bound-plan.png`、`expanded-workflow.png`、`restored-source.png` 是真实候选Electron截图，本地模型模拟，文件/实际Python/版本验收真实运行。
- 离线对照：`b-product/offline-comparison.json`，改前/后均6个合格配对，5道单位明确题的自动组各增加1次推理请求；不声称减少成本。独立Python只读检查12个试验目录通过。
- C最终离线：`c-frozen/`，完整Vitest 728文件，7135通过/11跳过；类型/构建通过；23项相关Electron通过；固定清单 `candidate-final.json`。
- 自审：`docs/reviews/2026-11-09-contract-catalog-recheck.md`，记录兼容、来源失效、路线、草稿和恢复等发现与修复。red失败证据完整保留。

## 真实复验尚在进行

用户已授权本轮最多300次，见 `authorization.json`。新宿主使用原只读凭证入口；此前等待macOS钥匙串，真实请求0/300；2026-11-10复审前已停止旧隔离宿主，不自动重启。未生成真实模型结果，不能用模拟截图或离线分数代替收益结论。进度 `d-live/status.json`，不会自动重跑。

## 历史问题与交付边界

历史偶发退出超时、长Bot/MCP收尾与PTY清理继续OPEN，1500/4000ms预算未改。`c-frozen/exit-summary.json` 的35次正常退出样本不构成这些历史问题已解决的证据。

2026-11-10用户已授权复审通过后本地提交并合并main；当前集成进度见 `docs/validation/contract-catalog-review-20261110/`。不推送、发布或替换正式App。正式profile三文件哈希仍与基线一致。

复审前派生宿主和失败追踪zip已完整迁到本机独立归档，位置和SHA见 `docs/validation/contract-catalog-review-20261110/local-derived-archive.json`，不入本地提交。恢复真实复验时须从新的main源码重建并重新记录候选身份，不能复用这个旧包。可审阅的错误日志、截图和摘要纳入提交。

复审源码 `ce3afbb4` 已本地合并main；最终审查、main实机截图及验证见 `docs/validation/contract-catalog-review-20261110/`。未推送、发布、替换正式App；真实模型复验0/300，旧等待宿主已停止。
