# 主区域四步向导实现计划

**Goal:** 在分支 codex/first-launch-guide 实现用户已确认的首次使用流程并展示实际应用。

**Architecture:** SetupWizard 管理四步页面，保留现有保存与验证回调、错误展示及 InterpreterPicker。App 负责首次与补填入口、完成状态；双语与样式使用现有目录和设计变量。

**Tech Stack:** React、TypeScript、Vitest、Electron、Playwright。

## 1. 行为回归先行

- 修改 tests/ui/setup-wizard.test.tsx：旧凭证回归直接从 key 步开始，新用例覆盖 welcome/features/key/environment、回退保留草稿、等待时禁止跳转、跳过计算环境、存储兼容。
- 运行 `npx vitest run --project ui tests/ui/setup-wizard.test.tsx`，确认新行为尚未实现。

## 2. 页面与入口

- src/ui/setup-wizard.tsx：增加 initialStep、四步状态、进度、功能卡片、可选环境完成操作；保留原密钥区、异常区、探测逻辑。
- src/ui/App.tsx：补填入口进入 key，首次完成与跳过分别记录独立介绍状态并复用旧跳过状态。
- src/ui/styles.css：主区域响应式向导；src/ui/i18n/en.ts：新增全部文案翻译。
- 重跑组件用例、解释器用例、App 基础用例和 i18n 扫描，执行 `npm run typecheck`。

## 3. 真实应用回归与交付

- e2e/setup-wizard.spec.ts：按四步调整既有验收，新增跳过环境/重启/补填及截图；保留默认配置首次 native 对话与真实 IPC 验证账目。
- README.md：同步中英文首次使用说明。
- 运行 `npm run build`、`npx playwright test e2e/setup-wizard.spec.ts`。在实际 Electron 窗口截图四页并检查窄窗口/英文排版；假密钥走本地假服务。
- 审查差异、检查新增开发文件与提交文本符合命名要求，记录验证证据，提交在当前分支，保留给用户预览。
