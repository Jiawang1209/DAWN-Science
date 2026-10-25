# 设置路径行修复计划

**Goal:** 长目录不挤没设置标题说明与按钮。
**Architecture:** 只约束包含 ws-setting 的路径行网格和控件最小宽度，窄窗口单列；沿用原路径省略与设置栏覆盖规则。
**Tech Stack:** CSS、Electron/Playwright、现有 UI 契约测试。

- [x] 创建 codex/settings-path-layout，基线 30c3a99d；从同一依赖完整构建。
- [x] e2e/settings-path-layout.spec.ts 新增宽/窄、亮/暗、长路径和恢复默认的几何/可见性回归，确认原样式失败。
- [x] src/ui/styles.css 仅修路径行约束；真实 Electron 查看截图并验证默认下载实际落盘与设置栏不溢出。
- [x] 类型/构建/相关 UI 与 Electron 验证，自审、review 与 DEVELOPMENT_HISTORY，提交本切片。
- [ ] 快进合并本地 main、主目录复验；为旧 E2E 契约漂移另建分支。

原会话串行执行，无子 agent，不推送或替换安装版。
