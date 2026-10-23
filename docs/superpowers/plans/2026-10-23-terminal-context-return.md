# Terminal Context Return Implementation Plan

> Execute inline with superpowers:executing-plans. Repository policy prohibits delegation unless the user asks for it.

**Goal:** 返回会话在主区打开当前终端 Agent 的同一会话并继续历史。
**Architecture:** DesktopCliHost 保存认证后的终端到会话映射，通过现有只读状态响应给 UI；App 使用既有会话路由，记录界面别名以复用原 PTY。原会话、草稿、权限和模型运行时保持原机制。
**Tech Stack:** TypeScript、Zod 协议、Nanostores、React、Vitest、真实 Playwright Electron。

- [x] `tests/cli/desktop-host.test.ts`：先断言认证后 state.sessionId、Normal 后保留、每个终端独立、新连接替换、forgetTerminal 清理；运行缺失实现失败。
- [x] `src/cli/desktop-host.ts` 增加 latestSessions；state 返回 live 或 latest ID，认证成功后登记；forgetTerminal 清理。`src/runtime/pty.ts` / `src/electron/wiring.ts` 在 PTY 退出时调用清理。
- [x] `src/protocol/terminal.ts` 添加可选 sessionId，协议版本到 8.28；`src/workbench/backend.ts` 对应端口类型同步。`tests/protocol/terminal.test.ts` 验证非空会话标识及非法值拒绝；精确版本断言同次更新。现有 mock 操作名不变。
- [x] `src/ui/state/dock.ts` / `state/index.ts` 保存界面终端到 CLI 会话的最新别名；`App.tsx` 终端过滤接受原主人或 CLI 别名。返回时重新查询、校验窗口作用域、调用回到那段并强制主区路由；成功提交导航时隐藏终端，失败保留，回包迟到不导航。`dock.tsx` 增加返回中禁用。
- [x] `e2e/desktop-cli.spec.ts` 验证 CLI 原话/响应显示、GUI 续问不创建会话、原草稿保留、再次开终端复用 ID、Normal 后仍返回 CLI、两终端隔离及无 Agent 回退。测试固定模型只用于回归。
- [x] 跑针对性、类型、完整构建和适当回归；真实模型用随机标记在终端说一次、返回后不重述标记续问并验证原会话 ID。实际预览检查 hover、明暗和窗口尺寸，保留可试用界面。
- [x] 更新开发历史、CLI 说明和验收记录，只做本地提交；检查主目录与凭证源未改，保留独立预览，不合并/推送/安装。
