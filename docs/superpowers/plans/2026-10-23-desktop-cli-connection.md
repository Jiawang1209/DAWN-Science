# Desktop CLI Connection Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans in the existing worktree. No delegation.

**Goal:** 无需重配模型或 key，通过真实 CLI 和 DAWN / Normal 按钮使用桌面 Agent。

**Architecture:** 私有本机 socket + 限定会话的 CLI 操作。桌面 Workbench 继续持有模型和凭证；readline 复用原 CLI；PTY 环境包含短期连接信息和私有命令路径，按钮状态以连接事实为准。

**Tech Stack:** Node net、TypeScript、现有 Workbench / PTY、React、Playwright Electron。

- [x] 新增 `tests/cli/desktop-host.test.ts`，先验证认证、限制操作、会话绑定和断开清理；运行缺失实现的失败。
- [x] `src/cli/desktop-host.ts` / `desktop-client.ts` 实现单一会话连接，最大帧限制、请求关联、事件及有界关闭；`context.ts` 和 `agent.ts` 抽象本地/桌面上下文，保留独立 CLI。
- [x] `src/terminal/control.ts` 增加只在 Shell 就绪时启动 CLI 的动作；`PtyRuntimeOptions` 增加 scoped 环境与退出清理；wiring 装配 CLI host、继承当前模型、独立 CLI 会话及关闭生命周期。
- [x] 协议加入 get/setTerminalAgentMode，同次补共享 mock、版本与精确操作清单；后端连接 host。Dock/App 加 DAWN/Normal 真实状态按钮，轮询作用域防迟到更新，切换失败保留原模式。
- [x] main 装配构建后 CLI 入口；预览可通过只读凭证源复用原配置，加密凭证留在原存储；不允许通过只读入口写回。
- [x] 跑类型、针对性和完整回归、真实 Electron 默认无 key 环境变量的模式切换/模型继承/权限/工具/退出；实际真实模型验收并检查 source 校验值、截图、记录。
- [x] 更新开发历史和说明；只本地提交，保留真实模型预览，不合并/推送/替换安装版。
