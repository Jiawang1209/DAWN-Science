# Bot 对话内成果预览实施计划

**Goal:** Bot 团队对话的成果文件在原消息内展开；脚本、图片用右上角 × 收起，不切坞页签。

**Architecture:** 保留现有成果身份与 attempt 校验。BotPane 接收稳定的 readArtifact 回调，App 先用 botArtifactPreviewPath 解析当前本地/远端工作区，再调用既有 readFile。新增 BotArtifactPreview 管读取生命周期；提取共享 FilePreviewContent 内容渲染，省去重复工具栏，由消息内预览统一显示文件名和关闭按钮。未支持格式显示原因，不自动跳页。每条成果消息同时展开一个文件，路径放在 owner/scope/team 隔离的 renderer room 状态；切页重读，不缓存文件内容。

**Tech Stack:** React, nanostores, existing FilePreview/ScriptPreview/PdfCanvas, Vitest, Electron.

用户已指定交互并授权直接在当前分支实现；沿用 codex/bot-team，不提交、不合并、不推送。

- [x] 回归先红：点击成果读取并留在消息内；脚本高亮原文、图片 data URL；× 收起恢复文件按钮焦点；加载中收起、切文件、换范围时迟到响应不复活/串内容；失败可重试；切页恢复展开路径与草稿。
- [x] FilePreview 提取只读 FilePreviewContent，默认文件页签行为保持原样；复用脚本/Markdown/表格/PDF，图片通过 img data URL，不执行 SVG/HTML。
- [x] BotArtifactPreview 显示一行文件名与 ×，加载和失败也能关闭；effect cleanup 拒绝迟到结果，重试重新读取。
- [x] BotCollaboration 成果按钮改为展开路径，预览挂到对应消息；只收起该条预览，保留草稿/目标/消息；预览操作取消自动贴底，关闭后 preventScroll 恢复触发按钮焦点。
- [x] App/BotPane 传稳定的读取回调，沿用已存在的路径、会话、远端连接校验；不调用 openFile、不切换页签。
- [x] 主题变量细边框、小圆角、紧凑内边距；脚本限高滚动并自动换行，图片等比缩放；280px 亮暗主题无横向溢出。
- [x] 回归绿、类型检查、构建；真实 Electron 数据分析测试点击脚本/图片、× 收起且 Bot 页签仍选中；全量单测，更新开发历史和验收记录。

验收：391 个 Vitest 文件、4428 项通过、10 项跳过；类型检查、构建通过；最终构建 12 项 Electron 用例通过。补充窄坞标题/× 滚出视野的先红后绿回归，最终截图已查看。
