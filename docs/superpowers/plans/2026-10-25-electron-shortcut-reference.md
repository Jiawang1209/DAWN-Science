# 速查契约验收计划

**Goal:** 核对新增对话查找及全套实际平台键位。
**Architecture:** 只修改palette E2E的旧数量判据，用用户可读的键位序列与查找行验证。
**Tech Stack:** Electron、Playwright、现有跨平台组件测试。

- [x] ee066daa新分支；原用例先红，核实DESIGN及ShortcutPanel/现有跨平台单测。
- [x] 13项内容、查找键位校验；整份palette和对应组件测试、类型通过。
- [x] 自审、历史/证据，提交快进main，主目录复验后继续，不推送。

本地main修复a4151e2d；主目录Electron1/1（2.3秒）通过。
