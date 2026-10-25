# 桌面 CLI E2E 验收修正计划

**Goal:** 检查实际桌面模型绑定与请求，而非旧 provider/model 标题格式。
**Architecture:** 只调整 desktop-cli E2E，使用已有只读协议及共用 mock 请求记录。
**Tech Stack:** Electron、Playwright、Zod、CLI/UI现有测试。

- [x] 8e192c5b 基线，首批99通过后复现旧 deepseek/ 标题失败，核实TUI引入提交与现有单测。
- [x] 新分支 codex/electron-desktop-cli；原 pending input/Shell/原会话连续性断言保留。
- [x] 实际绑定、展示名和请求模型均校验；类型/定向CLI测试与完整两项Electron通过。
- [ ] 自审与开发历史，提交、本地快进main，主目录两项复验后继续。无应用源码改动，复用同版本已验证构建，不推送。
