# 自动换行与原脚本回写：main 合并复查

日期：2026-11-15。

功能分支 `codex/editor-word-wrap` 从 main `1f8231a5` 开始，合并前完成独立状态/算法审查及界面集成审查。修复后 main 快进至 `d1fec2f0`，功能分支保留，仅本地合并。

## 审查结论

审查覆盖自动换行、原 CodeMirror view/撤销栈、完整未保存上下文与精确选区、CRLF/UTF-16 位置、实际用户回合与 AI 回复的关联、原文件/会话/内核身份、差异模式、陈旧/重复/错误会话保护、原生模态及 R/Python 围栏大小写。

发现并修复一个显示问题：未保存草稿带入对话后，如果用户在等待回复时首次保存并确定文件路径，差异对话框仍显示请求时的旧文件名。实际应用始终指向同一文档，并未写错文件；现在通过独立的 `targetLabel` 属性显示原文档的当前路径，同时保持请求、基线和 prompt 不变，也不因路径显示变化重复计算差异。

新增完整组件回归先失败，修复后相关 6 个文件、186 条测试通过。首轮综合测试包含该回归在修复前的失败，其余 7451 条通过、10 条跳过；该轮不能作为最终通过证明。修复后的类型检查与界面构建通过，独立复审确认无剩余阻塞发现。

## 验证范围

合并后在 main 上重新验证完整构建、类型检查、Node/UI 综合测试，以及真实 Electron 中的编辑、保存、冲突恢复、撤销/重做、自动换行、完整/片段 AI 回写、CRLF、过期保护、补全、输入栏布局与真实 R/Python 执行、图形放大/历史/导出。

在 main `d1fec2f0` 上的新验证结果：

- `npm run typecheck` 与 `npm run build` 全部通过。
- `npm test -- --project node --project ui`：754 个文件通过，7452 条通过、10 条跳过，无失败。
- `npx playwright test e2e/code-editor-ai.spec.ts e2e/code-editor-wrap.spec.ts e2e/code-editor.spec.ts e2e/code-completion.spec.ts e2e/composer-single-row.spec.ts e2e/plot-gallery.spec.ts --max-failures=1`：14 条通过，无跳过。使用重新构建后的 main，所有用例在同一命令中串行完成。

本地日志：`/tmp/dawn-wrap-ai-main-post-typecheck.log`、`/tmp/dawn-wrap-ai-main-post-build.log`、`/tmp/dawn-wrap-ai-main-post-tests.log`、`/tmp/dawn-wrap-ai-main-post-e2e.log`。既有 direct-eval、大分片、jsdom canvas 与 Electron 重载取消提示仍记录在输出中，没有被当作新的失败或隐藏。临时日志不代替永久审查记录。

最后保留已提交的功能截图，撤销仅由这轮验收重生成的时间文字差异。合并后的补充提交只记录本次审查与验证，不包含额外运行时修改。

自动化中的模型回复使用隔离假服务，R/Python 执行使用真实本机内核；本次合并复查没有另发真实模型请求，也没有验证用户生产 SSH 服务器或发布安装包。此前真实 DeepSeek 的现场证据保留在 [功能验证记录](2026-11-15-editor-ai-revisions.md)。

完整上下文仍限制为 128 KiB，超限明确报错；每轮修改要重新带入最新草稿。编辑请求仅属于当前窗口；普通追问不自动复用已消耗的请求。保存冲突保护与原实现一致。此次合并复查使用隔离应用实例，保留用户正在体验的进程和草稿。
