# 光标粘贴与讨论 / 执行边界实施计划

**Goal:** 修复中间粘贴 / 选区替换，并让明确讨论限制进入运行时，保留已授权分析的连续执行。

**Architecture:** 共用 DOM 选区粘贴处理器；统一讨论指引；基于 pi 当前分支的用户指令包裹现有工具，不增协议或确认弹窗。

**Tech Stack:** TypeScript、React、pi、Vitest、Playwright / Electron。

设计见 `../specs/2026-10-15-composer-paste-execution-boundary-design.md`，用户已授权本会话直接实现，不创建额外分支或提交。

集成授权更新：2026-10-15 用户实看预览并确认修复后，授权提交并合并入本地 main；不推送、不替换安装版。

- [x] `tests/ui/composer-paste.test.tsx`、`e2e/composer-paste.spec.ts`：先在旧实现验证裸文件名插入 / 替换失败；覆盖异步输入、附件识别失败、作用域与原输入行为。
- [x] `src/ui/composer-paste.ts`、`src/ui/views.tsx`：集中裸文件名回退处理，在 DOM 原选区插入 / 替换，同步草稿及光标，避免迟到请求覆盖文字或跨会话写入。
- [x] `tests/policy/execution-boundary.test.ts`、运行时 / 集成测试：先验证明确只讨论时工具仍可执行的失败，再验证门、解除和连续执行。
- [x] `src/policy/execution-boundary.ts`、`src/runtime/native.ts`、`src/tools/run-code.ts`：静态讨论指引 + 当前分支用户指令判定 + 外层工具门；保留方案期门、权限、内核语言约束。
- [x] 回归 `composer-field` / `at-menu` / 粘贴附件 / 内核快捷 / 方案模式 / 工具调用；运行 `npm run typecheck`、`npm run build`、相关真实 Electron；只在必要时扩大测试。
- [x] 复审改动、更新 `docs/DEVELOPMENT_HISTORY.md` 和验证记录，核对分支与 diff，交付未合并的改动。

最终证据、实际限制和主线已有失败见 `../../reviews/2026-10-15-composer-paste-execution-boundary-verification.md`。
