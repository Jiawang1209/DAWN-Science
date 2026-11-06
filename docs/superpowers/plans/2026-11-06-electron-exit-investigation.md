# Electron 偶发退出异常 Implementation Plan

> Inline execution in the existing isolated worktree; no delegation or automatic integration.

**Goal:** 补齐退出全链路事实，复现后修复已证明的根因，补测试与相关真实桌面回归并展示实际效果。

**Architecture:** 沿用现有 E2E 退出观察器与 Electron will-quit 收尾。诊断由隔离 E2E 显式启用，应用早期直接写独立 app-PID.jsonl，避免依赖待关闭的 inspector/evaluate/stderr；宿主文件继续记录进程及协议生命周期。两侧通过 PID、序号、ISO 时间与单调耗时对应。正式 App 默认不开启，不改关闭预算、权限或任务恢复。

**Tech Stack:** Electron / Node / TypeScript / Vitest / Playwright Electron。

## A. 证据与诊断

- [x] 核对主分支、专项修改指纹及原 trace：区分一次 Close context 卡住与另一次页面提前关闭、进程仍存活；不合并推断为同一根因。
- [x] 新增 `src/electron/exit-diagnostics.ts` 与 `tests/electron/app-exit-diagnostics.test.ts`：先测默认关闭、退出事件顺序、资源类型白名单和诊断写失败不影响产品，然后实现；接入 `src/electron/main.ts` 的生命周期和同步/异步收尾检查点。
- [x] 扩展 `e2e/electron-exit-diagnostics.ts` 及原单测：记录协议 app/context/page close/crash、有限 inspector stderr 标记与 close 调用返回时的真实进程状态。不得写通用 console、URL、请求正文或配置。
- [x] `e2e/fixtures.ts` 在启动前传入每例独立目录，记录 close 返回/失败；保留原 `app.close()` 与 exitCode=0 检查，诊断不得放宽验收。

验证命令：`npx vitest run --project=node tests/electron/exit-diagnostics.test.ts tests/electron/app-exit-diagnostics.test.ts`。先保存红灯，再实现至通过；类型检查确认真实 Electron 装配。

## B. 复现与根因修复

- [x] 先构建，再以完整诊断重复原后台关闭与纠偏/点名取消场景；每批保留独立目录、原日志和失败 trace。
- [x] 建立区分未进入 before-quit / 同步或异步收尾 / 收尾已返回但原生进程未退 / 进程已退但管道未关的事实链；受控 veto 验证 before-quit 后未进入 will-quit 的分类。故障注入只验证边界与诊断覆盖，不能冒称复现了历史根因。
- [x] 对实际复现的问题形成最小红灯测试，针对单一原因修改并复验。已修复主任务 busy 被漏判为空闲；补齐原有等待上限及清理失败的观察，正常/到期/失败三类均验。历史现象未复现，保留未知结论，不能用重复通过或故障注入代替根因证据。

历史 Close context 超时及页面提前关闭仍待复现，不能标为根因已关闭。当前完整记录见[专项报告](../../reviews/2026-11-07-electron-exit-investigation.md)。

## C. 回归、审查和展示

- [x] 运行相关单元、类型/构建及实际桌面：活跃子任务关闭、后台结果回送、纠偏取消、预算截止、MCP 停止等受影响路径。最终 Node/UI 6331 通过、10 既有跳过，11 桌面场景与 16 次原生退出通过。
- [x] 自审诊断不改变退出、无监听器/定时器泄漏、不泄露敏感内容、不把强杀算成功；保留正常退出与异常归类的可复查时间线及实际 UI 截图。主任务通过案例 forcedCleanup 为空，未触发原内层 deadline 或外层兜底。
- [x] 更新开发历史、长期路线与报告，核验 main/正式应用未变；未获当轮授权不 commit/merge，不 push/release。

本轮证据目录：`docs/validation/electron-exit-investigation-20261106/`。沿用 `codex/run-explanation-budget`，此前预算/解释改动全部保留。
