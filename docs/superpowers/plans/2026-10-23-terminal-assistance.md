# 会话终端协助 Implementation Plan

> 执行方式：`superpowers:executing-plans`，本会话逐项执行，不委派子 agent。用户已授权完整实现及实际预览；保留分支，不合并或推送。

**Goal:** 当前内置模型可在用户明确交出的 DAWN 终端原进程中继续工作，用户随时接回。

**Architecture:** 原 PTY + 后端终端画面 + 会话作用域控制服务；NativeRuntime 工具和终端协助行共用服务。写入继承既有权限、方案门与租约，另校验具体会话和授权代次。

**Tech Stack:** TypeScript、node-pty、xterm/headless、Electron、React、Vitest、Playwright。

## Task 1：画面、执行与控制服务

Files: `src/terminal/{screen,control,commands}.ts`，`src/runtime/pty.ts`；`tests/terminal/{screen,control,pty-control}.test.ts`。

- [x] 新增失败回归：ANSI 覆盖而非简单删转义、Unicode/尺寸；跨会话拒绝、显式交接与迟到写拒绝、超时不重发、分段私有完成标记。
- [x] 运行 `npm test -- tests/terminal/` 记录失败；补解析、类型化程序封装、授权代次及状态转换，再运行至通过。
- [x] `PtyRuntimeOptions` 可选注入同一服务；进程开始注册、字节到达更新画面、退出销毁身份，默认无服务路径保持兼容。
- [x] 真实 PTY 用例人工准备 cwd/env/PID，再由服务执行并比较实际输出；Python/R 各保存变量后原进程续算，退出收尾不遗留进程。

## Task 2：工具、权限与装配

Files: `src/tools/terminal.ts`，`src/runtime/native.ts`，`src/policy/{plan-mode,tool-selection}.ts`，`src/electron/wiring.ts`；相关 runtime/tool/electron 测试。

- [x] 失败回归：工具只在本地主 native 有；读取无需写权，执行权限拒绝时不写；权限等待中接回或取消后不写；方案模式只有列表/画面/等待可用。
- [x] 通过 constructor 可选能力注入工具；顺序 `方案门 → 授权检查/权限 → 再验授权 → 实际写入`。shell 参数以原 bash 风险判据检查，REPL 执行采用明确授权与现有权限档，不自动放行未知工具。
- [x] 工具返回真实状态/画面，不把字符送达标成执行完成，不将终端写入登记为确定文件事实。
- [x] 装配服务与 SessionManager 租约；收回/停止主对话撤销控制，不调用终端 stop。
- [x] `npm test -- tests/runtime/terminal-tools.test.ts tests/electron/terminal-control.test.ts tests/policy/plan-mode.test.ts`。

## Task 3：协议与共享 mock

Files: `src/protocol/{terminal,operations,version}.ts`，`src/workbench/backend.ts`，`scripts/mock-inference-server.mjs`；协议/后端测试。

- [x] 失败回归：授予对象/项目/工作区/活性验证、旧终端显式绑定、只读操作零写入、尺寸受界限检查。
- [x] 添加 `getTerminalControl`、`setTerminalControl`、`resizeTerminal`、`interruptTerminal`，`createTerminalSession.ownerSessionId` 可选；后端用户 PTY 输入触发接回。
- [x] 共享固定模型按实际工具结果驱动 `terminal_snapshot → terminal_execute → terminal_wait`；不硬编码计算结果。新增操作同时补 mock；版本升至8.25。
- [x] 定向协议/后端/装配回归后 `npm run typecheck`。

## Task 4：协助行与实际交接

Files: `src/ui/terminal-control.tsx`，`src/ui/{dock,terminal,App}.tsx`，`src/ui/i18n/en.ts`，`src/ui/styles.css`；UI 回归与 `e2e/terminal-assistance.spec.ts`。

- [x] UI 失败回归：未有主对话不可交出；shell/Python/R 可选；授予后显示接回；切对象不串；键盘能立即接回。
- [x] 新组件只管查询/动作/呈现，轮询随挂载清理，迟到回包按作用域丢弃；控件复用 Button 和现有样式。
- [x] 尺寸从 xterm 上报、后端解析与 PTY 同步；复用设计契约扫描并补真实窗口几何回归，不引入隐藏入口或 prompt 弹窗。
- [x] Electron 普通/窄窗/暗色：人工输入准备、授权、在主输入框请求模型操作、观察实际副作用、接回并继续输入；另验超时和中断。

## Task 5：复核、记录和可见预览

- [x] 审查上述规格每项与实际实现，补探索场景：收起终端仍可读、未发送输入被收回阻止、跨聊天不串、关闭期间不复活。
- [x] `npm run typecheck`、`npm test`、`npm run build` 和相关 Electron 回归；不放宽旧断言或阈值掩盖失败。
- [x] 检查 `git diff --check` 及新增文件/差异内无参考项目名称、路径或标记；原历史文本不改写。
- [x] 更新 `docs/DEVELOPMENT_HISTORY.md`、项目文档入口与独立核验报告，区分固定模型与真实进程证据。
- [x] 在独立 userData/配置/数据库/合成工作区启动已构建 Electron；按普通输入验收并保存截图，保持实际预览打开给用户查看。main 与安装版保持原样。

## 用户实际预览后的交互澄清

- [x] 用户已选择默认AI输入、按需切手动；后续实现在同分支完成，见2026-10-23-terminal-ai-input.md及对应核验报告。Python/R解释器不是自然语言聊天入口。
