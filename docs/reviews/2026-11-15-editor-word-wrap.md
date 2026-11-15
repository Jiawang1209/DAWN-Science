# 侧边代码编辑器自动换行

分支：`codex/editor-word-wrap`，基于 main `1f8231a5`。本轮仅实现显示折行开关，未合并 main 或推送。

顶部「自动换行」按钮默认开启，在当前窗口内跨编辑器重开、文档及语言保留选择。通过 CodeMirror Compartment 更新显示设置，保留当前 view、草稿文本、CRLF/LF、选区和撤销栈；关闭时恢复代码区内部横向滚动。中文和英文名称、按钮按下态均已提供。

验证：

- 新增组件回归先因缺少开关而失败，随后通过；覆盖有编辑历史和 CRLF 的草稿在反复切换后仍逐字一致、选区运行提交原文、撤销能返回原文本，以及重开/跨语言保留选择。
- `npx vitest run tests/ui/code-editor.test.tsx tests/ui/code-editor-state.test.ts tests/ui/code-editor-extensions.test.ts tests/ui/i18n.test.ts tests/ui/design-contract.test.ts --project ui`：5 个文件，160 条通过。
- `npm run typecheck`、`npm run build:ui`、`git diff --check` 通过。
- `npx playwright test e2e/code-editor-wrap.spec.ts e2e/code-editor.spec.ts e2e/code-completion.spec.ts e2e/composer-single-row.spec.ts --max-failures=1`：8 条真实 Electron 验收全部通过。包含长行折行/恢复横向滚动、1080px 窗口工具栏可操作、关闭重开保留选择、脚本原文一致，以及已有保存冲突恢复、真实 Python 选区运行、补全、主题和输入栏单行回归。
- 查看截图 `output/playwright/code-editor/word-wrap.png`：长逻辑行跨多行显示，下一条语句仍为逻辑行 2；工具栏和聊天输入均可见。
- 现有真实模型体验实例只刷新渲染界面，刷新前备份并恢复全部 4 个文档、活动文档映射、选区和对话输入；逐文档比较文本、路径、保存基线和版本一致。保持既有后端及内核运行。

UI 测试的 jsdom 不执行真实文本布局，组件测试验证折行 class 及编辑完整性；几何行为由 Electron 验收覆盖。既有大分片、direct-eval、jsdom canvas 或重载取消提示没有被隐藏，本轮没有发布打包或生产服务器验证。

后续协作需求另行跟进：让「带入对话」携带当前完整草稿、选区与文档身份，AI 修改经差异确认后应用回原脚本。本次换行开关不表示该回写流程已经实现。

后续进展：该回写流程现已在同一分支实现并验证，见 [对话修改应用回原脚本](2026-11-15-editor-ai-revisions.md)。
