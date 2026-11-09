# 本地合并前复审证据

审查报告：`docs/reviews/2026-11-10-contract-catalog-merge-review.md`。

- 红测：review-red.log（5项复现）、reconnect-parent-red.log、reconnect-stop-red.log、cancel-form-red.log、clear-feedback-red.log。
- 绿测：review-green.log、binding-freeze-green.log、scope-final-green.log、cancel-scope-green.log、fixes-final.log。
- 类型/构建：typecheck-verified.log、build-final.log。
- 固定源码：candidate-before-final-tests.json。完整回归：vitest-final.log；桌面最终日志另记。
- 第一轮桌面专项：desktop-first.log，确认/执行/重启保留1e-6容差，未确认修改明确反馈。截图 desktop/source/。
- 旧目录中由本次生成的33个未跟踪验收产物已迁到本轮实现证据根内，未丢弃证据；映射legacy-evidence-moves.json。
- 真实模型仍0请求，等待钥匙串的旧隔离宿主已停止，不自动重跑。当前审查不声称真实模型收益。

最终结果、main快进和正式profile核对在本地集成后补记。历史偶发退出超时和PTY清理继续OPEN，不改变预算。

最终合并前：729文件/7144通过/11跳过，类型与构建通过，23项相关Electron通过；源码/构建身份未变化。结论pre-merge-verdict.json，退出exit-summary.json。

本地main：源码提交 `ce3afbb4` 已快进合并，main类型/构建、60项关键测试和2项Electron复核通过，逐文件源码身份匹配，正式profile哈希未变。完整记录main-integration.json；实际main效果main-desktop/source/。原始退出跟踪仍完整保留在本机归档，见mainRawExitArchive。
