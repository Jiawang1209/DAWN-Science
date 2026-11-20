# DAWN 全项目检查与缺陷修复计划

**Goal:** 检查当前分支的构建、测试、核心数据流和真实桌面主路径，修复有复现证据的缺陷。

**Architecture:** 保持 Electron、React、pi、SQLite、Jupyter 与 SSH 边界；每个缺陷先复现、记录原因，再做最小修复和回归。默认在当前已创建的审查分支串行执行，不委派子 agent。

**Tech Stack:** TypeScript、Vitest、Playwright、Electron、Python/R。

基线：`4188a62a`，版本 `0.0.51`；原工作区干净。分支：`codex/full-project-audit-20261120`。

- [x] 读取项目约定、长期路线图、测试配置及历史检查边界；创建分支。
- [x] 建立当日基线：`npm run typecheck`、`npm test`、`npm ls --all`、`npm run build`，保留首次失败日志。
- [x] 检查首页/项目/会话状态、凭据/持久化、文件交付、内核/远端、定时/更新等主要入口与测试覆盖。
- [x] 对确认的缺陷逐项补失败用例，运行确认失败，做最小修复，再验证相关模块。
- [x] 执行真实 Electron 回归、真实内核及性能检查；必要时验证临时打包产物。
- [x] 复验改动，形成问题、原因、修复、运行证据和未验证边界报告；清理本轮一次性状态。

测试配置、数据库、工作目录、下载、技能、记忆、agent、CLI 和 Electron user-data 使用本轮临时目录。正式 App、正式用户配置、其他项目均不在修改范围。不自动提交、合并、推送或发布。

每项缺陷的具体文件、失败用例和验证命令在调查确认后记入 `docs/reviews/2026-11-20-full-project-audit.md`。日志保存在仓库外的 `~/.codex/audit-reports/dawn-science/2026-11-20-full-project-audit/`，原始失败不被重跑结果覆盖。
