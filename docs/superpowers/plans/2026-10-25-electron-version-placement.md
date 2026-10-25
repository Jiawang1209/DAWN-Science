# 版本位置验收计划

**Goal:** 核对真实版本、现行位置、窄窗可见与品牌导航。
**Architecture:** 仅修改header-version E2E，用同帧边界检查状态栏最右和品牌单行。
**Tech Stack:** Electron、Playwright、DOM布局。

- [x] b57f294c干净基线，新分支，原用例先红；核对DESIGN与App/CSS。
- [x] 宽窄版本位置、品牌单行/设置返回检查，类型与相关UI测试、本项Electron通过。
- [ ] 自审、历史/证据记录、提交后快进本地main，主目录复验，再继续。
