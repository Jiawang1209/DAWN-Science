# 首启向导入口验收计划

**Goal:** 通过现行菜单验收优化入口，保留首启凭证/运行时语义。
**Architecture:** 仅调整setup-wizard三处入口检查，复用真实添加菜单并关闭归还焦点。
**Tech Stack:** Electron、Playwright、现有向导组件测试。

- [x] 0f9f578d独立分支，原用例先红；核实DESIGN及已通过的enhance路径。
- [x] 三处菜单检查、整份setup-wizard、对应组件/类型通过。
- [ ] 自审、历史/证据、提交快进main并复验后继续；不推送。
