# 终端历史搜索检查

日期：2026-10-24；分支 `codex/terminal-reopen-context`；基线 `8802b2e9`。

## 已完成

- 顶栏新增“搜索历史”和“找回输入”。搜索当前终端保留的对话和输出，找回输入只填草稿，不发送。
- DAWN：复用原 TUI 全文索引和匹配定位，桌面 ⌘/Ctrl+F 打开；Enter/Shift+Enter 切换匹配，Esc 关闭。独立 CLI 使用 Ctrl+Shift+F。
- DAWN 输入历史：Ctrl+R 或顶栏按钮打开；关键词筛选、上下键选择，Enter 填回完整原文，Esc/Ctrl+C 取消。支持中文、多行和恢复的原用户输入。只保留最近 100 条去重输入，不收录模型、工具和权限回答。
- Normal：官方 `@xterm/addon-search@0.16.0` 搜当前 xterm 滚屏，显示匹配数、上下个、无结果；关闭后回到 Shell 草稿。Ctrl+R 交给原 Shell，不读写其历史文件。
- 搜索时保护已有草稿，屏蔽误发送/停止。浮层期间隐藏图片 DOM 装饰，关闭后恢复原图；Ctrl+L 仍能重发搜索状态所在的完整界面。
- 模式切换和 A→B→A 切换清理旧搜索请求，避免再次发送 Ctrl+R。保留终端包装层在主区与 dock 的满高布局。

## 自动验证

- 新回归先失败再修复：历史筛选/采纳、草稿和恢复、图片遮挡、A→B→A 旧请求、搜索中刷新、缩放后匹配索引未选中。
- 扩展检查：20 文件 230 项通过；随后刷新和计数修正的最终聚焦 3 文件 37 项通过。
- 类型检查、完整构建、最终 UI 构建通过。
- 实际 Electron：PTY 2 项、历史恢复 6 项、图片 4 项、搜索 3 项，共 15 项通过；另跑 CLI 交互 7 项及搜索 3 项共 10 项通过；最终 UI 计数调整后再跑搜索 3 项通过。搜索测试使用长正文，确认先前用户输入已不在屏幕上，再搜索定位。
- Normal 使用实际默认 Shell；其反向搜索可能显示 `bck-i-search` 或 `reverse-i-search`，两种提示均接受。
- 测试仍输出既有 jsdom canvas 提示、Bot 夹具恢复提示；构建仍有既有 eval 和大分块警告。

## 真实预览验证

独立预览目录：`/Volumes/RPython/DAWN-previews/main-20261024-0c96a5e9-3ff977`。

- 原会话“终端回复 · 自然排版试用”可搜 `terminal-layout-demo`，可用“试用数据”找回 3 条历史问题。搜索前后用户消息数仍为 6，未发送或执行找回的内容。
- 原图会话“历史恢复试用 · 原图”在两种搜索打开时图片隐藏，Esc 后原图恢复；原会话、图片和累计用量保留。
- 实际检查 1512×852 和 900×700 窗口，顶栏可换行，搜索框不超出面板，页面无横向溢出。缩放造成没有活动匹配时显示“n 个匹配”，不显示 `0/n`。
- 实际关闭最后一个终端后返回原会话，并通过历史入口重开；不需 GUI 重新连接。
- 原 providers.yaml、credentials.json 的 SHA256 均未改变。没有新增真实模型问题，本次为本地搜索交互验证。
- 未合并、未推送、未替换安装版。

截图：`terminal-search-native-wide.png`、`terminal-search-input-wide.png`、`terminal-search-input-narrow.png`、`terminal-search-normal-narrow.png`、`terminal-search-original-image-hidden.png`。
最终进程和提交记录：`terminal-history-search-ready.json`。

## 范围

这是当前终端内搜索，不是跨所有会话的全文检索。DAWN 搜已载入的保留内容，折叠工具详情需先展开；Normal 受 xterm 5000 行滚屏上限约束。较早的完整原会话可返回会话页查看。搜索不调用模型，不额外消耗对话 token。
