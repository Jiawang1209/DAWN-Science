# Bot 对话内成果预览验收

日期：2026-10-13。分支：`codex/bot-team`。版本 0.0.27，协议 8.15。main 保持 `5c7a1f74489800fbd3636f8c260db8fd1a8beec4`，未提交、合并或推送。

## 行为

- Bot 团队对话的成果文件点击后在原消息里展开，Bot 页签保持选中。文件名和 × 同行，常驻可访问的“收起预览”按钮；窄坞滚动长脚本时标题和 × 保持可见。
- 脚本复用 ScriptPreview，原文、高亮、自动换行及内外细边框；图片按宽度等比缩放，用 data URL img 渲染 SVG。共用 FilePreviewContent 同时展示 Markdown/表格；PDF 沿用 PdfCanvas。未支持类型原地显示原因。
- 每条消息同时展开一个文件；× 只收起该条预览，焦点回到对应文件按钮，草稿/发言对象/消息保留。普通导航可恢复展开路径并重新读取，不把文件内容写入 room store。
- 沿用当前 owner/scope/team、任务 attempt 与成果名单；本地工作区相对路径、远端绝对路径由 App 现有解析器与 readFile 守卫处理。不自动切文件页签，不新增外部打开入口。主对话任务卡仍保持原文件页签行为。
- 读取中、失败时都能收起。读取失败显示原因和“重试”；换文件、收起、换范围后迟到的成功/失败响应不复活旧内容。

## 验证

- UI 初始 RED：5 项失败、13 项通过。覆盖新的点击行为、脚本/图片展开与收起、加载中关闭及快速切文件、失败重试、范围隔离与导航恢复。
- 相关 9 文件、160 项回归通过，包含既有脚本预览、收起入口、Bot 清单、i18n 和设计契约。窄坞标题可见性 Electron 回归先红（标题在滚动视野上方）、加 sticky 标题后绿。
- 全量 `npm test`：**391 文件、4428 项通过、10 项按原设置跳过**，退出码 0。
- `npm run typecheck`、`npm run build`、`git diff --check` 均通过。构建保留原大 chunk 提示；Vitest 保留原 jsdom canvas 提示，未放宽检查。
- 最终构建 **12 项 Electron 用例通过**：Bot 协作、私聊、派单，以及原文件菜单边界、脚本预览和预览收起。最初 7 项已通过，最终 12 项包含重复复验，不相加计数。
- 数据分析通过现有真实 Electron/IPC/会话/工具链运行：原始 6 行 CSV 不改，排除已确认的 -999 后 n=5，slope=2，intercept=1，excluded=1。实际生成脚本、说明、结果和 SVG。点击消息里的 model.py 高亮原文、regression.svg 图片加载完成且 naturalWidth>0、model.csv 表格、method.md 说明，Bot 页签持续选中；× 关闭且焦点恢复；切页后恢复图片和未发送草稿。
- 亮色及 280px 亮暗主题无横向溢出，脚本/图片最终截图已逐张查看；标题和 × 可见性有几何断言。未改基线、mask 或容差。

## 证据与边界

日志与截图在 `tmp/bot-inline-preview-verification/`：`red.log`、`green.log`、`focused.log`、`sticky-red.log`、`vitest.log`、`typecheck.log`、`build.log`、`electron-final.log`；`script-light.png`、`script-light-280.png`、`script-dark-280.png`、`image-light.png`、`image-dark-280.png`。

推理是共享确定性 mock，计算、工具、文件和界面是真实执行；未调用真实模型或 SSH。PDF 复用现有组件和既有回归，本轮新流程的 Electron 内容验收覆盖脚本、SVG、CSV 和 Markdown。展开路径只保证当前渲染进程内普通导航恢复，不承诺退出后恢复。
