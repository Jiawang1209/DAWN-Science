# 长脚本阅读验收计划

**Goal:** 按预览语义令牌验收底色，同时保留阅读与滚动目标。
**Architecture:** 仅替换旧的外层dock颜色参照，用浏览器解析既有surface-sidebar令牌。
**Tech Stack:** Electron、Playwright、CSS变量解析。

- [x] d0726d1e新分支，原用例先红，核实DESIGN/背景覆盖规则。
- [x] 修正亮暗底色参照，整份script-reading/相关预览组件/类型通过。
- [x] 自审、历史/证据、提交快进main，主目录复验后继续，不推送。

本地main修复501b3747，主目录3/3（12.2秒）通过。
