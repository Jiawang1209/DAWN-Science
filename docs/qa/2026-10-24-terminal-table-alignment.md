# 终端中文表格边框对齐

日期：2026-10-24；分支 `codex/terminal-reopen-context`；基线 `b7c045d5`。

- 复现用户的“情况 / 建议”原始表格。Markdown 生成的列宽和 headless 终端占格一致；偏差出现在 Electron 的 DOM 字符显示层。
- xterm 通过连续 32 个相同字符测量字宽，浏览器默认中文标点压缩使重复标点的测量宽度与实际单个字符不同。`，、（）` 后面的边框因此逐次偏移；真实 Electron 回归在修复前测得至少 5.71875 CSS 像素的偏差。
- 仅对 `.term-host .xterm` 设置 `text-spacing-trim: space-all` 和 `text-autospace: no-autospace`，让测量与显示都遵守终端格宽。保留原 Markdown 表格、原会话和自动换行，不改模型回答内容或第三方依赖。
- 新增真实像素位置回归：检查原表格所有行的三条纵向边界在同列；缩窄窗口后等待实际出现多行单元格，继续检查边框对齐和右侧不溢出；输入草稿仍只有一个编辑器。
- 完整终端交互 8 项通过；随后加强窄窗重排等待条件，单独再次运行该回归通过。类型检查、UI 构建通过。
- 原会话实际预览的宽窗 11 行表格最大偏差 0.328125 CSS 像素，窄窗 15 行表格最大偏差 0.2890625 CSS 像素。已检查两张截图，并恢复原窗口尺寸和原 DAWN 会话。
- 预览样式来自本次真实 UI 构建，重建终端视图使旧字宽缓存失效；没有重启 Agent 或发送新消息。保留其他终端、当前主题及归档状态。
- 截图位于 `/Volumes/RPython/DAWN-previews/main-20261024-0c96a5e9-3ff977`：`terminal-table-aligned-wide.png`、`terminal-table-aligned-narrow.png`。
- 构建有既有大分块提示；Electron 夹具有既有 Bot 恢复日志。未合并、推送或替换安装版。
