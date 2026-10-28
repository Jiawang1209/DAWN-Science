# App Status Bar Implementation Plan

> Execute inline with superpowers:executing-plans. No delegation, merge or push.

**Goal:** 在底部展示真实的当前模型、解释器状态、启用扩展数量与版本，支持详情、配置跳转及窄窗口。

**Architecture:** 新增独立 `app-statusbar.tsx`，包含展示和按需检测；`App.tsx` 仅提供现有模型、项目名册、解释器配置、会话内核与设置动作。检测结果绑定连接与路径，项目名册绑定项目 ID。沿用现有 Button 和菜单组件。

**Tech Stack:** React、TypeScript、nanostores、现有工作台协议、Vitest、Playwright Electron。

## Task 1 — 状态语义与组件

- [x] 新建 `tests/ui/app-statusbar.test.tsx`：配置不等于就绪；手动检测成功/缺包/失败；跨路径和远端的延迟结果不能串用；内核启动/忙碌/断开；0 与未知计数；菜单及设置入口。
- [x] 执行 `npx vitest run tests/ui/app-statusbar.test.tsx`，确认缺少组件导致失败。
- [x] 新建 `src/ui/app-statusbar.tsx`：`AppStatusBar` 接收 model、environment、counts、version、alerts、onOpenSettings；`InterpreterStatus` 只在点击检测时调用 onProbe，以 scopeId + 两条路径绑定结果。复用 `SessionMenu` 实现窄屏扩展菜单。详情支持 Escape、点击外部关闭、键盘焦点返回。
- [x] 为底部按钮新增 Button `status` 尺寸，集中定义几何。修改 `styles.css`/`tokens.css`，底部基础 30px，提示区域可增高，1050px 以下折叠扩展数；模型缩略但保留版本与解释器。
- [x] 添加中英文文案并跑组件测试、i18n、design-contract。

## Task 2 — 接入现有 App 数据

- [x] `App.tsx` 启动时读取解释器配置一次，保留未读取/失败状态；设置保存后立即刷新展示。复用 getInterpreters/probeInterpreters，不新增协议。
- [x] 当前模型取 `currentModelOf(session)`，使用目录友好名并回退模型 ID；无会话用 `agentIds[0]` 的配置。非模型运行时如实显示其身份。
- [x] 用主区 session.remote.connectionId 选择远端连接解释器与 probe 参数，配置按钮打开该连接；本地配置打开 kernels。
- [x] Skills/MCP/子 Agent 名册加项目快照隔离；插件为全局启用计数。复用现有名册变更通知，不加轮询。
- [x] 以新组件替换现有 statusbar，将原有凭证、连接和 StatusNotices 放入独立 alerts 区。
- [x] 运行 App 默认 client 测试，新增一次配置读取的明确预算与断言，不增加检测请求。

## Task 3 — 验证与交付

- [x] 新建 `e2e/app-statusbar.spec.ts`，验证真实 Electron 下模型、数量、设置跳转、详情、窄窗口不溢出与版本末尾位置，截图。
- [x] 运行 typecheck、完整 UI 测试、build 和相关 Electron：新状态栏、侧栏菜单、工具栏/目录选择和设置向导。
- [x] 检查 diff 和边界，更新开发记录与验证报告，提交到当前分支。
- [ ] 空闲确认后停止旧预览，运行本机 canonical launch-preview.sh，确认新提交/PID，实际检查底部布局和主题色并截图。保留运行中的预览，确认 main/origin/main 不变。
