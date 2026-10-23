# Terminal Workspace Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in the existing isolated worktree, without delegation.

> 本计划已被用户后续确认的 `2026-10-23-dawn-cli.md` 取代；不实施桌面内复制对话的方案。

**Goal:** 一个整页终端工作区，以 Agent / Normal 在完整 DAWN 对话与同一原生终端间切换，没有重复聊天界面。

**Architecture:** 复用唯一 ConversationView，作为 TerminalDock 的工作区内容。模式切换保留挂载、草稿和 PTY；Agent 提交绑定当前终端，Normal 先停止 Agent 并接回。删除重复的 TerminalAssistant 组件。

**Tech Stack:** React、nanostores、xterm、现有工作台协议、Playwright Electron。

## 1. 交互回归先行

- [ ] 修改 `e2e/terminal-assistance.spec.ts`：Agent 默认选中，唯一 `.composer-card`，Normal 隐藏聊天输入，进程/PID/cwd/变量与草稿跨模式连续，权限卡一份，可从等待权限切 Normal。
- [ ] 调整 `e2e/terminal-dock.spec.ts` 的旧布局断言：Normal 整页，不再要求同时显示聊天框；无主对话的旧终端入口维持原行为。
- [ ] 运行 `npx playwright test e2e/terminal-assistance.spec.ts --grep '默认 Agent'`，确认旧界面因缺少 Agent 模式失败。

## 2. 复用主对话并移除重复组件

- [ ] `src/ui/App.tsx`：提取唯一主对话 JSX；本地终端工作区将它作为 Dock 的 conversation；普通入口仍渲染同一份。主槽 Agent 的 `onSend` 走 `sendTerminalPrompt`，忙时或带图片清楚报错并保留草稿，普通输入沿用原链路。
- [ ] `src/ui/dock.tsx`：添加 conversation 和模式切换状态；工作区单条工具栏，Agent / Normal；Agent 隐藏 xterm，Normal 隐藏 conversation，不卸载进程或草稿。
- [ ] `src/ui/terminal-control.tsx`：工作区紧凑状态和真正需要的接回/中断，不另铺说明栏；旧入口保留既有控制。
- [ ] 删除 `src/ui/terminal-assistant.tsx` 与其专用测试；完整对话功能由原 ConversationView 与 Electron 回归验证。
- [ ] `src/ui/styles.css`：工作区占满主区、独立滚动、紧凑工具栏、窄窗可用，删除废弃小聊天样式；Agent 的输入样式复用既有主 composer。

## 3. Agent 语义与回归

- [ ] `src/terminal/request.ts`：自由聊天直接回答，文件工具按需，终端执行限定当前原进程；不要求每句先观察终端。
- [ ] 运行 `npm run typecheck`、`npm test -- tests/terminal tests/ui/terminal-control.test.tsx tests/runtime/terminal-tools.test.ts tests/electron/terminal-control.test.ts tests/ui/i18n.test.ts`；检查实际存在的 i18n 测试名称并运行相应目录。
- [ ] `npm run build`，执行终端工作区、终端生命周期、工具选择、方案模式 Electron 回归。实际失败先定位再修，不降低断言。

## 4. 真实预览与交付

- [ ] 建立 QA 清单，运行隔离 Electron，核对 Agent/Normal、切换、草稿、权限、真实 shell/Python/R 行为；检查明暗及窄窗实际截图。
- [ ] 跑完整单元回归、diff/新增文本检查；更新设计和开发记录，明确旧预览已被新工作区替代。
- [ ] 保留实际预览打开，用户可点击 Agent/Normal；只做本地分支工作，不合并、不推送、不替换安装版。
