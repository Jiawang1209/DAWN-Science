# 终端右侧竖线检查

分支 `codex/terminal-reopen-context`，基线 `5979b98c`。不合并、不推送、不替换安装版。

用户截图中的灰色细线与绿色粗线来自 ScrollView 的 auto 字符滚动条：本地已安装 SDK 的 layout 绘制 `│` 作为轨道、`┃` 作为滑块，逐行替换最后一列；auto 模式没有为正文预留宽度。断续的字形看起来像显示残留，并可能盖住末列内容。

修复只关闭字符滚动条（scrollbar: hidden）。保留原 ScrollView、跟随模式、滚轮/触控板、翻页及回到底部；不修改第三方依赖、不删过滤正文里的竖线字符，Markdown 表格和代码不受该选项影响。

- 新回归先失败，headless 输出明确复现右侧灰色轨道和绿色滑块；修复后验证不再绘制，浏览旧记录期间新输出不抢走位置，Ctrl-End 仍到新回复。
- 相关 TUI、用量及图片/上下文坐标四文件 80 项通过。类型检查、构建通过；保留既有 chunk-size 提示。
- Electron CLI 文件六项全部通过，包括流式滚动与右缘无竖线断言、上下文按钮、工具、窄窗口和快照恢复。
- 最终构建的真实 Electron 已重启并恢复原试用会话；PageUp 后无字符滚动条，真实鼠标滚轮可继续改变视口，Ctrl-End 返回底部，原模型/累计统计/上下文按钮正常。
- 重启前重新核对并保存未发送输入快照，当时草稿已为空，没有代发用户输入。原会话和图片保留，主检出仍为干净的本地 main `0c96a5e9`。

预览标题：`DAWN Science · 终端滚动修复 · 分支预览`。独立预览目录 `/Volumes/RPython/DAWN-previews/main-20261024-0c96a5e9-3ff977` 保存 `terminal-right-edge-scrolled.png`、`terminal-right-edge-final.png`。
