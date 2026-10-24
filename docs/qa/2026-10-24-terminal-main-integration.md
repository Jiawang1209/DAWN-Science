# 终端集成本地 main 验证

日期：2026-10-24。`codex/terminal-reopen-context` 从 `0c96a5e9` 快进合并到本地 main，功能集成提交为 `834a0758`。

- main 主目录补齐与已验证开发工作树相同的本地依赖；首次缺少 `@xterm/addon-search` 的构建/类型错误已解决，未修改依赖锁文件。原依赖目录保留在忽略的 `tmp/main-dependency-recovery` 中。
- 在 main 本身重新完成完整构建和类型检查；全量 **494 文件、5201 项通过、10 项跳过**。既有 JSDOM canvas 提示及构建 eval/分块提示保留，未视为功能通过证据。
- 在 main 本身再跑历史恢复、空终端返回、会话返回 **11 项真实 Electron 回归全部通过**；包括原图延续、桌面重启、目录隔离、最后一个终端关闭与重开、原会话身份和上下文。
- 此前分支完整 45 项终端场景检查与高亮夹具颜色修正后的单项重跑结果见 `2026-10-24-terminal-merge-review.md`。
- 关闭旧分支预览 PID 13591；新预览 PID 3962，窗口为“DAWN Science · main · 开发预览”，渲染入口为主目录 `dist/ui/index.html`，启动入口为主目录 `dist/electron/main.js`。
- 沿用原隔离 profile 和 workspace。原 4 轮试用会话 ID `0e856412-bd24-4d1f-8717-0857aca07dc2`、模型 deepseek-flash 及归档状态保留；原配置和凭证文件哈希未变。
- 实际 main 预览中让 Shell 返回非零状态、显示右提示 `1 ↵`，仍可直接通过历史选择器恢复原会话；不再手动输入恢复命令绕过。再次关闭最后一个终端、返回原会话、直接打开终端并恢复原对话，用户轮数保持 4，无需先点 GUI 重新连接。
- 使用原历史回答验证 Python 和 R 语法色、Markdown 语言围栏与缩进，已检查真实截图 `main-python-highlight.png`。没有向真实模型发送新问题。
- 新预览目录 `/Volumes/RPython/DAWN-previews/main-20261024-834a0758-terminal`，保留旧数据目录作为 profile/workspace 来源。只有最新 main 的试用预览存活。
- 旧版本已落盘为成功的失败回执不会被猜测性回填；新回执的失败标记及恢复由真实 SDK 测试保证。
- 没有推送、创建远程 PR 或替换安装版。
