# 本地 main 集成验收

2026-11-12；基线 `0c5c627fa970c8e5f666aa506118654bb13a0423`，修复分支 `codex/lifecycle-date-boundaries-20261112@13eae293278ee04091d8eeb64a704d256a6a86e6`。

以 `--no-ff --no-commit` 合并，无冲突。在待合并的 main 上重新构建和验收；产品源码及测试与修复分支完全一致，12 个文件的 SHA-256 均与 `frozen-hashes.json` 一致，验收后仅整理文档。

| 检查 | main 上的最终结果 |
| --- | --- |
| 构建 / 类型检查 | 均退出 0 |
| 完整 node/UI | 736 文件，7284 通过、10 条环境条件跳过、0 失败 |
| 相关 Electron | 39 通过，0 跳过、0 不稳定重试 |
| 真实 Python/R 内核界面 | 6 通过，临时内核注册目录自动清理 |
| 完整视觉 | 14 通过，未更新快照或修改阈值、掩码、超时 |

相关 Electron 覆盖启动退出、恢复/续聊、调度新建及修改、输入框尺寸与布局、右键菜单、更新、技能发现、子代理/协作关闭及终端生命周期。内核界面实际执行 Python/R，覆盖报错、活会话、变量和解释器配置。

对应主进程日志中测试退出阶段的 `页面加载失败（-3）` 为窗口关闭时导航中止；所有断言通过且进程正常退出。原始输出完整保留，未作为失败日志删改。

证据：`unit-summary.json`、`main-e2e-summary.json`、`main-kernel-summary.json`、`main-visual-summary.json` 及同名文本日志。分支较早的 `e2e-frozen`/`kernel`/`visual` 结果仍保留，最终验收以 `main-*` 为准。

完整原始日志/JSON 已压缩保存至 `/Users/liuyue/.codex/audit-reports/dawn-science/2026-11-12-lifecycle-date-boundaries/`。测试产生的 10 个历史路径文件先归档、逐项 SHA-256 校验，再恢复原有跟踪文件并移除本轮临时生成文件；没有混入合并。

保留修复分支及工作区；只在本地 main 合并，不推送、不发布、不替换正式安装版，不扫描或改写正式任务库。外部服务与 Windows/Linux 真机未验收，完整范围限制见 README。
