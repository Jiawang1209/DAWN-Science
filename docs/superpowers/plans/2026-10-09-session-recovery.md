# Session Recovery Implementation Plan

**Goal:** 在原会话恢复远端 API 对话，并阻止第二实例错误结束活跃会话。

**Architecture:** Electron 单实例守卫保护数据库；SessionManager 负责运行状态；复用 subscribeSession，通过按 id 的 UI 恢复状态提供重试。

**Tech Stack:** Electron、TypeScript、SQLite、React/nanostores、Vitest、Playwright。

- [x] 单实例：新增 `src/electron/single-instance.ts` 和对应测试，主进程在 whenReady 前取得按 DB 路径的锁；真实 Electron 验证同库拒绝、异库并存。
- [x] 状态修复：`tests/session/manager.test.ts` 重现外部误写 exited，`resume` 修复为 alive；恢复重入合并、退出监听复用；运行 manager 和 rehome 回归。
- [x] 后端恢复：`tests/workbench/remote-resume.test.ts` 保留旧快照并让恢复失败，验证错误不能被旧快照吞掉；合并并发恢复，记录结束/失败原因。
- [x] 界面恢复：为 sync 和 ConversationView 增加失败重试测试，再加入按 id 的 pending/error；服务器 ready 后重订主区/侧区失败会话，成功后更新名单；使用既有 subscribeSession，无新增协议。
- [x] 运行相关 Vitest、typecheck、build、隔离 Electron 探针并记录证据；审查差异，更新开发历史。分支保留，不合并或发布。

## 完成记录与验证边界

- 同库第二实例场景由真实完整 Electron 应用验证；同库/异库锁行为另以实际 Electron 调用生产锁模块验证。
- 恢复、状态竞争、SSH 环境就绪与旧观察者问题均先建立失败测试，再修复。独立代码复查未发现有证据的新 P1/P2。
- 排除已知 app-default-client 基线失败文件后，348 个文件、4183 项单测通过，10 项跳过。最终相关回归 8 个文件、157/157 通过；类型检查、构建、diff check 通过。
- 两条 E2E 业务断言通过；Electron 测试进程退出收尾存在已知基线超时，不能报告 E2E 整套通过。测试替身覆盖 SSH 和 API，不替代真实服务器验证。
- 最终日志位于 `tmp/session-recovery-verification/`。未提交、合并、推送或更新已安装应用。
