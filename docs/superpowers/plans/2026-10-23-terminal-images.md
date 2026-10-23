# Terminal Images Implementation Plan

> Execute inline with superpowers:executing-plans. Repository policy prohibits delegation without explicit user request.

**Goal:** 内置 DAWN CLI 原输入支持图片，终端缩略图可放大，GUI 同会话继续问原图。
**Architecture:** DesktopCliHost 为每个认证 scope 管待发图与受限输出缓存。三个协议操作收/改待发图及按不透明 ID 读输出图；CLI 只带小型媒体事件，xterm decoration 画带来源 ID 的缩略图。Native 模型及转录机制复用。
**Tech Stack:** TypeScript / Zod / React / xterm decorations / Vitest / Playwright Electron。

- [x] 新增 tests/cli/desktop-images.test.ts：认证会话隔离、失败保留/成功消耗、原图进入 writeToSession、图片路径越界、去重及缓存上界，先运行 RED。
- [x] 新增 src/cli/desktop-images.ts：每 scope 待发图与输出缓存；验证 PNG/JPEG/WebP/GIF，缩略图复用 pi resizeImage，路径用 resolveInWorkspace。DesktopCliHost 认证后创建，close 清待发、PTY exit 清缓存；CLI 发送通过 consume 包装。
- [x] src/protocol/terminal.ts / operations.ts 定义 getTerminalAgentAttachments、updateTerminalAgentAttachments、getTerminalAgentImage；version.ts 8.29、精确版本和共享 mock 操作清单同步。backend / wiring 接到宿主且所有操作验证 PTY 存活及当前 scope。
- [x] src/cli/desktop-wire.ts / desktop-client.ts 定义小型 desktop_image 事件；agent.ts 按 `OSC 777;dawn-image;<uuid>`＋8行输出占位，文字继续 plain；宿主顺序处理输入回显、kernel_output、tool_files 及 Markdown 返回图片。
- [x] 新增 src/ui/terminal-images.tsx、src/ui/terminal-image-decorations.ts：终端根捕获粘贴/拖入并隔离隐藏 composer，待发缩略条和移除；TerminalModeSwitch 上报当前 mode/session。TerminalPane 注册 OSC 处理与 decoration，图片按 ID 读并点开同一预览浮层。图片加载期间阻止 Enter 丢图；异步结果不能串终端或新 scope。
- [x] 新增 tests/ui/terminal-images.test.tsx 与 e2e/terminal-images.spec.ts，先验证缺失功能失败，再跑图片上传、展示、放大、原图同 ID 续问、Normal 和失败路径。现有测试夹具的 image_url 计数提供真实协议图片证据。
- [x] 类型/全构建/全量单测/适当 Electron 回归；真实配置看图模型验证随机图而非文字提示；宽窄/明暗检查并留实际预览。
- [x] 记录日志、截图、开发历史及边界，核对主目录与源凭证未改，新增文本标识扫描，只本地提交。
